'use client'

import { useState, useEffect, useRef, useCallback, useTransition } from 'react'
import { getWorkspaceGraph, type GraphData, type GraphNode, type GraphLink } from '@/actions/knowledgeGraph'
import { getNoteById } from '@/actions/notes'
import { backfillEmbeddings } from '@/actions/embeddings'
import { 
  Network, Loader2, ZoomIn, ZoomOut, Maximize2, 
  BookOpen, MessageSquare, RefreshCw, X, ArrowRight 
} from 'lucide-react'
import Link from 'next/link'

interface Workspace {
  id: string
  name: string
}

interface KnowledgeGraphProps {
  workspaces: Workspace[]
}

interface SimulatedNode extends GraphNode {
  x: number
  y: number
  vx: number
  vy: number
}

// Lista de cores elegantes por tópico para criar visual agrupado
const TOPIC_COLORS: Record<string, { fill: string; bg: string; border: string; glow: string; text: string }> = {
  Geral: { fill: 'fill-indigo-500', bg: 'bg-indigo-500', border: 'border-indigo-400', glow: 'rgba(99, 102, 241, 0.4)', text: 'text-indigo-400' },
  Clipper: { fill: 'fill-emerald-500', bg: 'bg-emerald-500', border: 'border-emerald-400', glow: 'rgba(16, 185, 129, 0.4)', text: 'text-emerald-400' },
  'Web Clipper': { fill: 'fill-emerald-500', bg: 'bg-emerald-500', border: 'border-emerald-400', glow: 'rgba(16, 185, 129, 0.4)', text: 'text-emerald-400' },
  Concurso: { fill: 'fill-amber-500', bg: 'bg-amber-500', border: 'border-amber-400', glow: 'rgba(245, 158, 11, 0.4)', text: 'text-amber-400' },
  Faculdade: { fill: 'fill-rose-500', bg: 'bg-rose-500', border: 'border-rose-400', glow: 'rgba(244, 63, 94, 0.4)', text: 'text-rose-400' },
  Importante: { fill: 'fill-violet-500', bg: 'bg-violet-500', border: 'border-violet-400', glow: 'rgba(139, 92, 246, 0.4)', text: 'text-violet-400' },
}

function getTopicTheme(topic: string) {
  const norm = topic.trim()
  return TOPIC_COLORS[norm] || { fill: 'fill-sky-500', bg: 'bg-sky-500', border: 'border-sky-400', glow: 'rgba(14, 165, 233, 0.4)', text: 'text-sky-400' }
}

export default function KnowledgeGraph({ workspaces }: KnowledgeGraphProps) {
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('')
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] })
  const [nodes, setNodes] = useState<SimulatedNode[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Estados de manipulação de física e viewport
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null)
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })

  // Estados de seleção e detalhes
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [selectedNote, setSelectedNote] = useState<any>(null)
  const [isLoadingNote, setIsLoadingNote] = useState(false)

  // Estado de indexação automática
  const [isIndexing, setIsIndexing] = useState(false)
  const [indexMessage, setIndexMessage] = useState('')

  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const width = 800
  const height = 550
  const centerX = width / 2
  const centerY = height / 2

  // 1. Carrega dados do grafo ao alterar o workspace
  useEffect(() => {
    if (workspaces.length > 0 && !selectedWorkspaceId) {
      setSelectedWorkspaceId(workspaces[0].id)
    }
  }, [workspaces, selectedWorkspaceId])

  const loadGraph = useCallback(async (wsId: string) => {
    if (!wsId) return
    setIsLoading(true)
    try {
      const data = await getWorkspaceGraph(wsId)
      setGraphData(data)

      // Inicializa posições circulares ordenadas em torno do centro
      const simulated: SimulatedNode[] = data.nodes.map((node, index) => {
        const angle = (index / data.nodes.length) * 2 * Math.PI
        const radius = 120 + Math.random() * 60
        return {
          ...node,
          x: centerX + radius * Math.cos(angle),
          y: centerY + radius * Math.sin(angle),
          vx: 0,
          vy: 0
        }
      })
      setNodes(simulated)
      setTransform({ x: 0, y: 0, scale: 1 }) // Reset zoom
      setFocusedNodeId(null)
      setSelectedNote(null)
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }, [centerX, centerY])

  useEffect(() => {
    if (selectedWorkspaceId) {
      loadGraph(selectedWorkspaceId)
    }
  }, [selectedWorkspaceId, loadGraph])

  // 2. Loop físico de simulação (Força-Dirigida personalizada)
  useEffect(() => {
    if (nodes.length === 0) return

    let animId: number
    const tick = () => {
      setNodes(prevNodes => {
        const n = prevNodes.length
        const updated = prevNodes.map(node => ({ ...node, vx: node.vx || 0, vy: node.vy || 0 }))

        // A. Repulsão entre os nós (Coulomb invertido para evitar sobreposição)
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            const u = updated[i]
            const v = updated[j]
            const dx = v.x - u.x
            const dy = v.y - u.y
            const dist = Math.sqrt(dx * dx + dy * dy) || 0.1
            if (dist < 280) {
              const force = 180 / (dist * dist)
              const fx = force * (dx / dist)
              const fy = force * (dy / dist)
              if (u.id !== draggedNodeId) {
                u.vx -= fx
                u.vy -= fy
              }
              if (v.id !== draggedNodeId) {
                v.vx += fx
                v.vy += fy
              }
            }
          }
        }

        // B. Atração através de links (Hooke - Molas inteligentes ponderadas pela similaridade)
        for (const link of graphData.links) {
          const u = updated.find(x => x.id === link.source)
          const v = updated.find(x => x.id === link.target)
          if (!u || !v) continue

          const dx = v.x - u.x
          const dy = v.y - u.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.1
          const desiredLen = 150
          const force = (dist - desiredLen) * 0.02 * link.value
          const fx = force * (dx / dist)
          const fy = force * (dy / dist)

          if (u.id !== draggedNodeId) {
            u.vx += fx
            u.vy += fy
          }
          if (v.id !== draggedNodeId) {
            v.vx -= fx
            v.vy -= fy
          }
        }

        // C. Gravidade em direção ao centro para evitar dispersão infinita
        for (let i = 0; i < n; i++) {
          const u = updated[i]
          if (u.id === draggedNodeId) continue
          u.vx += (centerX - u.x) * 0.006
          u.vy += (centerY - u.y) * 0.006
        }

        // D. Atualização de posição e amortecimento (Fricção)
        return updated.map(u => {
          if (u.id === draggedNodeId) return u
          return {
            ...u,
            x: u.x + u.vx,
            y: u.y + u.vy,
            vx: u.vx * 0.85,
            vy: u.vy * 0.85
          }
        })
      })
      animId = requestAnimationFrame(tick)
    }

    animId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animId)
  }, [graphData.links, draggedNodeId, centerX, centerY, nodes.length])

  // 3. Zoom e Navegação do Canvas
  const zoom = (factor: number) => {
    setTransform(prev => ({
      ...prev,
      scale: Math.max(0.2, Math.min(prev.scale * factor, 3))
    }))
  }

  const resetZoom = () => {
    setTransform({ x: 0, y: 0, scale: 1 })
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const zoomFactor = 1.08
    const nextScale = e.deltaY < 0 ? transform.scale * zoomFactor : transform.scale / zoomFactor
    const boundedScale = Math.max(0.15, Math.min(nextScale, 3))
    
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    setTransform(prev => {
      const dx = mouseX - prev.x
      const dy = mouseY - prev.y
      return {
        scale: boundedScale,
        x: mouseX - dx * (boundedScale / prev.scale),
        y: mouseY - dy * (boundedScale / prev.scale)
      }
    })
  }

  // 4. Arrasto de Nós (Drag and Drop do grafo)
  const handleNodeMouseDown = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setDraggedNodeId(nodeId)
  }

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggedNodeId) return
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return

    const clientX = e.clientX - rect.left
    const clientY = e.clientY - rect.top
    const svgX = (clientX - transform.x) / transform.scale
    const svgY = (clientY - transform.y) / transform.scale

    setNodes(prev => prev.map(n => n.id === draggedNodeId ? { ...n, x: svgX, y: svgY, vx: 0, vy: 0 } : n))
  }, [draggedNodeId, transform])

  // 5. Clique de Panning (Arrasto do fundo)
  const handleSvgMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    setIsPanning(true)
    setPanStart({ x: e.clientX - transform.x, y: e.clientY - transform.y })
  }

  const handleSvgMouseMove = (e: React.MouseEvent) => {
    if (draggedNodeId) {
      handleMouseMove(e)
      return
    }
    if (!isPanning) return
    setTransform(prev => ({
      ...prev,
      x: e.clientX - panStart.x,
      y: e.clientY - panStart.y
    }))
  }

  const handleSvgMouseUp = () => {
    setIsPanning(false)
    setDraggedNodeId(null)
  }

  // 6. Carrega detalhes da nota selecionada no painel lateral
  const handleNodeClick = async (nodeId: string) => {
    setFocusedNodeId(nodeId)
    setIsLoadingNote(true)
    setSelectedNote(null)
    try {
      const note = await getNoteById(nodeId)
      setSelectedNote(note)
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoadingNote(false)
    }
  }

  // 7. Indexador direto do painel
  const handleStartIndex = async () => {
    setIsIndexing(true)
    setIndexMessage('Iniciando indexação vetorial...')
    try {
      const res = await backfillEmbeddings()
      setIndexMessage(`Indexado com sucesso! ${res.notesIndexed} notas e ${res.cardsIndexed} cards indexados.`)
      setTimeout(() => {
        setIndexMessage('')
        loadGraph(selectedWorkspaceId)
      }, 3000)
    } catch (err: any) {
      setIndexMessage('Falha ao rodar indexação: ' + err.message)
    } finally {
      setIsIndexing(false)
    }
  }

  // Determina quais nós e conexões destacar
  const connectedNodeIds = new Set<string>()
  if (focusedNodeId) {
    connectedNodeIds.add(focusedNodeId)
    graphData.links.forEach(l => {
      if (l.source === focusedNodeId) connectedNodeIds.add(l.target)
      if (l.target === focusedNodeId) connectedNodeIds.add(l.source)
    })
  } else if (hoveredNodeId) {
    connectedNodeIds.add(hoveredNodeId)
    graphData.links.forEach(l => {
      if (l.source === hoveredNodeId) connectedNodeIds.add(l.target)
      if (l.target === hoveredNodeId) connectedNodeIds.add(l.source)
    })
  }

  const hasConnections = graphData.links.length > 0

  return (
    <div className="relative flex flex-col h-[calc(100vh-120px)] min-h-[500px] bg-background text-text-strong rounded-2xl border border-border overflow-hidden">
      
      {/* 🟢 Header de controle */}
      <header className="flex flex-wrap items-center justify-between gap-4 p-4 border-b border-border bg-surface shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary-soft text-primary rounded-lg">
            <Network className="size-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-text-strong">Rede de Conexões</h1>
            <p className="text-xs text-text-muted">Mapeamento conceitual por similaridade vetorial (RAG)</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label htmlFor="ws-select" className="text-xs font-semibold text-text-muted uppercase">Workspace:</label>
          <select
            id="ws-select"
            value={selectedWorkspaceId}
            onChange={(e) => setSelectedWorkspaceId(e.target.value)}
            className="bg-surface-muted border border-border text-text-strong rounded-lg px-3 py-1.5 text-xs min-w-[180px] outline-none focus:border-primary/50"
          >
            {workspaces.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
      </header>

      {/* 🟢 Área de Visualização Principal */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* Loader do canvas */}
        {isLoading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/60 backdrop-blur-xs">
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-border bg-surface shadow-md text-xs font-medium">
              <Loader2 className="size-4 animate-spin text-primary" />
              Carregando mapa...
            </div>
          </div>
        )}

        {/* Notificação de Indexação */}
        {indexMessage && (
          <div className="absolute top-4 left-4 z-20 max-w-sm p-3 bg-surface border-l-4 border-l-primary border border-border rounded-r-xl rounded-l-md text-xs font-medium shadow-lg animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-2">
              {!isIndexing && <span className="text-emerald-500">✓</span>}
              {isIndexing && <Loader2 className="size-3 animate-spin text-primary" />}
              <span>{indexMessage}</span>
            </div>
          </div>
        )}

        {/* Canvas de Desenho */}
        <div 
          ref={containerRef}
          className={`flex-1 relative overflow-hidden select-none outline-none ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
          onMouseDown={handleSvgMouseDown}
          onMouseMove={handleSvgMouseMove}
          onMouseUp={handleSvgMouseUp}
          onMouseLeave={handleSvgMouseUp}
        >
          {nodes.length === 0 && !isLoading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
              <div className="p-4 bg-surface-muted border border-border rounded-full mb-3 text-text-muted">
                <Network className="size-8" />
              </div>
              <h3 className="font-semibold text-text-strong mb-1">Nenhuma conexão mapeada</h3>
              <p className="text-text-muted text-xs max-w-sm mb-4">Seu workspace está vazio ou precisa de processamento de IA para rastrear similaridades conceituais.</p>
              <button 
                onClick={handleStartIndex}
                disabled={isIndexing}
                className="btn-primary py-1.5 px-4 text-xs flex items-center gap-1.5"
              >
                <RefreshCw className={`size-3.5 ${isIndexing ? 'animate-spin' : ''}`} />
                Gerar Vetores & Indexar
              </button>
            </div>
          ) : (
            <>
              {/* Barra de controle flutuante do Canvas */}
              <div className="absolute bottom-4 left-4 z-10 flex items-center gap-1.5 p-1 bg-surface/90 border border-border rounded-full shadow-md backdrop-blur-xs">
                <button onClick={() => zoom(1.15)} className="p-2 rounded-full hover:bg-surface-muted text-text-medium transition-colors" title="Zoom In"><ZoomIn className="size-4" /></button>
                <button onClick={() => zoom(0.85)} className="p-2 rounded-full hover:bg-surface-muted text-text-medium transition-colors" title="Zoom Out"><ZoomOut className="size-4" /></button>
                <button onClick={resetZoom} className="p-2 rounded-full hover:bg-surface-muted text-text-medium transition-colors" title="Focar Grafo"><Maximize2 className="size-4" /></button>
                {!hasConnections && (
                  <button 
                    onClick={handleStartIndex}
                    disabled={isIndexing}
                    className="flex items-center gap-1 px-3 py-1.5 ml-2 text-[10px] font-bold uppercase tracking-wide bg-primary/10 text-primary border border-primary/20 rounded-full hover:bg-primary/20 transition-all"
                  >
                    <RefreshCw className={`size-3 ${isIndexing ? 'animate-spin' : ''}`} /> Indexar Conexões
                  </button>
                )}
              </div>

              {/* Elementos Vetoriais */}
              <svg
                ref={svgRef}
                className="w-full h-full"
                onWheel={handleWheel}
              >
                <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
                  
                  {/* Linhas (Links) */}
                  {graphData.links.map((link, idx) => {
                    const sourceNode = nodes.find(n => n.id === link.source)
                    const targetNode = nodes.find(n => n.id === link.target)
                    if (!sourceNode || !targetNode) return null

                    const isHighlighted = focusedNodeId || hoveredNodeId
                      ? (link.source === focusedNodeId || link.target === focusedNodeId || link.source === hoveredNodeId || link.target === hoveredNodeId)
                      : true

                    return (
                      <g key={`link-${idx}`}>
                        <line
                          x1={sourceNode.x}
                          y1={sourceNode.y}
                          x2={targetNode.x}
                          y2={targetNode.y}
                          className="transition-all duration-200"
                          stroke={isHighlighted ? 'currentColor' : '#475569'}
                          strokeWidth={isHighlighted ? 2.5 : 1}
                          strokeOpacity={isHighlighted ? Math.min(0.6, link.value + 0.1) : 0.1}
                          style={{ color: isHighlighted ? 'var(--primary)' : undefined }}
                        />
                      </g>
                    )
                  })}

                  {/* Círculos e Rótulos (Nós) */}
                  {nodes.map((node) => {
                    const theme = getTopicTheme(node.topic)
                    const isFocused = focusedNodeId === node.id
                    const isDimmed = (focusedNodeId || hoveredNodeId) && !connectedNodeIds.has(node.id)

                    return (
                      <g
                        key={node.id}
                        transform={`translate(${node.x}, ${node.y})`}
                        className="transition-all duration-150 ease-out cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleNodeClick(node.id)
                        }}
                        onMouseEnter={() => setHoveredNodeId(node.id)}
                        onMouseLeave={() => setHoveredNodeId(null)}
                      >
                        {/* Glow effect on focused node */}
                        {isFocused && (
                          <circle
                            r={18}
                            fill="none"
                            stroke="var(--primary)"
                            strokeWidth={2.5}
                            className="animate-ping opacity-25"
                            style={{ stroke: 'var(--primary)' }}
                          />
                        )}

                        {/* Corpo do Nó */}
                        <circle
                          r={isFocused ? 12 : 9}
                          className={`transition-all duration-300 ${theme.fill} ${isDimmed ? 'opacity-20' : 'opacity-100 shadow-md'}`}
                          style={{
                            boxShadow: !isDimmed ? `0 0 16px ${theme.glow}` : undefined,
                            stroke: isFocused ? 'var(--primary)' : 'rgba(255,255,255,0.15)',
                            strokeWidth: isFocused ? 3 : 1.5
                          }}
                          onMouseDown={(e) => handleNodeMouseDown(node.id, e)}
                        />

                        {/* Rótulo de Texto */}
                        <text
                          x={0}
                          y={isFocused ? 26 : 22}
                          textAnchor="middle"
                          className={`text-[10px] font-bold fill-text-strong select-none transition-all duration-200 ${isDimmed ? 'opacity-10' : 'opacity-100'}`}
                          stroke="var(--background)"
                          strokeWidth={2.5}
                          paintOrder="stroke"
                        >
                          {node.label.length > 20 ? `${node.label.slice(0, 18)}...` : node.label}
                        </text>
                      </g>
                    )
                  })}
                </g>
              </svg>
              {/* Legenda Explicativa do Grafo */}
              <div className="absolute bottom-4 right-4 z-10 pointer-events-none opacity-45 text-[10px] text-text-muted select-none text-right font-medium leading-normal">
                Arraste os nós para reorganizar<br />
                Scroll para Zoom | Clique para detalhar
              </div>
            </>
          )}
        </div>

        {/* 🟢 Painel Lateral de Detalhes */}
        <aside 
          className={`absolute top-0 bottom-0 right-0 z-20 w-80 bg-surface border-l border-border shadow-2xl p-5 flex flex-col justify-between transition-transform duration-300 pointer-events-auto ${focusedNodeId ? 'translate-x-0' : 'translate-x-full'}`}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseMove={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
        >
          <div className="flex-1 overflow-y-auto pr-1">
            <header className="flex items-start justify-between gap-3 mb-5 shrink-0">
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${selectedNote ? getTopicTheme(selectedNote.topic).bg : 'bg-slate-700'} text-white`}>
                {selectedNote?.topic || 'Geral'}
              </span>
              <button 
                onClick={(e) => {
                  e.stopPropagation()
                  setFocusedNodeId(null)
                }}
                className="p-1 rounded-md text-text-muted hover:bg-surface-muted hover:text-text-strong transition-colors pointer-events-auto"
                title="Fechar painel"
              >
                <X className="size-4" />
              </button>
            </header>

            {isLoadingNote ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 className="size-6 animate-spin text-primary" />
                <span className="text-xs text-text-muted font-medium">Buscando conteúdo...</span>
              </div>
            ) : selectedNote ? (
              <div className="animate-in fade-in slide-in-from-right-4 duration-200">
                <h2 className="text-base font-extrabold text-text-strong mb-2 leading-tight">
                  {selectedNote.title}
                </h2>
                
                {/* Visualização de conexões locais */}
                <div className="mb-6">
                  <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">Conceitos Conectados</h4>
                  <div className="space-y-1.5">
                    {graphData.links
                      .filter(l => l.source === selectedNote.id || l.target === selectedNote.id)
                      .map((link, idx) => {
                        const targetId = link.source === selectedNote.id ? link.target : link.source
                        const targetNode = nodes.find(n => n.id === targetId)
                        if (!targetNode) return null
                        const pct = Math.round(link.value * 100)

                        return (
                          <button
                            key={idx}
                            onClick={() => handleNodeClick(targetNode.id)}
                            className="flex items-center justify-between w-full p-2 text-left rounded-lg text-xs bg-surface-muted hover:bg-border transition-colors group"
                          >
                            <span className="font-semibold text-text-medium truncate pr-2 group-hover:text-text-strong transition-colors">{targetNode.label}</span>
                            <span className="shrink-0 text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">{pct}% similar</span>
                          </button>
                        )
                      })}
                  </div>
                </div>

                {/* Pré-visualização do conteúdo */}
                <div className="border-t border-border pt-4">
                  <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">Prévia do Conteúdo</h4>
                  <p className="text-xs text-text-muted leading-relaxed line-clamp-[12] whitespace-pre-wrap bg-surface-muted/50 p-3 rounded-xl border border-border/30">
                    {selectedNote.content ? selectedNote.content.replace(/Fonte:.*?\n\n---\n\n/, '') : 'Sem conteúdo.'}
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          {/* Botões de Ação na base */}
          {selectedNote && (
            <div className="border-t border-border pt-4 mt-4 shrink-0 space-y-2.5">
              <Link 
                href={`/dashboard/${selectedWorkspaceId}/note/${selectedNote.id}`}
                className="btn-primary w-full py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                <BookOpen className="size-3.5" />
                Abrir no Editor
                <ArrowRight className="size-3.5" />
              </Link>
              <Link 
                href={`/dashboard/chat?workspaceId=${selectedWorkspaceId}`}
                className="btn-ghost w-full py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                <MessageSquare className="size-3.5" />
                Conversar no Assistente
              </Link>
            </div>
          )}
        </aside>

      </div>
    </div>
  )
}

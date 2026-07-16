'use client'

import { useState, useEffect, useRef, useCallback, useTransition, useMemo } from 'react'
import { 
  getWorkspaceGraph, 
  generateAllWorkspacePrerequisites, 
  generateStudyRoadmap,
  type GraphData, 
  type GraphNode, 
  type GraphLink 
} from '@/actions/knowledgeGraph'
import { getNoteById, createNoteWithTitle } from '@/actions/notes'
import { backfillEmbeddings } from '@/actions/embeddings'
import { 
  Network, Loader2, ZoomIn, ZoomOut, Maximize2, 
  BookOpen, MessageSquare, RefreshCw, X, ArrowRight, ListChecks 
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

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

function getNodeTheme(node: GraphNode, dependentsCount: number) {
  if (node.isGhost) {
    return {
      fill: 'fill-zinc-900',
      bg: 'bg-zinc-900',
      border: 'border-zinc-700',
      glow: 'rgba(63, 63, 70, 0.4)',
      text: 'text-zinc-500',
      label: 'Pré-requisito Ausente'
    }
  }

  if (dependentsCount >= 3) {
    return {
      fill: 'fill-emerald-600',
      bg: 'bg-emerald-600',
      border: 'border-emerald-400',
      glow: 'rgba(16, 185, 129, 0.5)',
      text: 'text-emerald-400',
      label: 'Conceito Base'
    }
  }
  if (dependentsCount >= 1) {
    return {
      fill: 'fill-sky-500',
      bg: 'bg-sky-500',
      border: 'border-sky-400',
      glow: 'rgba(14, 165, 233, 0.5)',
      text: 'text-sky-400',
      label: 'Intermediário'
    }
  }
  return {
    fill: 'fill-violet-600',
    bg: 'bg-violet-600',
    border: 'border-violet-400',
    glow: 'rgba(139, 92, 246, 0.5)',
    text: 'text-violet-400',
    label: 'Conceito Alvo'
  }
}

// Hook para detectar se é mobile
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768 || 'ontouchstart' in window)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])
  
  return isMobile
}

export default function KnowledgeGraph({ workspaces }: KnowledgeGraphProps) {
  const router = useRouter()
  const isMobile = useIsMobile()
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('')
  const [isGeneratingRoadmap, setIsGeneratingRoadmap] = useState(false)
  const [isCreatingNote, setIsCreatingNote] = useState(false)
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
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [selectedNote, setSelectedNote] = useState<any>(null)
  const [isLoadingNote, setIsLoadingNote] = useState(false)
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false)

  // Estados de toque para Pinch-to-Zoom
  const [initialPinchDist, setInitialPinchDist] = useState<number | null>(null)
  const [initialScale, setInitialScale] = useState<number>(1)

  // Estado de indexação automática
  const [isIndexing, setIsIndexing] = useState(false)
  const [indexMessage, setIndexMessage] = useState('')

  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  // Dimensões responsivas
  const width = isMobile ? 600 : 800
  const height = isMobile ? 400 : 550
  const centerX = width / 2
  const centerY = height / 2

  const dependentsCountMap = useMemo(() => {
    const map = new Map<string, number>()
    nodes.forEach(n => map.set(n.id, 0))
    graphData.links.forEach(l => {
      const count = map.get(l.source) || 0
      map.set(l.source, count + 1)
    })
    return map
  }, [nodes, graphData.links])

  const handleGenerateMap = async () => {
    if (!selectedWorkspaceId || isIndexing) return
    setIsIndexing(true)
    setIndexMessage('Analisando notas e gerando mapa de pré-requisitos...')
    try {
      const res = await generateAllWorkspacePrerequisites(selectedWorkspaceId)
      if (res.error) {
        alert(res.error)
      } else {
        setIndexMessage('✓ Mapa de pré-requisitos gerado com sucesso!')
        await loadGraph(selectedWorkspaceId)
      }
    } catch (err) {
      console.error(err)
      alert('Erro ao gerar conexões.')
    } finally {
      setIsIndexing(false)
      setTimeout(() => setIndexMessage(''), 3000)
    }
  }

  const handleCreateFromGhost = async () => {
    if (!selectedNote || !selectedNote.isGhost || isCreatingNote) return
    setIsCreatingNote(true)
    try {
      const newNoteId = await createNoteWithTitle(selectedWorkspaceId, selectedNote.title)
      router.push(`/dashboard/${selectedWorkspaceId}/note/${newNoteId}`)
    } catch (err) {
      console.error(err)
      alert('Falha ao criar nota a partir do conceito.')
    } finally {
      setIsCreatingNote(false)
    }
  }

  const handleExportRoadmap = async () => {
    if (!selectedNote || isGeneratingRoadmap) return
    setIsGeneratingRoadmap(true)
    try {
      const res = await generateStudyRoadmap(selectedNote.id)
      if (res.error || !res.prompt) {
        alert(res.error || 'Falha ao gerar roteiro.')
        return
      }
      
      await navigator.clipboard.writeText(res.prompt)
      
      setIndexMessage('📋 Roteiro Ultra-Condensado copiado para a Área de Transferência!')
      setTimeout(() => setIndexMessage(''), 4000)
    } catch (err) {
      console.error(err)
      alert('Erro ao copiar roteiro.')
    } finally {
      setIsGeneratingRoadmap(false)
    }
  }

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
        const radius = isMobile ? 80 + Math.random() * 40 : 120 + Math.random() * 60
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
      setSelectedNodeIds([])
      setSelectedNote(null)
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }, [centerX, centerY, isMobile])

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
            if (dist < (isMobile ? 180 : 280)) {
              const force = isMobile ? 120 : 180
              const fx = force / (dist * dist) * (dx / dist)
              const fy = force / (dist * dist) * (dy / dist)
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
          const desiredLen = isMobile ? 100 : 150
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
  }, [graphData.links, draggedNodeId, centerX, centerY, nodes.length, isMobile])

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

  // 5.1. Suporte a Gestos e Toques para Dispositivos Móveis (Touch Events)
  const handleNodeTouchStart = (nodeId: string, e: React.TouchEvent) => {
    e.stopPropagation()
    setDraggedNodeId(nodeId)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      setInitialPinchDist(Math.sqrt(dx * dx + dy * dy))
      setInitialScale(transform.scale)
      return
    }
    if (e.touches.length !== 1) return
    const touch = e.touches[0]
    setIsPanning(true)
    setPanStart({ x: touch.clientX - transform.x, y: touch.clientY - transform.y })
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && initialPinchDist) {
      e.preventDefault()
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.sqrt(dx * dx + dy * dy)
      
      const nextScale = initialScale * (dist / initialPinchDist)
      const boundedScale = Math.max(0.15, Math.min(nextScale, 3))
      setTransform(prev => ({ ...prev, scale: boundedScale }))
      return
    }
    
    if (e.touches.length !== 1) return
    const touch = e.touches[0]

    // Arrastando nó no mobile
    if (draggedNodeId) {
      e.preventDefault()
      const rect = svgRef.current?.getBoundingClientRect()
      if (!rect) return

      const clientX = touch.clientX - rect.left
      const clientY = touch.clientY - rect.top
      const svgX = (clientX - transform.x) / transform.scale
      const svgY = (clientY - transform.y) / transform.scale

      setNodes(prev => prev.map(n => n.id === draggedNodeId ? { ...n, x: svgX, y: svgY, vx: 0, vy: 0 } : n))
      return
    }

    // Movendo canvas (panning) no mobile
    if (isPanning) {
      e.preventDefault()
      setTransform(prev => ({
        ...prev,
        x: touch.clientX - panStart.x,
        y: touch.clientY - panStart.y
      }))
    }
  }

  const handleTouchEnd = () => {
    setIsPanning(false)
    setDraggedNodeId(null)
    setInitialPinchDist(null)
  }

  // 6. Carrega detalhes da nota selecionada no painel lateral
  const handleNodeClick = async (nodeId: string, isMultiSelect: boolean) => {
    if (isMultiSelect) {
      setSelectedNodeIds(prev => prev.includes(nodeId) ? prev.filter(id => id !== nodeId) : [...prev, nodeId])
      setFocusedNodeId(null)
      setSelectedNote(null)
      return
    }
    
    setSelectedNodeIds([])
    setFocusedNodeId(nodeId)
    
    const clickedNode = nodes.find(n => n.id === nodeId)
    if (clickedNode?.isGhost) {
      setSelectedNote({
        id: nodeId,
        title: clickedNode.label,
        content: `Este conceito é um pré-requisito necessário para outro conteúdo do seu workspace, mas você ainda não o tem anotado.\n\nClique no botão "Criar Nota" abaixo para criar um resumo sobre ele e começar a estudar!`,
        topic: 'Ausente',
        isGhost: true
      })
      return
    }

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
      setIndexMessage(`Indexação concluída! Mapeando pré-requisitos via IA...`)
      
      await generateAllWorkspacePrerequisites(selectedWorkspaceId)
      
      setIndexMessage(`✓ Conexões indexadas e mapeadas!`)
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
  if (selectedNodeIds.length > 0) {
    selectedNodeIds.forEach(id => connectedNodeIds.add(id))
    graphData.links.forEach(l => {
      if (selectedNodeIds.includes(l.source)) connectedNodeIds.add(l.target)
      if (selectedNodeIds.includes(l.target)) connectedNodeIds.add(l.source)
    })
  } else if (focusedNodeId) {
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
    <div className="relative flex flex-col h-[calc(100dvh-110px)] md:h-[calc(100vh-120px)] min-h-[400px] bg-background text-text-strong rounded-2xl border border-border overflow-hidden">
      
      {/* 🟢 Header de controle - Mobile otimizado */}
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 p-3 md:p-4 border-b border-border bg-surface shrink-0">
        <div className="flex items-center gap-2 md:gap-3">
          <div className="p-1.5 md:p-2 bg-primary-soft text-primary rounded-lg">
            <Network className="size-4 md:size-5" />
          </div>
          <div>
            <h1 className="text-sm md:text-base font-bold text-text-strong">Rede de Conexões</h1>
            <p className="text-[10px] md:text-xs text-text-muted hidden sm:block">Mapeamento conceitual por similaridade vetorial (RAG)</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-2">
            <label htmlFor="ws-select" className="text-[10px] md:text-xs font-semibold text-text-muted uppercase whitespace-nowrap">Workspace:</label>
            <select
              id="ws-select"
              value={selectedWorkspaceId}
              onChange={(e) => setSelectedWorkspaceId(e.target.value)}
              className="flex-1 bg-surface-muted border border-border text-text-strong rounded-lg px-2.5 md:px-3 py-1.5 text-[10px] md:text-xs min-w-[140px] md:min-w-[180px] outline-none focus:border-primary/50"
            >
              {workspaces.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleGenerateMap}
            disabled={isIndexing}
            className="btn-primary py-1.5 px-2.5 md:px-3 text-[10px] md:text-xs flex items-center justify-center gap-1"
            title="Mapear pré-requisitos via IA de todas as notas do workspace"
          >
            {isIndexing ? (
              <Loader2 className="size-3 md:size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3 md:size-3.5" />
            )}
            <span className="hidden sm:inline">Gerar Mapa</span>
            <span className="sm:hidden">Mapa</span>
          </button>
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
          <div className="absolute top-2 md:top-4 left-2 md:left-4 z-20 max-w-[calc(100%-16px)] md:max-w-sm p-2.5 md:p-3 bg-surface border-l-4 border-l-primary border border-border rounded-r-xl rounded-l-md text-[10px] md:text-xs font-medium shadow-lg animate-in fade-in slide-in-from-top-2">
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
          className={`flex-1 relative overflow-hidden select-none outline-none touch-none ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
          onMouseDown={handleSvgMouseDown}
          onMouseMove={handleSvgMouseMove}
          onMouseUp={handleSvgMouseUp}
          onMouseLeave={handleSvgMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        >
          {nodes.length === 0 && !isLoading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-4 md:p-6 text-center">
              <div className="p-3 md:p-4 bg-surface-muted border border-border rounded-full mb-2 md:mb-3 text-text-muted">
                <Network className="size-6 md:size-8" />
              </div>
              <h3 className="font-semibold text-text-strong mb-1 text-sm md:text-base">Nenhuma conexão mapeada</h3>
              <p className="text-text-muted text-[10px] md:text-xs max-w-sm mb-3 md:mb-4 px-4">Seu workspace está vazio ou precisa de processamento de IA para rastrear similaridades conceituais.</p>
              <button 
                onClick={handleStartIndex}
                disabled={isIndexing}
                className="btn-primary py-1.5 px-3 md:px-4 text-[10px] md:text-xs flex items-center gap-1.5"
              >
                <RefreshCw className={`size-3.5 ${isIndexing ? 'animate-spin' : ''}`} />
                Gerar Vetores & Indexar
              </button>
            </div>
          ) : (
            <>
              {/* Barra de controle flutuante do Canvas - Mobile otimizado */}
              <div className="absolute bottom-2 md:bottom-4 left-2 md:left-4 z-10 flex items-center gap-1 p-1 md:p-1.5 bg-surface/90 border border-border rounded-full shadow-md backdrop-blur-xs">
                <button 
                  onClick={() => setIsMultiSelectMode(!isMultiSelectMode)} 
                  className={`p-1.5 md:p-2 rounded-full transition-colors ${isMultiSelectMode ? 'bg-primary text-white shadow-lg' : 'hover:bg-surface-muted text-text-medium'}`} 
                  title="Modo Multiseleção (Mobile/Touch)"
                >
                  <ListChecks className="size-3.5 md:size-4" />
                </button>
                <div className="w-px h-3.5 md:h-4 bg-border"></div>
                <button onClick={() => zoom(1.15)} className="p-1.5 md:p-2 rounded-full hover:bg-surface-muted text-text-medium transition-colors" title="Zoom In"><ZoomIn className="size-3.5 md:size-4" /></button>
                <button onClick={() => zoom(0.85)} className="p-1.5 md:p-2 rounded-full hover:bg-surface-muted text-text-medium transition-colors" title="Zoom Out"><ZoomOut className="size-3.5 md:size-4" /></button>
                <button onClick={resetZoom} className="p-1.5 md:p-2 rounded-full hover:bg-surface-muted text-text-medium transition-colors" title="Focar Grafo"><Maximize2 className="size-3.5 md:size-4" /></button>
                {!hasConnections && (
                  <button 
                    onClick={handleStartIndex}
                    disabled={isIndexing}
                    className="flex items-center gap-1 px-2 py-1 md:px-3 md:py-1.5 ml-1 md:ml-2 text-[9px] md:text-[10px] font-bold uppercase tracking-wide bg-primary/10 text-primary border border-primary/20 rounded-full hover:bg-primary/20 transition-all"
                  >
                    <RefreshCw className={`size-2.5 md:size-3 ${isIndexing ? 'animate-spin' : ''}`} /> 
                    <span className="hidden md:inline">Indexar Conexões</span>
                  </button>
                )}
              </div>

              {/* Elementos Vetoriais */}
              <svg
                ref={svgRef}
                className="w-full h-full"
                onWheel={handleWheel}
                viewBox={`0 0 ${width} ${height}`}
                preserveAspectRatio="xMidYMid meet"
              >
                <defs>
                  <marker
                    id="arrow"
                    viewBox="0 0 10 10"
                    refX="20"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
                  </marker>
                </defs>
                <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
                  
                  {/* Linhas (Links) */}
                  {graphData.links.map((link, idx) => {
                    const sourceNode = nodes.find(n => n.id === link.source)
                    const targetNode = nodes.find(n => n.id === link.target)
                    if (!sourceNode || !targetNode) return null

                    const isHighlighted = focusedNodeId || hoveredNodeId || selectedNodeIds.length > 0
                      ? (link.source === focusedNodeId || link.target === focusedNodeId || link.source === hoveredNodeId || link.target === hoveredNodeId || selectedNodeIds.includes(link.source) || selectedNodeIds.includes(link.target))
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
                          strokeWidth={isHighlighted ? (isMobile ? 1.5 : 2.5) : 1}
                          strokeOpacity={isHighlighted ? 0.6 : 0.1}
                          style={{ color: isHighlighted ? 'var(--primary)' : undefined }}
                          markerEnd="url(#arrow)"
                        />
                      </g>
                    )
                  })}

                  {/* Círculos e Rótulos (Nós) */}
                  {nodes.map((node) => {
                    const dependentsCount = dependentsCountMap.get(node.id) || 0
                    const theme = getNodeTheme(node, dependentsCount)
                    const isFocused = focusedNodeId === node.id || selectedNodeIds.includes(node.id)
                    const isDimmed = (focusedNodeId || hoveredNodeId || selectedNodeIds.length > 0) && !connectedNodeIds.has(node.id)

                    // Tamanhos responsivos para nós
                    const nodeRadius = isMobile 
                      ? (isFocused ? 10 : (node.flashcardsCount && node.flashcardsCount > 0 ? 8 : 6))
                      : (isFocused ? 12 : (node.flashcardsCount && node.flashcardsCount > 0 ? 10 : 8))

                    return (
                      <g
                        key={node.id}
                        transform={`translate(${node.x}, ${node.y})`}
                        className="transition-all duration-150 ease-out cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleNodeClick(node.id, e.ctrlKey || e.metaKey || e.shiftKey || isMultiSelectMode)
                        }}
                        onMouseEnter={() => setHoveredNodeId(node.id)}
                        onMouseLeave={() => setHoveredNodeId(null)}
                      >
                        <title>{node.label}
{node.health !== null && node.health !== undefined ? `Saúde (Retenção): ${Math.round(node.health * 100)}%` : 'Saúde: Sem Flashcards'}</title>
                        {/* Glow effect on focused node */}
                        {isFocused && (
                          <circle
                            r={isMobile ? 14 : 18}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={isMobile ? 2 : 2.5}
                            className={`animate-ping opacity-25 ${theme.text}`}
                          />
                        )}

                        {/* Corpo do Nó */}
                        <circle
                          r={nodeRadius}
                          className={`transition-all duration-300 ${
                            node.isGhost 
                              ? 'fill-zinc-900 stroke-zinc-500' 
                              : theme.fill
                          } ${isDimmed ? 'opacity-20' : 'opacity-100 shadow-md'}`}
                          style={{
                            boxShadow: !isDimmed && !node.isGhost ? `0 0 12px ${theme.glow}` : undefined,
                            stroke: node.isGhost ? 'var(--border)' : (isFocused ? 'currentColor' : 'rgba(255,255,255,0.15)'),
                            strokeWidth: node.isGhost ? 1.5 : (isFocused ? 2 : 1.5),
                            strokeDasharray: node.isGhost ? '3,3' : undefined,
                            color: node.isGhost ? 'var(--text-muted)' : theme.fill.replace('fill-', 'var(--').replace('-500', ')')
                          }}
                          onMouseDown={(e) => handleNodeMouseDown(node.id, e)}
                          onTouchStart={(e) => handleNodeTouchStart(node.id, e)}
                        />

                        {/* Simbolo de '+' em nós fantasma */}
                        {node.isGhost && (
                          <text
                            x={0}
                            y={isMobile ? 2 : 3}
                            textAnchor="middle"
                            className="text-[7px] md:text-[9px] font-extrabold fill-zinc-400 select-none pointer-events-none"
                          >
                            +
                          </text>
                        )}

                        {/* Rótulo de Texto - responsivo */}
                        <text
                          x={0}
                          y={isMobile ? (isFocused ? 20 : 16) : (isFocused ? 26 : 22)}
                          textAnchor="middle"
                          className={`font-bold fill-text-strong select-none transition-all duration-200 ${isDimmed ? 'opacity-10' : 'opacity-100'} ${isMobile ? 'text-[8px] md:text-[10px]' : 'text-[10px]'}`}
                          stroke="var(--background)"
                          strokeWidth={isMobile ? 2 : 2.5}
                          paintOrder="stroke"
                        >
                          {node.label.length > (isMobile ? 15 : 20) ? `${node.label.slice(0, isMobile ? 13 : 18)}...` : node.label}
                        </text>
                      </g>
                    )
                  })}
                </g>
              </svg>
              
              {/* Legenda Explicativa do Grafo - Mobile otimizada */}
              <div className="absolute bottom-2 md:bottom-4 right-2 md:right-4 z-10 flex flex-col gap-1.5 md:gap-2">
                <div className="bg-surface/90 border border-border rounded-lg md:rounded-xl p-2 md:p-3 shadow-lg backdrop-blur-sm max-w-[180px] md:max-w-none">
                  <h4 className="text-[9px] md:text-[10px] font-bold text-text-strong uppercase tracking-wider mb-1.5 md:mb-2">Estrutura do Mapa</h4>
                  <div className="flex flex-col gap-1 md:gap-1.5 text-[9px] md:text-xs font-medium text-text-medium">
                    <div className="flex items-center gap-1.5 md:gap-2">
                      <div className={`size-2 md:size-2.5 rounded-full bg-violet-600 shadow-[0_0_6px_rgba(139,92,246,0.5)]`}></div> 
                      <span className="hidden md:inline">Conceito Alvo (Final)</span>
                      <span className="md:hidden">Alvo</span>
                    </div>
                    <div className="flex items-center gap-1.5 md:gap-2">
                      <div className={`size-2 md:size-2.5 rounded-full bg-sky-500 shadow-[0_0_6px_rgba(14,165,233,0.5)]`}></div> 
                      <span className="hidden md:inline">Intermediário</span>
                      <span className="md:hidden">Inter.</span>
                    </div>
                    <div className="flex items-center gap-1.5 md:gap-2">
                      <div className={`size-2 md:size-2.5 rounded-full bg-emerald-600 shadow-[0_0_6px_rgba(16,185,129,0.5)]`}></div> 
                      <span className="hidden md:inline">Conceito Base (Fundamento)</span>
                      <span className="md:hidden">Base</span>
                    </div>
                    <div className="flex items-center gap-1.5 md:gap-2">
                      <div className="size-2 md:size-2.5 rounded-full bg-zinc-900 border border-dashed border-zinc-500"></div>
                      <span className="hidden md:inline">Pré-requisito Ausente</span>
                      <span className="md:hidden">Ausente</span>
                    </div>
                  </div>
                </div>
                <div className="pointer-events-none opacity-45 text-[8px] md:text-[10px] text-text-muted select-none text-right font-medium leading-normal hidden sm:block">
                  Ctrl/Shift+Click para multiseleção<br />
                  Arraste para organizar
                </div>
              </div>

              {/* Mesa de Operações (Action Hub) - Mobile otimizada */}
              {selectedNodeIds.length > 1 && (
                <div className="absolute top-2 md:top-4 left-2 md:left-1/2 md:-translate-x-1/2 z-30 animate-in slide-in-from-top-4 fade-in duration-200 w-[calc(100%-16px)] md:w-auto">
                  <div className="flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-3 bg-surface/95 border border-border shadow-xl backdrop-blur-md rounded-xl md:rounded-2xl p-2.5 md:p-2 px-3 md:px-4">
                    <div className="flex flex-col">
                      <span className="text-[9px] md:text-[10px] font-bold text-text-muted uppercase tracking-wider">Ação em Lote</span>
                      <span className="text-xs md:text-sm font-bold text-primary">{selectedNodeIds.length} selecionados</span>
                    </div>
                    <div className="h-6 md:h-8 w-px bg-border mx-1 md:mx-2 hidden md:block"></div>
                    <div className="flex flex-col md:flex-row gap-1.5 w-full md:w-auto">
                      <button 
                        onClick={() => window.dispatchEvent(new CustomEvent('open-chat'))}
                        className="btn-primary py-1.5 px-2.5 md:px-3 text-[10px] md:text-xs flex items-center justify-center gap-1"
                      >
                        <BookOpen className="size-3 md:size-3.5" />
                        <span className="md:hidden">Simulado</span>
                        <span className="hidden md:inline">Gerar Simulado</span>
                      </button>
                      <button 
                        onClick={() => window.dispatchEvent(new CustomEvent('open-chat'))}
                        className="btn-ghost py-1.5 px-2.5 md:px-3 text-[10px] md:text-xs flex items-center justify-center gap-1 border border-border hover:bg-surface-muted"
                      >
                        <MessageSquare className="size-3 md:size-3.5" />
                        <span className="md:hidden">Relação</span>
                        <span className="hidden md:inline">Resumir Relação</span>
                      </button>
                      <button 
                        onClick={() => setSelectedNodeIds([])}
                        className="p-1.5 rounded-full text-text-muted hover:bg-rose-500/10 hover:text-rose-500 transition-colors self-start md:self-center"
                        title="Cancelar Seleção"
                      >
                        <X className="size-3.5 md:size-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* 🟢 Painel Lateral de Detalhes - Mobile otimizado */}
        <aside 
          className={`
            absolute top-0 bottom-0 right-0 z-20 
            w-full sm:w-80 md:w-96 
            bg-surface border-l border-border shadow-2xl 
            p-3 md:p-5 
            flex flex-col justify-between 
            transition-transform duration-300 pointer-events-auto 
            ${focusedNodeId ? 'translate-x-0' : 'translate-x-full'}
          `}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseMove={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          <div className="flex-1 overflow-y-auto pr-1">
            <header className="flex items-start justify-between gap-2 md:gap-3 mb-3 md:mb-5 shrink-0">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 md:px-2.5 md:py-0.5 text-[9px] md:text-[10px] font-bold uppercase tracking-wider ${
                selectedNote 
                  ? getNodeTheme(
                      nodes.find(n => n.id === selectedNote.id) || { id: selectedNote.id, label: selectedNote.title, topic: selectedNote.topic, isGhost: selectedNote.isGhost },
                      dependentsCountMap.get(selectedNote.id) || 0
                    ).bg 
                  : 'bg-slate-700'
              } text-white`}>
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
                <X className="size-3.5 md:size-4" />
              </button>
            </header>

            {isLoadingNote ? (
              <div className="flex flex-col items-center justify-center py-12 md:py-16 gap-2">
                <Loader2 className="size-5 md:size-6 animate-spin text-primary" />
                <span className="text-[10px] md:text-xs text-text-muted font-medium">Buscando conteúdo...</span>
              </div>
            ) : selectedNote ? (
              <div className="animate-in fade-in slide-in-from-right-4 duration-200">
                <h2 className="text-sm md:text-base font-extrabold text-text-strong mb-1.5 md:mb-2 leading-tight">
                  {selectedNote.title}
                </h2>
                
                {/* Visualização de conexões locais */}
                <div className="mb-4 md:mb-6">
                  <h4 className="text-[9px] md:text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1.5 md:mb-2">Conceitos Conectados</h4>
                  <div className="space-y-1">
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
                            onClick={() => handleNodeClick(targetNode.id, false)}
                            className="flex items-center justify-between w-full p-1.5 md:p-2 text-left rounded-lg text-[9px] md:text-xs bg-surface-muted hover:bg-border transition-colors group"
                          >
                            <span className="font-semibold text-text-medium truncate pr-2 group-hover:text-text-strong transition-colors">{targetNode.label}</span>
                            <span className="shrink-0 text-[8px] md:text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-1 py-0.5 md:px-1.5 md:py-0.5 rounded-full">{pct}%</span>
                          </button>
                        )
                      })}
                  </div>
                </div>

                {/* Pré-visualização do conteúdo */}
                <div className="border-t border-border pt-3 md:pt-4">
                  <h4 className="text-[9px] md:text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1.5 md:mb-2">Prévia do Conteúdo</h4>
                  <p className="text-[9px] md:text-xs text-text-muted leading-relaxed line-clamp-[10] md:line-clamp-[12] whitespace-pre-wrap bg-surface-muted/50 p-2.5 md:p-3 rounded-lg md:rounded-xl border border-border/30">
                    {selectedNote.content ? selectedNote.content.replace(/Fonte:.*?\n\n---\n\n/, '') : 'Sem conteúdo.'}
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          {/* Botões de Ação na base - Mobile otimizado */}
          {selectedNote && (
            <div className="border-t border-border pt-3 md:pt-4 mt-3 md:mt-4 shrink-0 space-y-2">
              {selectedNote.isGhost ? (
                <button 
                  onClick={handleCreateFromGhost}
                  disabled={isCreatingNote}
                  className="btn-primary w-full py-2 text-[10px] md:text-xs font-semibold flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className={`size-3.5 ${isCreatingNote ? 'animate-spin' : ''}`} />
                  {isCreatingNote ? 'Criando...' : 'Criar Nota do Conceito'}
                </button>
              ) : (
                <>
                  <Link 
                    href={`/dashboard/${selectedWorkspaceId}/note/${selectedNote.id}`}
                    className="btn-primary w-full py-2 text-[10px] md:text-xs font-semibold flex items-center justify-center gap-1.5"
                  >
                    <BookOpen className="size-3.5" />
                    <span className="md:hidden">Abrir</span>
                    <span className="hidden md:inline">Abrir no Editor</span>
                    <ArrowRight className="size-3.5" />
                  </Link>
                  <button 
                    onClick={handleExportRoadmap}
                    disabled={isGeneratingRoadmap}
                    className="btn-ghost w-full py-2 text-[10px] md:text-xs font-semibold flex items-center justify-center gap-1.5 border border-border hover:bg-surface-muted"
                  >
                    {isGeneratingRoadmap ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <ListChecks className="size-3.5" />
                    )}
                    <span className="md:hidden">Roteiro</span>
                    <span className="hidden md:inline">📋 Gerar Roteiro de Estudo</span>
                  </button>
                  <button 
                    onClick={() => window.dispatchEvent(new CustomEvent('open-chat'))}
                    className="btn-ghost w-full py-2 text-[10px] md:text-xs font-semibold flex items-center justify-center gap-1.5"
                  >
                    <MessageSquare className="size-3.5" />
                    <span className="md:hidden">Chat</span>
                    <span className="hidden md:inline">Conversar no Assistente</span>
                  </button>
                </>
              )}
            </div>
          )}
        </aside>

      </div>
    </div>
  )
}
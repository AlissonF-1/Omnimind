'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import {
  X,
  Save,
  Trash2,
  Undo2,
  Redo2,
  Eraser,
  PenTool,
  Circle,
  Square,
  ArrowRight,
  Minus,
  Grid,
  Type,
} from 'lucide-react'

interface SketchpadProps {
  noteId: string
  onClose: () => void
  onSave: (imageUrl: string) => void
}

type Tool = 'pen' | 'line' | 'arrow' | 'rect' | 'circle' | 'eraser' | 'text'

export default function Sketchpad({ noteId, onClose, onSave }: SketchpadProps) {
  const supabase = createClient()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState<string>('#ffffff')
  const [lineWidth, setLineWidth] = useState<number>(3)
  const [isSaving, setIsSaving] = useState(false)
  const [showGrid, setShowGrid] = useState(true)

  // Histórico para Desfazer/Refazer do Canvas
  const historyRef = useRef<ImageData[]>([])
  const historyPointerRef = useRef<number>(-1)

  // Estados de desenho
  const isDrawingRef = useRef(false)
  const startXRef = useRef(0)
  const startYRef = useRef(0)
  const lastXRef = useRef(0)
  const lastYRef = useRef(0)
  const snapshotRef = useRef<ImageData | null>(null)
  const [fillMode, setFillMode] = useState(false)
  const pointsRef = useRef<{ x: number; y: number }[]>([])
  
  // Estados da Ferramenta de Texto
  const [textInput, setTextInput] = useState<{ x: number; y: number } | null>(null)
  const [textInputValue, setTextInputValue] = useState('')
  const textInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Ajusta a resolução interna do canvas para o tamanho visível
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect()
      // Salva o conteúdo anterior antes de redimensionar
      let tempImage: ImageData | null = null
      try {
        tempImage = ctx.getImageData(0, 0, canvas.width, canvas.height)
      } catch (_) {}

      canvas.width = rect.width
      canvas.height = rect.height

      // Preenche fundo escuro
      ctx.fillStyle = '#09090b' // zinc-950
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      if (tempImage) {
        ctx.putImageData(tempImage, 0, 0)
      } else {
        saveState(ctx)
      }
    };

    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    return () => {
      window.removeEventListener('resize', resizeCanvas)
    }
  }, [])

  // 1. Previne scroll no mobile quando desenhando no canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const preventScroll = (e: TouchEvent) => {
      if (e.target === canvas) {
        e.preventDefault()
      }
    }

    canvas.addEventListener('touchstart', preventScroll, { passive: false })
    canvas.addEventListener('touchmove', preventScroll, { passive: false })
    canvas.addEventListener('touchend', preventScroll, { passive: false })

    return () => {
      canvas.removeEventListener('touchstart', preventScroll)
      canvas.removeEventListener('touchmove', preventScroll)
      canvas.removeEventListener('touchend', preventScroll)
    }
  }, [])

  // 2. Atalhos de Teclado para Desktop
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement || 
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        return
      }
      
      const key = e.key.toLowerCase()

      if ((e.ctrlKey || e.metaKey) && key === 'z') {
        e.preventDefault()
        if (e.shiftKey) {
          handleRedo()
        } else {
          handleUndo()
        }
        return
      }
      if ((e.ctrlKey || e.metaKey) && key === 'y') {
        e.preventDefault()
        handleRedo()
        return
      }
      
      switch(key) {
        case 'b': setTool('pen'); break
        case 'e': setTool('eraser'); break
        case 'r': setTool('rect'); break
        case 'c': setTool('circle'); break
        case 'l': setTool('line'); break
        case 'a': setTool('arrow'); break
        case 't': setTool('text'); break
        case '[': setLineWidth(w => Math.max(1, w - 1)); break
        case ']': setLineWidth(w => Math.min(20, w + 1)); break
        case 'delete':
        case 'backspace':
          handleClear()
          break
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Estampa o texto final no Canvas
  const stampText = (coords: { x: number; y: number }, value: string) => {
    if (!value.trim()) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = color
    ctx.font = `bold ${Math.max(14, lineWidth * 4)}px Inter, sans-serif`
    ctx.textBaseline = 'middle'
    ctx.fillText(value, coords.x, coords.y)
    saveState(ctx)
  }

  const handleStampText = () => {
    if (textInput) {
      stampText(textInput, textInputValue)
      setTextInput(null)
      setTextInputValue('')
    }
  }

  // Foca o input de texto automaticamente
  useEffect(() => {
    if (textInput && textInputRef.current) {
      textInputRef.current.focus()
    }
  }, [textInput])

  // Estampa texto automaticamente caso mude de ferramenta
  useEffect(() => {
    if (tool !== 'text' && textInput) {
      handleStampText()
    }
  }, [tool])

  const saveState = (ctx: CanvasRenderingContext2D) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)

    // Remove qualquer estado à frente do ponteiro atual (caso tenha desfeito e desenhado algo novo)
    if (historyPointerRef.current < historyRef.current.length - 1) {
      historyRef.current = historyRef.current.slice(0, historyPointerRef.current + 1)
    }

    historyRef.current.push(imgData)
    // Limita o histórico a 30 estados para poupar memória
    if (historyRef.current.length > 30) {
      historyRef.current.shift()
    }
    historyPointerRef.current = historyRef.current.length - 1
  }

  const handleUndo = () => {
    const canvas = canvasRef.current
    if (!canvas || historyPointerRef.current <= 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    historyPointerRef.current--
    ctx.putImageData(historyRef.current[historyPointerRef.current], 0, 0)
  }

  const handleRedo = () => {
    const canvas = canvasRef.current
    if (!canvas || historyPointerRef.current >= historyRef.current.length - 1) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    historyPointerRef.current++
    ctx.putImageData(historyRef.current[historyPointerRef.current], 0, 0)
  }

  const handleClear = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#09090b'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    saveState(ctx)
  }

  // Obter coordenadas relativas corretas
  const getCoordinates = (e: any): { x: number; y: number } => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()

    let clientX = 0
    let clientY = 0

    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX
      clientY = e.touches[0].clientY
    } else {
      clientX = e.clientX
      clientY = e.clientY
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    }
  }

  // Iniciar desenho
  const startDrawing = (e: any) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { x, y } = getCoordinates(e)

    if (tool === 'text') {
      if (textInput) {
        stampText(textInput, textInputValue)
      }
      setTextInput({ x, y })
      setTextInputValue('')
      return
    }

    isDrawingRef.current = true
    startXRef.current = x
    startYRef.current = y
    lastXRef.current = x
    lastYRef.current = y

    if (tool === 'pen') {
      pointsRef.current = [{ x, y }]
    }

    // Salva o snapshot atual para preview de formas geométricas
    snapshotRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height)
  }

  // Desenhar
  const draw = (e: any) => {
    if (!isDrawingRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { x, y } = getCoordinates(e)

    ctx.lineWidth = lineWidth
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    if (tool === 'eraser') {
      ctx.strokeStyle = '#09090b' // Cor de fundo do canvas para apagar
      ctx.beginPath()
      ctx.moveTo(lastXRef.current, lastYRef.current)
      ctx.lineTo(x, y)
      ctx.stroke()
      lastXRef.current = x
      lastYRef.current = y
      return
    }

    ctx.strokeStyle = color

    // Caneta livre com suavização por curva quadrática
    if (tool === 'pen') {
      pointsRef.current.push({ x, y })
      if (pointsRef.current.length < 2) return

      if (snapshotRef.current) {
        ctx.putImageData(snapshotRef.current, 0, 0)
      }

      ctx.beginPath()
      ctx.moveTo(pointsRef.current[0].x, pointsRef.current[0].y)

      for (let i = 1; i < pointsRef.current.length - 1; i++) {
        const xc = (pointsRef.current[i].x + pointsRef.current[i + 1].x) / 2
        const yc = (pointsRef.current[i].y + pointsRef.current[i + 1].y) / 2
        ctx.quadraticCurveTo(pointsRef.current[i].x, pointsRef.current[i].y, xc, yc)
      }

      const lastPoint = pointsRef.current[pointsRef.current.length - 1]
      ctx.lineTo(lastPoint.x, lastPoint.y)
      ctx.stroke()
      return
    }

    // Para formas geométricas (restauramos o estado do canvas e redesenhamos a prévia da forma)
    if (snapshotRef.current) {
      ctx.putImageData(snapshotRef.current, 0, 0)
    }

    ctx.beginPath()
    if (tool === 'line') {
      ctx.moveTo(startXRef.current, startYRef.current)
      ctx.lineTo(x, y)
      ctx.stroke()
    } else if (tool === 'rect') {
      const width = x - startXRef.current
      const height = y - startYRef.current
      if (fillMode) {
        ctx.fillStyle = color
        ctx.fillRect(startXRef.current, startYRef.current, width, height)
      }
      ctx.strokeRect(startXRef.current, startYRef.current, width, height)
    } else if (tool === 'circle') {
      const radius = Math.sqrt(Math.pow(x - startXRef.current, 2) + Math.pow(y - startYRef.current, 2))
      ctx.arc(startXRef.current, startYRef.current, radius, 0, 2 * Math.PI)
      if (fillMode) {
        ctx.fillStyle = color
        ctx.fill()
      }
      ctx.stroke()
    } else if (tool === 'arrow') {
      const sx = startXRef.current
      const sy = startYRef.current
      ctx.moveTo(sx, sy)
      ctx.lineTo(x, y)
      ctx.stroke()

      // Desenhar a cabeça da seta
      const angle = Math.atan2(y - sy, x - sx)
      const arrowLength = 15
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x - arrowLength * Math.cos(angle - Math.PI / 6), y - arrowLength * Math.sin(angle - Math.PI / 6))
      ctx.moveTo(x, y)
      ctx.lineTo(x - arrowLength * Math.cos(angle + Math.PI / 6), y - arrowLength * Math.sin(angle + Math.PI / 6))
      ctx.stroke()
    }
  }

  // Parar desenho
  const stopDrawing = () => {
    if (!isDrawingRef.current) return
    isDrawingRef.current = false
    pointsRef.current = []
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (ctx) saveState(ctx)
  }

  // Salvar imagem
  const handleSave = () => {
    const canvas = canvasRef.current
    if (!canvas || isSaving) return

    setIsSaving(true)

    canvas.toBlob(async (blob) => {
      if (!blob) {
        setIsSaving(false)
        return
      }

      try {
        const filename = `${Date.now()}_sketch.png`
        const path = `${noteId}/${filename}`

        // Upload da imagem no bucket note_images
        const { error: uploadError } = await supabase.storage
          .from('note_images')
          .upload(path, blob, {
            contentType: 'image/png',
            cacheControl: '3600',
            upsert: true,
          })

        if (uploadError) throw uploadError

        // Obter URL pública
        const { data } = supabase.storage.from('note_images').getPublicUrl(path)
        if (!data?.publicUrl) throw new Error('Não foi possível obter a URL pública')

        onSave(data.publicUrl)
      } catch (err) {
        console.error('Erro ao salvar desenho:', err)
        alert('Falha ao salvar o desenho. Certifique-se de que o bucket "note_images" está configurado no Supabase.')
      } finally {
        setIsSaving(false)
      }
    }, 'image/png')
  }

  const COLORS = [
    { name: 'Branco', hex: '#ffffff' },
    { name: 'Vermelho', hex: '#ef4444' },
    { name: 'Laranja', hex: '#f97316' },
    { name: 'Amarelo', hex: '#eab308' },
    { name: 'Verde', hex: '#22c55e' },
    { name: 'Azul', hex: '#3b82f6' },
    { name: 'Indigo', hex: '#6366f1' },
    { name: 'Roxo', hex: '#a855f7' },
    { name: 'Rosa', hex: '#ec4899' },
    { name: 'Teal', hex: '#14b8a6' },
    { name: 'Cinza', hex: '#78716c' },
    { name: 'Preto', hex: '#000000' }
  ]

  const TOOLS = [
    { id: 'pen', label: 'Caneta', icon: PenTool },
    { id: 'line', label: 'Reta', icon: Minus },
    { id: 'arrow', label: 'Seta', icon: ArrowRight },
    { id: 'rect', label: 'Retângulo', icon: Square },
    { id: 'circle', label: 'Círculo', icon: Circle },
    { id: 'text', label: 'Texto', icon: Type },
    { id: 'eraser', label: 'Borracha', icon: Eraser },
  ] as const

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between border-b border-border bg-zinc-950 px-4 py-3">
        <div className="flex items-center gap-2">
          <PenTool className="size-5 text-primary" />
          <h3 className="text-sm font-bold text-text-strong">Quadro de Esboço (Sketchpad)</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowGrid(!showGrid)}
            title="Alternar Quadrícula"
            className={`btn-ghost p-2 rounded-lg ${showGrid ? 'bg-primary/10 text-primary' : 'text-text-muted'}`}
          >
            <Grid className="size-4" />
          </button>
          <button
            onClick={handleUndo}
            disabled={historyPointerRef.current <= 0}
            title="Desfazer"
            className="btn-ghost p-2 rounded-lg text-text-strong disabled:opacity-40"
          >
            <Undo2 className="size-4" />
          </button>
          <button
            onClick={handleRedo}
            disabled={historyPointerRef.current >= historyRef.current.length - 1}
            title="Refazer"
            className="btn-ghost p-2 rounded-lg text-text-strong disabled:opacity-40"
          >
            <Redo2 className="size-4" />
          </button>
          <button
            onClick={handleClear}
            title="Limpar Tela"
            className="btn-ghost p-2 rounded-lg text-error hover:bg-error-soft/10"
          >
            <Trash2 className="size-4" />
          </button>
          <span className="h-5 w-px bg-border mx-1" />
          <button
            onClick={onClose}
            className="btn-secondary text-xs px-3 py-1.5"
            disabled={isSaving}
          >
            <X className="size-4 mr-1 inline" /> Cancelar
          </button>
          <button
            onClick={handleSave}
            className="btn-primary text-xs px-3 py-1.5"
            disabled={isSaving}
          >
            {isSaving ? 'Salvando...' : (
              <>
                <Save className="size-4 mr-1 inline" /> Inserir na Nota
              </>
            )}
          </button>
        </div>
      </header>

      {/* Área de Desenho */}
      <div className="relative flex-1 min-h-0 overflow-hidden bg-zinc-950 select-none">
        {/* Grade de fundo estilo caderno */}
        {showGrid && (
          <div 
            className="absolute inset-0 pointer-events-none opacity-20"
            style={{
              backgroundImage: 'linear-gradient(to right, #27272a 1px, transparent 1px), linear-gradient(to bottom, #27272a 1px, transparent 1px)',
              backgroundSize: '24px 24px'
            }}
          />
        )}
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="h-full w-full cursor-crosshair touch-none"
        />

        {/* Input flutuante de texto */}
        {textInput && (
          <input
            ref={textInputRef}
            type="text"
            value={textInputValue}
            onChange={(e) => setTextInputValue(e.target.value)}
            onBlur={handleStampText}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleStampText()
              } else if (e.key === 'Escape') {
                setTextInput(null)
                setTextInputValue('')
              }
            }}
            style={{
              position: 'absolute',
              left: `${textInput.x}px`,
              top: `${textInput.y}px`,
              transform: 'translateY(-50%)',
              color: color,
              font: `bold ${Math.max(14, lineWidth * 4)}px Inter, sans-serif`,
              background: 'rgba(9, 9, 11, 0.95)',
              border: `1px dashed ${color}`,
              padding: '2px 6px',
              borderRadius: '4px',
              outline: 'none',
              zIndex: 30,
              minWidth: '140px',
              caretColor: color,
            }}
          />
        )}
      </div>

      {/* Caixa de Ferramentas Inferior */}
      <footer className="flex flex-col gap-3 border-t border-border bg-zinc-950 p-4 shrink-0 sm:flex-row sm:items-center sm:justify-between">
        {/* Ferramentas */}
        <div className="flex flex-wrap items-center gap-1 justify-center sm:justify-start">
          {TOOLS.map((t) => {
            const Icon = t.icon
            return (
              <button
                key={t.id}
                onClick={() => setTool(t.id)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  tool === t.id
                    ? 'bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20'
                    : 'bg-surface border-border text-text-medium hover:bg-surface-muted'
                }`}
                title={t.label}
              >
                <Icon className="size-4" />
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-4 justify-between sm:justify-end flex-1 sm:flex-none">
          {/* Preenchimento Toggle */}
          {(tool === 'rect' || tool === 'circle') && (
            <button
              onClick={() => setFillMode(!fillMode)}
              className={`px-3 py-1.5 text-xs font-bold uppercase rounded-lg border transition-all ${
                fillMode 
                  ? 'bg-primary/20 text-primary border-primary/30 shadow-sm' 
                  : 'bg-surface border-border text-text-muted hover:text-text-medium'
              }`}
            >
              Preencher
            </button>
          )}

          {/* Paleta de Cores */}
          {tool !== 'eraser' && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider">Cor:</span>
              <div className="flex flex-wrap items-center gap-1 max-w-[130px] sm:max-w-none">
                {COLORS.map((c) => (
                  <button
                    key={c.hex}
                    onClick={() => setColor(c.hex)}
                    style={{ backgroundColor: c.hex }}
                    title={c.name}
                    className={`size-5 rounded-full border transition-all ${
                      color === c.hex
                        ? 'border-primary scale-110 shadow-md ring-2 ring-primary/20'
                        : 'border-zinc-800 scale-100 hover:scale-105'
                    }`}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Espessura da Linha */}
          <div className="flex items-center gap-2 flex-1 sm:flex-none">
            <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider shrink-0">Linha:</span>
            <input
              type="range"
              min="1"
              max="15"
              value={lineWidth}
              onChange={(e) => setLineWidth(parseInt(e.target.value))}
              className="h-1.5 w-24 sm:w-32 rounded-lg bg-border accent-primary cursor-pointer"
            />
            <span className="text-xs text-text-strong font-semibold w-4 text-right shrink-0">{lineWidth}px</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

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
  HelpCircle,
  Loader2,
} from 'lucide-react'

interface SketchpadProps {
  noteId: string
  onClose: () => void
  onSave: (imageUrl: string) => void
}

interface TextLabel {
  id: string
  x: number
  y: number
  value: string
  fontSize: number
  fontFamily: string
  fontWeight: string
  fontStyle: string
  textAlign: string
  color: string
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

  // 🟢 Configurações da Ferramenta de Texto
  const [fontSize, setFontSize] = useState<number>(20)
  const [fontFamily, setFontFamily] = useState<string>('Inter')
  const [fontWeight, setFontWeight] = useState<'bold' | 'normal'>('bold')
  const [fontStyle, setFontStyle] = useState<'italic' | 'normal'>('normal')
  const [textAlign, setTextAlign] = useState<string>('left')

  // 🟢 Estados do Viewport (Zoom e Pan)
  const [viewport, setViewport] = useState({ scale: 1, offsetX: 0, offsetY: 0 })
  const pinchStartDistRef = useRef(0)
  const pinchStartScaleRef = useRef(1)

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
  
  // Estados da Ferramenta de Texto (Camada de Vetores Interativa)
  const [textLabels, setTextLabels] = useState<TextLabel[]>([])
  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  const [textInputValue, setTextInputValue] = useState('')
  const textInputRef = useRef<HTMLInputElement | null>(null)
  
  // Arrastar caixas de texto
  const [draggedLabelId, setDraggedLabelId] = useState<string | null>(null)
  const dragStartOffsetRef = useRef({ x: 0, y: 0 })
  
  // Estado de ajuda de atalhos
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false)

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

  // 🟢 Aplica transformação de escala e pan no contexto
  const applyViewport = (ctx: CanvasRenderingContext2D) => {
    ctx.setTransform(
      viewport.scale, 0,
      0, viewport.scale,
      viewport.offsetX, viewport.offsetY
    )
  }

  // Foca o input de texto automaticamente com um pequeno timeout para aguardar a montagem no DOM
  useEffect(() => {
    if (editingTextId) {
      const timer = setTimeout(() => {
        if (textInputRef.current) {
          textInputRef.current.focus()
        }
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [editingTextId])

  // Estampa texto automaticamente caso mude de ferramenta
  useEffect(() => {
    if (tool !== 'text' && editingTextId) {
      handleStampText()
    }
  }, [tool, editingTextId])

  // Estampa os textos finais no Canvas com suporte a múltiplas linhas e viewport ao salvar
  const stampAllLabels = (ctx: CanvasRenderingContext2D) => {
    textLabels.forEach((l) => {
      if (!l.value.trim()) return
      ctx.save()
      ctx.setTransform(
        viewport.scale, 0,
        0, viewport.scale,
        viewport.offsetX, viewport.offsetY
      )
      ctx.fillStyle = l.color
      ctx.font = `${l.fontStyle} ${l.fontWeight} ${l.fontSize}px ${l.fontFamily}, sans-serif`
      ctx.textBaseline = 'middle'
      ctx.textAlign = l.textAlign as CanvasTextAlign

      const lines = l.value.split('\n')
      const lineHeight = l.fontSize * 1.2
      lines.forEach((line, index) => {
        ctx.fillText(line, l.x, l.y + index * lineHeight)
      })
      ctx.restore()
    })
  }

  const handleStampText = () => {
    if (editingTextId) {
      if (!textInputValue.trim()) {
        setTextLabels(prev => prev.filter(l => l.id !== editingTextId))
      } else {
        setTextLabels(prev => prev.map(l => {
          if (l.id === editingTextId) {
            return { ...l, value: textInputValue }
          }
          return l
        }))
      }
      setEditingTextId(null)
      setTextInputValue('')
    }
  }

  const handleLabelMouseDown = (labelId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const label = textLabels.find(l => l.id === labelId)
    if (!label) return

    const { x, y } = getCoordinates(e)
    dragStartOffsetRef.current = {
      x: x - label.x,
      y: y - label.y,
    }
    setDraggedLabelId(labelId)
  }

  const handleLabelTouchStart = (labelId: string, e: React.TouchEvent) => {
    e.stopPropagation()
    const label = textLabels.find(l => l.id === labelId)
    if (!label) return

    const { x, y } = getCoordinates(e)
    dragStartOffsetRef.current = {
      x: x - label.x,
      y: y - label.y,
    }
    setDraggedLabelId(labelId)
  }

  const handleLabelClick = (labelId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (tool === 'text') {
      const label = textLabels.find(l => l.id === labelId)
      if (label) {
        setTextInputValue(label.value)
        setEditingTextId(labelId)
      }
    }
  }

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

  // Eventos de Zoom e Pan (Desktop e Mobile)
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1
      setViewport(prev => ({
        ...prev,
        scale: Math.max(0.1, Math.min(5, prev.scale * zoomFactor)),
      }))
    } else {
      setViewport(prev => ({
        ...prev,
        offsetX: prev.offsetX - e.deltaX,
        offsetY: prev.offsetY - e.deltaY,
      }))
    }
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
      pinchStartDistRef.current = dist
      pinchStartScaleRef.current = viewport.scale
    } else {
      startDrawing(e)
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault()
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
      const newScale = (dist / pinchStartDistRef.current) * pinchStartScaleRef.current
      setViewport(prev => ({ ...prev, scale: Math.max(0.1, Math.min(5, newScale)) }))
    } else {
      draw(e)
    }
  }

  // Obter coordenadas relativas corrigidas pelo viewport
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

    const screenX = clientX - rect.left
    const screenY = clientY - rect.top

    return {
      x: (screenX - viewport.offsetX) / viewport.scale,
      y: (screenY - viewport.offsetY) / viewport.scale,
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
      if (e && typeof e.preventDefault === 'function') {
        e.preventDefault()
      }
      if (editingTextId) {
        handleStampText()
      }
      const newId = Math.random().toString(36).substring(2, 9)
      const newLabel: TextLabel = {
        id: newId,
        x,
        y,
        value: '',
        fontSize,
        fontFamily,
        fontWeight,
        fontStyle,
        textAlign,
        color,
      }
      setTextLabels((prev) => [...prev, newLabel])
      setTextInputValue('')
      setEditingTextId(newId)
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
    if (draggedLabelId) {
      const { x, y } = getCoordinates(e)
      setTextLabels(prev => prev.map(l => {
        if (l.id === draggedLabelId) {
          return {
            ...l,
            x: x - dragStartOffsetRef.current.x,
            y: y - dragStartOffsetRef.current.y
          }
        }
        return l
      }))
      return
    }

    if (!isDrawingRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { x, y } = getCoordinates(e)

    // Aplica o transform de zoom/pan antes de desenhar
    applyViewport(ctx)

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
    if (draggedLabelId) {
      setDraggedLabelId(null)
      return
    }
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

    // Cria um canvas clone para carimbar as caixas de texto apenas no salvamento
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = canvas.width
    tempCanvas.height = canvas.height
    const tempCtx = tempCanvas.getContext('2d')
    if (tempCtx) {
      tempCtx.drawImage(canvas, 0, 0)
      stampAllLabels(tempCtx)
    }

    tempCanvas.toBlob(async (blob) => {
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
      <header className="flex shrink-0 items-center justify-between border-b border-border bg-zinc-950 px-3 py-2">
        {/* Lado esquerdo: Botão fechar/cancelar + Título */}
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            disabled={isSaving}
            title="Cancelar"
            className="p-1.5 text-text-muted hover:text-text-strong hover:bg-surface-muted rounded-lg transition-colors"
          >
            <X className="size-4" />
          </button>
          <h3 className="text-xs font-bold text-text-strong hidden sm:block">Quadro de Esboço</h3>
        </div>

        {/* Lado direito: Ações do canvas + Botão Salvar */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowGrid(!showGrid)}
            title="Alternar Grade"
            className={`p-1.5 rounded-lg transition-colors ${showGrid ? 'bg-primary/10 text-primary' : 'text-text-muted hover:text-text-strong hover:bg-surface-muted'}`}
          >
            <Grid className="size-4" />
          </button>
          <button
            onClick={() => setShowShortcutsHelp(!showShortcutsHelp)}
            title="Atalhos de Teclado"
            className={`p-1.5 rounded-lg hidden md:inline-flex ${showShortcutsHelp ? 'bg-primary/10 text-primary' : 'text-text-muted hover:text-text-strong hover:bg-surface-muted'}`}
          >
            <HelpCircle className="size-4" />
          </button>
          
          <div className="w-px h-4 bg-border mx-0.5 hidden sm:block"></div>
          
          <button
            onClick={handleUndo}
            disabled={historyPointerRef.current <= 0}
            title="Desfazer"
            className="p-1.5 rounded-lg text-text-strong hover:bg-surface-muted disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <Undo2 className="size-4" />
          </button>
          <button
            onClick={handleRedo}
            disabled={historyPointerRef.current >= historyRef.current.length - 1}
            title="Refazer"
            className="p-1.5 rounded-lg text-text-strong hover:bg-surface-muted disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <Redo2 className="size-4" />
          </button>
          <button
            onClick={handleClear}
            title="Limpar Tela"
            className="p-1.5 rounded-lg text-error hover:bg-error-soft/10 transition-colors"
          >
            <Trash2 className="size-4" />
          </button>

          <div className="w-px h-4 bg-border mx-0.5"></div>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="btn-primary py-1.5 px-2.5 sm:px-3 text-xs flex items-center gap-1.5 font-bold"
            title="Inserir na Nota"
          >
            {isSaving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            <span className="hidden sm:inline">Inserir na Nota</span>
          </button>
        </div>
      </header>

      {/* Área de Desenho */}
      <div 
        className="relative flex-1 min-h-0 overflow-hidden bg-zinc-950 select-none"
        onWheel={handleWheel}
      >
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
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={stopDrawing}
          className={`h-full w-full cursor-${tool === 'text' ? 'text' : 'crosshair'} touch-none`}
        />

        {/* Textarea flutuante de texto com autoResize */}
        {textLabels.map((l) => {
          const isEditing = l.id === editingTextId
          if (isEditing) {
            return (
              <div
                key={l.id}
                style={{
                  position: 'absolute',
                  left: `${l.x * viewport.scale + viewport.offsetX}px`,
                  top: `${l.y * viewport.scale + viewport.offsetY}px`,
                  transform: 'translateY(-50%)',
                  zIndex: 30,
                }}
              >
                <textarea
                  ref={textInputRef as any}
                  value={textInputValue}
                  onChange={(e) => setTextInputValue(e.target.value)}
                  onBlur={handleStampText}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleStampText()
                    } else if (e.key === 'Escape') {
                      setEditingTextId(null)
                    }
                  }}
                  style={{
                    color: l.color,
                    font: `${l.fontStyle} ${l.fontWeight} ${l.fontSize * viewport.scale}px ${l.fontFamily}, sans-serif`,
                    background: 'rgba(9, 9, 11, 0.95)',
                    border: `1.5px dashed ${l.color}`,
                    padding: '4px 8px',
                    borderRadius: '6px',
                    outline: 'none',
                    minWidth: '150px',
                    textAlign: l.textAlign as any,
                    caretColor: l.color,
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
                    resize: 'both',
                  }}
                />
                <button
                  onMouseDown={(e) => e.stopPropagation()} // Evita desfocar
                  onClick={() => {
                    setTextLabels(prev => prev.filter(item => item.id !== l.id))
                    setEditingTextId(null)
                  }}
                  className="absolute -top-2.5 -right-2.5 bg-red-600 hover:bg-red-700 text-white p-1 rounded-full shadow-md z-40 transition-colors"
                  title="Remover Texto"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            )
          }

          return (
            <div
              key={l.id}
              onMouseDown={(e) => handleLabelMouseDown(l.id, e)}
              onTouchStart={(e) => handleLabelTouchStart(l.id, e)}
              onClick={(e) => handleLabelClick(l.id, e)}
              className="absolute select-none z-20 px-2 py-1 border border-transparent rounded-lg cursor-move hover:border-dashed hover:border-zinc-700 hover:bg-zinc-900/35 transition-all"
              style={{
                left: `${l.x * viewport.scale + viewport.offsetX}px`,
                top: `${l.y * viewport.scale + viewport.offsetY}px`,
                transform: 'translateY(-50%)',
                color: l.color,
                font: `${l.fontStyle} ${l.fontWeight} ${l.fontSize * viewport.scale}px ${l.fontFamily}, sans-serif`,
                textAlign: l.textAlign as any,
              }}
            >
              {l.value.split('\n').map((line, idx) => (
                <div key={idx}>{line || '\u00A0'}</div>
              ))}
            </div>
          )
        })}

        {/* Card flutuante de Atalhos de Teclado */}
        {showShortcutsHelp && (
          <div className="absolute top-4 right-4 z-40 bg-zinc-950/95 border border-border rounded-xl p-4 shadow-2xl w-56 animate-in slide-in-from-top-2 fade-in duration-200">
            <div className="flex items-center justify-between mb-3 border-b border-border pb-2">
              <span className="text-[10px] font-bold text-text-strong uppercase tracking-wider">Atalhos de Teclado</span>
              <button onClick={() => setShowShortcutsHelp(false)} className="text-text-muted hover:text-text-strong p-0.5">
                <X className="size-3.5" />
              </button>
            </div>
            <div className="flex flex-col gap-2 text-[10px] font-medium text-text-medium">
              <div className="flex items-center justify-between">
                <span>Caneta</span>
                <kbd className="px-1.5 py-0.5 text-[9px] font-semibold text-text-strong bg-surface border border-border rounded-md shadow-xs">B</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span>Borracha</span>
                <kbd className="px-1.5 py-0.5 text-[9px] font-semibold text-text-strong bg-surface border border-border rounded-md shadow-xs">E</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span>Retângulo</span>
                <kbd className="px-1.5 py-0.5 text-[9px] font-semibold text-text-strong bg-surface border border-border rounded-md shadow-xs">R</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span>Círculo</span>
                <kbd className="px-1.5 py-0.5 text-[9px] font-semibold text-text-strong bg-surface border border-border rounded-md shadow-xs">C</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span>Reta</span>
                <kbd className="px-1.5 py-0.5 text-[9px] font-semibold text-text-strong bg-surface border border-border rounded-md shadow-xs">L</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span>Seta</span>
                <kbd className="px-1.5 py-0.5 text-[9px] font-semibold text-text-strong bg-surface border border-border rounded-md shadow-xs">A</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span>Texto</span>
                <kbd className="px-1.5 py-0.5 text-[9px] font-semibold text-text-strong bg-surface border border-border rounded-md shadow-xs">T</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span>Limpar</span>
                <kbd className="px-1.5 py-0.5 text-[9px] font-semibold text-text-strong bg-surface border border-border rounded-md shadow-xs">Del</kbd>
              </div>
              <div className="border-t border-border pt-2 mt-1 flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span>Desfazer</span>
                  <kbd className="px-1.5 py-0.5 text-[9px] font-semibold text-text-strong bg-surface border border-border rounded-md shadow-xs">Ctrl+Z</kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span>Refazer</span>
                  <kbd className="px-1.5 py-0.5 text-[9px] font-semibold text-text-strong bg-surface border border-border rounded-md shadow-xs">Ctrl+Y</kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span>Linha - / +</span>
                  <div className="flex gap-0.5">
                    <kbd className="px-1.5 py-0.5 text-[9px] font-semibold text-text-strong bg-surface border border-border rounded-md shadow-xs">[</kbd>
                    <kbd className="px-1.5 py-0.5 text-[9px] font-semibold text-text-strong bg-surface border border-border rounded-md shadow-xs">]</kbd>
                  </div>
                </div>
              </div>
            </div>
          </div>
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

          {/* Opções de formatação exclusivas da ferramenta de texto */}
          {tool === 'text' && (
            <div className="flex flex-wrap items-center gap-2.5 border-l border-zinc-800 pl-3">
              {/* Tamanho da Fonte */}
              <div className="flex items-center gap-1">
                <span className="text-[9px] uppercase font-bold text-text-muted tracking-wider">Tamanho:</span>
                <select
                  value={fontSize}
                  onChange={(e) => setFontSize(parseInt(e.target.value))}
                  className="bg-surface border border-border text-text-strong rounded-md px-1.5 py-0.5 text-xs outline-none focus:border-primary/50"
                >
                  {[12, 14, 16, 20, 24, 28, 32, 40, 48].map((size) => (
                    <option key={size} value={size}>{size}px</option>
                  ))}
                </select>
              </div>

              {/* Família da Fonte */}
              <div className="flex items-center gap-1">
                <span className="text-[9px] uppercase font-bold text-text-muted tracking-wider">Fonte:</span>
                <select
                  value={fontFamily}
                  onChange={(e) => setFontFamily(e.target.value)}
                  className="bg-surface border border-border text-text-strong rounded-md px-1.5 py-0.5 text-xs outline-none focus:border-primary/50"
                >
                  <option value="Inter">Inter (Sans)</option>
                  <option value="Arial">Arial</option>
                  <option value="Courier New">Courier (Mono)</option>
                  <option value="Georgia">Georgia (Serif)</option>
                </select>
              </div>

              {/* Alinhamento */}
              <div className="flex items-center gap-0.5 bg-surface border border-border rounded-md p-0.5">
                {['left', 'center', 'right'].map((align) => (
                  <button
                    key={align}
                    onClick={() => setTextAlign(align)}
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase transition-all ${
                      textAlign === align ? 'bg-primary text-white shadow-xs' : 'text-text-muted hover:text-text-strong'
                    }`}
                  >
                    {align === 'left' ? 'Esq' : align === 'center' ? 'Cent' : 'Dir'}
                  </button>
                ))}
              </div>

              {/* Negrito / Itálico */}
              <div className="flex items-center gap-0.5 bg-surface border border-border rounded-md p-0.5">
                <button
                  onClick={() => setFontWeight(fontWeight === 'bold' ? 'normal' : 'bold')}
                  className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all ${
                    fontWeight === 'bold' ? 'bg-primary/20 text-primary border border-primary/30' : 'text-text-muted hover:text-text-strong'
                  }`}
                  title="Negrito"
                >
                  B
                </button>
                <button
                  onClick={() => setFontStyle(fontStyle === 'italic' ? 'normal' : 'italic')}
                  className={`px-2 py-0.5 rounded text-[9px] font-bold italic transition-all ${
                    fontStyle === 'italic' ? 'bg-primary/20 text-primary border border-primary/30' : 'text-text-muted hover:text-text-strong'
                  }`}
                  title="Itálico"
                >
                  I
                </button>
              </div>
            </div>
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

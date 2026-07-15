'use client'

import { useEffect, useRef, useState, useTransition, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { updateNoteContent } from '@/actions/notes'
import { generateFlashcardsFromNote, createFlashcard, generateAIClozeCard, previewGeneratedFlashcards, saveGeneratedFlashcards } from '@/actions/flashcards'
import { formatMarkdownWithGroq } from '@/actions/groq'
import { createClient } from '@/utils/supabase/client'
import {
  ImagePlus,
  Camera,
  Loader2,
  Sparkles,
  Bold,
  Italic,
  Heading2,
  List,
  Wand2,
  Eye,
  Pencil,
  ChevronDown,
  CheckSquare,
  Quote,
  Minus,
  LayoutTemplate,
  Search,
  Maximize,
  Minimize,
  X,
  ChevronDown as ChevronNext,
  Target,
  CheckCircle2,
  AlertCircle,
  Check,
} from 'lucide-react'

interface Note {
  id: string
  title: string
  content: string
}

function applyInlineWrap(
  content: string,
  textarea: HTMLTextAreaElement,
  prefix: string,
  suffix: string = prefix
) {
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const selected = content.slice(start, end)
  const newContent =
    content.slice(0, start) + prefix + selected + suffix + content.slice(end)
  return {
    newContent,
    cursorStart: start + prefix.length,
    cursorEnd: end + prefix.length,
  }
}

function applyLinePrefix(
  content: string,
  textarea: HTMLTextAreaElement,
  linePrefix: string
) {
  const start = textarea.selectionStart
  const lineStart = content.lastIndexOf('\n', start - 1) + 1
  const newContent =
    content.slice(0, lineStart) + linePrefix + content.slice(lineStart)
  const offset = linePrefix.length
  return {
    newContent,
    cursorStart: start + offset,
    cursorEnd: start + offset,
  }
}

function handleIndent(content: string, textarea: HTMLTextAreaElement) {
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const lineStart = content.lastIndexOf('\n', start - 1) + 1
  const newContent = content.slice(0, lineStart) + '  ' + content.slice(lineStart)
  return {
    newContent,
    cursorStart: start + 2,
    cursorEnd: end + 2,
  }
}

function handleOutdent(content: string, textarea: HTMLTextAreaElement) {
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const lineStart = content.lastIndexOf('\n', start - 1) + 1
  const lineEnd = content.indexOf('\n', start)
  const targetLine = content.slice(lineStart, lineEnd === -1 ? content.length : lineEnd)
  
  let removeCount = 0
  let newLine = targetLine
  if (targetLine.startsWith('  ')) {
    newLine = targetLine.substring(2)
    removeCount = 2
  } else if (targetLine.startsWith('\t')) {
    newLine = targetLine.substring(1)
    removeCount = 1
  } else if (targetLine.startsWith(' ')) {
    newLine = targetLine.substring(1)
    removeCount = 1
  }

  const newContent = content.slice(0, lineStart) + newLine + content.slice(lineEnd === -1 ? content.length : lineEnd)
  const newStart = Math.max(lineStart, start - removeCount)
  const newEnd = Math.max(lineStart, end - removeCount)
  return {
    newContent,
    cursorStart: newStart,
    cursorEnd: newEnd,
  }
}

const MOBILE_ACCESSORY_KEYS = [
  { label: '#', title: 'Título', action: (c: string, t: HTMLTextAreaElement) => applyLinePrefix(c, t, '## ') },
  { label: '**', title: 'Negrito', action: (c: string, t: HTMLTextAreaElement) => applyInlineWrap(c, t, '**') },
  { label: '*', title: 'Itálico', action: (c: string, t: HTMLTextAreaElement) => applyInlineWrap(c, t, '*') },
  { label: 'Lista', title: 'Lista', action: (c: string, t: HTMLTextAreaElement) => applyLinePrefix(c, t, '- ') },
  { label: '[ ]', title: 'Checklist', action: (c: string, t: HTMLTextAreaElement) => applyLinePrefix(c, t, '- [ ] ') },
  { label: '$', title: 'Matemática', action: (c: string, t: HTMLTextAreaElement) => applyInlineWrap(c, t, '$') },
  { label: 'Tab', title: 'Identar', action: (c: string, t: HTMLTextAreaElement) => handleIndent(c, t) },
  { label: 'Shift+Tab', title: 'Recuar', action: (c: string, t: HTMLTextAreaElement) => handleOutdent(c, t) },
]

const TOOLBAR_ACTIONS = [
  {
    label: 'H2',
    icon: Heading2,
    title: 'Subtítulo',
    action: (c: string, t: HTMLTextAreaElement) =>
      applyLinePrefix(c, t, '## '),
  },
  {
    label: 'B',
    icon: Bold,
    title: 'Negrito',
    action: (c: string, t: HTMLTextAreaElement) =>
      applyInlineWrap(c, t, '**'),
  },
  {
    label: 'I',
    icon: Italic,
    title: 'Itálico',
    action: (c: string, t: HTMLTextAreaElement) =>
      applyInlineWrap(c, t, '*'),
  },
  {
    label: '—',
    icon: Minus,
    title: 'Divisor',
    action: (c: string, t: HTMLTextAreaElement) =>
      applyLinePrefix(c, t, '\n---\n'),
  },
  {
    label: 'UL',
    icon: List,
    title: 'Lista',
    action: (c: string, t: HTMLTextAreaElement) =>
      applyLinePrefix(c, t, '- '),
  },
  {
    label: '☑',
    icon: CheckSquare,
    title: 'Checklist',
    action: (c: string, t: HTMLTextAreaElement) =>
      applyLinePrefix(c, t, '- [ ] '),
  },
  {
    label: '"',
    icon: Quote,
    title: 'Citação',
    action: (c: string, t: HTMLTextAreaElement) =>
      applyLinePrefix(c, t, '> '),
  },
]

export default function MarkdownEditor({ initialNote }: { initialNote: Note }) {
  // Título removido do estado local – gerenciado fora (na sidebar)
  const [content, setContent] = useState(initialNote.content || '')
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit')
  const [isSaving, setIsSaving] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isPendingGroq, startTransition] = useTransition()
  const [toast, setToast] = useState<{
    text: string
    type: 'success' | 'error'
  } | null>(null)

  const [showQuickHelp, setShowQuickHelp] = useState(false)
  const [isFocusMode, setIsFocusMode] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [fontFamily, setFontFamily] = useState<'sans' | 'serif' | 'mono'>('sans')

  // 🔹 PASSO 1: Estado para o modo de geração
  const [generationMode, setGenerationMode] = useState<'default' | 'concurso'>('default')
  const [showSlashMenu, setShowSlashMenu] = useState(false)

  const [selectedText, setSelectedText] = useState('')
  const [isPendingCloze, setIsPendingCloze] = useState(false)

  // Estados do Painel de Preview de Flashcards
  const [previewCards, setPreviewCards] = useState<Array<{
    front: string
    back: string
    analogia?: string | null
    mnemonico?: string | null
    source_chunk: string
    selected: boolean
  }>>([])
  const [showPreviewPanel, setShowPreviewPanel] = useState(false)
  const [isSavingGenerated, setIsSavingGenerated] = useState(false)

  const handleSelectionChange = () => {
    const textarea = textareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    if (start !== end) {
      setSelectedText(textarea.value.slice(start, end))
    } else {
      setSelectedText('')
    }
  }

  const handleCreateClozeManual = async () => {
    const textarea = textareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = content.slice(start, end).trim()
    if (!selected) return

    setIsPendingCloze(true)
    try {
      const lineStart = content.lastIndexOf('\n', start - 1) + 1
      const nextLineEnd = content.indexOf('\n', end)
      const lineEnd = nextLineEnd === -1 ? content.length : nextLineEnd
      const fullLineText = content.slice(lineStart, lineEnd).trim()

      const front = fullLineText.replace(selected, '[...]')
      const back = selected

      const res = await createFlashcard(initialNote.id, front, back)
      if (res.error) throw new Error(res.error)

      const newContent = content.slice(0, start) + `**${selected}**` + content.slice(end)
      setContent(newContent)
      
      showToast('Flashcard Cloze Manual criado!', 'success')
      setSelectedText('')
      
      requestAnimationFrame(() => {
        textarea.focus()
        textarea.setSelectionRange(start, start + selected.length + 4)
      })
    } catch (err: any) {
      console.error(err)
      showToast(err.message || 'Erro ao criar card manual', 'error')
    } finally {
      setIsPendingCloze(false)
    }
  }

  const handleCreateClozeAI = async () => {
    const textarea = textareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = content.slice(start, end).trim()
    if (!selected) return

    setIsPendingCloze(true)
    try {
      const resAI = await generateAIClozeCard(selected)
      if (resAI.error || !resAI.front || !resAI.back) {
        throw new Error(resAI.error || 'Não foi possível gerar lacunas para essa frase.')
      }

      const resDb = await createFlashcard(initialNote.id, resAI.front, resAI.back)
      if (resDb.error) throw new Error(resDb.error)

      const newContent = content.slice(0, start) + `**${selected}**` + content.slice(end)
      setContent(newContent)

      showToast('Cloze gerado por IA com sucesso!', 'success')
      setSelectedText('')

      requestAnimationFrame(() => {
        textarea.focus()
        textarea.setSelectionRange(start, start + selected.length + 4)
      })
    } catch (err: any) {
      console.error(err)
      showToast(err.message || 'Erro ao processar Cloze IA', 'error')
    } finally {
      setIsPendingCloze(false)
    }
  }

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const supabase = useMemo(() => createClient(), [])

  const { wordCount, readingTime } = useMemo(() => {
    const wCount = content.trim() ? content.trim().split(/\s+/).length : 0
    const rTime = Math.ceil(wCount / 200) || 1
    return { wordCount: wCount, readingTime: rTime }
  }, [content])

  useEffect(() => {
    if (viewMode === 'preview' && previewRef.current) {
      previewRef.current.scrollTop = 0
    }
  }, [viewMode])

  // Auto‑save focado **exclusivamente** no conteúdo
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (content !== initialNote.content) {
        setIsSaving(true)
        try {
          await updateNoteContent(initialNote.id, content)
        } catch (error) {
          console.error('Erro ao salvar conteúdo:', error)
        } finally {
          setIsSaving(false)
        }
      }
    }, 1500)

    return () => clearTimeout(timer)
  }, [content, initialNote.id, initialNote.content])

  const showToast = (
    text: string,
    type: 'success' | 'error',
    duration = 3000
  ) => {
    setToast({ text, type })
    setTimeout(() => setToast(null), duration)
  }

  const handleToolbarAction = (action: any) => {
    const textarea = textareaRef.current
    if (!textarea) return
    const result = action(content, textarea)
    setContent(result.newContent)
    requestAnimationFrame(() => {
      if (!textareaRef.current) return
      textareaRef.current.focus()
      textareaRef.current.setSelectionRange(
        result.cursorStart,
        result.cursorEnd
      )
    })
  }

  const insertTemplateAtCursor = () => {
    const template = `\n## 📅 Data: ${new Date().toLocaleDateString('pt-BR')}\n## 📌 Tema: \n\n### 📝 Conceitos Principais\n- \n\n### ❓ Dúvidas\n- \n\n---\n`
    const textarea = textareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const newContent = content.slice(0, start) + template + content.slice(end)
    setContent(newContent)

    requestAnimationFrame(() => {
      if (!textareaRef.current) return
      textareaRef.current.focus()
      const cursorTarget = start + template.indexOf('Tema: ') + 6
      textareaRef.current.setSelectionRange(cursorTarget, cursorTarget)
    })
  }

  const handleSearchNext = () => {
    if (!textareaRef.current || !searchQuery) return
    const text = content.toLowerCase()
    const query = searchQuery.toLowerCase()
    let index = text.indexOf(query, textareaRef.current.selectionEnd)
    if (index === -1) index = text.indexOf(query, 0)

    if (index !== -1) {
      textareaRef.current.focus()
      textareaRef.current.setSelectionRange(index, index + query.length)
      const textBefore = text.substring(0, index)
      const lineBreaks = (textBefore.match(/\n/g) || []).length
      textareaRef.current.scrollTop = lineBreaks * 28
    } else {
      showToast('Texto não encontrado', 'error')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const isSelection = start !== end
    const selected = content.slice(start, end)

    // 1. Envelopamento de seleção (surround selection) e auto-fechamento
    const pairs: Record<string, [string, string]> = {
      '(': ['(', ')'],
      '[': ['[', ']'],
      '{': ['{', '}'],
      '"': ['"', '"'],
      "'": ["'", "'"],
      '*': ['*', '*'],
      '_': ['_', '_'],
      '$': ['$', '$'],
      '`': ['`', '`'],
    }

    if (e.key in pairs) {
      e.preventDefault()
      const [prefix, suffix] = pairs[e.key]
      let newContent = ''
      let newStart = start
      let newEnd = end

      if (isSelection) {
        newContent = content.slice(0, start) + prefix + selected + suffix + content.slice(end)
        newStart = start + prefix.length
        newEnd = end + prefix.length
      } else {
        newContent = content.slice(0, start) + prefix + suffix + content.slice(end)
        newStart = start + prefix.length
        newEnd = start + prefix.length
      }

      setContent(newContent)
      requestAnimationFrame(() => {
        textarea.setSelectionRange(newStart, newEnd)
      })
      return
    }

    // 1.1 Avança o cursor se digitar o caractere de fechamento que já está na frente
    const nextChar = content[start]
    const closers = [')', ']', '}', '"', "'", '`', '*', '_', '$']
    if (closers.includes(e.key) && nextChar === e.key && !isSelection) {
      e.preventDefault()
      const newCursor = start + 1
      requestAnimationFrame(() => {
        textarea.setSelectionRange(newCursor, newCursor)
      })
      return
    }

    // 1.2 Backspace inteligente (deleta o par auto-fechado de uma vez)
    if (e.key === 'Backspace' && !isSelection) {
      const prevChar = content[start - 1]
      const nextChar = content[start]
      const pairedKeys: Record<string, string> = {
        '(': ')',
        '[': ']',
        '{': '}',
        '"': '"',
        "'": "'",
        '`': '`',
        '*': '*',
        '_': '_',
        '$': '$',
      }
      if (pairedKeys[prevChar] === nextChar) {
        e.preventDefault()
        const newContent = content.slice(0, start - 1) + content.slice(start + 1)
        setContent(newContent)
        const newCursor = start - 1
        requestAnimationFrame(() => {
          textarea.setSelectionRange(newCursor, newCursor)
        })
        return
      }
    }

    // 2. Atalhos de Teclado Universais
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault()
      handleToolbarAction((c: string, t: HTMLTextAreaElement) => applyInlineWrap(c, t, '**'))
      return
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
      e.preventDefault()
      handleToolbarAction((c: string, t: HTMLTextAreaElement) => applyInlineWrap(c, t, '*'))
      return
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
      e.preventDefault()
      handleToolbarAction((c: string, t: HTMLTextAreaElement) => applyLinePrefix(c, t, '- [ ] '))
      return
    }

    // 3. Tab e Shift+Tab para recuo/avanço de listas
    if (e.key === 'Tab') {
      e.preventDefault()
      if (e.shiftKey) {
        handleToolbarAction((c: string, t: HTMLTextAreaElement) => handleOutdent(c, t))
      } else {
        handleToolbarAction((c: string, t: HTMLTextAreaElement) => handleIndent(c, t))
      }
      return
    }

    // 4. Continuação Inteligente de Linhas (Smart Enter)
    if (e.key === 'Enter') {
      const lineStart = content.lastIndexOf('\n', start - 1) + 1
      const currentLine = content.slice(lineStart, start)

      // Listas ordenadas, desordenadas, checklists, citações
      const listRegex = /^(\s*-\s*\[\s*[x ]\s*\]\s*|\s*-\s*|\s*\*\s*|\s*\d+\.\s*|\s*>\s*)/
      const match = currentLine.match(listRegex)

      if (match) {
        const prefix = match[1]
        const plainPrefix = prefix.replace('[ ]', '').replace('[x]', '').trim()
        
        if (currentLine.trim() === plainPrefix) {
          e.preventDefault()
          const newContent = content.slice(0, lineStart) + content.slice(start)
          setContent(newContent)
          requestAnimationFrame(() => {
            textarea.setSelectionRange(lineStart, lineStart)
          })
        } else {
          e.preventDefault()
          let newPrefix = prefix
          const numMatch = prefix.match(/^(\s*)(\d+)(\.\s*)$/)
          if (numMatch) {
            const nextNum = parseInt(numMatch[2], 10) + 1
            newPrefix = `${numMatch[1]}${nextNum}${numMatch[3]}`
          }
          if (newPrefix.includes('[x]')) {
            newPrefix = newPrefix.replace('[x]', '[ ]')
          }

          const newContent = content.slice(0, start) + '\n' + newPrefix + content.slice(start)
          const newCursor = start + 1 + newPrefix.length
          setContent(newContent)
          requestAnimationFrame(() => {
            textarea.setSelectionRange(newCursor, newCursor)
          })
        }
      }
    }
  }

  const handleAIAssist = () => {
    if (!content.trim() || isPendingGroq) return
    startTransition(async () => {
      const result = await formatMarkdownWithGroq(content)
      if (result.error) {
        showToast('Erro ao formatar com IA: ' + result.error, 'error')
      } else {
        setContent(result.formattedText)
        showToast('Formatado com IA!', 'success')
      }
    })
  }

  const handleImageUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) return
    setIsUploading(true)
    const fileExt = file.name.split('.').pop()
    const fileName = `${Math.random()}.${fileExt}`
    const filePath = `${initialNote.id}/${fileName}`

    const { error } = await supabase.storage
      .from('note_images')
      .upload(filePath, file)
    if (error) {
      console.error('Erro no upload:', error)
      showToast('Erro ao fazer upload da imagem', 'error')
      setIsUploading(false)
      return
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from('note_images').getPublicUrl(filePath)
    const separator = content.endsWith('\n') || content === '' ? '' : '\n'
    setContent((prev) => `${prev}${separator}\n![${file.name}](${publicUrl})\n`)
    setIsUploading(false)
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    for (let i = 0; i < e.clipboardData.items.length; i++) {
      if (e.clipboardData.items[i].type.indexOf('image') !== -1) {
        const file = e.clipboardData.items[i].getAsFile()
        if (file) handleImageUpload(file)
      }
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleImageUpload(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleCameraInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleImageUpload(file)
    if (cameraInputRef.current) cameraInputRef.current.value = ''
  }

  // 🔹 PASSO 2: Geração de Flashcards com Pré-visualização Inline
  const handleGenerateCards = async () => {
    if (content.trim().length < 50) {
      showToast('Escreva mais conteúdo para gerar cards.', 'error')
      return
    }
    setIsGenerating(true)
    const response = await previewGeneratedFlashcards(content, generationMode)
    setIsGenerating(false)

    if (response.error) {
      showToast(response.error, 'error')
    } else if (response.cards) {
      setPreviewCards(response.cards.map((c: any) => ({ ...c, selected: true })))
      setShowPreviewPanel(true)
    }
  }

  const handleCardFieldChange = (index: number, field: 'front' | 'back' | 'selected', value: any) => {
    setPreviewCards(prev => prev.map((c, idx) => idx === index ? { ...c, [field]: value } : c))
  }

  const handleSavePreviewCards = async () => {
    const selected = previewCards.filter(c => c.selected)
    if (selected.length === 0) {
      showToast('Selecione pelo menos um flashcard para salvar.', 'error')
      return
    }

    setIsSavingGenerated(true)
    const response = await saveGeneratedFlashcards(initialNote.id, selected)
    setIsSavingGenerated(false)

    if (response.error) {
      showToast(response.error, 'error')
    } else {
      showToast(`${response.count} flashcards adicionados com sucesso!`, 'success')
      setShowPreviewPanel(false)
      setPreviewCards([])
    }
  }

  return (
    <div className="relative flex h-[100dvh] flex-col bg-background">
      {/* Toast */}
      {toast && (
        <div
          className={`pointer-events-none fixed left-1/2 top-4 z-50 -translate-x-1/2 flex items-center gap-2 rounded-full border px-4 py-2.5 text-xs font-semibold backdrop-blur-md shadow-xl animate-in fade-in zoom-in-95 slide-in-from-top-4 duration-300 ${
            toast.type === 'success'
              ? 'border-success/30 bg-success-soft/90 text-success shadow-[0_10px_25px_rgba(34,197,94,0.12)]'
              : 'border-error/30 bg-error-soft/90 text-error shadow-[0_10px_25px_rgba(239,68,68,0.12)]'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="size-4 shrink-0" />
          ) : (
            <AlertCircle className="size-4 shrink-0" />
          )}
          <span>{toast.text}</span>
        </div>
      )}

      {/* ── Header limpo (sem input de título) ────────────────────────── */}
      {!isFocusMode && (
        <header className="flex flex-col shrink-0 border-b border-border bg-surface">
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            {/* Lado esquerdo: Título da nota */}
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold text-text-strong truncate">
                {initialNote.title || 'Sem título'}
              </h2>
            </div>

            {/* Lado direito: botões */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setShowSearch(!showSearch)}
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                  showSearch
                    ? 'bg-primary/10 text-primary'
                    : 'text-text-muted hover:bg-surface-muted'
                }`}
                aria-label="Buscar na nota"
                title="Buscar na nota"
              >
                <Search className="size-4" />
              </button>

              <button
                onClick={() => setIsFocusMode(true)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-surface-muted transition-colors"
                aria-label="Modo Foco"
                title="Modo Foco"
              >
                <Maximize className="size-4" />
              </button>

              {/* Seletor de Tipografia */}
              <div className="flex items-center">
                <select
                  value={fontFamily}
                  onChange={(e) => setFontFamily(e.target.value as 'sans' | 'serif' | 'mono')}
                  className="h-8 rounded-lg border border-border bg-surface-muted px-1.5 text-[10px] sm:text-xs font-semibold text-text-strong outline-none focus:border-primary/50 cursor-pointer"
                  title="Tipografia"
                >
                  <option value="sans">Aa Sans</option>
                  <option value="serif">Aa Serif</option>
                  <option value="mono">Aa Mono</option>
                </select>
              </div>

              <div className="flex rounded-lg border border-border bg-surface-muted p-0.5 shrink-0">
                <button
                  onClick={() => setViewMode('edit')}
                  aria-label="Editar"
                  title="Editar"
                  className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                    viewMode === 'edit'
                      ? 'bg-surface text-text-strong shadow-sm'
                      : 'text-text-muted'
                  }`}
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  onClick={() => setViewMode('preview')}
                  aria-label="Visualizar"
                  title="Visualizar"
                  className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                    viewMode === 'preview'
                      ? 'bg-surface text-text-strong shadow-sm'
                      : 'text-text-muted'
                  }`}
                >
                  <Eye className="size-3.5" />
                </button>
              </div>

              {/* Seletor de Modo Concurso */}
              <div className="flex items-center">
                <select
                  value={generationMode}
                  onChange={(e) => setGenerationMode(e.target.value as 'default' | 'concurso')}
                  className="h-8 max-w-[85px] sm:max-w-none truncate rounded-lg border border-border bg-surface-muted px-1.5 text-[10px] sm:text-xs font-semibold text-text-strong outline-none focus:border-primary/50 cursor-pointer"
                >
                  <option value="default">📚 Geral</option>
                  <option value="concurso">⚖️ Concurso</option>
                </select>
              </div>

              <button
                onClick={handleGenerateCards}
                disabled={isGenerating}
                aria-label="Gerar flashcards"
                title="Gerar flashcards por IA"
                className="flex h-8 px-2.5 items-center justify-center gap-1.5 rounded-lg bg-primary text-white disabled:opacity-60 active:scale-95 transition-all text-xs font-semibold shadow-sm hover:bg-primary/95"
              >
                {isGenerating ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5" />
                )}
                <span className="hidden sm:inline">Gerar Cards</span>
              </button>
            </div>
          </div>

          {/* Barra de Ferramentas de Formatação (Movida para o topo) */}
          {viewMode === 'edit' && (
            <div className="flex items-center gap-0.5 overflow-x-auto px-2 py-1.5 border-t border-border/40 bg-surface scrollbar-none">
              <button
                type="button"
                aria-label="Inserir Template de Aula"
                onPointerDown={(e) => { e.preventDefault(); insertTemplateAtCursor() }}
                className="flex h-8 min-w-[32px] items-center justify-center rounded-lg px-2 text-primary bg-primary/5 hover:bg-primary/10 active:bg-primary/20 transition-colors"
              >
                <LayoutTemplate className="size-4" />
              </button>
              <div className="mx-1 h-4 w-px shrink-0 bg-border" />
              {TOOLBAR_ACTIONS.map(({ icon: Icon, title, action }) => (
                <button
                  key={title}
                  type="button"
                  title={title}
                  aria-label={title}
                  onPointerDown={(e) => { e.preventDefault(); handleToolbarAction(action) }}
                  className="flex h-8 min-w-[32px] items-center justify-center rounded-lg px-2 text-text-medium transition-colors active:bg-primary/10 active:text-primary"
                >
                  <Icon className="size-4" />
                </button>
              ))}
              <div className="mx-1 h-4 w-px shrink-0 bg-border" />
              <button
                type="button"
                aria-label="Tirar foto do quadro"
                onPointerDown={(e) => { e.preventDefault(); cameraInputRef.current?.click() }}
                className="flex h-8 min-w-[32px] items-center justify-center rounded-lg px-2 text-text-medium active:bg-primary/10 active:text-primary"
              >
                <Camera className="size-4" />
              </button>
              <button
                type="button"
                aria-label="Adicionar imagem"
                onPointerDown={(e) => { e.preventDefault(); fileInputRef.current?.click() }}
                className="flex h-8 min-w-[32px] items-center justify-center rounded-lg px-2 text-text-medium active:bg-primary/10 active:text-primary"
              >
                <ImagePlus className="size-4" />
              </button>
              <button
                type="button"
                aria-label="Formatar com IA"
                disabled={isPendingGroq || !content.trim()}
                onPointerDown={(e) => { e.preventDefault(); handleAIAssist() }}
                className="flex h-8 min-w-[32px] items-center justify-center rounded-lg px-2 text-indigo-500 disabled:opacity-40 active:bg-indigo-500/10"
              >
                {isPendingGroq ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
              </button>
              <div className="mx-1 h-4 w-px shrink-0 bg-border" />
              <button
                type="button"
                aria-label="Referência rápida"
                onPointerDown={(e) => { e.preventDefault(); setShowQuickHelp((v) => !v) }}
                className={`flex h-8 min-w-[32px] items-center justify-center rounded-lg px-2 transition-colors ${
                  showQuickHelp ? 'bg-primary/10 text-primary' : 'text-text-muted active:bg-surface-muted'
                }`}
              >
                <ChevronDown className={`size-4 transition-transform ${showQuickHelp ? 'rotate-180' : ''}`} />
              </button>
            </div>
          )}

          {/* Barra de Status secundária e fina */}
          <div className="flex items-center justify-between px-3 py-1 bg-surface-muted/30 border-t border-border/40 text-[10px] text-text-muted select-none">
            <div className="flex items-center gap-1.5">
              <span className={`inline-block size-1.5 rounded-full ${isSaving ? 'bg-amber-500 animate-pulse' : 'bg-success'}`} />
              <span>{isSaving ? 'Salvando...' : 'Salvo na nuvem'}</span>
            </div>
            <span>{wordCount} palavras · ~{readingTime} min leitura</span>
          </div>

          {/* Barra de busca */}
          {showSearch && viewMode === 'edit' && (
            <div className="flex items-center gap-2 px-3 py-2 border-t border-border bg-surface-muted/30">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchNext()}
                placeholder="Buscar no texto..."
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-text-muted"
                autoFocus
              />
              <button
                onClick={handleSearchNext}
                className="rounded-md p-1.5 text-text-medium hover:bg-border/50 active:bg-border"
              >
                <ChevronNext className="size-4 -rotate-90" />
              </button>
              <button
                onClick={() => {
                  setShowSearch(false)
                  setSearchQuery('')
                }}
                className="rounded-md p-1.5 text-text-medium hover:bg-border/50 active:bg-border"
              >
                <X className="size-4" />
              </button>
            </div>
          )}
        </header>
      )}

      {/* Botão para sair do modo foco */}
      {isFocusMode && (
        <button
          onClick={() => setIsFocusMode(false)}
          className="absolute right-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-surface/80 border border-border text-text-medium shadow-sm backdrop-blur-sm transition-opacity hover:bg-surface"
          aria-label="Sair do Modo Foco"
        >
          <Minimize className="size-4" />
        </button>
      )}

      {/* ── Área de edição / preview ────────────────────────────────── */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {isUploading && (
          <div className="absolute right-3 top-3 z-10 rounded-full bg-primary px-3 py-1 text-xs font-medium text-white shadow">
            Enviando imagem…
          </div>
        )}

        {/* ── Slash Command Menu ──────── */}
        {showSlashMenu && viewMode === 'edit' && (
          <div className="absolute inset-x-4 bottom-24 sm:bottom-1/2 sm:translate-y-1/2 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 z-40 bg-surface border border-border rounded-xl shadow-2xl p-2 flex flex-col gap-1 max-h-[250px] overflow-y-auto animate-in zoom-in-95 duration-200">
            <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider px-2 py-1 flex justify-between items-center">
              Ações Rápidas
              <button onClick={() => setShowSlashMenu(false)} className="text-text-muted hover:text-text-strong"><X className="size-3" /></button>
            </div>
            <button onPointerDown={(e) => { e.preventDefault(); insertTemplateAtCursor(); setShowSlashMenu(false) }} className="flex items-center gap-3 px-3 py-2 hover:bg-surface-muted rounded-lg text-sm text-left">
              <LayoutTemplate className="size-4 text-primary" />
              <div>
                <div className="font-semibold text-text-strong">Template de Aula</div>
                <div className="text-[10px] text-text-muted">Insere a estrutura padrão</div>
              </div>
            </button>
            <button onPointerDown={(e) => { e.preventDefault(); handleAIAssist(); setShowSlashMenu(false) }} className="flex items-center gap-3 px-3 py-2 hover:bg-surface-muted rounded-lg text-sm text-left" disabled={isPendingGroq || !content.trim()}>
              <Wand2 className="size-4 text-indigo-500" />
              <div>
                <div className="font-semibold text-text-strong">Formatar com IA</div>
                <div className="text-[10px] text-text-muted">Melhora e formata o texto</div>
              </div>
            </button>
            <button onPointerDown={(e) => { e.preventDefault(); handleCreateClozeAI(); setShowSlashMenu(false) }} className="flex items-center gap-3 px-3 py-2 hover:bg-surface-muted rounded-lg text-sm text-left">
              <Sparkles className="size-4 text-amber-500" />
              <div>
                <div className="font-semibold text-text-strong">Criar Lacuna com IA</div>
                <div className="text-[10px] text-text-muted">Gera flashcard na frase atual</div>
              </div>
            </button>
            <button onPointerDown={(e) => { 
              e.preventDefault(); 
              const boldAct = TOOLBAR_ACTIONS.find(a => a.title === 'Negrito')?.action;
              if (boldAct) handleToolbarAction(boldAct);
              setShowSlashMenu(false);
            }} className="flex items-center gap-3 px-3 py-2 hover:bg-surface-muted rounded-lg text-sm text-left">
              <Bold className="size-4 text-text-medium" />
              <div><div className="font-semibold text-text-strong">Negrito</div></div>
            </button>
          </div>
        )}

        <div className="h-full w-full overflow-y-auto custom-scrollbar">
          <div className="max-w-3xl mx-auto h-full px-4 py-6 md:px-8">
            {viewMode === 'edit' ? (
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => {
                  setContent(e.target.value)
                  const val = e.target.value
                  const start = e.target.selectionStart
                  if (val[start - 1] === '/' && (start === 1 || val[start - 2] === '\n' || val[start - 2] === ' ')) {
                    setShowSlashMenu(true)
                  } else if (showSlashMenu) {
                    setShowSlashMenu(false)
                  }
                }}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                onSelect={handleSelectionChange}
                onKeyUp={handleSelectionChange}
                onMouseUp={handleSelectionChange}
                placeholder="Comece a anotar…"
                autoCorrect="on"
                spellCheck
                className={`h-full w-full resize-none bg-transparent outline-none placeholder:text-text-muted pb-32 border-none ring-0 focus:ring-0 ${
                  fontFamily === 'sans'
                    ? 'font-sans text-base leading-relaxed tracking-wide'
                    : fontFamily === 'serif'
                    ? 'font-serif text-base md:text-lg leading-relaxed'
                    : 'font-mono text-sm leading-7'
                } text-text-strong`}
              />
            ) : (
              <div
                ref={previewRef}
                className={`prose prose-sm max-w-none pb-24 ${
                  fontFamily === 'sans'
                    ? 'font-sans'
                    : fontFamily === 'serif'
                    ? 'font-serif'
                    : 'font-mono'
                }`}
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                >
                  {content || '*A nota está vazia.*'}
                </ReactMarkdown>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Mobile Accessory Bar (Scrollable syntax toolbar for mobile keyboards) ── */}
      {viewMode === 'edit' && (
        <div className="flex md:hidden shrink-0 items-center gap-1.5 overflow-x-auto px-3 py-2 border-t border-border/40 bg-surface scrollbar-none z-30">
          <button
            type="button"
            onPointerDown={(e) => { e.preventDefault(); insertTemplateAtCursor() }}
            className="flex h-8 items-center justify-center rounded-lg px-3 text-xs font-bold text-primary bg-primary/10 shrink-0"
          >
            Template
          </button>
          
          <div className="h-4 w-px shrink-0 bg-border" />

          {MOBILE_ACCESSORY_KEYS.map((key) => (
            <button
              key={key.label}
              type="button"
              onPointerDown={(e) => { 
                e.preventDefault()
                const textarea = textareaRef.current
                if (textarea) {
                  const result = key.action(content, textarea)
                  setContent(result.newContent)
                  requestAnimationFrame(() => {
                    textarea.focus()
                    textarea.setSelectionRange(result.cursorStart, result.cursorEnd)
                  })
                }
              }}
              className="flex h-8 min-w-[36px] items-center justify-center rounded-lg border border-border/60 bg-surface-muted px-2.5 text-xs font-bold text-text-medium active:bg-primary/10 active:text-primary shrink-0"
              title={key.title}
            >
              {key.label}
            </button>
          ))}

          <div className="h-4 w-px shrink-0 bg-border" />
          
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault()
              const textarea = textareaRef.current
              if (textarea) {
                const pos = Math.max(0, textarea.selectionStart - 1)
                textarea.focus()
                textarea.setSelectionRange(pos, pos)
              }
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-surface-muted text-text-medium shrink-0 font-bold"
            title="Mover cursor esquerda"
          >
            ←
          </button>
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault()
              const textarea = textareaRef.current
              if (textarea) {
                const pos = Math.min(content.length, textarea.selectionStart + 1)
                textarea.focus()
                textarea.setSelectionRange(pos, pos)
              }
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-surface-muted text-text-medium shrink-0 font-bold"
            title="Mover cursor direita"
          >
            →
          </button>
        </div>
      )}

      {/* ── Barra de ferramentas inferior (apenas modo edição) ──────── */}
      {viewMode === 'edit' && !isFocusMode && (
        <div className="shrink-0 border-t border-border bg-surface safe-area-bottom">
          {/* ── Barra Flutuante de Seleção (Criar Cloze) ──────── */}
          {selectedText.trim().length > 0 && (
            <div className="mx-4 my-2 p-3 bg-gradient-to-r from-primary/10 to-indigo-500/10 border border-primary/20 rounded-xl flex items-center justify-between gap-4 animate-in slide-in-from-bottom-2 duration-200 shadow-sm shrink-0">
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-bold text-primary uppercase tracking-wider block mb-0.5">Seleção Ativa</span>
                <p className="text-xs text-text-strong font-medium truncate italic">
                  "{selectedText}"
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleCreateClozeManual}
                  disabled={isPendingCloze}
                  className="btn-secondary text-[10px] px-2.5 py-1.5 h-auto hover:bg-primary-soft/20 flex items-center gap-1 cursor-pointer active:scale-95"
                  title="Transforma o termo selecionado em um flashcard de lacuna"
                >
                  <Target className="size-3 text-primary" />
                  <span>Cloze Manual</span>
                </button>
                <button
                  onClick={handleCreateClozeAI}
                  disabled={isPendingCloze}
                  className="btn-primary text-[10px] px-2.5 py-1.5 h-auto bg-gradient-to-r from-primary to-indigo-600 flex items-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-50"
                  title="A IA escolhe o melhor contexto e cria a lacuna para você"
                >
                  {isPendingCloze ? (
                    <Loader2 className="size-3 animate-spin text-white" />
                  ) : (
                    <Sparkles className="size-3 text-white" />
                  )}
                  <span>Cloze IA</span>
                </button>
              </div>
            </div>
          )}

          {/* Quick-help */}
          {showQuickHelp && (
            <div className="border-b border-border bg-surface-muted/60 px-3 py-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                Sintaxe rápida
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs text-text-medium">
                <span>
                  <span className="text-text-strong">**texto**</span> →{' '}
                  <strong>negrito</strong>
                </span>
                <span>
                  <span className="text-text-strong">*texto*</span> →{' '}
                  <em>itálico</em>
                </span>
                <span>
                  <span className="text-text-strong">## </span> → subtítulo
                </span>
                <span>
                  <span className="text-text-strong">- </span> → lista
                </span>
                <span>
                  <span className="text-text-strong">- [ ] </span> → checklist
                </span>
                <span>
                  <span className="text-text-strong">{'>>'} </span> → citação
                </span>
                <span>
                  <span className="text-text-strong">$x^2$</span> → fórmula
                  inline
                </span>
                <span>
                  <span className="text-text-strong">$$…$$</span> → bloco de
                  equação
                </span>
              </div>
            </div>
          )}

        </div>
      )}

      {/* Inputs ocultos de imagem */}
      <input
        type="file"
        accept="image/*"
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileInputChange}
      />
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        ref={cameraInputRef}
        onChange={handleCameraInputChange}
      />

      {/* Mini Painel de Preview de Flashcards */}
      {showPreviewPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-3xl border border-border bg-surface shadow-2xl flex flex-col animate-in zoom-in-95 duration-200">
            
            {/* Header do Painel */}
            <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-surface-muted/30 shrink-0">
              <div className="space-y-0.5">
                <h3 className="text-base font-black text-text-strong flex items-center gap-2">
                  <Sparkles className="size-4 text-primary fill-primary/10" /> Flashcards Gerados por IA
                </h3>
                <p className="text-xs text-text-muted">Selecione, edite e adicione os cards ao seu Segundo Cérebro.</p>
              </div>
              <button 
                onClick={() => setShowPreviewPanel(false)}
                className="rounded-full p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-strong transition-colors"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Lista Scrollable de Cards */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-surface/50">
              {previewCards.map((card, idx) => (
                <div 
                  key={idx} 
                  className={`p-4 rounded-2xl border transition-all flex items-start gap-4 ${
                    card.selected 
                      ? 'border-primary/20 bg-primary-soft/5 shadow-[0_4px_12px_rgba(249,115,22,0.02)]' 
                      : 'border-border bg-surface opacity-60'
                  }`}
                >
                  {/* Checkbox de Seleção */}
                  <input
                    type="checkbox"
                    checked={card.selected}
                    onChange={(e) => handleCardFieldChange(idx, 'selected', e.target.checked)}
                    className="size-4 mt-1 rounded border-border text-primary focus:ring-primary cursor-pointer shrink-0"
                  />

                  {/* Inputs Editáveis */}
                  <div className="flex-1 space-y-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-extrabold text-text-muted uppercase tracking-wider">Pergunta</label>
                      <textarea
                        value={card.front}
                        onChange={(e) => handleCardFieldChange(idx, 'front', e.target.value)}
                        disabled={!card.selected}
                        className="w-full text-xs font-semibold text-text-strong bg-surface border border-border rounded-xl px-3 py-2 focus:border-primary focus:ring-1 focus:ring-primary outline-none resize-none min-h-[50px]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-extrabold text-text-muted uppercase tracking-wider">Resposta</label>
                      <textarea
                        value={card.back}
                        onChange={(e) => handleCardFieldChange(idx, 'back', e.target.value)}
                        disabled={!card.selected}
                        className="w-full text-xs text-text-medium bg-surface border border-border rounded-xl px-3 py-2 focus:border-primary focus:ring-1 focus:ring-primary outline-none resize-none min-h-[50px]"
                      />
                    </div>
                    
                    {/* Analogia e Mnemônicos info */}
                    {(card.analogia || card.mnemonico) && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {card.analogia && (
                          <span className="text-[10px] font-medium bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 px-2 py-0.5 rounded-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]" title={card.analogia}>
                            💡 Contém Analogia
                          </span>
                        )}
                        {card.mnemonico && (
                          <span className="text-[10px] font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]" title={card.mnemonico}>
                            🔑 Contém Mnemônico
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Rodapé de Ações */}
            <div className="px-6 py-4 border-t border-border flex items-center justify-between bg-surface-muted/30 shrink-0">
              <span className="text-xs font-semibold text-text-muted">
                {previewCards.filter(c => c.selected).length} de {previewCards.length} selecionados
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowPreviewPanel(false)}
                  className="btn-secondary h-9 px-4 text-xs font-semibold rounded-xl"
                  disabled={isSavingGenerated}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSavePreviewCards}
                  className="btn-primary h-9 px-4 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5"
                  disabled={isSavingGenerated}
                >
                  {isSavingGenerated ? (
                    <>
                      <Loader2 className="size-3 animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <>
                      <Check className="size-3.5" />
                      <span>Adicionar Selecionados</span>
                    </>
                  )}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}
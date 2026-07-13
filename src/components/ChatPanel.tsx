'use client'

import React, { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { Send, Bot, User, BookOpen, AlertCircle, Loader2, Copy, CheckCircle2, Sparkles, Plus, MessageSquare, ArrowLeftRight, Trash2, Menu, Volume2, Mic, Square, Brain, FileText, X, Settings } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useSettings } from '@/contexts/SettingsContext'
import { getBestVoice } from '@/utils/audio'

interface Source {
  id: string
  title: string | null
  type: string
  similarity: number
  workspaceId?: string | null
  noteId?: string | null
}

interface Message {
  id: string
  role: 'user' | 'ai'
  content: string
  sources?: Source[]
  error?: boolean
  model?: string
}

interface Conversation {
  id: string
  title: string
  messages: Message[]
  createdAt: number
  updatedAt: number
  persona?: 'tutor' | 'grill' | 'eli5'
}

interface ChatStorageState {
  conversations: Conversation[]
  activeConversationId: string | null
}

const SUGGESTIONS = [
  "🎲 Me faça uma pergunta desafiadora sobre minhas anotações",
  "⚡ Analise minhas notas e ache contradições conceituais",
  "📝 Resuma minhas anotações de estudo mais recentes",
  "🧠 Explique um conceito das minhas notas de forma simples"
]

const MAX_STORED_MESSAGES = 40
const DEFAULT_CONVERSATION_TITLE = 'Nova conversa'

// 🔒 Função de fallback para compatibilidade com navegadores mobile em HTTP
function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback manual seguro caso crypto não esteja disponível (muito comum em celulares antigos ou HTTP)
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9)
}

function createConversation(title = DEFAULT_CONVERSATION_TITLE, messages: Message[] = [], persona: 'tutor' | 'grill' | 'eli5' = 'tutor'): Conversation {
  return {
    id: generateUUID(),
    title,
    messages: messages.slice(-MAX_STORED_MESSAGES),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    persona,
  }
}

function normalizeConversation(conversation: Conversation): Conversation {
  return {
    ...conversation,
    messages: conversation.messages.slice(-MAX_STORED_MESSAGES),
    persona: conversation.persona || 'tutor',
  }
}

function deriveConversationTitle(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (!cleaned) return DEFAULT_CONVERSATION_TITLE

  const words = cleaned.split(' ')
  const title = words.slice(0, 5).join(' ')
  const capitalized = title.charAt(0).toUpperCase() + title.slice(1)

  return capitalized.length > 32 ? `${capitalized.slice(0, 29)}...` : capitalized
}

function loadChatState(storageKey: string): ChatStorageState | null {
  if (typeof window === 'undefined') return null

  try {
    const saved = sessionStorage.getItem(storageKey)
    if (!saved) return null

    const parsed = JSON.parse(saved)

    if (Array.isArray(parsed)) {
      const legacyMessages = parsed as Message[]
      const legacyConversation = createConversation(
        legacyMessages.find((message) => message.role === 'user')?.content
          ? deriveConversationTitle(legacyMessages.find((message) => message.role === 'user')?.content || '')
          : DEFAULT_CONVERSATION_TITLE,
        legacyMessages
      )

      return {
        conversations: [legacyConversation],
        activeConversationId: legacyConversation.id,
      }
    }

    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as ChatStorageState).conversations)) {
      const nextState = parsed as ChatStorageState
      const conversations = nextState.conversations.map(normalizeConversation)
      const activeConversationId = conversations.some((conversation) => conversation.id === nextState.activeConversationId)
        ? nextState.activeConversationId
        : conversations[0]?.id ?? null

      return {
        conversations,
        activeConversationId,
      }
    }

    return null
  } catch {
    sessionStorage.removeItem(storageKey)
    return null
  }
}

function saveChatState(storageKey: string, state: ChatStorageState) {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(storageKey, JSON.stringify(state))
}

function buildSourceHref(src: Source): string | null {
  if (src.workspaceId && src.noteId) {
    return `/dashboard/${src.workspaceId}/note/${src.noteId}`
  }
  if (src.workspaceId) {
    return `/dashboard/${src.workspaceId}`
  }
  return null
}

function buildSourceLabel(src: Source): string {
  if (src.title) return src.title

  const typeLabels: Record<string, string> = {
    flashcard_front: 'Flashcard',
    flashcard_back: 'Flashcard',
    analogia: 'Analogia',
    mnemonico: 'Mnemônico',
    note: 'Nota',
  }

  return typeLabels[src.type] ?? 'Fonte'
}

// Filtra fontes para não repetir a mesma nota várias vezes na UI
function getUniqueSources(sources?: Source[]) {
  if (!sources) return []
  
  const seenUrls = new Set<string>()
  const unique: Source[] = []

  for (const src of sources) {
    const href = buildSourceHref(src)
    // Se não tiver link, ou se já vimos esse link, ignoramos para não poluir a UI
    if (href && !seenUrls.has(href)) {
      seenUrls.add(href)
      unique.push(src)
    }
  }

  return unique
}

// 🛡️ Error Boundary Simples (Com as tipagens corrigidas)
interface ErrorBoundaryProps {
  fallback: React.ReactNode;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ChatErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback
    }
    return this.props.children
  }
}

interface ChatPanelProps {
  workspaceId?: string
  workspaces?: { id: string; name: string }[]
  onWorkspaceChange?: (newId: string) => void
  isFloatingMode?: boolean
  onClose?: () => void
}

export default function ChatPanel({ workspaceId, workspaces = [], onWorkspaceChange, isFloatingMode = false, onClose }: ChatPanelProps) {
  const { settings } = useSettings()
  const isWorkspaceValid = true
  const storageKey = workspaceId ? `omnimind_chat_${workspaceId}` : 'omnimind_chat_global'

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [isMounted, setIsMounted] = useState(false)
  const [userName, setUserName] = useState('Estudante')

  const [query, setQuery] = useState('')

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const { createClient } = await import('@/utils/supabase/client')
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Estudante'
          setUserName(name)
        }
      } catch (err) {
        console.error('Erro ao buscar usuário no Chat:', err)
      }
    }
    fetchUser()
  }, [])

  const [isLoading, setIsLoading] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [copyError, setCopyError] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [showPersonaModal, setShowPersonaModal] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<any>(null)

  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId) ?? conversations[0] ?? null
  const activeMessages = activeConversation?.messages ?? []

  const saveState = (nextConversations: Conversation[], nextActiveConversationId: string | null) => {
    const normalizedConversations = nextConversations.map(normalizeConversation)
    setConversations(normalizedConversations)
    setActiveConversationId(nextActiveConversationId)
    if (isMounted) {
      saveChatState(storageKey, {
        conversations: normalizedConversations,
        activeConversationId: nextActiveConversationId,
      })
    }
  }

  useEffect(() => {
    setIsMounted(true)
    const loadedState = loadChatState(storageKey)

    if (loadedState && loadedState.conversations.length > 0) {
      setConversations(loadedState.conversations)
      setActiveConversationId(loadedState.activeConversationId ?? loadedState.conversations[0].id)
    } else {
      const initialConversation = createConversation()
      setConversations([initialConversation])
      setActiveConversationId(initialConversation.id)
      saveChatState(storageKey, {
        conversations: [initialConversation],
        activeConversationId: initialConversation.id,
      })
    }

    setCopiedId(null)
    setCopyError(null)
  }, [storageKey])

  useEffect(() => {
    if (!isMounted) return

    if (conversations.length > 0) {
      saveChatState(storageKey, {
        conversations: conversations.map(normalizeConversation),
        activeConversationId,
      })
    } else if (typeof window !== 'undefined') {
      sessionStorage.removeItem(storageKey)
    }
  }, [conversations, storageKey, isMounted, activeConversationId])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [activeMessages, isLoading])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [query])

  // --- Inicialização do reconhecimento de voz ---
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition()
        recognition.continuous = false
        recognition.interimResults = true
        recognition.lang = 'pt-BR'

        recognition.onresult = (event: any) => {
          let currentTranscript = ''
          for (let i = event.resultIndex; i < event.results.length; i++) {
            currentTranscript += event.results[i][0].transcript
          }
          setQuery(currentTranscript)
        }

        recognition.onerror = (event: any) => {
          console.error('Erro no reconhecimento de voz:', event.error)
          setIsRecording(false)
        }

        recognition.onend = () => {
          setIsRecording(false)
        }

        recognitionRef.current = recognition
      }
    }
  }, [])

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      alert('Seu navegador não suporta reconhecimento de voz nativo ou você está em HTTP sem SSL.')
      return
    }

    if (isRecording) {
      recognitionRef.current.stop()
      setIsRecording(false)
    } else {
      setQuery('')
      recognitionRef.current.start()
      setIsRecording(true)
    }
  }

  const speakText = (text: string) => {
    if (!('speechSynthesis' in window)) {
      alert('Seu navegador não suporta a API de leitura de voz.')
      return
    }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'pt-BR'
    utterance.rate = 0.95
    const selectedVoice = getBestVoice(settings.tts_voice)
    if (selectedVoice) {
      utterance.voice = selectedVoice
    }
    window.speechSynthesis.speak(utterance)
  }


  const handleStartNewConversation = () => {
    const nextConversation = createConversation()
    saveState([nextConversation, ...conversations], nextConversation.id)
    setQuery('')
    setCopyError(null)
    setCopiedId(null)
  }

  const handleSelectConversation = (conversationId: string) => {
    setActiveConversationId(conversationId)
    setQuery('')
    setCopyError(null)
    setCopiedId(null)
    setIsSidebarOpen(false) // Fecha a sidebar no mobile ao trocar de chat
  }

  const handleUpdatePersona = (newPersona: 'tutor' | 'grill' | 'eli5') => {
    if (!activeConversation) return
    const updatedConversations = conversations.map((conv) => {
      if (conv.id === activeConversation.id) {
        return { ...conv, persona: newPersona }
      }
      return conv
    })
    saveState(updatedConversations, activeConversation.id)
  }

  const handleDeleteConversation = (conversationId: string) => {
    const conversation = conversations.find((item) => item.id === conversationId)
    if (!conversation) return

    const shouldDelete = typeof window === 'undefined'
      ? true
      : window.confirm(`Apagar a conversa "${conversation.title || DEFAULT_CONVERSATION_TITLE}"?`)

    if (!shouldDelete) return

    const remainingConversations = conversations.filter((item) => item.id !== conversationId)

    if (remainingConversations.length === 0) {
      const nextConversation = createConversation()
      saveState([nextConversation], nextConversation.id)
      setQuery('')
      setCopyError(null)
      setCopiedId(null)
      return
    }

    const nextActiveConversationId = activeConversationId === conversationId
      ? remainingConversations[0].id
      : activeConversationId

    saveState(remainingConversations, nextActiveConversationId)

    if (nextActiveConversationId !== activeConversationId) {
      setQuery('')
      setCopyError(null)
      setCopiedId(null)
    }
  }

  const handleAsk = async (textOverride?: string) => {
    const textToSubmit = typeof textOverride === 'string' ? textOverride : query
    const trimmed = textToSubmit.trim()
    
    if (trimmed.length < 3 || isLoading || !isWorkspaceValid) return

    let targetConversationId = activeConversationId ?? conversations[0]?.id ?? null
    const currentPersona = activeConversation?.persona || 'tutor'

    if (!targetConversationId) {
      const nextConversation = createConversation(deriveConversationTitle(trimmed), [], currentPersona)
      saveState([nextConversation], nextConversation.id)
      targetConversationId = nextConversation.id
    }

    const userMsgId = generateUUID()
    const aiMsgId = generateUUID()
    const userMessage: Message = { id: userMsgId, role: 'user', content: trimmed }
    const assistantMessage: Message = { id: aiMsgId, role: 'ai', content: '', sources: [], error: false }

    setConversations((prev) =>
      prev.map((conversation) => {
        if (conversation.id !== targetConversationId) return conversation

        const updatedMessages = [
          ...conversation.messages,
          userMessage,
          assistantMessage,
        ]

        return normalizeConversation({
          ...conversation,
          title: conversation.messages.length === 0 ? deriveConversationTitle(trimmed) : conversation.title,
          messages: updatedMessages,
          updatedAt: Date.now(),
        })
      })
    )
    setQuery('')
    setIsLoading(true)

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    const history = activeMessages.map(msg => ({
      role: msg.role,
      content: msg.content
    }))

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: trimmed,
          workspaceId,
          persona: currentPersona,
          history,
          model: settings.ai_default_model,
          ecoMode: settings.eco_mode
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(errorData?.error || 'Erro na requisição')
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let aiContent = ''
      let buffer = ''

      if (!reader) {
        throw new Error('Resposta sem stream.')
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.trim() === '') continue

          try {
            const parsed = JSON.parse(line)

            if (parsed.type === 'sources') {
              setConversations((prev) =>
                prev.map((conversation) => {
                  if (conversation.id !== targetConversationId) return conversation

                  return normalizeConversation({
                    ...conversation,
                    messages: conversation.messages.map((message) =>
                      message.id === aiMsgId ? { ...message, sources: parsed.data } : message
                    ),
                    updatedAt: Date.now(),
                  })
                })
              )
            } else if (parsed.type === 'model') {
              setConversations((prev) =>
                prev.map((conversation) => {
                  if (conversation.id !== targetConversationId) return conversation

                  return normalizeConversation({
                    ...conversation,
                    messages: conversation.messages.map((message) =>
                      message.id === aiMsgId ? { ...message, model: parsed.data } : message
                    ),
                    updatedAt: Date.now(),
                  })
                })
              )
            } else if (parsed.type === 'text') {
              aiContent += parsed.data
              const cleanContent = aiContent.replace(/\[ACTION:CREATE_EXAM_GOAL\|title=[^|]+\|date=[^\]]+\]/g, '')
              setConversations((prev) =>
                prev.map((conversation) => {
                  if (conversation.id !== targetConversationId) return conversation

                  return normalizeConversation({
                    ...conversation,
                    messages: conversation.messages.map((message) =>
                      message.id === aiMsgId ? { ...message, content: cleanContent } : message
                    ),
                    updatedAt: Date.now(),
                  })
                })
              )
            } else if (parsed.type === 'level-up') {
              window.dispatchEvent(new CustomEvent('level-up', {
                detail: parsed.data
              }))
            } else if (parsed.type === 'achievement-unlocked') {
              window.dispatchEvent(new CustomEvent('achievement-unlocked', {
                detail: parsed.data
              }))
            } else if (parsed.type === 'action-complete') {
              window.dispatchEvent(new CustomEvent('calendar-updated'))
              window.dispatchEvent(new CustomEvent('achievement-unlocked', {
                detail: {
                  id: 'exam_created_agent',
                  title: '📅 Prova Agendada!',
                  description: `O Agente de Estudos marcou sua prova "${parsed.data.title}" para ${parsed.data.date}!`
                }
              }))
            }
          } catch (streamError) {
            console.warn('Erro ao ler pedaço do stream:', streamError)
          }
        }
      }
    } catch (error) {
      setConversations((prev) =>
        prev.map((conversation) => {
          if (conversation.id !== targetConversationId) return conversation

          return normalizeConversation({
            ...conversation,
            messages: conversation.messages.map((message) =>
              message.id === aiMsgId
                ? { ...message, content: 'Ocorreu um erro na comunicação com o servidor.', error: true }
                : message
            ),
            updatedAt: Date.now(),
          })
        })
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleCopy = (id: string, content: string) => {
    navigator.clipboard.writeText(content)
      .then(() => {
        setCopyError(null)
        setCopiedId(id)
        setTimeout(() => setCopiedId(null), 2000)
      })
      .catch(() => {
        setCopyError('Não foi possível copiar a resposta.')
      })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      const isMobile = typeof window !== 'undefined' && navigator.maxTouchPoints > 0
      if (!isMobile) {
        e.preventDefault()
        handleAsk()
      }
    }
  }

  return (
    <div className={`flex ${isFloatingMode ? 'h-full w-full' : 'h-[calc(100dvh-115px)] md:h-[calc(100vh-125px)] w-[calc(100%+2.5rem)] md:w-[calc(100%+4rem)] -mx-5 -mb-6 md:-mx-8 md:-mb-8'} relative overflow-hidden flex-col ${isFloatingMode ? '' : 'lg:flex-row'} gap-0 bg-surface`}>
      {/* Overlay para fechar a sidebar no mobile */}
      {isSidebarOpen && (
        <div 
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden transition-opacity"
        />
      )}

      {/* Sidebar de Histórico (Slide-in mobile/flutuante + Fixo desktop normal) */}
      {(!isFloatingMode || isSidebarOpen) && (
        <aside className={`
          fixed inset-y-0 left-0 z-40 flex w-72 max-w-[80vw] flex-col border-r border-border bg-slate-50 dark:bg-slate-950/20 transition-transform duration-300 ease-in-out lg:static lg:z-0 lg:w-72 lg:min-w-72 lg:translate-x-0
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          ${isFloatingMode ? 'absolute lg:absolute lg:translate-x-0 lg:w-full max-w-full shadow-2xl bg-surface' : ''}
        `}>
        <div className="border-b border-border p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-text-muted">Conversas</p>
              <h2 className="mt-1 text-sm font-semibold text-text-strong">Histórico do chat</h2>
            </div>
            <button
              type="button"
              onClick={handleStartNewConversation}
              className="icon-button shrink-0"
              aria-label="Iniciar nova conversa"
              title="Nova conversa"
            >
              <Plus className="size-4" />
            </button>
          </div>
          <p className="mt-3 text-xs leading-5 text-text-muted">
            Alterne entre tópicos, retome conversas antigas ou comece um novo fio.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
          {conversations.length > 0 ? (
            conversations.map((conversation) => {
              const isActive = conversation.id === activeConversation?.id

              return (
                <div
                  key={conversation.id}
                  className={`mb-1 flex items-start gap-3 rounded-xl border px-3 py-3 transition-colors ${
                    isActive
                      ? 'border-primary bg-primary-soft text-text-strong'
                      : 'border-transparent bg-surface hover:border-border hover:bg-surface-muted'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleSelectConversation(conversation.id)}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                  >
                    <div className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${isActive ? 'bg-primary text-white' : 'bg-surface-muted text-text-medium'}`}>
                      <MessageSquare className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {conversation.title || DEFAULT_CONVERSATION_TITLE}
                        </span>
                        <ArrowLeftRight className="size-3 shrink-0 text-text-muted" />
                      </div>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-text-muted">
                        {conversation.messages[0]?.content || 'Conversa vazia'}
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteConversation(conversation.id)}
                    aria-label={`Apagar conversa ${conversation.title || DEFAULT_CONVERSATION_TITLE}`}
                    title="Apagar conversa"
                    className="shrink-0 rounded-md p-1 text-text-muted transition-colors hover:bg-error-soft hover:text-error"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              )
            })
          ) : (
            <div className="flex h-full items-center justify-center p-4 text-center text-sm text-text-muted">
              Nenhuma conversa ainda.
            </div>
          )}
        </div>
      </aside>
      )}

      {/* Área Principal de Chat */}
      <div className="panel flex min-w-0 flex-1 flex-col overflow-hidden bg-surface relative h-full">

        {/* Top Header do Chat com trigger para sidebar mobile */}
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 shrink-0 bg-surface z-10">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {!isFloatingMode ? (
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="lg:hidden p-2 -ml-2 text-text-muted hover:text-text-strong rounded-lg hover:bg-surface-muted transition-colors shrink-0"
                aria-label="Abrir menu"
              >
                <Menu className="size-5" />
              </button>
            ) : (
              <button
                onClick={onClose}
                className="p-1.5 -ml-1 text-text-muted hover:text-text-strong hover:bg-surface-muted rounded-md transition-colors"
                aria-label="Fechar chat"
              >
                <X className="size-5" />
              </button>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-text-muted">
                {isFloatingMode ? 'OmniMind' : 'Conversa ativa'}
              </p>
              <h3 className="mt-0.5 truncate text-sm font-semibold text-text-strong flex items-center gap-2">
                {isFloatingMode && <Sparkles className="size-3.5 text-primary" />}
                {isFloatingMode ? 'Assistente' : (activeConversation?.title || DEFAULT_CONVERSATION_TITLE)}
              </h3>
            </div>
          </div>

          {/* Seletor de Workspace em formato de Badge compacta e discreta */}
          {workspaces.length > 0 && onWorkspaceChange && !isFloatingMode && (
            <div className="flex items-center gap-1.5 shrink-0">
              <select
                value={workspaceId || ''}
                onChange={(e) => onWorkspaceChange(e.target.value)}
                className={`h-7 rounded-full border px-2.5 text-[10px] font-bold outline-none cursor-pointer transition-all shadow-sm max-w-[130px] sm:max-w-[200px] truncate ${
                  workspaceId
                    ? 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20'
                    : 'border-dashed border-border bg-surface text-text-muted hover:text-text-strong hover:border-primary/50'
                }`}
              >
                <option value="" className="bg-surface text-text-strong text-xs">🔍 Todo o App (Sem filtro)</option>
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id} className="bg-surface text-text-strong text-xs">
                    🧠 {ws.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-1 shrink-0">
            {isFloatingMode && (
              <button
                type="button"
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 text-text-muted hover:text-text-strong rounded-full hover:bg-surface-muted transition-colors"
                title="Histórico"
              >
                <MessageSquare className="size-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowPersonaModal(true)}
              className="p-2 text-text-muted hover:text-text-strong rounded-full hover:bg-surface-muted transition-colors"
              title="Mudar personalidade da IA"
            >
              <Settings className="size-4" />
            </button>
          </div>

          {isFloatingMode ? (
            <button
              type="button"
              onClick={handleStartNewConversation}
              className="shrink-0 p-2 text-text-muted hover:text-text-strong rounded-full hover:bg-surface-muted transition-colors"
              title="Limpar conversa"
            >
              <Trash2 className="size-4" />
            </button>
          ) : (
            <button 
              type="button" 
              onClick={handleStartNewConversation} 
              className="btn-secondary h-9 shrink-0 px-2.5 sm:px-4 text-xs flex items-center gap-1.5 border border-border"
              title="Nova conversa"
            >
              <Plus className="size-4" />
              <span className="hidden sm:inline">Nova conversa</span>
            </button>
          )}
        </div>

        {/* Modal de Personas */}
        {showPersonaModal && activeConversation && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="panel max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-text-strong">Modo da IA</h3>
                <button onClick={() => setShowPersonaModal(false)} className="icon-button">
                  <X className="size-4" />
                </button>
              </div>
              <div className="space-y-3">
                {[
                  { id: 'tutor', label: '📚 Tutor Socrático', desc: 'Explica com analogias e faz perguntas de fixação.' },
                  { id: 'grill', label: '🔥 Examinador (Grill)', desc: 'Banca rígida, faz perguntas difíceis e testa seus limites.' },
                  { id: 'eli5', label: '👶 Simplificado (ELI5)', desc: 'Explica tudo em termos infantis bem simples.' }
                ].map((p) => {
                  const isSel = (activeConversation.persona || 'tutor') === p.id
                  return (
                    <button
                      key={p.id}
                      onClick={() => { handleUpdatePersona(p.id as any); setShowPersonaModal(false); }}
                      className={`w-full flex flex-col text-left p-3 rounded-xl border transition-all ${
                        isSel ? 'bg-primary/10 border-primary shadow-sm' : 'bg-surface border-border hover:bg-surface-hover'
                      }`}
                    >
                      <span className={`font-bold text-sm ${isSel ? 'text-primary' : 'text-text-strong'}`}>{p.label}</span>
                      <span className="text-xs text-text-muted mt-1">{p.desc}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Mensagens protegidas pelo ErrorBoundary */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto bg-surface p-4 pb-16 custom-scrollbar">
          <ChatErrorBoundary fallback={
            <div className="flex h-full flex-col items-center justify-center px-4 text-center">
              <AlertCircle className="size-10 text-error mb-4" />
              <p className="text-sm font-medium text-text-strong">Ops, algo deu errado ao carregar as mensagens.</p>
              <p className="text-xs text-text-muted mt-1">Recarregue a página ou inicie uma nova conversa.</p>
              <button 
                onClick={() => window.location.reload()} 
                className="mt-4 btn-primary px-4 py-2 text-xs"
              >
                Recarregar página
              </button>
            </div>
          }>
            {!isMounted ? (
              <div className="flex h-full items-center justify-center text-sm text-text-muted">
                Carregando chat...
              </div>
            ) : activeMessages.length === 0 ? (
              <div className={`mx-auto flex flex-col justify-center w-full max-w-2xl px-4 animate-in fade-in duration-500 ${isFloatingMode ? 'min-h-[60dvh] py-4' : 'min-h-[80dvh] py-4 md:py-12'}`}>
                <h1 className={`${isFloatingMode ? 'text-2xl md:text-3xl' : 'text-3xl md:text-5xl'} font-bold tracking-tight`}>
                  <span className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
                    Olá, {userName}
                  </span>
                </h1>
                <h2 className={`${isFloatingMode ? 'text-xl md:text-2xl mt-1 mb-4' : 'text-2xl md:text-4xl mt-2 mb-6 md:mb-8'} font-semibold text-text-muted`}>
                  Como posso ajudar você hoje?
                </h2>

                <div className={`gap-3 w-full ${isFloatingMode ? 'flex flex-col' : 'flex sm:grid sm:grid-cols-2 overflow-x-auto sm:overflow-visible pb-4 sm:pb-0 snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'}`}>
                  {SUGGESTIONS.map((sug, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleAsk(sug)}
                      disabled={!isWorkspaceValid}
                      aria-label={`Enviar sugestão: ${sug}`}
                      className={`group flex rounded-2xl border border-border bg-surface p-3 text-left transition-all hover:border-primary/50 hover:bg-surface-muted/20 disabled:cursor-not-allowed disabled:opacity-50 shadow-sm hover:shadow-md ${
                        isFloatingMode 
                          ? 'flex-row items-center justify-between min-h-[60px]' 
                          : 'flex-col justify-between p-4 md:p-5 min-h-[100px] md:min-h-[120px] w-[240px] sm:w-auto shrink-0 sm:shrink snap-align-start'
                      }`}
                    >
                      <span className={`font-semibold text-text-strong leading-relaxed ${isFloatingMode ? 'text-xs' : 'text-xs md:text-sm'}`}>{sug}</span>
                      <div className={`flex justify-end ${isFloatingMode ? 'ml-2 shrink-0' : 'w-full mt-2 md:mt-4'}`}>
                        <span className={`flex items-center justify-center rounded-full bg-primary-soft text-primary opacity-0 group-hover:opacity-100 transition-opacity ${isFloatingMode ? 'size-6' : 'size-7 md:size-8'}`}>
                          <Sparkles className={isFloatingMode ? 'size-3' : 'size-3.5 md:size-4'} />
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-8 max-w-3xl mx-auto w-full px-4 py-6">
                {activeMessages.map((msg) => {
                  const uniqueSources = getUniqueSources(msg.sources)

                  return (
                    <div key={msg.id} className="flex gap-4">
                      {msg.role === 'ai' && (
                        <div className="shrink-0 mt-1">
                          <div className="flex size-8 items-center justify-center rounded-full bg-gradient-to-tr from-primary to-indigo-600 text-white shadow-sm">
                            <Sparkles className="size-4" />
                          </div>
                        </div>
                      )}

                      <div className={`flex-1 space-y-2 min-w-0 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                        {msg.role === 'user' ? (
                          <div className="inline-block text-left rounded-3xl bg-surface-muted/60 text-text-strong px-5 py-3 text-sm shadow-sm border border-border/20 max-w-[85%] sm:max-w-[70%] ml-auto break-words">
                            <div className="whitespace-pre-wrap">{msg.content}</div>
                          </div>
                        ) : (
                          <div className="w-full">
                            {msg.role === 'ai' && msg.model && (
                              <div className="mb-2">
                                <span className="inline-flex items-center gap-1 text-[9px] font-bold text-primary uppercase bg-primary-soft/30 border border-primary/10 px-2.5 py-0.5 rounded-full">
                                  ⚡ {msg.model}
                                </span>
                              </div>
                            )}

                            {msg.error ? (
                              <div className="inline-block rounded-2xl border border-error/20 bg-error-soft text-error p-4 text-sm">
                                <AlertCircle className="mr-2 inline-block size-4 align-[-2px]" />
                                {msg.content}
                              </div>
                            ) : (
                              <div className="flex-1 min-w-0 pb-1 w-full max-w-full overflow-hidden text-left">
                                <div className={`prose ${settings.ai_font_size === 'small' ? 'prose-sm text-xs' : settings.ai_font_size === 'large' ? 'prose-base' : 'prose-sm'} max-w-none dark:prose-invert prose-p:leading-relaxed prose-pre:border prose-pre:border-border prose-pre:bg-surface-muted prose-p:text-text-strong prose-li:text-text-strong`}>
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {msg.content}
                                  </ReactMarkdown>
                                </div>
                              </div>
                            )}

                            {/* Actions under the AI message */}
                            {!msg.error && (
                              <div className="flex items-center gap-2 mt-3 pt-1">
                                <button
                                  type="button"
                                  onClick={() => handleCopy(msg.id, msg.content)}
                                  aria-label="Copiar resposta"
                                  className="rounded-lg p-1.5 text-text-muted hover:bg-surface-muted hover:text-text-strong transition-all"
                                  title="Copiar"
                                >
                                  {copiedId === msg.id ? <CheckCircle2 className="size-4 text-success" /> : <Copy className="size-4" />}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => speakText(msg.content)}
                                  aria-label="Ouvir resposta"
                                  className="rounded-lg p-1.5 text-text-muted hover:bg-surface-muted hover:text-text-strong transition-all"
                                  title="Ouvir"
                                >
                                  <Volume2 className="size-4" />
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Sources displayed directly under the AI bubble */}
                        {msg.role === 'ai' && !msg.error && uniqueSources.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {uniqueSources.map((src, idx) => {
                              const href = buildSourceHref(src)
                              const label = buildSourceLabel(src)
                              
                              let Icon = BookOpen
                              let pillColor = 'border-border bg-surface text-text-medium hover:border-primary hover:text-primary'

                              if (src.type.includes('flashcard')) {
                                Icon = Brain
                                pillColor = 'border-indigo-500/10 bg-indigo-500/5 text-indigo-500 hover:border-indigo-500/30'
                              } else if (src.type.includes('note')) {
                                Icon = FileText
                                pillColor = 'border-primary/10 bg-primary/5 text-primary hover:border-primary/30'
                              }

                              const sharedClasses = `inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-medium shadow-sm transition-colors ${pillColor}`

                              return href ? (
                                <Link
                                  key={src.id + idx}
                                  href={href}
                                  className={sharedClasses}
                                >
                                  <Icon className="size-3 shrink-0" />
                                  <span className="max-w-[140px] truncate">{label}</span>
                                </Link>
                              ) : null
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {isLoading && (
              <div className="flex gap-4 max-w-3xl mx-auto w-full px-4 mt-4">
                <div className="shrink-0 mt-1">
                  <div className="flex size-8 items-center justify-center rounded-full bg-gradient-to-tr from-primary to-indigo-600 text-white shadow-sm">
                    <Loader2 className="size-4 animate-spin shrink-0" />
                  </div>
                </div>
                <div className="flex-1 space-y-2 min-w-0">
                  <div className="flex items-center gap-2 rounded-2xl p-4 text-sm text-text-medium animate-pulse bg-surface-muted/30 border border-border/30 shadow-sm">
                    <div className="flex gap-1 mr-2">
                      <div className="size-1.5 animate-bounce rounded-full bg-primary/40" style={{ animationDelay: '0ms' }} />
                      <div className="size-1.5 animate-bounce rounded-full bg-primary/40" style={{ animationDelay: '150ms' }} />
                      <div className="size-1.5 animate-bounce rounded-full bg-primary/40" style={{ animationDelay: '300ms' }} />
                    </div>
                    Vasculhando anotações...
                  </div>
                </div>
              </div>
            )}
          </ChatErrorBoundary>
        </div>

        {/* Input e botões rápidos */}
        <div className="bg-surface px-4 py-4 md:py-6 shrink-0 w-full max-w-3xl mx-auto z-10">
          <form onSubmit={(e) => { e.preventDefault(); handleAsk(); }}>
            <div className="relative flex items-end gap-2 bg-surface-muted/40 border border-border/80 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10 rounded-3xl pl-3 pr-12 py-2 shadow-sm transition-all focus-within:shadow-md">
              {/* Botão de gravação de voz */}
              <button
                type="button"
                onClick={toggleRecording}
                disabled={isLoading || !isWorkspaceValid}
                className={`flex size-9 items-center justify-center rounded-full transition-all shrink-0 ${
                  isRecording 
                    ? 'bg-error text-white animate-pulse' 
                    : 'text-text-muted hover:bg-surface-muted hover:text-primary'
                }`}
                title={isRecording ? 'Parar gravação' : 'Falar pergunta'}
              >
                {isRecording ? <Square className="size-4 fill-current" /> : <Mic className="size-5" />}
              </button>

              <textarea
                ref={textareaRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isWorkspaceValid ? 'Escreva sua pergunta...' : 'Workspace inválido'}
                disabled={isLoading || !isWorkspaceValid}
                className="w-full bg-transparent border-0 outline-none focus:ring-0 resize-none py-1.5 px-2 text-sm text-text-strong min-h-[36px] max-h-[140px] overflow-y-auto placeholder:text-text-muted/70"
                rows={1}
              />
              
              <button
                type="submit"
                disabled={isLoading || query.trim().length < 3 || !isWorkspaceValid}
                className="absolute right-2.5 bottom-2 flex size-9 items-center justify-center rounded-full bg-primary text-white shadow-sm transition-all hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-muted"
              >
                <Send className="size-4" />
              </button>
            </div>

            {activeMessages.some((message) => message.role === 'ai') && (
              <p className="mt-3 text-center text-[10px] font-medium text-text-muted">
                A IA pode apresentar informações imprecisas. Verifique as fontes citadas para confirmar.
              </p>
            )}
            {copyError && (
              <p className="mt-2 text-center text-[10px] font-medium text-error">
                {copyError}
              </p>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}
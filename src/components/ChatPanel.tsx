'use client'

import React, { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { Send, Bot, User, BookOpen, AlertCircle, Loader2, Copy, CheckCircle2, Sparkles, Plus, MessageSquare, ArrowLeftRight, Trash2, Menu, Volume2, Mic, Square, Brain, FileText } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

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
  "Resuma minhas anotações mais recentes",
  "O que é repetição espaçada?",
  "Me teste sobre os flashcards de hoje",
  "Explique um conceito das minhas notas"
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
}

export default function ChatPanel({ workspaceId, workspaces = [], onWorkspaceChange }: ChatPanelProps) {
  const isWorkspaceValid = Boolean(workspaceId)
  const storageKey = `omnimind_chat_${workspaceId || 'invalid'}`

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [isMounted, setIsMounted] = useState(false)

  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [copyError, setCopyError] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

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

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed, workspaceId, persona: currentPersona }),
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
              setConversations((prev) =>
                prev.map((conversation) => {
                  if (conversation.id !== targetConversationId) return conversation

                  return normalizeConversation({
                    ...conversation,
                    messages: conversation.messages.map((message) =>
                      message.id === aiMsgId ? { ...message, content: aiContent } : message
                    ),
                    updatedAt: Date.now(),
                  })
                })
              )
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
    <div className="flex h-full w-full gap-4 relative overflow-hidden flex-col lg:flex-row">
      {/* Overlay para fechar a sidebar no mobile */}
      {isSidebarOpen && (
        <div 
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden transition-opacity"
        />
      )}

      {/* Sidebar de Histórico (Slide-in mobile + Fixo desktop) */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 flex w-72 max-w-[80vw] flex-col border-r border-border bg-surface transition-transform duration-300 ease-in-out lg:static lg:z-0 lg:w-80 lg:min-w-80 lg:translate-x-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
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

      {/* Área Principal de Chat */}
      <div className="panel flex min-w-0 flex-1 flex-col overflow-hidden bg-surface relative h-full">
        {!isWorkspaceValid && (
          <div className="flex items-center justify-center gap-2 border-b border-error/20 bg-error-soft px-4 py-2 text-center text-xs font-medium text-error">
            <AlertCircle className="size-4" /> Workspace não identificado. O chat está desativado.
          </div>
        )}

        {/* Top Header do Chat com trigger para sidebar mobile */}
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 shrink-0 bg-surface">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="lg:hidden p-2 -ml-2 text-text-muted hover:text-text-strong rounded-lg hover:bg-surface-muted transition-colors shrink-0"
              aria-label="Abrir menu"
            >
              <Menu className="size-5" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-text-muted">Conversa ativa</p>
              <h3 className="mt-1 truncate text-sm font-semibold text-text-strong">
                {activeConversation?.title || DEFAULT_CONVERSATION_TITLE}
              </h3>
            </div>
          </div>

          {/* Seletor Dropdown de Workspace */}
          {workspaces.length > 0 && onWorkspaceChange && (
            <div className="flex items-center gap-2 shrink-0">
              <span className="hidden sm:inline text-[10px] text-text-muted font-bold uppercase tracking-wider">Workspace:</span>
              <select
                value={workspaceId || ''}
                onChange={(e) => onWorkspaceChange(e.target.value)}
                className="h-8 rounded-lg border border-border bg-surface-muted/50 px-2.5 text-xs font-semibold text-text-strong outline-none focus:border-primary/50 cursor-pointer max-w-[150px] truncate"
              >
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button type="button" onClick={handleStartNewConversation} className="btn-secondary h-9 shrink-0 px-3 text-xs">
            Nova conversa
          </button>
        </div>

        {/* Seletor de Persona de Estudo */}
        {activeConversation && (
          <div className="border-b border-border bg-surface-muted/20 px-4 py-2 flex items-center gap-2 overflow-x-auto scrollbar-none shrink-0">
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider mr-2 shrink-0">Modo:</span>
            {[
              { id: 'tutor', label: '📚 Tutor Socrático', desc: 'Explica com analogias e faz perguntas de fixação ao final' },
              { id: 'grill', label: '🔥 Examinador (Grill)', desc: 'Banca rígida, faz perguntas difíceis e critica respostas' },
              { id: 'eli5', label: '👶 Simplificado (ELI5)', desc: 'Explica tudo em termos infantis bem simples' }
            ].map((p) => {
              const isSel = (activeConversation.persona || 'tutor') === p.id
              return (
                <button
                  key={p.id}
                  onClick={() => handleUpdatePersona(p.id as any)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border flex items-center gap-1.5 transition-all shrink-0 ${
                    isSel
                      ? 'bg-primary/10 text-primary border-primary/20 shadow-sm'
                      : 'bg-surface text-text-muted border-border hover:bg-surface-hover'
                  }`}
                  title={p.desc}
                >
                  {p.label}
                </button>
              )
            })}
          </div>
        )}

        {/* Mensagens protegidas pelo ErrorBoundary */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto bg-surface-muted/30 p-4 custom-scrollbar">
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
              <div className="mx-auto flex h-full max-w-lg flex-col items-center justify-center px-4 text-center animate-in fade-in duration-500">
                <div className="mb-6 flex size-16 items-center justify-center rounded-2xl border border-border bg-surface shadow-sm">
                  <Bot className="size-8 text-primary opacity-80" />
                </div>
                <h2 className="mb-2 text-xl font-semibold text-text-strong">Como posso ajudar?</h2>
                <p className="mb-8 text-sm text-text-medium">
                  Faça perguntas sobre os seus estudos. Vou vasculhar suas notas, flashcards e PDFs para responder.
                </p>

                <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                  {SUGGESTIONS.map((sug, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleAsk(sug)}
                      disabled={!isWorkspaceValid}
                      aria-label={`Enviar sugestão: ${sug}`}
                      className="group flex items-center gap-2 rounded-xl border border-border bg-surface p-3 text-left text-sm transition-all hover:border-primary/30 hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Sparkles className="size-4 shrink-0 text-primary opacity-50 transition-opacity group-hover:opacity-100" />
                      <span className="line-clamp-2 font-medium text-text-strong">{sug}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {activeMessages.map((msg) => {
                  const uniqueSources = getUniqueSources(msg.sources)

                  return (
                    <div key={msg.id} className={`group flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                      <div className="shrink-0 mt-1">
                        {msg.role === 'user' ? (
                          <div className="flex size-8 items-center justify-center rounded-full border border-border bg-surface text-text-medium">
                            <User className="size-4" />
                          </div>
                        ) : (
                          <div className="flex size-8 items-center justify-center rounded-full bg-primary text-white shadow-sm">
                            <Bot className="size-4" />
                          </div>
                        )}
                      </div>

                      <div className={`max-w-[85%] space-y-2 sm:max-w-[75%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                        <div className="relative flex items-start gap-2 w-full">
                          {msg.role === 'ai' && !msg.error && (
                            <div className="absolute -left-16 top-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => handleCopy(msg.id, msg.content)}
                                aria-label="Copiar resposta"
                                className="rounded-md p-1.5 text-text-muted hover:bg-surface hover:text-primary transition-colors"
                                title="Copiar resposta"
                              >
                                {copiedId === msg.id ? <CheckCircle2 className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
                              </button>
                              <button
                                onClick={() => speakText(msg.content)}
                                aria-label="Ouvir resposta"
                                className="rounded-md p-1.5 text-text-muted hover:bg-surface hover:text-primary transition-colors"
                                title="Ouvir resposta"
                              >
                                <Volume2 className="size-3.5" />
                              </button>
                            </div>
                          )}

                          <div
                            className={`rounded-2xl p-4 text-sm leading-relaxed w-full ${
                              msg.role === 'user'
                                ? 'rounded-tr-sm border border-border bg-surface text-text-strong shadow-sm'
                                : msg.error
                                  ? 'rounded-tl-sm border border-error/20 bg-error-soft text-error'
                                  : 'panel w-full rounded-tl-sm shadow-sm bg-surface'
                            }`}
                          >
                            {msg.error && <AlertCircle className="mr-2 inline-block size-4 align-[-2px]" />}

                            {msg.role === 'ai' && msg.model && (
                              <div className="mb-2">
                                <span className="inline-flex items-center gap-1 text-[9px] font-bold text-primary uppercase bg-primary-soft/30 border border-primary/10 px-2.5 py-0.5 rounded-full">
                                  ⚡ {msg.model}
                                </span>
                              </div>
                            )}

                            {msg.role === 'ai' && !msg.error ? (
                              <div className="prose prose-sm max-w-none dark:prose-invert prose-p:leading-relaxed prose-pre:border prose-pre:border-border prose-pre:bg-surface-muted">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {msg.content}
                                </ReactMarkdown>
                              </div>
                            ) : (
                              <div className="whitespace-pre-wrap text-text-strong">{msg.content}</div>
                            )}
                          </div>
                        </div>

                        {msg.role === 'ai' && !msg.error && uniqueSources.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
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
              <div className="flex gap-4 flex-row mt-4">
                <div className="shrink-0 mt-1">
                  <div className="flex size-8 items-center justify-center rounded-full bg-primary text-white shadow-sm">
                    <Loader2 className="size-4 animate-spin" />
                  </div>
                </div>
                <div className="panel flex items-center gap-3 rounded-2xl rounded-tl-sm p-4 text-sm text-text-medium shadow-sm animate-pulse bg-surface">
                  <div className="flex gap-1">
                    <div className="size-1.5 animate-bounce rounded-full bg-primary/40" style={{ animationDelay: '0ms' }} />
                    <div className="size-1.5 animate-bounce rounded-full bg-primary/40" style={{ animationDelay: '150ms' }} />
                    <div className="size-1.5 animate-bounce rounded-full bg-primary/40" style={{ animationDelay: '300ms' }} />
                  </div>
                  Vasculhando anotações...
                </div>
              </div>
            )}
          </ChatErrorBoundary>
        </div>

        {/* Input e botões rápidos */}
        <div className="border-t border-border bg-surface p-4 shrink-0">
          {/* Quick Commands */}
          {isWorkspaceValid && !isLoading && (
            <div className="flex items-center gap-2 mb-3 overflow-x-auto scrollbar-none py-1">
              <button
                type="button"
                onClick={() => handleAsk("Me faça uma pergunta desafiadora sobre minhas anotações para testar meu conhecimento.")}
                className="px-3 py-1.5 rounded-lg border border-border bg-surface text-text-medium hover:bg-surface-hover hover:border-primary/30 transition-all text-[11px] font-semibold flex items-center gap-1.5 shrink-0"
              >
                <span>🎲</span>
                <span>Me faça uma pergunta</span>
              </button>
              <button
                type="button"
                onClick={() => handleAsk("Analise minhas anotações deste workspace e aponte se existe alguma contradição conceitual ou inconsistência.")}
                className="px-3 py-1.5 rounded-lg border border-border bg-surface text-text-medium hover:bg-surface-hover hover:border-primary/30 transition-all text-[11px] font-semibold flex items-center gap-1.5 shrink-0"
              >
                <span>⚡</span>
                <span>Ache contradições</span>
              </button>
            </div>
          )}

          <form onSubmit={(e) => { e.preventDefault(); handleAsk(); }}>
            <div className="relative flex items-end gap-2">
              {/* Botão de gravação de voz */}
              <button
                type="button"
                onClick={toggleRecording}
                disabled={isLoading || !isWorkspaceValid}
                className={`absolute left-2.5 bottom-2 rounded-lg p-1.5 transition-colors z-10 ${
                  isRecording 
                    ? 'bg-error text-white animate-pulse' 
                    : 'text-text-muted hover:bg-surface-muted hover:text-primary'
                }`}
                title={isRecording ? 'Parar gravação' : 'Falar pergunta'}
              >
                {isRecording ? <Square className="size-3.5 fill-current" /> : <Mic className="size-4" />}
              </button>

              <textarea
                ref={textareaRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isWorkspaceValid ? 'Pergunte ao seu Segundo Cérebro...' : 'Workspace inválido'}
                disabled={isLoading || !isWorkspaceValid}
                className="field w-full min-h-[44px] max-h-[120px] resize-none py-3 pl-11 pr-12 overflow-y-auto disabled:bg-surface-muted disabled:opacity-50"
                rows={1}
              />
              
              <button
                type="submit"
                disabled={isLoading || query.trim().length < 3 || !isWorkspaceValid}
                className="absolute right-2 bottom-1.5 rounded-lg bg-primary p-2 text-white shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="size-4" />
              </button>
            </div>

            {activeMessages.some((message) => message.role === 'ai') && (
              <p className="mt-3 text-center text-[10px] font-medium text-text-muted">
                A IA pode cometer erros. Verifique as fontes citadas para confirmar.
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
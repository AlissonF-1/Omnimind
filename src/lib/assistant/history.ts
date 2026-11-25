import { isAssistantId, isAssistantPersona, type AssistantPersona, type AssistantSource } from './contracts'
import { isAssistantProvider, parseGenerationMetadata, type AssistantProvider, type GenerationMetadata } from './providers'
import { parseLearningTutorLabel, type LearningTutorHint, type LearningTutorLabel } from './learning-tutor'

export const newConversationTitle = 'Nova conversa'
const messageLimit = 40

export type AssistantMessage = {
  id: string
  role: 'user' | 'ai'
  content: string
  sources?: AssistantSource[]
  error?: boolean
  interruption?: string
  generation?: GenerationMetadata
  learningHint?: LearningTutorHint
}

export type AssistantConversation = {
  id: string
  title: string
  messages: AssistantMessage[]
  createdAt: number
  updatedAt: number
  persona: AssistantPersona
}

export type AssistantHistory = {
  conversations: AssistantConversation[]
  activeConversationId: string | null
  learningLabel?: LearningTutorLabel
  learningProvider?: AssistantProvider
}

export function emptyAssistantHistory(): AssistantHistory {
  return { conversations: [], activeConversationId: null }
}

export function assistantMessageId() {
  return globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2)
}

export function newAssistantConversation(persona: AssistantPersona): AssistantConversation {
  const timestamp = Date.now()
  return { id: assistantMessageId(), title: newConversationTitle, messages: [], createdAt: timestamp, updatedAt: timestamp, persona }
}

export function assistantTitle(text: string) {
  const title = text.trim().split(/\s+/).slice(0, 6).join(' ')
  if (!title) return newConversationTitle
  return title.length > 52 ? title.slice(0, 51) + '…' : title
}

export function limitAssistantMessages(messages: AssistantMessage[]) {
  return messages.slice(-messageLimit)
}

export function parseAssistantSources(input: unknown): AssistantSource[] {
  if (!Array.isArray(input)) return []
  return input.flatMap((source) => {
    if (!source || !isAssistantId(source.id) || typeof source.type !== 'string') return []
    return [{
      id: source.id,
      title: typeof source.title === 'string' ? source.title : null,
      type: source.type,
      similarity: typeof source.similarity === 'number' ? source.similarity : 0,
      workspaceId: isAssistantId(source.workspaceId) ? source.workspaceId : null,
      noteId: isAssistantId(source.noteId) ? source.noteId : null,
    }]
  })
}

export function readAssistantHistory(storage: Pick<Storage, 'getItem'>, key: string): AssistantHistory {
  try {
    const data = JSON.parse(storage.getItem(key) ?? 'null')
    if (!Array.isArray(data?.conversations)) return emptyAssistantHistory()
    const conversations = data.conversations.flatMap((entry: AssistantConversation) => {
      if (!entry || typeof entry.id !== 'string' || typeof entry.title !== 'string' || !Array.isArray(entry.messages)) return []
      const messages = entry.messages.flatMap((message) => {
        if (!message || typeof message.id !== 'string' || (message.role !== 'user' && message.role !== 'ai') ||
          typeof message.content !== 'string' || !message.content.trim()) return []
        return [{
          id: message.id, role: message.role, content: message.content, sources: parseAssistantSources(message.sources), error: message.error === true,
          interruption: typeof message.interruption === 'string' ? message.interruption : undefined,
          generation: parseGenerationMetadata(message.generation),
          learningHint: message.learningHint === 1 || message.learningHint === 2 || message.learningHint === 3 ? message.learningHint : undefined,
        }]
      })
      return [{
        id: entry.id, title: entry.title, messages: limitAssistantMessages(messages),
        createdAt: Number.isFinite(entry.createdAt) ? entry.createdAt : 0,
        updatedAt: Number.isFinite(entry.updatedAt) ? entry.updatedAt : 0,
        persona: isAssistantPersona(entry.persona) ? entry.persona : 'tutor',
      } satisfies AssistantConversation]
    }) as AssistantConversation[]
    return {
      conversations,
      activeConversationId: conversations.some(({ id }) => id === data.activeConversationId)
        ? data.activeConversationId : conversations[0]?.id ?? null,
      learningLabel: parseLearningTutorLabel(data.learningLabel),
      learningProvider: isAssistantProvider(data.learningProvider) ? data.learningProvider : undefined,
    }
  } catch {
    return emptyAssistantHistory()
  }
}

export function saveAssistantHistory(storage: Pick<Storage, 'setItem'>, key: string, state: AssistantHistory) {
  try {
    storage.setItem(key, JSON.stringify(state))
  } catch {
    // A conversa continua disponível em memória quando o navegador restringe o armazenamento.
  }
}

export function assistantDisplayText(text: string) {
  return text.replace(/\[ACTION:CREATE_EXAM_GOAL\|[^\]]*(?:\]|$)/g, '').trim()
}

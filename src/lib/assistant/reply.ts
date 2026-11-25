import type { AssistantPersona, parseAssistantHistory } from './contracts'
import type { AssistantProvider } from './providers'
import type { LearningTutorRequest } from './learning-tutor'

export type AssistantRequest = {
  accountId: string
  question: string
  workspaceId: string | null
  persona: AssistantPersona
  contextRoute: string
  history: ReturnType<typeof parseAssistantHistory>
  ecoMode: boolean
  model: AssistantProvider
  maxOutputTokens?: number
  contextConsent: AssistantProvider | null
  learning?: LearningTutorRequest
  learningConsent?: AssistantProvider | null
  fallback?: { provider: AssistantProvider; consent: true }
}

export class AssistantReplyError extends Error {
  constructor(message: string, readonly canRetry = false, readonly sessionChanged = false, readonly assessmentOpen = false) {
    super(message)
  }
}

type ReplyEvent = { type: string; data: unknown }
const interrupted = () => new AssistantReplyError('A resposta foi interrompida. Envie a pergunta novamente.')

export async function* readAssistantReply(input: AssistantRequest, signal: AbortSignal): AsyncGenerator<ReplyEvent> {
  const result = await fetch('/api/chat', {
    method: 'POST', cache: 'no-store', signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!result.ok) {
    const data = await result.json().catch(() => null)
    throw new AssistantReplyError(
      typeof data?.error === 'string' ? data.error : 'Não foi possível enviar a pergunta.',
      data?.canRetry === true,
      result.status === 401 || result.status === 409,
      result.status === 423,
    )
  }
  if (!result.body || !result.headers.get('content-type')?.includes('application/x-ndjson')) throw interrupted()

  const reader = result.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      signal.throwIfAborted()
      const lines = (buffer + (value ?? '')).split('\n')
      buffer = lines.pop() ?? ''
      if (done && buffer) lines.push(buffer)
      for (const line of lines) {
        if (!line.trim()) continue
        const event = JSON.parse(line)
        if (!event || typeof event.type !== 'string') throw interrupted()
        if (event.type === 'done') return
        if (event.type === 'error') {
          throw new AssistantReplyError(
            typeof event.data?.message === 'string' ? event.data.message : 'A resposta foi interrompida.',
            event.data?.canRetry === true,
          )
        }
        yield event
      }
      if (done) throw interrupted()
    }
  } finally {
    await reader.cancel().catch(() => null)
    reader.releaseLock()
  }
}

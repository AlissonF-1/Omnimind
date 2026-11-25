import 'server-only'

import { GoogleGenAI, ThinkingLevel, type GenerateContentConfig, type GenerateContentResponse } from '@google/genai'
import { assistantProviders, parseGenerationMetadata, type AssistantProvider, type GenerationMetadata } from './providers'

const models = {
  gemini: { standard: 'gemini-3.8-flash', economy: 'gemini-3.5-flash-lite' },
  groq: { standard: 'openai/gpt-oss-120b', economy: 'openai/gpt-oss-20b' },
  openrouter: { standard: 'openai/gpt-oss-20b', economy: 'openrouter/free' },
} as const

const endpoints = {
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
} as const

export const generationInputLimit = 64_000
const encoder = new TextEncoder()

export type GenerationMessage = { role: 'user' | 'assistant'; content: string }
type GenerationInput = {
  provider: AssistantProvider
  eco?: boolean
  system: string
  messages: GenerationMessage[]
  maxOutputTokens: number
  signal?: AbortSignal
  timeoutMs?: number
  json?: boolean
  modelOverride?: string
}
type ProviderChunk = { text?: string; metadata?: GenerationMetadata }
type CompatibleResponse = {
  model?: string
  provider?: string
  usage?: CompatibleUsage
  x_groq?: { usage?: CompatibleUsage }
  error?: { code?: unknown }
  choices?: { delta?: { content?: string }; message?: { content?: string }; finish_reason?: string }[]
}
type CompatibleUsage = { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }

const errors = {
  credentials: [502, 'A autenticação do provedor falhou. Confira a configuração do serviço.'],
  forbidden: [502, 'O provedor negou acesso. Confira as permissões da conta.'],
  quota: [429, 'O provedor atingiu um limite de uso ou de créditos. Tente mais tarde.'],
  model: [502, 'O modelo configurado está indisponível para esta conta.'],
  unavailable: [503, 'O provedor está indisponível. Tente mais tarde.'],
  configuration: [503, 'Este provedor não está configurado neste ambiente.'],
  timeout: [504, 'O provedor demorou demais para responder.'],
  cancelled: [499, 'A geração foi cancelada.'],
  empty: [502, 'O provedor retornou uma resposta vazia.'],
  invalid: [502, 'O provedor retornou uma resposta inválida.'],
  interrupted: [502, 'A conexão com o provedor foi encerrada antes do fim.'],
  input: [413, 'O contexto excede o limite desta chamada.'],
  rejected: [502, 'O provedor rejeitou a solicitação. Confira a configuração do modelo.'],
} as const

export class GenerationError extends Error {
  readonly status: number

  constructor(readonly code: keyof typeof errors, readonly provider: AssistantProvider, readonly upstreamStatus?: number) {
    const [status, message] = errors[code]
    super(assistantProviders[provider] + ' — ' + message)
    this.status = status
  }
}

function httpErrorStatus(value: unknown): number | undefined {
  const status = typeof value === 'string' && /^[45]\d\d$/.test(value) ? Number(value) : value
  return typeof status === 'number' && Number.isInteger(status) && status >= 400 && status < 600 ? status : undefined
}

function failureCode(status: number | undefined): keyof typeof errors {
  switch (status) {
    case 401: return 'credentials'
    case 403: return 'forbidden'
    case 402:
    case 429: return 'quota'
    case 404: return 'model'
    case 408:
    case 504: return 'timeout'
    case 400:
    case 422: return 'rejected'
    default: return 'unavailable'
  }
}

function geminiRejectedKey(error: unknown) {
  if (!(error instanceof Error)) return false
  try {
    const details = JSON.parse(error.message)?.error?.details
    return Array.isArray(details) && details.some((detail) =>
      detail?.['@type'] === 'type.googleapis.com/google.rpc.ErrorInfo' && detail?.reason === 'API_KEY_INVALID')
  } catch {
    return false
  }
}

function providerKey(provider: AssistantProvider) {
  switch (provider) {
    case 'gemini': return process.env.GEMINI_API_KEY
    case 'groq': return process.env.GROQ_API_KEY
    case 'openrouter': return process.env.OPENROUTER_API_KEY
  }
}

export function assertGenerationAvailable(provider: AssistantProvider) {
  if (!providerKey(provider)) throw new GenerationError('configuration', provider)
}

function configuredModel(input: GenerationInput) {
  const profile = input.eco ? 'economy' : 'standard'
  const defaults = models[input.provider]
  const candidate = input.modelOverride ?? (input.provider === 'gemini' && !input.eco ? process.env.GEMINI_MODEL : undefined)
  // An old deployment override must not keep the Assistant on a retired model.
  return candidate && (candidate === defaults.standard || candidate === defaults.economy) ? candidate : defaults[profile]
}

function geminiChunk(value: GenerateContentResponse, provider: AssistantProvider): ProviderChunk {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new GenerationError('invalid', provider)
  const candidate = value.candidates?.[0]
  if (value.promptFeedback?.blockReason || (candidate?.finishReason && !['STOP', 'MAX_TOKENS'].includes(candidate.finishReason))) {
    throw new GenerationError('rejected', provider)
  }
  const usage = value.usageMetadata
  return {
    text: candidate?.content?.parts?.filter((part) => !part.thought).map((part) => part.text ?? '').join(''),
    metadata: parseGenerationMetadata({
      provider, model: value.modelVersion,
      usage: usage && { inputTokens: usage.promptTokenCount, outputTokens: usage.candidatesTokenCount, totalTokens: usage.totalTokenCount },
    }),
  }
}

async function* generateGemini(input: GenerationInput, model: string, key: string, signal: AbortSignal, stream: boolean) {
  const client = new GoogleGenAI({ apiKey: key, vertexai: false, apiVersion: 'v1beta' })
  const config: GenerateContentConfig = {
    abortSignal: signal,
    httpOptions: { retryOptions: { attempts: 1 } },
    automaticContinuation: false,
    systemInstruction: input.system,
    maxOutputTokens: input.maxOutputTokens,
    thinkingConfig: { thinkingLevel: input.eco ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW },
    ...(input.json ? { responseMimeType: 'application/json' } : {}),
  }
  const request = {
    model, config,
    contents: input.messages.map(({ role, content }) => ({
      role: role === 'assistant' ? 'model' : 'user', parts: [{ text: content }],
    })),
  }
  if (!stream) {
    yield geminiChunk(await client.models.generateContent(request), input.provider)
    return
  }

  let finished = false
  for await (const chunk of await client.models.generateContentStream(request)) {
    const event = geminiChunk(chunk, input.provider)
    finished ||= !!chunk.candidates?.[0]?.finishReason
    yield event
  }
  if (!finished) throw new GenerationError('interrupted', input.provider)
}

async function* readServerEvents(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let data: string[] = []
  try {
    while (true) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      if (done && buffer) lines.push(buffer)
      for (const rawLine of lines) {
        const line = rawLine.replace(/\r$/, '')
        if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
        if (line === '' && data.length) {
          const event = data.join('\n')
          data = []
          yield event
        }
      }
      if (done) {
        if (data.length) yield data.join('\n')
        return
      }
    }
  } finally {
    await reader.cancel().catch(() => null)
    reader.releaseLock()
  }
}

function compatibleChunk(value: CompatibleResponse, provider: AssistantProvider, stream: boolean): ProviderChunk {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new GenerationError('invalid', provider)
  if (value.error) {
    const status = httpErrorStatus(value.error.code)
    throw new GenerationError(failureCode(status), provider, status)
  }
  const choice = value.choices?.[0]
  if (choice?.finish_reason && !['stop', 'length'].includes(choice.finish_reason)) {
    throw new GenerationError(choice.finish_reason === 'error' ? 'interrupted' : 'rejected', provider)
  }
  const text = stream ? choice?.delta?.content : choice?.message?.content
  if (text != null && typeof text !== 'string') throw new GenerationError('invalid', provider)
  const usage = value.usage ?? value.x_groq?.usage
  return {
    text: text ?? undefined,
    metadata: parseGenerationMetadata({
      provider, model: value.model === 'openrouter/free' ? undefined : value.model,
      upstreamProvider: provider === 'openrouter' ? value.provider : undefined,
      usage: usage && { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens, totalTokens: usage.total_tokens },
    }),
  }
}

async function* generateCompatible(input: GenerationInput, provider: 'groq' | 'openrouter', model: string, key: string, signal: AbortSignal, stream: boolean) {
  const groq = provider === 'groq'
  const response = await fetch(endpoints[provider], {
    method: 'POST', cache: 'no-store', signal,
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', ...(!groq ? { 'X-Title': 'OmniMind' } : {}) },
    body: JSON.stringify({
      model, stream, max_completion_tokens: input.maxOutputTokens,
      messages: [{ role: 'system', content: input.system }, ...input.messages],
      ...(groq
        ? { reasoning_effort: 'low', include_reasoning: false }
        : { provider: { allow_fallbacks: false, require_parameters: true } }),
      ...(stream && !groq && { stream_options: { include_usage: true } }),
      ...(input.json && { response_format: { type: 'json_object' } }),
    }),
  })
  if (!response.ok) {
    void response.body?.cancel().catch(() => null)
    throw new GenerationError(failureCode(response.status), provider, response.status)
  }
  if (!stream) {
    yield compatibleChunk(await response.json(), provider, false)
    return
  }
  if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
    void response.body?.cancel().catch(() => null)
    throw new GenerationError('invalid', provider)
  }

  let finished = false
  for await (const event of readServerEvents(response.body)) {
    if (event === '[DONE]') {
      if (finished) return
      break
    }
    const value: CompatibleResponse = JSON.parse(event)
    const chunk = compatibleChunk(value, provider, true)
    finished ||= !!value.choices?.[0]?.finish_reason
    yield chunk
  }
  throw new GenerationError('interrupted', provider)
}

export async function* generate(input: GenerationInput, stream = true) {
  const { provider } = input
  const key = providerKey(provider)
  if (!key) throw new GenerationError('configuration', provider)
  if (encoder.encode(JSON.stringify([input.system, input.messages])).length > generationInputLimit) {
    throw new GenerationError('input', provider)
  }
  const model = configuredModel(input)
  const timeout = AbortSignal.timeout(input.timeoutMs ?? 45_000)
  const signal = AbortSignal.any(input.signal ? [timeout, input.signal] : [timeout])
  const chunks = provider === 'gemini'
    ? generateGemini(input, model, key, signal, stream)
    : generateCompatible(input, provider, model, key, signal, stream)
  let metadata: GenerationMetadata = { provider }
  let answered = false
  let prefix = ''
  let outcome: 'complete' | keyof typeof errors = 'interrupted'
  let upstreamStatus: number | undefined
  try {
    signal.throwIfAborted()
    for await (const chunk of chunks) {
      signal.throwIfAborted()
      if (chunk.metadata) {
        const next = { ...metadata, ...chunk.metadata }
        if (chunk.metadata.usage) next.usage = { ...metadata.usage, ...chunk.metadata.usage }
        if (JSON.stringify(next) !== JSON.stringify(metadata)) {
          metadata = next
          yield { type: 'metadata', data: metadata } as const
        }
      }
      if (!chunk.text) continue
      if (!answered && !chunk.text.trim()) {
        prefix = (prefix + chunk.text).slice(-256)
        continue
      }
      yield { type: 'text', data: prefix + chunk.text } as const
      prefix = ''
      answered = true
    }
    signal.throwIfAborted()
    if (!answered) throw new GenerationError('empty', provider)
    outcome = 'complete'
  } catch (error) {
    upstreamStatus = error instanceof GenerationError ? error.upstreamStatus
      : error && typeof error === 'object' && 'status' in error ? httpErrorStatus(error.status) : undefined
    if (input.signal?.aborted) outcome = 'cancelled'
    else if (timeout.aborted) outcome = 'timeout'
    else if (error instanceof GenerationError) outcome = error.code
    else if (error instanceof SyntaxError) outcome = 'invalid'
    else if (provider === 'gemini' && upstreamStatus === 400 && geminiRejectedKey(error)) outcome = 'credentials'
    else outcome = failureCode(upstreamStatus)
    throw new GenerationError(outcome, provider, upstreamStatus)
  } finally {
    if (outcome === 'complete' && metadata.usage) console.info('[assistant-generation]', { ...metadata, outcome })
    else if (outcome !== 'complete' && outcome !== 'cancelled' && !input.signal?.aborted) {
      console.warn('[assistant-generation]', { ...metadata, requestedModel: model, outcome, upstreamStatus })
    }
  }
}

export async function generateText(input: GenerationInput) {
  let content = ''
  let metadata: GenerationMetadata = { provider: input.provider }
  for await (const event of generate(input, false)) {
    if (event.type === 'metadata') metadata = event.data
    else content += event.data
  }
  if (input.json) {
    try {
      const parsed: unknown = JSON.parse(content)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
    } catch {
      throw new GenerationError('invalid', input.provider)
    }
  }
  return { content, metadata }
}

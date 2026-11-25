export const assistantProviders = {
  gemini: 'Gemini',
  groq: 'Groq',
  openrouter: 'OpenRouter',
} as const

export type AssistantProvider = keyof typeof assistantProviders
export const assistantProviderIds = Object.keys(assistantProviders) as AssistantProvider[]
export const assistantQuestionLimit = 4000
export const assistantOutputLimits = [512, 1024, 2048] as const

export function isAssistantProvider(value: unknown): value is AssistantProvider {
  return value === 'gemini' || value === 'groq' || value === 'openrouter'
}

export function assistantGenerationSelection(input: {
  model?: unknown
  ecoMode?: unknown
  maxOutputTokens?: unknown
  contextConsent?: unknown
  fallback?: unknown
}) {
  if (input.model !== undefined && !isAssistantProvider(input.model)) return null
  const original = isAssistantProvider(input.model) ? input.model : 'gemini'
  const fallback = input.fallback
  let provider = original
  if (fallback !== undefined) {
    if (!fallback || typeof fallback !== 'object' || !('consent' in fallback) || fallback.consent !== true ||
      !('provider' in fallback) || !isAssistantProvider(fallback.provider) || fallback.provider === original) return null
    provider = fallback.provider
  }
  const eco = input.ecoMode === true
  const defaultLimit = eco ? 1024 : 2048
  const requested = assistantOutputLimits.find((limit) => limit === input.maxOutputTokens)
  return {
    provider,
    eco,
    maxOutputTokens: requested ?? defaultLimit,
    includeContext: input.contextConsent === provider ||
      (input.contextConsent === undefined && provider === 'gemini' && fallback === undefined),
  }
}

export type GenerationUsage = { inputTokens?: number; outputTokens?: number; totalTokens?: number }
export type GenerationMetadata = {
  provider: AssistantProvider
  model?: string
  upstreamProvider?: string
  usage?: GenerationUsage
}

export function parseGenerationMetadata(value: unknown): GenerationMetadata | undefined {
  if (!value || typeof value !== 'object' || !('provider' in value) || !isAssistantProvider(value.provider)) return
  const metadata: GenerationMetadata = { provider: value.provider }
  if ('model' in value && typeof value.model === 'string' && /^[\w./:@-]{1,160}$/.test(value.model)) metadata.model = value.model
  if ('upstreamProvider' in value && typeof value.upstreamProvider === 'string' && /^[\w ./:&()-]{1,100}$/.test(value.upstreamProvider)) {
    metadata.upstreamProvider = value.upstreamProvider
  }
  if ('usage' in value && value.usage && typeof value.usage === 'object') {
    const usage: GenerationUsage = {}
    for (const key of ['inputTokens', 'outputTokens', 'totalTokens'] as const) {
      const count = (value.usage as Record<string, unknown>)[key]
      if (typeof count === 'number' && Number.isSafeInteger(count) && count >= 0) usage[key] = count
    }
    if (Object.keys(usage).length) metadata.usage = usage
  }
  return metadata
}

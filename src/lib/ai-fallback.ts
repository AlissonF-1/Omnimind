import 'server-only'

import { generateText, GenerationError } from './assistant/generation'

// Retains the existing server interface for features without a provider consent control.
export async function callAIWithFallback(
  systemPrompt: string,
  userMessage: string,
  modelPreference: 'critical' | 'simple' = 'simple',
  jsonMode = false,
  options?: { groqModel: string },
) {
  try {
    const { content } = await generateText({
      provider: 'groq',
      eco: modelPreference === 'simple',
      modelOverride: options?.groqModel,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      maxOutputTokens: 4096,
      json: jsonMode,
      timeoutMs: 25_000,
    })
    return { success: true, content } as const
  } catch (error) {
    return { success: false, error: error instanceof GenerationError ? error.message : 'A geração está indisponível.' } as const
  }
}

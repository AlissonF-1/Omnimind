import type { QuestionAnswerInput } from './contracts'

export const questionsPath = '/dashboard/questoes'

export function practiceHref(topic?: string, versionId?: string, origin?: 'historico' | 'erros') {
  const params = new URLSearchParams()
  if (topic) params.set('assunto', topic)
  if (versionId) params.set('versao', versionId)
  if (origin) params.set('origem', origin)
  return `${questionsPath}/resolver${params.size ? `?${params}` : ''}`
}

export function historyHref(errorsOnly = false, page = 1, topic?: string) {
  const params = new URLSearchParams()
  if (errorsOnly) params.set('filtro', 'erros')
  if (topic) params.set('assunto', topic)
  if (page > 1) params.set('pagina', String(page))
  return `${questionsPath}/historico${params.size ? `?${params}` : ''}`
}

export function answerSubmission(
  previous: QuestionAnswerInput | null,
  versionId: string,
  optionId: string,
  createRequestId: () => string,
): QuestionAnswerInput {
  return previous ?? { versionId, optionId, requestId: createRequestId() }
}

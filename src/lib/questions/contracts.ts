export type QuestionAnswerInput = {
  versionId: string
  optionId: string
  requestId: string
}

export type QuestionAttemptFeedback = {
  attemptId: string
  versionId: string
  selectedOptionId: string
  correctOptionId: string
  isCorrect: boolean
  answeredAt: string
  options: { optionId: string; position: number; explanation: string }[]
}

export type QuestionActionError =
  | 'UNAUTHENTICATED'
  | 'INVALID_INPUT'
  | 'REQUEST_CONFLICT'
  | 'ATTEMPT_NOT_FOUND'
  | 'UNAVAILABLE'

export type QuestionActionResult =
  | { ok: true; feedback: QuestionAttemptFeedback }
  | { ok: false; error: QuestionActionError }

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isQuestionUuid(value: unknown): value is string {
  return typeof value === 'string' && value.length === 36 && uuidPattern.test(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isQuestionAnswerInput(input: unknown): input is QuestionAnswerInput {
  return isRecord(input)
    && isQuestionUuid(input.versionId)
    && isQuestionUuid(input.optionId)
    && isQuestionUuid(input.requestId)
}

export function parseQuestionFeedback(input: unknown): QuestionAttemptFeedback | null {
  if (!isRecord(input)) return null

  const { attemptId, versionId, selectedOptionId, correctOptionId, isCorrect, answeredAt, options } = input
  if (
    !isQuestionUuid(attemptId) || !isQuestionUuid(versionId)
    || !isQuestionUuid(selectedOptionId) || !isQuestionUuid(correctOptionId)
    || typeof isCorrect !== 'boolean' || isCorrect !== (selectedOptionId === correctOptionId)
    || typeof answeredAt !== 'string' || !Number.isFinite(Date.parse(answeredAt))
    || !Array.isArray(options) || options.length !== 5
  ) return null

  const feedbackOptions: QuestionAttemptFeedback['options'] = []
  const optionIds = new Set<string>()

  for (const [index, option] of (options as unknown[]).entries()) {
    if (!isRecord(option)) return null
    const { optionId, position, explanation } = option
    if (
      !isQuestionUuid(optionId) || optionIds.has(optionId) || position !== index + 1
      || typeof explanation !== 'string' || explanation.trim() === ''
    ) return null

    optionIds.add(optionId)
    feedbackOptions.push({ optionId, position, explanation })
  }

  if (!optionIds.has(selectedOptionId) || !optionIds.has(correctOptionId)) return null

  return {
    attemptId, versionId, selectedOptionId, correctOptionId, isCorrect, answeredAt,
    options: feedbackOptions,
  }
}

export function questionErrorFromSqlState(code: string): QuestionActionError {
  switch (code) {
    case '28000': return 'UNAUTHENTICATED'
    case '22023': return 'INVALID_INPUT'
    case '23505': return 'REQUEST_CONFLICT'
    case 'P0002': return 'ATTEMPT_NOT_FOUND'
    default: return 'UNAVAILABLE'
  }
}

export const learningPath = '/dashboard/trilhas'

export type LearningKind = 'reading' | 'practice' | 'challenge' | 'assessment'

export type LearningProgress = {
  step_id: string
  viewed_at: string
  completed_at: string | null
  submission_text: string | null
  submission_url: string | null
  submitted_at: string | null
  reviewed_at: string | null
  review_checks: boolean[] | null
  challenge_approved: boolean | null
}

export type LearningRound = {
  round: number
  finished_at: string | null
  correct: number | null
  total: number | null
  passed: boolean | null
}

export function isLearningSlug(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 100 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
}

export function learningHref(slug: string, stepId?: string, review = false) {
  const params = new URLSearchParams()
  if (stepId) params.set('etapa', stepId)
  if (review) params.set('revisao', '1')
  return learningPath + '/' + encodeURIComponent(slug) + (params.size ? '?' + params : '')
}

export function learningQuestionHref(slug: string, stepId: string, versionId?: string) {
  const stepHref = learningHref(slug, stepId)
  return versionId ? stepHref + '&questao=' + encodeURIComponent(versionId) : stepHref + '&resultado=1'
}

export function nextLearningStep<T extends { id: string }>(steps: T[], progress: Pick<LearningProgress, 'step_id' | 'completed_at'>[]) {
  const completed = new Set(progress.filter((item) => item.completed_at).map((item) => item.step_id))
  return steps.find((step) => !completed.has(step.id)) ?? null
}

export function remainingQuestions<T extends { version_id: string }>(questions: T[], answers: { version_id: string }[]) {
  const attempted = new Set(answers.map((answer) => answer.version_id))
  return questions.filter((question) => !attempted.has(question.version_id))
}

export function learningStepStatus(kind: LearningKind, progress?: LearningProgress) {
  if (kind === 'challenge') {
    if (progress?.challenge_approved) return 'Aprovado'
    if (progress?.reviewed_at) return 'Avaliado'
    if (progress?.submitted_at) return 'Enviado'
    return 'Não enviado'
  }
  if (!progress) return 'A fazer'
  if (!progress.completed_at) return kind === 'reading' ? 'Visualizada' : 'Em andamento'
  if (kind === 'reading') return 'Leitura confirmada'
  return kind === 'practice' ? 'Prática realizada' : 'Avaliação aprovada'
}

export function parseChallengeDelivery(mode: unknown, text: unknown, link: unknown) {
  if (mode === 'text' && typeof text === 'string') {
    const trimmed = text.trim()
    return trimmed && trimmed.length <= 12000 ? { text: trimmed, url: null } : null
  }
  if (mode !== 'url' || typeof link !== 'string') return null
  const trimmed = link.trim()
  if (trimmed.length > 2048 || !/^https:\/\/[a-z0-9][^/@?#\s]*\/[^\s]+$/i.test(trimmed) ||
      trimmed.includes(String.fromCharCode(92)) || /\p{Cc}/u.test(trimmed)) return null
  try {
    const url = new URL(trimmed)
    if (url.username || url.password || url.pathname === '/') return null
    return { text: null, url: url.href }
  } catch {
    return null
  }
}

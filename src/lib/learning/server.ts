import 'server-only'

import { getPracticeQuestion, getQuestionSession } from '@/lib/questions/server'
import { nextLearningStep, remainingQuestions, type LearningKind, type LearningProgress, type LearningRound } from './progress'

type LearningSession = Awaited<ReturnType<typeof getQuestionSession>>
export type LearningPath = { id: string; slug: string; kind: 'concurso' | 'mercado'; title: string; description: string }
export type LearningStep = {
  id: string
  path_id: string
  position: number
  topic: string
  title: string
  kind: LearningKind
  body: string | null
  rubric: string[] | null
  passing_score: number | null
}
type Enrollment = { id: string; path_id: string }
type ReviewSubmission = {
  enrollment_id: string
  submission_text: string | null
  submission_url: string | null
  submitted_at: string
}
type PracticeAttemptLink = { version_id: string }
export type LearningPracticeMistake = { attemptId: string; position: number }

export class LearningSchemaUnavailableError extends Error {}

function checkError(error: { code: string } | null) {
  if (!error) return
  if (error.code === 'PGRST205' || error.code === 'PGRST202' || error.code === '42P01') {
    throw new LearningSchemaUnavailableError('O esquema de Trilhas está indisponível.')
  }
  throw new Error('Não foi possível carregar os dados da trilha.')
}

export async function getLearningCatalog({ db, userId }: LearningSession) {
  const [paths, steps, enrollments] = await Promise.all([
    db.from('learning_paths').select('id,slug,kind,title,description').order('title')
      .overrideTypes<LearningPath[], { merge: false }>(),
    db.from('learning_path_steps').select('id,path_id,position,topic,title,kind').order('position')
      .overrideTypes<Pick<LearningStep, 'id' | 'path_id' | 'position' | 'topic' | 'title' | 'kind'>[], { merge: false }>(),
    db.from('learning_enrollments').select('id,path_id').eq('user_id', userId)
      .overrideTypes<Enrollment[], { merge: false }>(),
  ])
  for (const result of [paths, steps, enrollments]) checkError(result.error)
  const enrollmentIds = (enrollments.data ?? []).map((enrollment) => enrollment.id)
  const progress = enrollmentIds.length ? await db.from('learning_step_progress').select('enrollment_id,step_id,completed_at')
    .in('enrollment_id', enrollmentIds).not('completed_at', 'is', null)
    .overrideTypes<{ enrollment_id: string; step_id: string; completed_at: string }[], { merge: false }>() : null
  checkError(progress?.error ?? null)

  return (paths.data ?? []).map((path) => {
    const route = (steps.data ?? []).filter((step) => step.path_id === path.id)
    const enrollment = (enrollments.data ?? []).find((entry) => entry.path_id === path.id)
    const completed = (progress?.data ?? []).filter((item) => item.enrollment_id === enrollment?.id)
    const next = nextLearningStep(route, completed)
    return { ...path, enrolled: !!enrollment, completed: completed.length, total: route.length, next }
  })
}

export async function getLearningDetail({ db, userId }: LearningSession, slug: string) {
  const entry = await db.from('learning_paths').select('id,slug,kind,title,description').eq('slug', slug).maybeSingle()
    .overrideTypes<LearningPath, { merge: false }>()
  checkError(entry.error)
  if (!entry.data) return null
  const path = entry.data

  const [steps, enrollment, reviewer] = await Promise.all([
    db.from('learning_path_steps').select('id,path_id,position,topic,title,kind,body,rubric,passing_score')
      .eq('path_id', path.id).order('position').overrideTypes<LearningStep[], { merge: false }>(),
    db.from('learning_enrollments').select('id,path_id').eq('path_id', path.id).eq('user_id', userId).maybeSingle()
      .overrideTypes<Enrollment, { merge: false }>(),
    db.rpc('learn_can_review'),
  ])
  for (const result of [steps, enrollment, reviewer]) checkError(result.error)
  const progress = enrollment.data ? await db.from('learning_step_progress')
    .select('step_id,viewed_at,completed_at,submission_text,submission_url,submitted_at,reviewed_at,review_checks,challenge_approved')
    .eq('enrollment_id', enrollment.data.id).overrideTypes<LearningProgress[], { merge: false }>() : null
  checkError(progress?.error ?? null)
  return { path, steps: steps.data ?? [], enrollment: enrollment.data, progress: progress?.data ?? [], canReview: reviewer.data === true }
}

export async function getLearningPractice(session: LearningSession, enrollment: string, stepId: string, withMistakes = false) {
  const { db, userId } = session
  const [rounds, questions] = await Promise.all([
    db.from('learning_step_rounds').select('round,finished_at,correct,total,passed')
      .eq('enrollment_id', enrollment).eq('step_id', stepId).order('round', { ascending: false })
      .overrideTypes<LearningRound[], { merge: false }>(),
    db.from('learning_step_questions').select('version_id,position').eq('step_id', stepId).order('position')
      .overrideTypes<{ version_id: string; position: number }[], { merge: false }>(),
  ])
  checkError(rounds.error)
  checkError(questions.error)
  const round = rounds.data?.[0]
  if (!round || !questions.data?.length) return null
  const total = questions.data.length
  const mistakes: LearningPracticeMistake[] = []
  let links: PracticeAttemptLink[] | null = null
  if (withMistakes) {
    const result = await db.from('learning_step_attempts').select('version_id,attempt_id,attempt:quest_attempts(is_correct)')
      .eq('enrollment_id', enrollment).eq('step_id', stepId).eq('round', round.round).eq('attempt.user_id', userId)
      .overrideTypes<(PracticeAttemptLink & { attempt_id: string; attempt: { is_correct: boolean } | null })[], { merge: false }>()
    if (!result.error) {
      links = result.data ?? []
      const incorrect = new Map((result.data ?? []).filter(({ attempt }) => attempt?.is_correct === false)
        .map(({ version_id, attempt_id }) => [version_id, attempt_id]))
      for (const { version_id, position } of questions.data) {
        const attemptId = incorrect.get(version_id)
        if (attemptId) mistakes.push({ position, attemptId })
      }
    }
  }
  const practice = { round, rounds: rounds.data ?? [], total, mistakes }
  if (round.finished_at) return { ...practice, question: null, nextId: null, position: total }

  if (!links) {
    const attempts = await db.from('learning_step_attempts').select('version_id')
      .eq('enrollment_id', enrollment).eq('step_id', stepId).eq('round', round.round)
      .overrideTypes<PracticeAttemptLink[], { merge: false }>()
    checkError(attempts.error)
    links = attempts.data ?? []
  }
  const pending = remainingQuestions(questions.data, links)
  const [current, next] = pending
  if (!current) return null
  const question = await getPracticeQuestion(session, current.version_id)
  return { ...practice, question, nextId: next?.version_id ?? null, position: total - pending.length + 1 }
}

export async function getLearningReviewQueue({ db }: LearningSession, stepId: string) {
  const { data, error } = await db.rpc('learn_review_queue', { p_step_id: stepId })
  checkError(error)
  if (!Array.isArray(data)) throw new Error('Não foi possível ler a fila de avaliação.')
  return data as ReviewSubmission[]
}

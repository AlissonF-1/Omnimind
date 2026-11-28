import 'server-only'

import type { LearningKind } from '@/lib/learning/progress'
import { parseQuestionFeedback } from '@/lib/questions/contracts'
import type { createClient } from '@/utils/supabase/server'
import { isAssistantId } from './contracts'

type Database = Awaited<ReturnType<typeof createClient>>
type ContextInput = { pathId: string; stepId: string; attemptId?: string }
type Step = { position: number; topic: string; title: string; kind: LearningKind; body: string | null }
type Attempt = { isCorrect: boolean; question: string; selectedOption: string; explanation: string }

export class AssistantLearningContextError extends Error {
  constructor(readonly reason: 'invalid' | 'forbidden' | 'attempt_unavailable' | 'unavailable' | 'assessment_open') {
    super(reason)
  }
}

function readIds(value: unknown): ContextInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AssistantLearningContextError('invalid')
  const input = value as Record<string, unknown>
  if (!isAssistantId(input.pathId) || !isAssistantId(input.stepId) ||
    (input.attemptId !== undefined && !isAssistantId(input.attemptId))) {
    throw new AssistantLearningContextError('invalid')
  }
  return { pathId: input.pathId.toLowerCase(), stepId: input.stepId.toLowerCase(), attemptId: input.attemptId?.toLowerCase() }
}

function check(error: { code: string } | null) {
  if (error) throw new AssistantLearningContextError('unavailable')
}

export async function hasOpenAssistantAssessment(db: Database, userId: string): Promise<boolean> {
  if (!isAssistantId(userId)) throw new AssistantLearningContextError('forbidden')
  // Os três relacionamentos existem a partir do progresso, inclusive o FK composto das rodadas.
  const result = await db.from('learning_step_progress')
    .select('step_id,rounds:learning_step_rounds!inner(round),enrollment:learning_enrollments!inner(user_id),step:learning_path_steps!inner(kind)')
    .eq('enrollment.user_id', userId).eq('step.kind', 'assessment').is('rounds.finished_at', null).limit(1)
    .overrideTypes<{ step_id: string }[], { merge: false }>()
  // Instalações anteriores ao módulo de Trilhas continuam com acesso ao chat padrão.
  if (result.error?.code === 'PGRST205' || result.error?.code === '42P01') return false
  check(result.error)
  return !!result.data?.length
}

async function loadAttempt(db: Database, userId: string, enrollmentId: string, step: Step, stepId: string, attemptId: string): Promise<Attempt> {
  if (step.kind !== 'practice' && step.kind !== 'assessment') throw new AssistantLearningContextError('attempt_unavailable')
  const link = await db.from('learning_step_attempts').select('version_id,round')
    .eq('enrollment_id', enrollmentId).eq('step_id', stepId).eq('attempt_id', attemptId).maybeSingle()
    .overrideTypes<{ version_id: string; round: number }, { merge: false }>()
  check(link.error)
  if (!link.data) throw new AssistantLearningContextError('attempt_unavailable')
  const { version_id: versionId, round } = link.data
  if (step.kind === 'assessment') {
    const closed = await db.from('learning_step_rounds').select('finished_at')
      .eq('enrollment_id', enrollmentId).eq('step_id', stepId).eq('round', round).maybeSingle()
      .overrideTypes<{ finished_at: string | null }, { merge: false }>()
    check(closed.error)
    if (!closed.data?.finished_at) throw new AssistantLearningContextError('attempt_unavailable')
  }

  const receipt = await db.from('quest_attempts').select('selected_option_id,is_correct')
    .eq('user_id', userId).eq('id', attemptId).eq('question_version_id', versionId).maybeSingle()
    .overrideTypes<{ selected_option_id: string; is_correct: boolean }, { merge: false }>()
  check(receipt.error)
  if (!receipt.data || receipt.data.is_correct) throw new AssistantLearningContextError('attempt_unavailable')
  const { selected_option_id: optionId, is_correct: isCorrect } = receipt.data
  const [feedback, question, option] = await Promise.all([
    db.rpc('quest_get_attempt_feedback', { p_attempt_id: attemptId }),
    db.from('quest_question_versions').select('statement').eq('id', versionId).maybeSingle()
      .overrideTypes<{ statement: string }, { merge: false }>(),
    db.from('quest_question_options').select('body').eq('id', optionId).eq('question_version_id', versionId).maybeSingle()
      .overrideTypes<{ body: string }, { merge: false }>(),
  ])
  if (feedback.error?.code === 'P0002') throw new AssistantLearningContextError('attempt_unavailable')
  for (const result of [feedback, question, option]) check(result.error)
  const correction = parseQuestionFeedback(feedback.data)
  const explanation = correction?.options.find((entry) => entry.optionId === optionId)?.explanation
  if (!correction || correction.attemptId !== attemptId || correction.versionId !== versionId ||
    correction.selectedOptionId !== optionId || correction.isCorrect !== isCorrect || !explanation || !question.data || !option.data) {
    throw new AssistantLearningContextError('attempt_unavailable')
  }
  return {
    isCorrect,
    question: question.data.statement.slice(0, 1_600),
    selectedOption: option.data.body.slice(0, 500),
    explanation: explanation.slice(0, 900),
  }
}

export async function loadAssistantLearningContext(db: Database, userId: string, input: unknown) {
  const { pathId, stepId, attemptId } = readIds(input)
  if (await hasOpenAssistantAssessment(db, userId)) throw new AssistantLearningContextError('assessment_open')
  const enrollment = await db.from('learning_enrollments').select('id').eq('user_id', userId).eq('path_id', pathId).maybeSingle()
    .overrideTypes<{ id: string }, { merge: false }>()
  check(enrollment.error)
  if (!enrollment.data) throw new AssistantLearningContextError('forbidden')
  const enrollmentId = enrollment.data.id
  const [path, step, progress] = await Promise.all([
    db.from('learning_paths').select('slug,title').eq('id', pathId).maybeSingle()
      .overrideTypes<{ slug: string; title: string }, { merge: false }>(),
    db.from('learning_path_steps').select('position,topic,title,kind,body').eq('id', stepId).eq('path_id', pathId).maybeSingle()
      .overrideTypes<Step, { merge: false }>(),
    db.from('learning_step_progress').select('completed_at,challenge_approved')
      .eq('enrollment_id', enrollmentId).eq('path_id', pathId).eq('step_id', stepId).maybeSingle()
      .overrideTypes<{ completed_at: string | null; challenge_approved: boolean | null }, { merge: false }>(),
  ])
  check(path.error)
  check(step.error)
  check(progress.error)
  if (!path.data || !step.data || !progress.data) throw new AssistantLearningContextError('forbidden')

  const [reading, topics, attempt] = await Promise.all([
    step.data.kind === 'assessment' ? null : db.from('learning_path_steps').select('body')
      .eq('path_id', pathId).eq('topic', step.data.topic).eq('kind', 'reading').lte('position', step.data.position)
      .order('position', { ascending: false }).limit(1).maybeSingle()
      .overrideTypes<{ body: string }, { merge: false }>(),
    db.from('learning_step_questions')
      .select('step_id,version:quest_question_versions!inner(competency:quest_competencies!inner(name)),step:learning_path_steps!inner(path_id,topic)')
      .eq('step.path_id', pathId).eq('step.topic', step.data.topic).order('position').limit(40)
      .overrideTypes<{ step_id: string; version: { competency: { name: string } } }[], { merge: false }>(),
    attemptId ? loadAttempt(db, userId, enrollmentId, step.data, stepId, attemptId) : null,
  ])
  check(reading?.error ?? null)
  check(topics.error)
  const recent = await db.from('quest_attempts').select('is_correct,link:learning_step_attempts!inner(enrollment_id,step_id)')
    .eq('user_id', userId).eq('link.enrollment_id', enrollmentId)
    .in('link.step_id', [...new Set([stepId, ...(topics.data ?? []).map((row) => row.step_id)])])
    .order('answered_at', { ascending: false }).limit(5).overrideTypes<{ is_correct: boolean }[], { merge: false }>()
  check(recent.error)

  const competencies = [...new Set((topics.data ?? []).map((row) => row.version.competency.name))].slice(0, 6)
  const stepCompleted = step.data.kind === 'challenge' ? progress.data.challenge_approved : progress.data.completed_at
  const label = { pathTitle: path.data.title.slice(0, 150), stepTitle: step.data.title.slice(0, 150), slug: path.data.slug, stepId }
  return {
    label,
    context: {
      path: label.pathTitle,
      step: label.stepTitle,
      kind: step.data.kind,
      competency: (competencies.join(', ') || step.data.topic.replace(/-/g, ' ')).slice(0, 240),
      reading: reading?.data?.body?.slice(0, 3_500) ?? null,
      activity: step.data.kind === 'challenge' ? step.data.body?.slice(0, 2_000) ?? null : null,
      progress: stepCompleted ? 'completed' as const : 'started' as const,
      recentAttempts: (recent.data ?? []).map((row) => ({ isCorrect: row.is_correct })),
      attempt,
    },
  }
}

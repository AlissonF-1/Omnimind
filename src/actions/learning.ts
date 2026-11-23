'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  isQuestionAnswerInput, isQuestionUuid, parseQuestionFeedback, questionErrorFromSqlState,
  type QuestionActionResult, type QuestionAnswerInput,
} from '@/lib/questions/contracts'
import { isLearningSlug, learningHref, learningPath, parseChallengeDelivery } from '@/lib/learning/progress'
import { createClient } from '@/utils/supabase/server'

export type LearningFormState = { error?: string }

const invalidInput = { error: 'Confira os dados e tente novamente.' }
const unavailable = 'Não foi possível salvar agora. Tente novamente.'

type LearningRpc = {
  learn_enroll: { p_path_id: string }
  learn_begin_step: { p_step_id: string }
  learn_confirm_reading: { p_step_id: string }
  learn_submit_challenge: { p_step_id: string; p_text: string | null; p_url: string | null }
  learn_restart_assessment: { p_step_id: string; p_round: number }
  learn_grade_challenge: { p_step_id: string; p_enrollment_id: string; p_checks: boolean[] }
}

function validRound(round: number) {
  return Number.isInteger(round) && round > 0 && round < 2147483647
}

async function callLearning<Name extends keyof LearningRpc>(name: Name, args: LearningRpc[Name]) {
  try {
    const db = await createClient()
    const { data: { user }, error: authError } = await db.auth.getUser()
    if (authError || !user) return 'Sua sessão expirou. Entre novamente para continuar.'
    const { error } = await db.rpc(name, args)
    if (!error) return null
    if (error.code === '42501') return 'Esta ação ainda não está disponível para sua conta ou etapa.'
    if (error.code === '23505') return 'Já existe um registro diferente para esta ação. Atualize a trilha.'
    if (error.code === '22023' || error.code === '23514') return invalidInput.error
    return unavailable
  } catch {
    return unavailable
  }
}

function finish(slug: string, stepId?: string, review = false): never {
  revalidatePath(learningPath)
  revalidatePath(learningHref(slug))
  redirect(learningHref(slug, stepId, review))
}

export async function enrollLearningAction(slug: string, pathId: string): Promise<LearningFormState> {
  if (!isLearningSlug(slug) || !isQuestionUuid(pathId)) return invalidInput
  const error = await callLearning('learn_enroll', { p_path_id: pathId })
  if (error) return { error }
  finish(slug)
}

export async function beginLearningStepAction(slug: string, stepId: string): Promise<LearningFormState> {
  if (!isLearningSlug(slug) || !isQuestionUuid(stepId)) return invalidInput
  const error = await callLearning('learn_begin_step', { p_step_id: stepId })
  if (error) return { error }
  finish(slug, stepId)
}

export async function confirmLearningReadingAction(slug: string, stepId: string): Promise<LearningFormState> {
  if (!isLearningSlug(slug) || !isQuestionUuid(stepId)) return invalidInput
  const error = await callLearning('learn_confirm_reading', { p_step_id: stepId })
  if (error) return { error }
  finish(slug, stepId)
}

export async function deliverLearningChallengeAction(slug: string, stepId: string, _state: LearningFormState, form: FormData): Promise<LearningFormState> {
  if (!isLearningSlug(slug) || !isQuestionUuid(stepId) || !(form instanceof FormData)) return invalidInput
  const delivery = parseChallengeDelivery(form.get('mode'), form.get('response'), form.get('repository'))
  if (!delivery) return { error: 'Informe a resposta em texto ou um endereço HTTPS válido de repositório.' }
  const error = await callLearning('learn_submit_challenge', { p_step_id: stepId, p_text: delivery.text, p_url: delivery.url })
  if (error) return { error }
  finish(slug, stepId)
}

export async function restartLearningAssessmentAction(slug: string, stepId: string, round: number): Promise<LearningFormState> {
  if (!isLearningSlug(slug) || !isQuestionUuid(stepId) || !validRound(round)) return invalidInput
  const error = await callLearning('learn_restart_assessment', { p_step_id: stepId, p_round: round })
  if (error) return { error }
  finish(slug, stepId)
}

export async function gradeLearningChallengeAction(slug: string, stepId: string, enrollmentId: string, criteria: number, _state: LearningFormState, form: FormData): Promise<LearningFormState> {
  if (!isLearningSlug(slug) || !isQuestionUuid(stepId) || !isQuestionUuid(enrollmentId) ||
      !Number.isInteger(criteria) || criteria < 1 || criteria > 8 || !(form instanceof FormData)) return invalidInput
  const checks = Array.from({ length: criteria }, (_, index) => form.get('criterion-' + index))
  if (checks.some((check) => check !== 'yes' && check !== 'no')) return invalidInput
  const error = await callLearning('learn_grade_challenge', {
    p_enrollment_id: enrollmentId, p_step_id: stepId, p_checks: checks.map((check) => check === 'yes'),
  })
  if (error) return { error }
  finish(slug, stepId, true)
}

export async function submitLearningAnswerAction(stepId: string, round: number, input: QuestionAnswerInput): Promise<QuestionActionResult> {
  if (!isQuestionUuid(stepId) || !validRound(round) || !isQuestionAnswerInput(input)) {
    return { ok: false, error: 'INVALID_INPUT' }
  }
  try {
    const db = await createClient()
    const { data: { user }, error: authError } = await db.auth.getUser()
    if (authError || !user) return { ok: false, error: 'UNAUTHENTICATED' }
    const { data, error } = await db.rpc('learn_answer_step', {
      p_step_id: stepId, p_round: round, p_version_id: input.versionId,
      p_option_id: input.optionId, p_request_id: input.requestId,
    })
    if (error) return { ok: false, error: error.code === '42501' ? 'REQUEST_CONFLICT' : questionErrorFromSqlState(error.code) }
    const feedback = parseQuestionFeedback(data)
    if (!feedback) return { ok: false, error: 'UNAVAILABLE' }
    return { ok: true, feedback }
  } catch {
    return { ok: false, error: 'UNAVAILABLE' }
  }
}

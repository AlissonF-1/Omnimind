'use server'

import {
  isQuestionAnswerInput,
  isQuestionUuid,
  parseQuestionFeedback,
  questionErrorFromSqlState,
  type QuestionActionResult,
  type QuestionAnswerInput,
} from '@/lib/questions/contracts'
import { createClient } from '@/utils/supabase/server'

type QuestionRpcArgs = {
  quest_submit_answer: { p_version_id: string; p_option_id: string; p_request_id: string }
  quest_get_attempt_feedback: { p_attempt_id: string }
}

async function callQuestionRpc<Name extends keyof QuestionRpcArgs>(
  name: Name,
  args: QuestionRpcArgs[Name],
): Promise<QuestionActionResult> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return { ok: false, error: 'UNAUTHENTICATED' }

    const { data, error } = await supabase.rpc(name, args)
    if (error) return { ok: false, error: questionErrorFromSqlState(error.code) }

    const feedback = parseQuestionFeedback(data)
    return feedback ? { ok: true, feedback } : { ok: false, error: 'UNAVAILABLE' }
  } catch {
    return { ok: false, error: 'UNAVAILABLE' }
  }
}

export async function submitQuestionAnswer(input: QuestionAnswerInput): Promise<QuestionActionResult> {
  if (!isQuestionAnswerInput(input)) return { ok: false, error: 'INVALID_INPUT' }

  return callQuestionRpc('quest_submit_answer', {
    p_version_id: input.versionId,
    p_option_id: input.optionId,
    p_request_id: input.requestId,
  })
}

export async function getQuestionAttemptFeedback(attemptId: string): Promise<QuestionActionResult> {
  if (!isQuestionUuid(attemptId)) return { ok: false, error: 'INVALID_INPUT' }

  return callQuestionRpc('quest_get_attempt_feedback', { p_attempt_id: attemptId })
}

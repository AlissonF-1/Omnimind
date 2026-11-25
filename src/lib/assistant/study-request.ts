import 'server-only'

import { createClient } from '@/utils/supabase/server'
import { assistantAccountMatches, assistantPrivateHeaders } from './contracts'
import { GenerationError } from './generation'
import { hasOpenAssistantAssessment } from './learning-context'
import { openAssessmentTutorMessage } from './learning-tutor'
import { isAssistantProvider } from './providers'

export class StudyRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

export function studyResponse(data: unknown, status = 200) {
  return Response.json(data, { status, headers: assistantPrivateHeaders })
}

export function studyError(error: unknown) {
  if (error instanceof StudyRequestError || error instanceof GenerationError) return studyResponse({ error: error.message }, error.status)
  return studyResponse({ error: 'Não foi possível verificar ou concluir a solicitação. Tente novamente.' }, 503)
}

async function readStudyBody(req: Request, limit: number): Promise<Record<string, unknown>> {
  if (!req.body) throw new StudyRequestError('Solicitação inválida.', 400)
  const reader = req.body.getReader()
  let size = 0
  const decode = new TextDecoder()
  let text = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.length
      if (size > limit) throw new StudyRequestError('A solicitação é muito extensa.', 413)
      text += decode.decode(value, { stream: true })
    }
    const value = JSON.parse(text + decode.decode())
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SyntaxError()
    return value
  } catch (error) {
    if (error instanceof SyntaxError) throw new StudyRequestError('Solicitação inválida.', 400)
    throw error
  } finally {
    void reader.cancel().catch(() => null)
    reader.releaseLock()
  }
}

export async function authorizeStudyRequest(req: Request) {
  const db = await createClient()
  const { data: { user }, error } = await db.auth.getUser()
  if (error || !user) throw new StudyRequestError('Entre novamente para continuar.', 401)
  const input = await readStudyBody(req, 60_000)
  if (!assistantAccountMatches(input.accountId, user.id)) throw new StudyRequestError('A sessão mudou. Atualize a página.', 409)
  return { db, input, userId: user.id }
}

export async function authorizeStudyGeneration(session: Awaited<ReturnType<typeof authorizeStudyRequest>>) {
  const { input, db, userId } = session
  if (!isAssistantProvider(input.provider) || input.consent !== input.provider) {
    throw new StudyRequestError('Autorize o envio ao provedor selecionado.', 400)
  }
  if (await hasOpenAssistantAssessment(db, userId)) throw new StudyRequestError(openAssessmentTutorMessage, 423)
  return { provider: input.provider, eco: input.eco === true }
}

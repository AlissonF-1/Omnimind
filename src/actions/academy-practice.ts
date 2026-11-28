'use server'

import { createClient } from '@/utils/supabase/server'
import { getPracticeFilters, practiceId, practiceSizes, practiceUuid, type PracticeResult } from '@/lib/academy/practice'

async function practiceAccount(account: string) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  return user && user.id === account ? db : null
}

export async function startPractice(account: string, filters: unknown, size: number, request: string, item?: string) {
  if (typeof request !== 'string' || !practiceUuid.test(request) || !practiceSizes.some((option) => option === size)
    || (item !== undefined && (typeof item !== 'string' || !practiceId.test(item)))) return { error:'Sessão inválida.' }
  const db = await practiceAccount(account)
  if (!db) return { error:'Sua sessão mudou. Entre na conta novamente.' }
  const { data,error } = await db.rpc('academy_practice_start',{p_request:request,p_size:size,p_filters:getPracticeFilters(filters),p_item:item ?? null})
  if (error || typeof data !== 'string') return { error:error?.code === 'P0002' ? 'Nenhuma atividade corresponde aos filtros.' : 'Não foi possível iniciar a prática.' }
  return { sessionId:data }
}

function validSlot(session: string, position: number, value: string) {
  return typeof session === 'string' && practiceUuid.test(session) && Number.isInteger(position) && position >= 1 && position <= 30
    && typeof value === 'string' && new TextEncoder().encode(value).length <= 12000
}

export async function submitPractice(account: string, session: string, position: number, request: string, answer: string) {
  if (!validSlot(session,position,answer) || typeof request !== 'string' || !practiceUuid.test(request)) return { error:'Envio inválido.' }
  const db = await practiceAccount(account)
  if (!db) return { error:'Sua sessão mudou. Entre na conta novamente.' }
  const { data,error } = await db.rpc('academy_practice_submit',{p_session:session,p_position:position,p_request:request,p_value:answer})
  if (error) return { error:error.code === '23505' ? 'Esta resposta já foi registrada. Recarregue a sessão para continuar.' : 'Não foi possível registrar a prática.' }
  return { result:data as PracticeResult }
}

export async function savePracticeCode(account: string, session: string, position: number, code: string) {
  if (!validSlot(session,position,code)) return { error:'Use um rascunho de até 12 KB.' }
  const db = await practiceAccount(account)
  if (!db) return { error:'Sua sessão mudou. Entre na conta novamente.' }
  const { error } = await db.rpc('academy_practice_save_code',{p_session:session,p_position:position,p_code:code})
  return error ? { error:'Não foi possível salvar o rascunho.' } : { saved:true as const }
}

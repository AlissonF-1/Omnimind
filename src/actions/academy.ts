'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { academyPath, academySlug, type AcademyLesson, type LessonRef } from '@/lib/academy/contracts'

function validReference(ref: LessonRef) {
  return ref && typeof ref.release === 'string' && academySlug.test(ref.release)
    && typeof ref.lesson === 'string' && academySlug.test(ref.lesson)
    && Number.isInteger(ref.version) && ref.version > 0 && ref.version <= 999999
}

type StudyAction = 'start' | 'answer' | 'review' | 'draft'
type StudyResult = { error: string } | { correct?: boolean; completed?: boolean; feedback?: string; saved?: boolean }
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i

export async function recordAcademyActivity(
  ref: LessonRef, action: StudyAction,
  data?: { exercise: string; answer: string; requestId: string } | { exercise: string; code: string; account: string } | string,
): Promise<StudyResult> {
  if (!validReference(ref) || !['start', 'answer', 'review', 'draft'].includes(action)) return { error: 'Atividade inválida.' }
  const answer = action === 'answer' || action === 'review'
  const payload = data && typeof data === 'object' ? data : undefined
  const exercise = payload?.exercise
  const reply = payload && 'answer' in payload ? payload : undefined
  const draft = typeof data === 'string' ? data : payload && 'code' in payload ? payload.code : undefined
  const withinLimit = (value: unknown) => typeof value === 'string' && new TextEncoder().encode(value).length <= 12000
  if ((answer || payload) && (typeof exercise !== 'string' || !academySlug.test(exercise))) return { error: 'Atividade inválida.' }
  if (answer && (!reply || typeof reply.requestId !== 'string' || !uuid.test(reply.requestId)
    || !withinLimit(reply.answer))) return { error: 'Envie uma resposta válida.' }
  if (action === 'draft' && !withinLimit(draft)) {
    return { error: 'O rascunho precisa ter até 12 KB.' }
  }
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return { error: 'Entre na sua conta para salvar a atividade.' }
  if (action === 'draft' && payload && (!('account' in payload) || payload.account !== user.id)) {
    return { error: 'A sessão mudou. Reabra o laboratório.' }
  }
  const args = {
    p_id: ref.release, p_version: ref.version, p_lesson: ref.lesson, p_action: action,
    p_exercise: exercise ?? null,
    p_value: answer ? reply?.answer : action === 'draft' ? draft : null,
    p_request: answer ? reply?.requestId : null,
  }
  const { data: result, error } = await db.rpc('academy_study', args)
  if (error) {
    return { error: error.code === '42501' ? 'Conclua o pré-requisito desta aula.' : 'Não foi possível registrar a atividade.' }
  }
  if (answer) {
    revalidatePath(academyPath + '/' + ref.release + '/' + ref.lesson)
    revalidatePath(academyPath)
  }
  return result as StudyResult
}

export async function getAcademyPythonChallenge(ref: LessonRef, exerciseId: string, account: string) {
  if (!validReference(ref) || typeof exerciseId !== 'string' || !academySlug.test(exerciseId)) return { error: 'Desafio inválido.' }
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user || user.id !== account) return { error: 'Entre na sua conta para abrir o laboratório.' }
  const [content, draft] = await Promise.all([
    db.from('academy_lessons').select('lesson').eq('release_id', ref.release).eq('version', ref.version).eq('id', ref.lesson)
      .maybeSingle().overrideTypes<{ lesson: AcademyLesson } | null, { merge: false }>(),
    db.from('academy_python_drafts').select('code').eq('user_id', user.id).eq('release_id', ref.release)
      .eq('version', ref.version).eq('lesson_id', ref.lesson).eq('exercise_id', exerciseId).maybeSingle(),
  ])
  const exercise = content.data?.lesson.exercises.find((item) => item.id === exerciseId)
  if (content.error || draft.error || exercise?.kind !== 'python') return { error: 'Não foi possível carregar o desafio.' }
  return { exercise, draft: (draft.data?.code as string | undefined) ?? null }
}

export async function updateAcademyProfile(minutes: number) {
  if (!Number.isInteger(minutes) || minutes < 10 || minutes > 120) return { error: 'Escolha entre 10 e 120 minutos.' }
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return { error: 'Entre na sua conta para salvar a meta.' }
  const { error } = await db.from('academy_profiles').upsert({ user_id: user.id, minutes_per_day: minutes })
  if (error) return { error: 'Não foi possível salvar a meta.' }
  revalidatePath(academyPath)
  return { saved: true as const }
}

export async function academyVocabularyNotes() {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return { error: 'Entre na sua conta para escolher uma nota.' }
  const { data, error } = await db.from('notes').select('id,title').eq('user_id', user.id)
    .order('updated_at', { ascending: false }).limit(50).overrideTypes<{ id: string; title: string }[], { merge: false }>()
  return error ? { error: 'Não foi possível carregar suas notas.' } : { notes: data ?? [] }
}

export async function exportAcademyVocabulary(ref: LessonRef, note: string) {
  if (!validReference(ref) || typeof note !== 'string' || !uuid.test(note)) return { error: 'Escolha uma nota válida.' }
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return { error: 'Entre na sua conta para salvar os flashcards.' }
  const { data, error } = await db.rpc('academy_export_vocabulary',
    { p_id: ref.release, p_version: ref.version, p_lesson: ref.lesson, p_note: note })
  if (error) return { error: 'Não foi possível salvar o vocabulário nesta nota.' }
  revalidatePath('/dashboard/revisoes')
  return { count: data as number }
}

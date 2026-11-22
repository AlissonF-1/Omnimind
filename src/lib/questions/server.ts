import 'server-only'

import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { lastStudyDays, summarizeRecentAttempts, type RecentAttempt } from './performance'

export type Competency = { id: string; slug: string; name: string }
export type QuestionVersion = { id: string; question_id: string; competency_id: string; version: number }
export type PracticeQuestion = QuestionVersion & { statement: string }
export type PracticeOption = { id: string; position: number; body: string }
export type QuestionStats = { correct: number; incorrect: number }
export type HistoryAttempt = {
  id: string
  question_version_id: string
  is_correct: boolean
  answered_at: string
  question: { statement: string; competency_id: string } | null
}

type QuestionSession = Awaited<ReturnType<typeof getQuestionSession>>

const sqlTopics = ['select-where', 'and-or', 'join', 'group-by', 'having', 'count-null']

export class QuestionSchemaUnavailableError extends Error {}

function reportCatalogError(table: string, code: string, message: string): never {
  const safeCode = /^(?:PGRST[0-9A-Z]{3}|[0-9A-Z]{5})$/.test(code) ? code : 'INDEFINIDO'
  console.warn(`[questoes] ${table}: ${safeCode}`)
  if (safeCode === 'PGRST205' || safeCode === '42P01') {
    throw new QuestionSchemaUnavailableError(message)
  }
  throw new Error(message)
}

export async function getQuestionSession() {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) redirect('/login')
  return { db, userId: user.id }
}

export async function getQuestionCompetencies({ db }: QuestionSession) {
  const { data, error } = await db.from('quest_competencies').select('id,slug,name')
    .order('name').overrideTypes<Competency[], { merge: false }>()
  if (error) reportCatalogError('quest_competencies', error.code, 'Não foi possível carregar as competências.')

  const topicOrder = (slug: string) => {
    const index = sqlTopics.indexOf(slug)
    return index === -1 ? sqlTopics.length : index
  }
  return (data ?? []).sort((a, b) => topicOrder(a.slug) - topicOrder(b.slug))
}

export async function getLatestQuestionVersions({ db }: QuestionSession) {
  const latest = new Map<string, QuestionVersion>()
  const batchSize = 200
  for (let offset = 0; ; offset += batchSize) {
    const { data, error } = await db.from('quest_question_versions')
      .select('id,question_id,competency_id,version')
      .order('question_id').order('version', { ascending: false })
      .range(offset, offset + batchSize - 1).overrideTypes<QuestionVersion[], { merge: false }>()
    if (error) reportCatalogError('quest_question_versions', error.code, 'Não foi possível carregar o catálogo de questões.')

    for (const row of data ?? []) {
      if (!latest.has(row.question_id)) latest.set(row.question_id, row)
    }
    if (!data || data.length < batchSize) return [...latest.values()]
  }
}

export async function getQuestionStats({ db, userId }: QuestionSession): Promise<QuestionStats | null> {
  const count = (correct: boolean) => db.from('quest_attempts').select('id', { head: true, count: 'exact' })
    .eq('user_id', userId).eq('is_correct', correct)
  const [correct, incorrect] = await Promise.all([count(true), count(false)])
  if (correct.error || incorrect.error || correct.count === null || incorrect.count === null) return null
  return { correct: correct.count, incorrect: incorrect.count }
}

export async function getPracticeQuestion({ db }: QuestionSession, versionId: string) {
  const [version, options] = await Promise.all([
    db.from('quest_question_versions').select('id,question_id,competency_id,version,statement')
      .eq('id', versionId).maybeSingle().overrideTypes<PracticeQuestion, { merge: false }>(),
    db.from('quest_question_options').select('id,position,body')
      .eq('question_version_id', versionId).order('position').overrideTypes<PracticeOption[], { merge: false }>(),
  ])
  if (version.error || options.error) throw new Error('Não foi possível carregar a questão.')
  if (!version.data) return null
  if (options.data?.length !== 5) throw new Error('A questão publicada está incompleta.')
  return { version: version.data, options: options.data }
}

export const questionHistoryPageSize = 12

export async function getPracticedVersions({ db, userId }: QuestionSession, versions: QuestionVersion[]) {
  const practiced = new Set<string>()
  const versionIds = versions.map(({ id }) => id)
  const pageSize = 250

  for (let start = 0; start < versionIds.length; start += 75) {
    const group = versionIds.slice(start, start + 75)
    let practicedInGroup = 0
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await db.from('quest_attempts').select('question_version_id')
        .eq('user_id', userId).in('question_version_id', group).order('id')
        .range(offset, offset + pageSize - 1)
        .overrideTypes<{ question_version_id: string }[], { merge: false }>()
      if (error) return null

      for (const row of data ?? []) {
        if (practiced.has(row.question_version_id)) continue
        practiced.add(row.question_version_id)
        practicedInGroup += 1
      }
      if (!data || data.length < pageSize || practicedInGroup === group.length) break
    }
  }
  return practiced
}

export async function getRecentQuestionPerformance({ db, userId }: QuestionSession) {
  const days = lastStudyDays()
  const attempts: RecentAttempt[] = []
  const pageSize = 250
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await db.from('quest_attempts')
      .select('is_correct,answered_at,question:quest_question_versions!quest_attempts_question_version_id_fkey(competency_id)')
      .eq('user_id', userId).gte('answered_at', `${days[0]}T00:00:00Z`).order('answered_at').order('id')
      .range(offset, offset + pageSize - 1).overrideTypes<RecentAttempt[], { merge: false }>()
    if (error) return null
    attempts.push(...(data ?? []))
    if (!data || data.length < pageSize) return summarizeRecentAttempts(attempts, days)
  }
}

export async function getQuestionHistory({ db, userId }: QuestionSession, errorsOnly: boolean, page: number, competencyId?: string) {
  const offset = (page - 1) * questionHistoryPageSize
  const relation = competencyId ? 'quest_attempts_question_version_id_fkey!inner' : 'quest_attempts_question_version_id_fkey'
  const query = db.from('quest_attempts')
    .select(`id,question_version_id,is_correct,answered_at,question:quest_question_versions!${relation}(statement,competency_id)`, { count: 'exact' })
    .eq('user_id', userId)
  if (errorsOnly) query.eq('is_correct', false)
  if (competencyId) query.eq('question.competency_id', competencyId)

  const { data, error, count } = await query.order('answered_at', { ascending: false }).order('id')
    .range(offset, offset + questionHistoryPageSize - 1).overrideTypes<HistoryAttempt[], { merge: false }>()
  if (page > 1 && error?.code === 'PGRST103') return { attempts: [], count: count ?? 0 }
  if (error || count === null) throw new Error('Não foi possível carregar o histórico de questões.')
  return { attempts: data ?? [], count }
}

import 'server-only'

import type { createClient } from '@/utils/supabase/server'

type Database = Awaited<ReturnType<typeof createClient>>
export type SqlLabAttempt = { id: string; submission: string; submitted_at: string; formative_feedback: string | null }
const columns = 'id,submission,submitted_at,formative_feedback'

export class SqlLabDataError extends Error {
  constructor(readonly reason: 'schema' | 'storage' | 'conflict') { super(reason) }
}

function check(error: { code: string } | null) {
  if (!error) return
  throw new SqlLabDataError(error.code === 'PGRST205' || error.code === '42P01' ? 'schema' : 'storage')
}

export async function listSqlLabAttempts(db: Database, userId: string, slug: string) {
  const result = await db.from('sql_lab_attempts').select(columns).eq('user_id', userId).eq('challenge_slug', slug)
    .order('submitted_at', { ascending: false }).order('id', { ascending: false }).limit(25)
    .overrideTypes<SqlLabAttempt[], { merge: false }>()
  check(result.error)
  return result.data ?? []
}

export async function getSqlLabAttempt(db: Database, userId: string, slug: string, id: string) {
  const result = await db.from('sql_lab_attempts').select(columns)
    .eq('user_id', userId).eq('challenge_slug', slug).eq('id', id).maybeSingle().overrideTypes<SqlLabAttempt, { merge: false }>()
  check(result.error)
  return result.data
}

export async function saveSqlLabAttempt(db: Database, userId: string, slug: string, id: string, submission: string) {
  const result = await db.from('sql_lab_attempts').upsert({ id, challenge_slug: slug, submission }, {
    onConflict: 'user_id,id', ignoreDuplicates: true,
  })
  check(result.error)
  const attempt = await getSqlLabAttempt(db, userId, slug, id)
  if (!attempt || attempt.submission !== submission) throw new SqlLabDataError('conflict')
  return attempt
}

export async function saveSqlLabFeedback(db: Database, userId: string, slug: string, id: string, feedback: string) {
  const result = await db.from('sql_lab_attempts').update({ formative_feedback: feedback })
    .eq('user_id', userId).eq('challenge_slug', slug).eq('id', id).is('formative_feedback', null)
  check(result.error)
  const attempt = await getSqlLabAttempt(db, userId, slug, id)
  if (!attempt) throw new SqlLabDataError('storage')
  return attempt
}

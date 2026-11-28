import 'server-only'

import { getAcademySession } from './server'
import { practicePosition, type PracticeActivity, type PracticeCatalog, type PracticeFilters, type PracticeOverview, type PracticeSession, type PracticeSlot } from './practice'

export class PracticeSchemaMissing extends Error {}
function ensurePractice(error: { code: string } | null) {
  if (!error) return
  if (['PGRST202','PGRST205','42P01','42883'].includes(error.code)) throw new PracticeSchemaMissing()
  throw new Error('Não foi possível carregar as práticas.')
}

export async function getPracticeHome(filters: PracticeFilters, after: string | null, historyPage: number) {
  const { db, userId } = await getAcademySession()
  const offset = historyPage * 12
  const [overview, catalog, history, unfinished] = await Promise.all([
    db.rpc('academy_practice_overview',{ p_filters:filters }),
    db.rpc('academy_practice_catalog',{ p_filters:filters,p_after:after }),
    db.from('academy_practice_sessions').select('id,created_at,finished_at,filters').eq('user_id',userId)
      .order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+12)
      .overrideTypes<PracticeSession[],{ merge:false }>(),
    db.from('academy_practice_sessions').select('id').eq('user_id',userId).is('finished_at',null)
      .order('created_at',{ascending:false}).order('id',{ascending:false}).limit(1).maybeSingle(),
  ])
  ensurePractice(overview.error ?? catalog.error ?? history.error ?? unfinished.error)
  if (!overview.data || !catalog.data) throw new Error('Catálogo indisponível.')
  return { overview:overview.data as unknown as PracticeOverview,catalog:catalog.data as unknown as PracticeCatalog,
    history:(history.data ?? []).slice(0,12), hasHistoryNext:(history.data?.length ?? 0)>12,
    resume:unfinished.data?.id as string | undefined,account:userId }
}

type ItemDetail = {
  title: string; topic: string; activity: PracticeActivity; prerequisites: string[];
  skills: string[]; lessons: string[]; difficulty: keyof typeof import('./practice').practiceDifficulties
}

export async function getPracticeSession(id: string, position: unknown) {
  const { db, userId } = await getAcademySession()
  const [session, items] = await Promise.all([
    db.from('academy_practice_sessions').select('id,created_at,finished_at,filters').eq('id',id).eq('user_id',userId)
      .maybeSingle().overrideTypes<PracticeSession | null,{ merge:false }>(),
    db.from('academy_practice_slots').select('position,item_id,version,reason,answered_at,outcome,credit').eq('session_id',id)
      .order('position').limit(30).overrideTypes<PracticeSlot[],{ merge:false }>(),
  ])
  ensurePractice(session.error ?? items.error)
  if (!session.data || !items.data?.length) return null
  const { selected, next } = practicePosition(items.data,position)
  const result = { session:session.data, slots:items.data, selected, next, account:userId }
  if (!selected) return { ...result, item:null, draft:null, feedback:null }
  const { data:item,error } = await db.from('academy_practice_items').select('title,topic,activity,prerequisites,skills,lessons,difficulty')
    .eq('id',selected.item_id).eq('version',selected.version).maybeSingle().overrideTypes<ItemDetail | null,{ merge:false }>()
  ensurePractice(error)
  if (!item) return null
  const [slot, state] = await Promise.all([
    selected.answered_at ? db.from('academy_practice_slots').select('feedback').eq('session_id',id).eq('position',selected.position).single() : null,
    item.activity.kind === 'python' && !selected.answered_at ? db.from('academy_practice_state').select('draft').eq('user_id',userId)
      .eq('item_id',selected.item_id).eq('version',selected.version).maybeSingle() : null,
  ])
  ensurePractice(slot?.error ?? state?.error ?? null)
  return { ...result, item, draft:(state?.data?.draft as string | undefined) ?? null, feedback:(slot?.data?.feedback as string | undefined) ?? null }
}

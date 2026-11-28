import 'server-only'

import { cache } from 'react'
import { getQuestionSession } from '@/lib/questions/server'
import { academyLessonHref, academySlug, type AcademyCatalog, type AcademyLesson, type AcademyMentor, type AcademyProgress, type AcademySummaryRelease } from './contracts'
import { academyLessonMediaIds, fetchAcademyProgress } from './catalog-queries'

export const getAcademySession = cache(getQuestionSession)
export class AcademySchemaMissing extends Error {}

function ensureReadable(error: { code: string } | null) {
  if (!error) return
  if (error.code === 'PGRST205' || error.code === '42P01') throw new AcademySchemaMissing()
  throw new Error('Não foi possível carregar a Academy.')
}

const progressColumns = 'release_id, version, lesson_id, completed_at, last_activity, review_due_at, review_count'
const summaryColumns = 'id,version,description:catalog->>description,pilot:catalog->pilot,formations:catalog->formations,competencies:catalog->competencies,market:catalog->market'
type ReleaseSummaryRow = Pick<AcademySummaryRelease, 'id' | 'version'> & AcademySummaryRelease['catalog']
type LessonCatalogRow = Pick<AcademySummaryRelease, 'id' | 'version'> & Pick<AcademyCatalog, 'formations' | 'competencies'>

export async function getAcademyMentor(
  db: Awaited<ReturnType<typeof getQuestionSession>>['db'], releaseId: unknown, lessonId: unknown,
): Promise<AcademyMentor | undefined> {
  if (typeof releaseId !== 'string' || typeof lessonId !== 'string' || !academySlug.test(releaseId) || !academySlug.test(lessonId)) return
  const { data } = await db.from('academy_current_releases').select('version,formations:catalog->formations').eq('id', releaseId)
    .maybeSingle().overrideTypes<Pick<LessonCatalogRow, 'version' | 'formations'> | null, { merge: false }>()
  if (!data) return
  const lesson = data.formations.flatMap(({ chapters }) => chapters.flatMap(({ lessons }) => lessons))
    .find(({ id }) => id === lessonId)
  if (!lesson) return
  return { key: `${releaseId}:${data.version}:${lessonId}`, href: academyLessonHref(releaseId, lessonId), title: lesson.title,
    question: `Estou estudando «${lesson.title}». Objetivo: ${lesson.summary} Explique com um exemplo diferente e faça uma pergunta para eu tentar responder.` }
}

export async function getAcademyHome() {
  const { db, userId } = await getAcademySession()
  const [catalog, profile] = await Promise.all([
    db.from('academy_current_releases').select(summaryColumns).order('id').overrideTypes<ReleaseSummaryRow[], { merge: false }>(),
    db.from('academy_profiles').select('minutes_per_day').eq('user_id', userId).maybeSingle(),
  ])
  ensureReadable(catalog.error ?? profile.error)
  const releases = (catalog.data ?? []).map(({ id, version, ...catalog }) => ({ id, version, catalog }))
  const progress = await Promise.all(releases.map(({ id, version }) => fetchAcademyProgress(async (after, limit) => {
    const query = db.from('academy_progress').select(progressColumns).eq('user_id', userId).eq('release_id', id)
      .eq('version', version).order('lesson_id').limit(limit)
    if (after !== undefined) query.gt('lesson_id', after)
    const { data, error } = await query.overrideTypes<AcademyProgress[], { merge: false }>()
    ensureReadable(error)
    return data ?? []
  })))
  return { releases, rows: progress.flat(), minutes: profile.data?.minutes_per_day as number | undefined, now: Date.now() }
}

export async function getAcademyLessonObjectives(releaseId: string, version: number, lessonId: string) {
  const { db } = await getAcademySession()
  const { data, error } = await db.from('academy_lessons').select('objectives:lesson->objectives')
    .eq('release_id', releaseId).eq('version', version).eq('id', lessonId)
    .maybeSingle().overrideTypes<{ objectives: string[] } | null, { merge: false }>()
  ensureReadable(error)
  return data?.objectives ?? []
}

export async function getAcademyLesson(releaseId: string, lessonId: string) {
  const { db, userId } = await getAcademySession()
  const release = await db.from('academy_current_releases').select('id,version,formations:catalog->formations,competencies:catalog->competencies').eq('id', releaseId)
    .maybeSingle().overrideTypes<LessonCatalogRow | null, { merge: false }>()
  ensureReadable(release.error)
  if (!release.data) return null
  const current = release.data
  const formation = current.formations.find((item) => item.chapters.some((chapter) => chapter.lessons.some((lesson) => lesson.id === lessonId)))
  const summary = formation?.chapters.flatMap((chapter) => chapter.lessons).find((lesson) => lesson.id === lessonId)
  if (!summary || !formation) return null
  const progressIds = [lessonId, ...summary.prerequisites]
  const [content, progress, attempts] = await Promise.all([
    db.from('academy_lessons').select('lesson').eq('release_id', releaseId).eq('version', current.version).eq('id', lessonId)
      .maybeSingle().overrideTypes<{ lesson: AcademyLesson } | null, { merge: false }>(),
    db.from('academy_progress').select(progressColumns).eq('user_id', userId).eq('release_id', releaseId)
      .eq('version', current.version).in('lesson_id', progressIds)
      .overrideTypes<AcademyProgress[], { merge: false }>(),
    db.from('academy_verified_exercises').select('exercise_id').eq('user_id', userId).eq('release_id', releaseId)
      .eq('version', current.version).eq('lesson_id', lessonId)
      .overrideTypes<{ exercise_id: string }[], { merge: false }>(),
  ])
  ensureReadable(content.error ?? progress.error ?? attempts.error)
  if (!content.data) return null
  const lesson = content.data.lesson
  const mediaIds = academyLessonMediaIds(lesson)
  let resources: AcademyCatalog['resources'] = []
  if (mediaIds.size > 0) {
    const media = await db.from('academy_releases').select('resources:catalog->resources').eq('id', releaseId).eq('version', current.version)
      .maybeSingle().overrideTypes<Pick<AcademyCatalog, 'resources'> | null, { merge: false }>()
    ensureReadable(media.error)
    resources = (media.data?.resources ?? []).filter(({ id }) => mediaIds.has(id))
  }
  const { id, version, formations, competencies } = current
  return { release: { id, version, catalog: { formations, competencies, resources } }, formation, lesson, now: Date.now(), userId,
    progress: progress.data ?? [], passed: [...new Set((attempts.data ?? []).map(({ exercise_id }) => exercise_id))] }
}

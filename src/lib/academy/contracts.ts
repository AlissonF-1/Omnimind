export const academyPath = '/dashboard/academy'
export const academySlug = /^[a-z0-9][a-z0-9-]{0,63}$/

export type LessonRef = { release: string; version: number; lesson: string }
export type LessonSummary = {
  id: string
  title: string
  summary: string
  minutes: number
  prerequisites: string[]
  competencies: string[]
}
type ExerciseBase = { id: string; prompt: string; hints: string[]; resource?: string }
export type ExercisePhase = 'practice' | 'challenge' | 'review'
export type ActivityItem = { id: string; label: string }
type GradedBase = ExerciseBase & { phase: ExercisePhase }
export type TextExercise = GradedBase & { kind: 'text' }
export type GradedExercise = TextExercise | (GradedBase & (
  | { kind: 'multiple-choice'; options: ActivityItem[] }
  | { kind: 'ordering'; items: ActivityItem[] }
  | { kind: 'parsons'; lines: ActivityItem[]; maxIndent: number }
  | { kind: 'matching'; left: ActivityItem[]; right: ActivityItem[] }
  | { kind: 'output' }
  | { kind: 'trace' | 'fill-in'; fields: ActivityItem[] }
))
export type PythonCase = { id: string; input: string; expected: string }
export type PythonExercise = ExerciseBase & { kind: 'python'; starter: string; publicCases: PythonCase[] }
export type QuestionLinks = ExerciseBase & { kind: 'question-set'; versionIds: string[] }
export type AcademyExercise = GradedExercise | PythonExercise | QuestionLinks
export const isGradedExercise = (item: AcademyExercise): item is GradedExercise => 'phase' in item
export type AcademyResource = {
  id: string; type: 'image' | 'audio'; path: string; alt: string; caption?: string
  author: string; license: string; language: string; version: number; width?: number; height?: number
}
export type AcademyLesson = LessonSummary & {
  objectives: string[]
  lessonMarkdown: string
  application: string
  resources: string[]
  exercises: AcademyExercise[]
  progressFromVersion?: number
  visual?: { kind: 'variables' | 'counter'; name: string; start: number; end: number }
  dialogue?: { speaker: string; text: string; translation: string; audio?: string }[]
  vocabulary?: { term: string; translation: string; example: string; audio?: string }[]
}
export type AcademyFormation = {
  id: string; kind: 'tech' | 'english'; title: string; description: string; art: string
  chapters: { id: string; title: string; lessons: LessonSummary[] }[]
}
export type AcademyCatalog = {
  description: string
  pilot: boolean
  formations: AcademyFormation[]
  resources: AcademyResource[]
  competencies: { id: string; title: string; description: string; prerequisites: string[]; mastery: { version: number; criterion: string; description: string } }[]
  market: { description: string; sources: { title: string; date: string; caveat: string }[];
    vacancies: { id: string; title: string; region: string; seniority: string; collectedOn: string; sourceUrl: string; requirements: string[] }[] }
}
export type AcademyRelease = { id: string; version: number; catalog: AcademyCatalog }
export type AcademySummaryRelease = Omit<AcademyRelease, 'catalog'> & { catalog: Omit<AcademyCatalog, 'resources'> }
export type AcademyProgress = {
  release_id: string; version: number; lesson_id: string; completed_at: string | null
  last_activity: string; review_due_at: string | null; review_count: number
}
export type AcademyMentor = { key: string; href: string; title: string; question: string }

export function academyLessonHref(release: string, lesson: string, review = false) {
  return `${academyPath}/${release}/${lesson}${review ? '?revisao=1#pratica' : ''}`
}

export function availableLesson(lesson: LessonSummary, completed: Set<string>) {
  return lesson.prerequisites.every((id) => completed.has(id))
}

export function progressByLesson(release: Pick<AcademyRelease, 'id' | 'version'>, progress: AcademyProgress[]) {
  return new Map(progress.filter((row) => row.release_id === release.id && row.version === release.version)
    .map((row) => [row.lesson_id, row]))
}

export function nextAcademyLesson(lessons: LessonSummary[], progress: Map<string, AcademyProgress>) {
  const completed = new Set([...progress.values()].filter((row) => row.completed_at).map((row) => row.lesson_id))
  const available = lessons.filter((lesson) => !completed.has(lesson.id) && availableLesson(lesson, completed))
  return available.filter((lesson) => progress.has(lesson.id)).sort((a, b) =>
    (progress.get(b.id)?.last_activity ?? '').localeCompare(progress.get(a.id)?.last_activity ?? ''))[0] ?? available[0]
}

export type AcademyFormationProgress = {
  release: AcademySummaryRelease
  formation: AcademyFormation
  progress: Map<string, AcademyProgress>
  completed: Set<string>
  lessons: LessonSummary[]
  next: LessonSummary | undefined
  count: number
}

export type ArchivedAcademyRelease = {
  release: AcademySummaryRelease
  completedCount: number
  totalCount: number
  lessons: { id: string; title: string; completed: boolean }[]
}

const primaryReleaseOrder = ['omni-content-001']

function sortReleases(releases: AcademySummaryRelease[]) {
  return [...releases].sort((a, b) => {
    const rankA = primaryReleaseOrder.indexOf(a.id)
    const rankB = primaryReleaseOrder.indexOf(b.id)
    if (rankA !== rankB) {
      if (rankA === -1) return 1
      if (rankB === -1) return -1
      return rankA - rankB
    }
    return a.id.localeCompare(b.id)
  })
}

export function partitionAcademyReleases(releases: AcademySummaryRelease[]) {
  const regular = releases.filter((release) => !release.catalog.pilot)
  const pilot = releases.filter((release) => release.catalog.pilot)
  return {
    active: sortReleases(regular.length > 0 ? regular : pilot),
    archived: regular.length > 0 ? sortReleases(pilot) : [],
  }
}

function compareActivityDesc(a: string, b: string) {
  if (a === b) return 0
  return b > a ? 1 : -1
}

export function buildAcademyDashboardState(releases: AcademySummaryRelease[], rows: AcademyProgress[], now: number) {
  const { active, archived } = partitionAcademyReleases(releases)
  const items: AcademyFormationProgress[] = active.flatMap((release) => {
    const progress = progressByLesson(release, rows)
    const completed = new Set([...progress.values()].filter((row) => row.completed_at).map((row) => row.lesson_id))
    return release.catalog.formations.map((formation) => {
      const lessons = formation.chapters.flatMap((chapter) => chapter.lessons)
      return {
        release,
        formation,
        progress,
        completed,
        lessons,
        next: nextAcademyLesson(lessons, progress),
        count: lessons.filter(({ id }) => completed.has(id)).length,
      }
    })
  })
  const next = items
    .filter((item) => item.next)
    .sort((a, b) => compareActivityDesc(
      a.progress.get(a.next!.id)?.last_activity ?? '',
      b.progress.get(b.next!.id)?.last_activity ?? '',
    ))[0]
  const count = items.reduce((sum, item) => sum + item.count, 0)
  const total = items.reduce((sum, item) => sum + item.lessons.length, 0)
  const due = items.flatMap((item) => item.lessons.filter(({ id }) => {
    const date = item.progress.get(id)?.review_due_at
    return Boolean(date && Date.parse(date) <= now)
  }).map((lesson) => ({ lesson, releaseId: item.release.id })))
  const archivedHistory: ArchivedAcademyRelease[] = archived.flatMap((release) => {
    const progress = progressByLesson(release, rows)
    if (progress.size === 0) return []
    const lessons = release.catalog.formations.flatMap((formation) =>
      formation.chapters.flatMap((chapter) => chapter.lessons))
    const completedCount = lessons.filter(({ id }) => Boolean(progress.get(id)?.completed_at)).length
    return [{
      release,
      completedCount,
      totalCount: lessons.length,
      lessons: lessons
        .filter(({ id }) => progress.has(id))
        .map(({ id, title }) => ({ id, title, completed: Boolean(progress.get(id)?.completed_at) })),
    }]
  })

  return {
    activeReleases: active,
    archivedReleases: archived,
    items,
    next,
    count,
    total,
    due,
    market: active[0]?.catalog.market,
    archivedHistory,
  }
}

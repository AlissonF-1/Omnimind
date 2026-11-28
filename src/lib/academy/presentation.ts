import { academyPath, availableLesson, type AcademyFormationProgress, type AcademyProgress, type LessonSummary } from './contracts'

export const journeyPath = academyPath + '/jornada'
export const skillsPath = academyPath + '/competencias'
export type FormationSelection = { release: string; form: string; track: 'tech' | 'english' }
export const formationLabels = { tech: 'OmniMind Tech', english: 'OmniMind English' }

export function formationSelection(item: AcademyFormationProgress): FormationSelection {
  return { release: item.release.id, form: item.formation.id, track: item.formation.kind }
}

export function academyExploreHref(path: string, selection: FormationSelection, extra: Record<string, string> = {}) {
  return path + '?' + new URLSearchParams({ ...selection, ...extra })
}

export function selectAcademyFormation(items: AcademyFormationProgress[], release: unknown, form: unknown, track?: unknown) {
  return items.find((item) => item.release.id === release && item.formation.id === form)
    ?? items.find((item) => item.formation.kind === track) ?? items[0]
}

export function academyLessonStatus(lesson: LessonSummary, row: AcademyProgress | undefined, completed: Set<string>, now: number) {
  if (!availableLesson(lesson, completed)) return { label: 'Bloqueada', key: 'locked' }
  if (row?.review_due_at && Date.parse(row.review_due_at) <= now) return { label: 'Revisão pendente', key: 'review' }
  if (completed.has(lesson.id)) return { label: 'Concluída', key: 'complete' }
  if (row) return { label: 'Em andamento', key: 'current' }
  return { label: 'Disponível', key: 'available' }
}

type Chapter = AcademyFormationProgress['formation']['chapters'][number]

export function chapterWindow(chapters: Chapter[], index: number, size = 6) {
  const start = Math.floor(index / size) * size
  return { start, list: chapters.slice(start, start + size) }
}

export function journeyPoints(count: number) {
  const positions = [100, 300, 500]
  return Array.from({ length: count }, (_, index) =>
    index < 3 ? { x: positions[index], y: 92 } : { x: positions[5 - index], y: 260 })
}

export function journeyConnection(from: { x: number; y: number }, to: { x: number; y: number }) {
  if (from.y === to.y) {
    return 'M ' + from.x + ' ' + from.y + ' H ' + to.x
  }
  const edge = Math.abs(from.x - to.x) < 100 ? (from.x >= 300 ? 570 : 30) : (from.x + to.x) / 2
  return 'M ' + from.x + ' ' + from.y + ' Q ' + edge + ' ' + ((from.y + to.y) / 2) + ' ' + to.x + ' ' + to.y
}

const techArts = ['islands/coding', 'islands/processor', 'islands/ai-chip', 'activities/new-skill', 'activities/lab',
  'achievements/logic', 'activities/quick-challenge', 'islands/security', 'achievements/loops', 'activities/boss-battle']
const englishArts = ['achievements/first-words', 'activities/new-skill', 'activities/lab', 'activities/review', 'achievements/speaking',
  'activities/project', 'activities/consistency', 'activities/milestone', 'activities/quick-challenge', 'activities/boss-battle']

export function formationArt(kind: AcademyFormationProgress['formation']['kind'], index = 0) {
  const assets = kind === 'english' ? englishArts : techArts
  return assets[index % assets.length]
}


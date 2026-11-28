import type { AcademyLesson, AcademyProgress } from './contracts'

export function academyLessonMediaIds(lesson: AcademyLesson) {
  const ids = new Set(lesson.resources)
  for (const exercise of lesson.exercises) if (exercise.resource) ids.add(exercise.resource)
  for (const phrase of lesson.dialogue ?? []) if (phrase.audio) ids.add(phrase.audio)
  for (const word of lesson.vocabulary ?? []) if (word.audio) ids.add(word.audio)
  return ids
}

export async function fetchAcademyProgress(readPage: (after: string | undefined, limit: number) => Promise<AcademyProgress[]>) {
  const limit = 200
  const rows: AcademyProgress[] = []
  let after: string | undefined
  while (true) {
    const page = await readPage(after, limit)
    rows.push(...page)
    if (page.length < limit) return rows
    after = page[page.length - 1].lesson_id
  }
}

import type {
  AcademyCatalog, AcademyFormation, AcademyLesson, AcademyResource, GradedExercise, PythonCase, PythonExercise, QuestionLinks,
} from '../../src/lib/academy/contracts'

type WithKey<Kind extends GradedExercise['kind'], Key> = Extract<GradedExercise, { kind: Kind }> & Key & { explanation: string }
export type AuthoringTextExercise = WithKey<'text', { accepted: string[] }>
export type AuthoringPythonExercise = PythonExercise & { hiddenCases: PythonCase[]; solution: string }
export type AuthoringExercise = AuthoringTextExercise | AuthoringPythonExercise | QuestionLinks
  | WithKey<'multiple-choice', { correctOptionId: string }>
  | WithKey<'ordering', { correctOrder: string[] }>
  | WithKey<'parsons', { correctLines: { id: string; indent: number }[] }>
  | WithKey<'matching', { pairs: Record<string, string> }>
  | WithKey<'output', { accepted: string[] }>
  | WithKey<'trace' | 'fill-in', { acceptedByField: Record<string, string[]> }>

export type AuthoringLesson = Omit<AcademyLesson, 'exercises'> & { exercises: AuthoringExercise[] }
export type AuthoringFormation = Omit<AcademyFormation, 'chapters'> & {
  chapters: { id: string; title: string; lessons: AuthoringLesson[] }[]
}
export type AuthoringCompetency = Omit<AcademyCatalog['competencies'][number], 'mastery'> & {
  mastery: { version: number; criterion: 'verified-practice'; description: string }
}
type AuthoringResource = Omit<AcademyResource, 'type' | 'path' | 'language' | 'width' | 'height'> & {
  language: 'pt-BR' | 'en-US' | 'und'
}
export type AuthoringImage = AuthoringResource & {
  type: 'image'; path: `/academy/media/${string}.${'webp' | 'png' | 'jpg'}`; width: number; height: number
}
export type AuthoringAudio = AuthoringResource & { type: 'audio'; path: `/academy/media/${string}.${'mp3' | 'ogg' | 'wav'}` }
export type AuthoringMarket = Omit<AcademyCatalog['market'], 'sources' | 'vacancies'> & {
  sources: (AcademyCatalog['market']['sources'][number] & { id: string })[]
  vacancies: (Omit<AcademyCatalog['market']['vacancies'][number], 'seniority'> & {
    seniority: 'internship' | 'entry' | 'unspecified'
  })[]
}

/** O JSON Schema e o importador aplicam as restrições específicas de cada versão e os vínculos entre IDs. */
export type AcademyAuthoringPackage = {
  schemaVersion: 1 | 2; id: string; version: number; description: string; pilot: boolean
  competencies: AuthoringCompetency[]; resources: (AuthoringImage | AuthoringAudio)[]
  formations: AuthoringFormation[]; market: AuthoringMarket
}

import type { GradedExercise, PythonExercise } from './contracts'

export const practicePath = '/dashboard/academy/praticas'
export const practiceSizes = [5, 10, 15, 30] as const
export const practiceDifficulties = { basic: 'Básica', intermediate: 'Intermediária', application: 'Aplicação' } as const
export const practiceKinds = {
  'multiple-choice': 'Múltipla escolha', output: 'Previsão de saída', trace: 'Rastreamento', 'fill-in': 'Completar lacunas',
  ordering: 'Ordenação', parsons: 'Parsons', matching: 'Associação', text: 'Resposta curta', python: 'Desafio Python',
} as const
export const practiceModes = { all: 'Todas', recommended: 'Recomendações', unseen: 'Nunca respondidas', mistakes: 'Revisar erros' } as const
export const outcomeLabel = { correct:'Acertou',incorrect:'Para revisar',practiced:'Prática registrada' } as const
export const practiceReasons = {
  mistake: 'Você errou a última tentativa desta questão.',
  skill: 'Ela reforça uma competência com erros recentes.',
  pattern: 'Ela trabalha um erro conceitual associado a falhas recorrentes nas suas práticas.',
  unseen: 'É uma atividade inédita para você nesta edição.',
  ready: 'Você já estudou a aula associada ou concluiu seus pré-requisitos.',
  selected: 'Ela corresponde aos filtros da sessão.',
} as const
export type PracticeReason = keyof typeof practiceReasons
type PracticeKind = keyof typeof practiceKinds
type PracticeDifficulty = keyof typeof practiceDifficulties
type PracticeMode = keyof typeof practiceModes
export type PracticeFilters = {
  topic?: string; skill?: string; difficulty?: PracticeDifficulty; kind?: PracticeKind; mode?: PracticeMode;
  lesson?: string; formation?: 'tech' | 'english'; module?: string
}
export type PracticeActivity = PythonExercise | (GradedExercise & { multilineFields?: string[] })
export type PracticeResult = { outcome: 'correct' | 'incorrect' | 'practiced'; credit: number | null; feedback: string }
export type PracticeListItem = {
  item_id: string; version: number; title: string; topic: string; kind: PracticeKind; difficulty: PracticeDifficulty; reason: PracticeReason
}
export type PracticeCatalog = { items: PracticeListItem[]; next: string | null }
export type PracticeOverview = {
  available: number; filtered: number; answered: number; correct: number; incorrect: number; practiced: number;
  topics: string[]; modules: string[]; kinds: PracticeKind[]; skills: { id: string; label: string }[];
  weak: { id: string; label: string; errors: number }[]; recommended: Pick<PracticeListItem,'item_id' | 'title' | 'reason'>[]
}
export type PracticeSession = { id: string; created_at: string; finished_at: string | null; filters: PracticeFilters }
export type PracticeSlot = {
  position: number; item_id: string; version: number; reason: PracticeReason; answered_at: string | null;
  outcome: PracticeResult['outcome'] | null; credit: number | null
}

export const practiceId = /^(?:TECH|EN)-[A-Z0-9]+-[0-9]{4,6}$/
export const practiceUuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
const reference = /^[a-z0-9][a-z0-9-]{0,63}\/[a-z0-9][a-z0-9-]{0,63}$/

export function getPracticeFilters(input: unknown): PracticeFilters {
  if (!input || typeof input !== 'object') return {}
  const values = input as Record<string, unknown>
  const filters: PracticeFilters = {}
  const topic = values.topic
  if (typeof topic === 'string' && topic.trim() && topic.length <= 250) filters.topic = topic.trim()
  for (const key of ['skill','module'] as const) {
    const value = values[key]
    if (typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9-]{0,79}$/.test(value)) filters[key] = value
  }
  if (typeof values.lesson === 'string' && reference.test(values.lesson)) filters.lesson = values.lesson
  if (values.formation === 'tech' || values.formation === 'english') filters.formation = values.formation
  if (typeof values.mode === 'string' && Object.hasOwn(practiceModes,values.mode) && values.mode !== 'all') filters.mode = values.mode as PracticeMode
  if (typeof values.kind === 'string' && Object.hasOwn(practiceKinds,values.kind)) filters.kind = values.kind as PracticeKind
  if (typeof values.difficulty === 'string' && Object.hasOwn(practiceDifficulties,values.difficulty)) filters.difficulty = values.difficulty as PracticeDifficulty
  return filters
}

export function practiceHref(filters: PracticeFilters = {}, extra: Record<string,string | undefined> = {}) {
  const query = new URLSearchParams()
  for (const [key,value] of Object.entries({ ...filters, ...extra })) if (value) query.set(key,value)
  return practicePath + (query.size ? '?' + query : '')
}

export function practicePosition(slots: PracticeSlot[], requested: unknown) {
  const next = slots.find(({ answered_at }) => !answered_at)
  const position = typeof requested === 'string' && /^\d{1,2}$/.test(requested) ? Number(requested) : undefined
  const chosen = position === undefined ? undefined : slots.find((item) => item.position === position && (item.answered_at || item === next))
  return { selected: chosen ?? next, next }
}

export function normalizePracticeOutput(value: string) {
  const lines = value.replace(/\r\n?/g,'\n')
  return lines.endsWith('\n') ? lines.slice(0,-1) : lines
}

import { ACHIEVEMENTS, type AchievementDetails } from '@/types/achievements'

type GoalKey = 'reviews' | 'streak' | 'exams' | 'notes' | 'simulations' | 'tutor'
export type AchievementCounters = Record<GoalKey, number | null>

const milestones: Partial<Record<string, readonly [GoalKey, number]>> = {
  o_inicio: ['reviews', 1],
  a_chama: ['streak', 7],
  o_planejador: ['exams', 1],
  o_arquivista_bronze: ['notes', 10],
  o_arquivista_prata: ['notes', 50],
  o_arquivista_ouro: ['notes', 100],
  o_arquivista_diamante: ['notes', 500],
  a_banca_bronze: ['simulations', 1],
  a_banca_prata: ['simulations', 10],
  a_banca_ouro: ['simulations', 50],
  o_tutor_bronze: ['tutor', 5],
  o_tutor_prata: ['tutor', 50],
  o_tutor_ouro: ['tutor', 200],
}

const groups = [
  { id: 'estudo', title: 'Primeiros marcos', description: 'Revisões, sequência e planejamento.', icon: 'Flame', entries: ['o_inicio', 'a_chama', 'o_planejador'] },
  { id: 'notas', title: 'Arquivista', description: 'Crie e organize suas notas de estudo.', icon: 'FolderHeart', entries: ['o_arquivista_bronze', 'o_arquivista_prata', 'o_arquivista_ouro', 'o_arquivista_diamante'] },
  { id: 'simulados', title: 'A Banca', description: 'Marcos de aproveitamento em simulados.', icon: 'GraduationCap', entries: ['a_banca_bronze', 'a_banca_prata', 'a_banca_ouro'] },
  { id: 'tutor', title: 'O Tutor', description: 'Pratique e tire dúvidas com o assistente.', icon: 'Brain', entries: ['o_tutor_bronze', 'o_tutor_prata', 'o_tutor_ouro'] },
  { id: 'especiais', title: 'Conquistas especiais', description: 'Desafios e descobertas ao longo do estudo.', icon: 'Sparkles', entries: ['o_matador_de_chefes', 'passaro_madrugador', 'coruja_noturna', 'premio_nobel'] },
] as const

export type CollectionItem = {
  id: string
  title: string
  description: string
  icon: string
  tier?: AchievementDetails['tier']
  unlocked: boolean
  hidden: boolean
  progress: { key: GoalKey; value: number; target: number } | null
}

export type Collection = ReturnType<typeof buildCollection>

const units: Record<GoalKey, readonly [string, string]> = {
  reviews: ['revisão', 'revisões'],
  streak: ['dia seguido', 'dias seguidos'],
  exams: ['prova agendada', 'provas agendadas'],
  notes: ['nota', 'notas'],
  simulations: ['simulado perfeito', 'simulados perfeitos'],
  tutor: ['consulta ao tutor', 'consultas ao tutor'],
}

function nextGoalText(key: GoalKey, remaining: number) {
  return (remaining === 1 ? 'Falta 1 ' : 'Faltam ' + remaining + ' ') + units[key][remaining === 1 ? 0 : 1] + '.'
}

export function buildCollection(unlockedIds: string[], counters: AchievementCounters) {
  const unlocked = new Set(unlockedIds)
  const families = groups.map(({ id, title, description, icon, entries }) => ({
    id, title, description, icon,
    items: entries.map((entry, index): CollectionItem => {
      const item = ACHIEVEMENTS[entry]
      const earned = unlocked.has(item.id)
      if (item.secret && !earned) {
        return {
          id: 'secreta-' + index,
          title: 'Conquista secreta',
          description: 'O título e o desafio aparecem quando você a desbloqueia.',
          icon: 'Lock',
          unlocked: false,
          hidden: true,
          progress: null,
        }
      }

      const [key, target] = milestones[entry] ?? []
      const value = key ? counters[key] : null
      return {
        id: entry,
        title: item.title.replace(/^[^\p{L}]+/u, ''),
        description: item.description,
        icon: item.icon,
        tier: item.tier,
        unlocked: earned,
        hidden: false,
        progress: key && target !== undefined && value !== null ? { key, value, target } : null,
      }
    }),
  }))

  const all = families.flatMap((family) => family.items)
  const candidates = families.flatMap((family) => {
    const hasTiers = family.id === 'notas' || family.id === 'tutor' || family.id === 'simulados'
    const pending = family.items.filter((item) => !item.unlocked && item.progress)
    return hasTiers ? pending.slice(0, 1) : pending
  })

  // A Banca é exibida na coleção, mas o contador de simulados ainda não tem um fluxo conectado.
  const nextTarget = candidates.flatMap((item) => {
    const progress = item.progress
    return progress && progress.key !== 'simulations' && progress.value < progress.target ? [{ item, progress }] : []
  }).sort((a, b) => b.progress.value / b.progress.target - a.progress.value / a.progress.target)[0] ?? null
  const next = nextTarget ? {
    ...nextTarget,
    remainingLabel: nextGoalText(nextTarget.progress.key, nextTarget.progress.target - nextTarget.progress.value),
  } : null

  return {
    families,
    next,
    total: all.length,
    unlockedCount: all.filter((item) => item.unlocked).length,
    trophy: unlocked.has('premio_nobel') ? ACHIEVEMENTS.premio_nobel : null,
  }
}

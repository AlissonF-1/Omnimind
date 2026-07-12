export const XP_CONFIG = {
  REVIEW_CARD: 10,
  PERFECT_SIMULADO: 20,
  CHAT_MESSAGE: 5,
  DAILY_QUEST_COMPLETE: 30
}

export interface UserStudyStats {
  user_id: string
  daily_goal_completed: boolean
  streak_multiplier: number
  tutor_queries_count: number
  perfect_exams_count: number
  unlocked_achievements: string[]
  total_xp?: number
  current_level?: number
  streak_shields?: number
  updated_at?: string
}

export interface AchievementDetails {
  id: string
  title: string
  description: string
  icon: string
}

export const ACHIEVEMENTS: Record<string, AchievementDetails> = {
  o_inicio: {
    id: 'o_inicio',
    title: '🏆 O Início',
    description: 'Revisou seu primeiro card de estudos.',
    icon: 'Trophy'
  },
  a_chama: {
    id: 'a_chama',
    title: '🔥 A Chama',
    description: 'Completou 7 dias seguidos de streak de revisões.',
    icon: 'Flame'
  },
  o_arquivista: {
    id: 'o_arquivista',
    title: '📝 O Arquivista',
    description: 'Escreveu 50 notas de estudos no seu segundo cérebro.',
    icon: 'FolderHeart'
  },
  a_banca: {
    id: 'a_banca',
    title: '🎓 A Banca',
    description: 'Completou 10 simulados (sprints) com 100% de aproveitamento.',
    icon: 'GraduationCap'
  },
  o_tutor: {
    id: 'o_tutor',
    title: '🧠 O Tutor',
    description: 'Consultou o assistente IA do OmniMind por 20 vezes.',
    icon: 'Brain'
  },
  o_planejador: {
    id: 'o_planejador',
    title: '📅 O Planejador',
    description: 'Agendou uma prova no calendário de estudos.',
    icon: 'Calendar'
  }
}

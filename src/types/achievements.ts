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
  tier?: 'bronze' | 'prata' | 'ouro' | 'diamante'
  secret?: boolean
  imageUrl?: string
}

export const ACHIEVEMENTS: Record<string, AchievementDetails> = {
  // --- INICIAIS ---
  o_inicio: {
    id: 'o_inicio',
    title: '🏆 O Início',
    description: 'Revisou seu primeiro card de estudos.',
    icon: 'Trophy',
    tier: 'bronze'
  },
  a_chama: {
    id: 'a_chama',
    title: '🔥 A Chama',
    description: 'Completou 7 dias seguidos de streak de revisões.',
    icon: 'Flame',
    tier: 'bronze'
  },
  o_planejador: {
    id: 'o_planejador',
    title: '📅 O Planejador',
    description: 'Agendou uma prova no calendário de estudos.',
    icon: 'Calendar',
    tier: 'bronze'
  },

  // --- TIERS: O ARQUIVISTA ---
  o_arquivista_bronze: {
    id: 'o_arquivista_bronze',
    title: '📝 O Arquivista (Bronze)',
    description: 'Escreveu 10 notas de estudos no seu segundo cérebro.',
    icon: 'FolderHeart',
    tier: 'bronze'
  },
  o_arquivista_prata: {
    id: 'o_arquivista_prata',
    title: '📝 O Arquivista (Prata)',
    description: 'Escreveu 50 notas de estudos no seu segundo cérebro.',
    icon: 'FolderHeart',
    tier: 'prata'
  },
  o_arquivista_ouro: {
    id: 'o_arquivista_ouro',
    title: '📝 O Arquivista (Ouro)',
    description: 'Escreveu 100 notas de estudos no seu segundo cérebro.',
    icon: 'FolderHeart',
    tier: 'ouro'
  },
  o_arquivista_diamante: {
    id: 'o_arquivista_diamante',
    title: '📝 O Arquivista (Diamante)',
    description: 'Escreveu 500 notas de estudos no seu segundo cérebro.',
    icon: 'FolderHeart',
    tier: 'diamante'
  },

  // --- TIERS: A BANCA ---
  a_banca_bronze: {
    id: 'a_banca_bronze',
    title: '🎓 A Banca (Bronze)',
    description: 'Completou 1 simulado com 100% de aproveitamento.',
    icon: 'GraduationCap',
    tier: 'bronze'
  },
  a_banca_prata: {
    id: 'a_banca_prata',
    title: '🎓 A Banca (Prata)',
    description: 'Completou 10 simulados com 100% de aproveitamento.',
    icon: 'GraduationCap',
    tier: 'prata'
  },
  a_banca_ouro: {
    id: 'a_banca_ouro',
    title: '🎓 A Banca (Ouro)',
    description: 'Completou 50 simulados com 100% de aproveitamento.',
    icon: 'GraduationCap',
    tier: 'ouro'
  },

  // --- TIERS: O TUTOR ---
  o_tutor_bronze: {
    id: 'o_tutor_bronze',
    title: '🧠 O Tutor (Bronze)',
    description: 'Consultou o assistente IA do OmniMind por 5 vezes.',
    icon: 'Brain',
    tier: 'bronze'
  },
  o_tutor_prata: {
    id: 'o_tutor_prata',
    title: '🧠 O Tutor (Prata)',
    description: 'Consultou o assistente IA do OmniMind por 50 vezes.',
    icon: 'Brain',
    tier: 'prata'
  },
  o_tutor_ouro: {
    id: 'o_tutor_ouro',
    title: '🧠 O Tutor (Ouro)',
    description: 'Consultou o assistente IA do OmniMind por 200 vezes.',
    icon: 'Brain',
    tier: 'ouro'
  },

  // --- SECRETOS & HORÁRIOS ---
  passaro_madrugador: {
    id: 'passaro_madrugador',
    title: '🌅 Pássaro Madrugador',
    description: 'Fez uma revisão de estudos entre as 04:00 e 06:59 da manhã.',
    icon: 'Sun',
    tier: 'ouro',
    secret: true
  },
  coruja_noturna: {
    id: 'coruja_noturna',
    title: '🦉 Coruja Noturna',
    description: 'Fez uma revisão de estudos de madrugada (entre 00:00 e 03:59).',
    icon: 'Moon',
    tier: 'ouro',
    secret: true
  },
  premio_nobel: {
    id: 'premio_nobel',
    title: '🏅 Prêmio Nobel',
    description: 'Atingiu precisão superior a 90% em uma explicação no Feynman Sandbox.',
    icon: 'Award',
    tier: 'diamante',
    secret: true,
    imageUrl: '/images/nobel_3d.png'
  },
  o_matador_de_chefes: {
    id: 'o_matador_de_chefes',
    title: '⚔️ O Matador de Chefes',
    description: 'Derrotou seu primeiro Boss no Modo Batalha de Simulados.',
    icon: 'Swords',
    tier: 'prata',
    secret: false
  },
  o_jardineiro_do_foco: {
    id: 'o_jardineiro_do_foco',
    title: '🌱 Jardineiro do Foco',
    description: 'Sobreviveu a 10 Pomodoros no Modo Hardcore sem perder a concentração.',
    icon: 'Sprout',
    tier: 'ouro',
    secret: false
  }
}

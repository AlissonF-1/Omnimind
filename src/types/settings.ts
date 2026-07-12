export interface UserPreferences {
  user_id: string

  // Organização e Aparência
  theme: 'dark' | 'light' | 'system'
  clipper_default_workspace_id: string | null

  // Estudos e Metas
  daily_goal_default: number
  do_not_disturb: boolean
  fsrs_retention_goal: number

  // Áudio e Voz
  transcription_mode: 'browser' | 'whisper'
  tts_voice: 'default' | 'male' | 'female'
  ai_font_size: 'small' | 'normal' | 'large'

  // IA e Modelos
  ai_default_model: 'gemini' | 'groq' | 'openrouter'
  eco_mode: boolean
  generate_analogies: boolean

  // Gamificação e Perfil
  enable_sounds: boolean
  enable_confetti: boolean
  level_visibility: 'public' | 'private'

  updated_at?: string
}

export const DEFAULT_PREFERENCES: Omit<UserPreferences, 'user_id' | 'updated_at'> = {
  theme: 'dark',
  clipper_default_workspace_id: null,
  daily_goal_default: 10,
  do_not_disturb: false,
  fsrs_retention_goal: 0.90,
  transcription_mode: 'browser',
  tts_voice: 'default',
  ai_font_size: 'normal',
  ai_default_model: 'gemini',
  eco_mode: false,
  generate_analogies: true,
  enable_sounds: true,
  enable_confetti: true,
  level_visibility: 'public'
}

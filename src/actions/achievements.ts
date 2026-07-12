'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { UserStudyStats, AchievementDetails, ACHIEVEMENTS } from '@/types/achievements'

export async function getUserStudyStats(): Promise<UserStudyStats | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('user_study_stats')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    console.error('Erro ao obter user_study_stats:', error)
    return null
  }

  if (!data) {
    const { data: newRow, error: insertError } = await supabase
      .from('user_study_stats')
      .insert({
        user_id: user.id,
        daily_goal_completed: false,
        streak_multiplier: 1.0,
        tutor_queries_count: 0,
        perfect_exams_count: 0,
        unlocked_achievements: []
      })
      .select()
      .single()

    if (insertError) {
      console.error('Erro ao inicializar user_study_stats:', insertError)
      return null
    }

    return newRow
  }

  // Se for um novo dia, reseta a flag daily_goal_completed para false
  const todayStr = new Date().toISOString().split('T')[0]
  const lastUpdateStr = new Date(data.updated_at).toISOString().split('T')[0]

  if (todayStr !== lastUpdateStr && data.daily_goal_completed) {
    const { data: updatedData } = await supabase
      .from('user_study_stats')
      .update({
        daily_goal_completed: false,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user.id)
      .select()
      .single()

    if (updatedData) {
      return updatedData
    }
  }

  return data
}

export async function checkAndUnlockAchievements(): Promise<AchievementDetails[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const stats = await getUserStudyStats()
  if (!stats) return []

  const unlocked = new Set(stats.unlocked_achievements || [])
  const newlyUnlocked: AchievementDetails[] = []

  // A. Busca total de notas criadas nas workspaces do usuário
  const { count: notesCount } = await supabase
    .from('notes')
    .select('id, workspaces!inner(user_id)', { count: 'exact', head: true })
    .eq('workspaces.user_id', user.id)

  // B. Busca total de logs de revisão feitos
  const { data: logs } = await supabase
    .from('daily_study_logs')
    .select('review_count')
    .eq('user_id', user.id)

  const totalReviews = logs?.reduce((acc: number, cur: any) => acc + (cur.review_count || 0), 0) || 0

  // 🏆 O Início
  if (!unlocked.has('o_inicio') && totalReviews >= 1) {
    newlyUnlocked.push(ACHIEVEMENTS.o_inicio)
  }

  // 📝 O Arquivista
  if (!unlocked.has('o_arquivista') && (notesCount || 0) >= 50) {
    newlyUnlocked.push(ACHIEVEMENTS.o_arquivista)
  }

  // 🧠 O Tutor
  if (!unlocked.has('o_tutor') && stats.tutor_queries_count >= 20) {
    newlyUnlocked.push(ACHIEVEMENTS.o_tutor)
  }

  // 🎓 A Banca
  if (!unlocked.has('a_banca') && stats.perfect_exams_count >= 10) {
    newlyUnlocked.push(ACHIEVEMENTS.a_banca)
  }

  // 🔥 A Chama (7 dias de streak)
  const streak = await getUserStreak(user.id)
  if (!unlocked.has('a_chama') && streak >= 7) {
    newlyUnlocked.push(ACHIEVEMENTS.a_chama)
  }

  if (newlyUnlocked.length > 0) {
    const nextUnlocked = [...unlocked, ...newlyUnlocked.map(a => a.id)]
    let multiplier = stats.streak_multiplier
    
    // Ativa o multiplicador se a chama for desbloqueada
    if (newlyUnlocked.some(a => a.id === 'a_chama')) {
      multiplier = 1.5
    }

    await supabase
      .from('user_study_stats')
      .update({
        unlocked_achievements: nextUnlocked,
        streak_multiplier: multiplier
      })
      .eq('user_id', user.id)

    revalidatePath('/dashboard')
  }

  return newlyUnlocked
}

export async function incrementTutorQueriesCount() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const stats = await getUserStudyStats()
  if (stats) {
    await supabase
      .from('user_study_stats')
      .update({ tutor_queries_count: (stats.tutor_queries_count || 0) + 1 })
      .eq('user_id', user.id)
  }
}

export async function incrementPerfectExamsCount() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const stats = await getUserStudyStats()
  if (stats) {
    await supabase
      .from('user_study_stats')
      .update({ perfect_exams_count: (stats.perfect_exams_count || 0) + 1 })
      .eq('user_id', user.id)
  }
}

async function getUserStreak(userId: string): Promise<number> {
  const supabase = await createClient()
  const { data: logs } = await supabase
    .from('daily_study_logs')
    .select('study_date')
    .eq('user_id', userId)
    .order('study_date', { ascending: false })
    .limit(365)

  let streak = 0
  if (logs && logs.length > 0) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    let currentDate = new Date(today)
    for (const log of logs) {
      const logDate = new Date(log.study_date)
      logDate.setHours(0, 0, 0, 0)
      
      if (logDate.getTime() === currentDate.getTime()) {
        streak++
        currentDate.setDate(currentDate.getDate() - 1)
      } else {
        break
      }
    }
  }
  return streak
}

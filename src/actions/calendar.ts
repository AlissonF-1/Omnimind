'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

// Helper para obter a data local (Brasil) no formato YYYY-MM-DD
function getLocalISODate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { 
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date)
}

export type ExamGoal = {
  id: string
  user_id: string
  workspace_id: string | null
  title: string
  exam_date: string
  color: string
  is_active_goal: boolean
  created_at: string
}

export type DayData = {
  date: string
  scheduled: number
  reviewed: number
  isPast: boolean
}

export type CalendarData = {
  days: DayData[]
  examGoals: ExamGoal[]
}

export async function getCalendarData(month: number, year: number, workspaceId?: string): Promise<CalendarData> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { days: [], examGoals: [] }

  const startOfMonth = new Date(year, month, 1)
  const endOfMonth = new Date(year, month + 1, 0)
  const mm = String(month + 1).padStart(2, '0')
  const endDay = String(endOfMonth.getDate()).padStart(2, '0')
  const startOfMonthStr = `${year}-${mm}-01`
  const endOfMonthStr = `${year}-${mm}-${endDay}`

  // 1. Busca nome do workspace se houver filtro
  let workspaceName: string | null = null
  if (workspaceId) {
    const { data: ws } = await supabase
      .from('workspaces')
      .select('name')
      .eq('id', workspaceId)
      .maybeSingle()
    workspaceName = ws?.name || null
  }

  // 2. Busca flashcards agendados (FSRS)
  let flashcardQuery = supabase
    .from('flashcards')
    .select('due, notes!inner(workspace_id)')
    .eq('user_id', user.id)
    .gte('due', startOfMonth.toISOString())
    .lte('due', endOfMonth.toISOString())

  if (workspaceId) {
    flashcardQuery = flashcardQuery.eq('notes.workspace_id', workspaceId)
  }

  const { data: scheduledData } = await flashcardQuery

  const scheduledMap = new Map<string, number>()
  scheduledData?.forEach(card => {
    if (!card.due) return
    const dayStr = card.due.split('T')[0]
    scheduledMap.set(dayStr, (scheduledMap.get(dayStr) || 0) + 1)
  })

  // 3. Busca logs de estudo históricos
  const { data: logs } = await supabase
    .from('daily_study_logs')
    .select('study_date, review_count, topics')
    .eq('user_id', user.id)
    .gte('study_date', startOfMonthStr)
    .lte('study_date', endOfMonthStr)

  const reviewedMap = new Map<string, number>()
  logs?.forEach(log => {
    if (workspaceName && (!log.topics || !log.topics.includes(workspaceName))) {
      return
    }
    const studyDateOnly = log.study_date?.split('T')[0] || log.study_date
    reviewedMap.set(studyDateOnly, (reviewedMap.get(studyDateOnly) || 0) + (log.review_count || 0))
  })

  // 4. Busca metas de prova (exam goals)
  let examGoalsQuery = supabase
    .from('exam_goals')
    .select('*')
    .eq('user_id', user.id)

  if (workspaceId) {
    examGoalsQuery = examGoalsQuery.or(`workspace_id.eq.${workspaceId},workspace_id.is.null`)
  }

  const { data: examGoals } = await examGoalsQuery.order('exam_date', { ascending: true })

  const todayStr = getLocalISODate(new Date())
  const days: DayData[] = []
  const totalDays = endOfMonth.getDate()

  for (let d = 1; d <= totalDays; d++) {
    const dd = String(d).padStart(2, '0')
    const dateStr = `${year}-${mm}-${dd}`
    days.push({
      date: dateStr,
      scheduled: scheduledMap.get(dateStr) || 0,
      reviewed: reviewedMap.get(dateStr) || 0,
      isPast: dateStr < todayStr,
    })
  }

  return { days, examGoals: examGoals || [] }
}

export async function getExamGoals(): Promise<ExamGoal[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('exam_goals')
    .select('*')
    .eq('user_id', user.id)
    .order('exam_date', { ascending: true })

  return data || []
}

export async function getDynamicDailyGoal(userId?: string): Promise<{ goal: number; activeGoal: ExamGoal | null }> {
  const supabase = await createClient()
  let targetUserId = userId
  if (!targetUserId) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { goal: 10, activeGoal: null }
    targetUserId = user.id
  }

  const todayStr = getLocalISODate(new Date())
  
  // Unifica a busca: tenta achar a meta ativa OU a próxima meta mais próxima no futuro
  const { data: targetGoal } = await supabase
    .from('exam_goals')
    .select('*')
    .eq('user_id', targetUserId)
    .gte('exam_date', todayStr)
    .order('is_active_goal', { ascending: false }) // ativas (true) primeiro
    .order('exam_date', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!targetGoal) {
    return { goal: 10, activeGoal: null }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const examDate = new Date(targetGoal.exam_date + 'T00:00:00')
  examDate.setHours(0, 0, 0, 0)

  let daysLeft = Math.ceil((examDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (daysLeft < 0) daysLeft = 0

  const { count: pendingCards } = await supabase
    .from('flashcards')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', targetUserId)
    .neq('state', 0)
    .lte('due', examDate.toISOString())

  let goal = 10
  if (daysLeft === 0) {
    goal = Math.max(5, Math.min(50, pendingCards || 0))
  } else {
    goal = Math.max(5, Math.min(50, Math.ceil((pendingCards || 0) / daysLeft)))
  }

  return { goal, activeGoal: targetGoal }
}

export async function toggleActiveGoal(goalId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: existing } = await supabase
    .from('exam_goals')
    .select('is_active_goal')
    .eq('id', goalId)
    .eq('user_id', user.id)
    .single()

  await supabase
    .from('exam_goals')
    .update({ is_active_goal: false })
    .eq('user_id', user.id)

  if (!existing?.is_active_goal) {
    await supabase
      .from('exam_goals')
      .update({ is_active_goal: true })
      .eq('id', goalId)
      .eq('user_id', user.id)
  }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/calendario')
}

export async function createExamGoal(
  title: string,
  examDate: string,
  workspaceId?: string,
  color?: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nao autenticado')

  const { error } = await supabase.from('exam_goals').insert({
    user_id: user.id,
    title,
    exam_date: examDate,
    workspace_id: workspaceId || null,
    color: color || '#6366f1',
    is_active_goal: false
  })

  if (error) throw new Error(error.message)

  // Dispara checagem de conquistas em background (ex: O Planejador)
  const { checkAndUnlockAchievements } = await import('@/actions/achievements')
  checkAndUnlockAchievements().catch(err => 
    console.error('Erro ao verificar conquistas pós-criação de meta:', err)
  )

  revalidatePath('/dashboard/calendario')
  revalidatePath('/dashboard')
}

export async function deleteExamGoal(goalId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('exam_goals')
    .delete()
    .eq('id', goalId)
    .eq('user_id', user.id)

  revalidatePath('/dashboard/calendario')
  revalidatePath('/dashboard')
}

export async function updateExamGoal(
  goalId: string,
  updates: { title?: string; exam_date?: string; color?: string; workspace_id?: string | null }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('exam_goals')
    .update(updates)
    .eq('id', goalId)
    .eq('user_id', user.id)

  revalidatePath('/dashboard/calendario')
  revalidatePath('/dashboard')
}

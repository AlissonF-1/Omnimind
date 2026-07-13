'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { UserStudyStats, AchievementDetails, ACHIEVEMENTS, XP_CONFIG } from '@/types/achievements'

// Helper para obter a data local (Brasil) no formato YYYY-MM-DD, ignorando a virada do UTC.
function getLocalISODate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { 
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date)
}

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
  const todayStr = getLocalISODate(new Date())
  const lastUpdateStr = getLocalISODate(new Date(data.updated_at))

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

  // Dispara queries em paralelo para melhorar performance
  const [notesRes, logsRes, examGoalsRes, streak] = await Promise.all([
    supabase
      .from('notes')
      .select('id, workspaces!inner(user_id)', { count: 'exact', head: true })
      .eq('workspaces.user_id', user.id),
    supabase
      .from('daily_study_logs')
      .select('review_count')
      .eq('user_id', user.id),
    supabase
      .from('exam_goals')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id),
    getUserStreak(user.id)
  ])

  const notesCount = notesRes.count || 0
  const logs = logsRes.data || []
  const examGoalsCount = examGoalsRes.count || 0

  const totalReviews = logs.reduce((acc: number, cur: any) => acc + (cur.review_count || 0), 0)

  // 🏆 O Início
  if (!unlocked.has('o_inicio') && totalReviews >= 1) {
    newlyUnlocked.push(ACHIEVEMENTS.o_inicio)
  }

  // 📝 O Arquivista
  if (!unlocked.has('o_arquivista') && notesCount >= 50) {
    newlyUnlocked.push(ACHIEVEMENTS.o_arquivista)
  }

  // 🧠 O Tutor
  if (!unlocked.has('o_tutor') && stats.tutor_queries_count >= 20) {
    newlyUnlocked.push(ACHIEVEMENTS.o_tutor)
  }

  // 📅 O Planejador
  if (!unlocked.has('o_planejador') && examGoalsCount >= 1) {
    newlyUnlocked.push(ACHIEVEMENTS.o_planejador)
  }

  // 🎓 A Banca
  if (!unlocked.has('a_banca') && stats.perfect_exams_count >= 10) {
    newlyUnlocked.push(ACHIEVEMENTS.a_banca)
  }

  // 🔥 A Chama (7 dias de streak)
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

export async function getUserStreak(userId: string): Promise<number> {
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
        // Se hoje ainda não foi estudado, permitimos pular hoje para ontem
        const yesterday = new Date(today)
        yesterday.setDate(yesterday.getDate() - 1)

        if (currentDate.getTime() === today.getTime() && logDate.getTime() === yesterday.getTime()) {
          currentDate.setDate(currentDate.getDate() - 1)
          continue
        }

        break // A streak quebra de verdade
      }
    }
  }
  return streak
}

/**
 * Verifica se a streak do usuário está em perigo (ontem não estudado, mas anteontem sim)
 */
export async function getStreakJeopardyStatus(): Promise<{
  isJeopardy: boolean
  potentialStreak: number
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { isJeopardy: false, potentialStreak: 0 }

  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const twoDaysAgo = new Date()
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)

  const todayStr = getLocalISODate(today)
  const yesterdayStr = getLocalISODate(yesterday)
  const twoDaysAgoStr = getLocalISODate(twoDaysAgo)

  // Busca se existem logs para ontem e anteontem
  const { data: logs } = await supabase
    .from('daily_study_logs')
    .select('study_date')
    .eq('user_id', user.id)
    .in('study_date', [yesterdayStr, twoDaysAgoStr])

  const hasYesterday = logs?.some(l => (l.study_date?.split('T')[0] || l.study_date) === yesterdayStr)
  const hasTwoDaysAgo = logs?.some(l => (l.study_date?.split('T')[0] || l.study_date) === twoDaysAgoStr)

  if (!hasYesterday && hasTwoDaysAgo) {
    // Ontem foi pulado, mas anteontem teve estudo. A streak pode ser resgatada!
    // Para calcular a potentialStreak (a streak até anteontem), vamos buscar todos os logs anteriores
    const { data: allLogs } = await supabase
      .from('daily_study_logs')
      .select('study_date')
      .eq('user_id', user.id)
      .order('study_date', { ascending: false })
      .limit(365)

    let potentialStreak = 0
    if (allLogs) {
      let currentDate = new Date(twoDaysAgo)
      currentDate.setHours(0, 0, 0, 0)

      for (const log of allLogs) {
        const logDate = new Date(log.study_date)
        logDate.setHours(0, 0, 0, 0)

        // Ignoramos hoje/amanhã se houver
        if (logDate.getTime() > currentDate.getTime()) {
          continue
        }

        if (logDate.getTime() === currentDate.getTime()) {
          potentialStreak++
          currentDate.setDate(currentDate.getDate() - 1)
        } else {
          break
        }
      }
    }

    return { isJeopardy: true, potentialStreak }
  }

  return { isJeopardy: false, potentialStreak: 0 }
}

/**
 * Resgata a streak inserindo um log de estudos dummy para o dia de ontem
 */
export async function rescueStreak(): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Não autenticado' }

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = getLocalISODate(yesterday)

  // Insere um log de estudo fictício para ontem
  const { error } = await supabase
    .from('daily_study_logs')
    .insert({
      user_id: user.id,
      study_date: yesterdayStr,
      review_count: 1
    })

  if (error) {
    console.error('[rescueStreak] Erro ao resgatar streak:', error)
    return { success: false, error: error.message }
  }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/revisoes')
  return { success: true }
}

export async function addXp(amount: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const stats = await getUserStudyStats()
  if (!stats) return null

  const currentXp = stats.total_xp || 0
  const newXp = currentXp + amount

  // Fórmula de nível: Nível = (Raiz quadrada do XP / 5) + 1
  const newLevel = Math.floor(Math.sqrt(newXp / 5)) + 1
  const oldLevel = stats.current_level || 1
  const leveledUp = newLevel > oldLevel

  await supabase
    .from('user_study_stats')
    .update({ 
      total_xp: newXp, 
      current_level: newLevel,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', user.id)

  revalidatePath('/dashboard')

  return { leveledUp, oldLevel, newLevel }
}

export async function incrementQuestProgress(questId: 'guerreiro' | 'escritor' | 'curioso', amount = 1) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const todayStr = getLocalISODate(new Date())
  
  // 1. Busca a quest de hoje
  let { data: quest } = await supabase
    .from('daily_quests')
    .select('*')
    .eq('user_id', user.id)
    .eq('date', todayStr)
    .eq('quest_id', questId)
    .maybeSingle()

  const stats = await getUserStudyStats()
  const level = stats?.current_level || 1

  const targets = { 
    guerreiro: Math.min(30, 5 + Math.floor(level * 1.5)), 
    escritor: 1, 
    curioso: 1 
  }
  const rewardXps = { 
    guerreiro: XP_CONFIG.DAILY_QUEST_COMPLETE, 
    escritor: XP_CONFIG.DAILY_QUEST_COMPLETE, 
    curioso: XP_CONFIG.DAILY_QUEST_COMPLETE 
  }

  const target = targets[questId]
  const rewardXp = rewardXps[questId]

  let levelUpRes = null

  if (!quest) {
    // Insere nova quest para hoje
    const newProgress = Math.min(amount, target)
    const completed = newProgress >= target
    
    const { data: inserted } = await supabase
      .from('daily_quests')
      .insert({
        user_id: user.id,
        date: todayStr,
        quest_id: questId,
        progress: newProgress,
        target: target,
        completed: completed,
        reward_xp: rewardXp
      })
      .select()
      .single()

    if (completed && inserted) {
      levelUpRes = await addXp(rewardXp)
    }
    return { quest: inserted, newlyCompleted: completed, leveledUp: levelUpRes }
  } else {
    if (quest.completed) return { quest, newlyCompleted: false }

    const newProgress = Math.min((quest.progress || 0) + amount, target)
    const completed = newProgress >= target

    const { data: updated } = await supabase
      .from('daily_quests')
      .update({
        progress: newProgress,
        completed: completed
      })
      .eq('id', quest.id)
      .select()
      .single()

    if (completed && !quest.completed && updated) {
      levelUpRes = await addXp(rewardXp)
    }
    return { quest: updated, newlyCompleted: completed && !quest.completed, leveledUp: levelUpRes }
  }
}

export async function getDailyQuests() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const todayStr = getLocalISODate(new Date())

  // Busca as quests de hoje
  let { data: quests } = await supabase
    .from('daily_quests')
    .select('*')
    .eq('user_id', user.id)
    .eq('date', todayStr)

  // Se não tem as 3 quests, inicializa
  const questTypes = ['guerreiro', 'escritor', 'curioso']
  if (!quests || quests.length < 3) {
    const existingIds = quests?.map(q => q.quest_id) || []
    const missingTypes = questTypes.filter(t => !existingIds.includes(t))

    const stats = await getUserStudyStats()
    const level = stats?.current_level || 1

    const targets = { 
      guerreiro: Math.min(30, 5 + Math.floor(level * 1.5)), 
      escritor: 1, 
      curioso: 1 
    }
    
    const inserts = missingTypes.map(type => ({
      user_id: user.id,
      date: todayStr,
      quest_id: type,
      progress: 0,
      target: targets[type as 'guerreiro' | 'escritor' | 'curioso'],
      completed: false,
      reward_xp: XP_CONFIG.DAILY_QUEST_COMPLETE
    }))

    if (inserts.length > 0) {
      const { error: insertError } = await supabase.from('daily_quests').insert(inserts)
      
      if (insertError) {
        console.error('Erro ao inserir daily_quests:', insertError)
      }

      const { data: reloaded } = await supabase
        .from('daily_quests')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', todayStr)
      quests = reloaded
    }
  }

  return quests || []
}

export async function generatePlayerTitle(force = false): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 'Estudante Dedicado'

  // Se já tem título e não estamos forçando a geração, retorna o atual
  const currentTitle = user.user_metadata?.player_title
  if (currentTitle && !force) {
    return currentTitle
  }

  // Verificador de timestamp (Rate limit: 1 hora)
  const lastGenerated = user.user_metadata?.last_title_generated_at
  if (lastGenerated && force) {
    const lastTime = new Date(lastGenerated).getTime()
    const nowTime = new Date().getTime()
    const diffHours = (nowTime - lastTime) / (1000 * 60 * 60)
    if (diffHours < 1) {
      // Retorna o título atual silenciosamente se for clicado antes de 1 hora
      return currentTitle || 'Estudante Dedicado'
    }
  }

  // 1. Busca os nomes das workspaces do usuário
  const { data: workspaces } = await supabase
    .from('workspaces')
    .select('name')
    .eq('is_archived', false)

  const stats = await getUserStudyStats()
  const level = stats?.current_level || 1

  const workspaceNames = workspaces?.map(w => w.name).join(', ') || 'Estudos Gerais'

  // 2. Chama a API do Groq para gerar um título criativo de 3 palavras em português
  const groqApiKey = process.env.GROQ_API_KEY
  if (!groqApiKey) return `Especialista Nível ${level}`

  try {
    const prompt = `Você é um gerador de títulos honoríficos de RPG para um aplicativo de estudos gamificado chamado OmniMind.
O usuário estuda os seguintes temas: "${workspaceNames}" e está no Nível ${level}.
Gere um título honorífico curto de 2 a 4 palavras em português que descreva essa jornada de forma épica ou divertida.
Exemplos:
- Se estuda Direito: "O Intérprete da Lei" ou "Defensor da Justiça"
- Se estuda Computação: "Arquiteto de Algoritmos" ou "Mestre dos Bits"
- Se estuda Medicina: "Guardião da Saúde" ou "Anatomista do Amanhã"
- Se estuda vários temas: "Polímata Aprendiz" ou "Buscador do Conhecimento"

Retorne APENAS o título gerado, sem explicações, sem aspas, sem introduções. Não use markdown.`

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqApiKey}`
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 30
      })
    })

    if (!res.ok) throw new Error('Falha na chamada do Groq')
    const json = await res.json()
    const title = json.choices?.[0]?.message?.content?.trim() || `Conquistador Nível ${level}`

    // 3. Salva o título gerado e o timestamp de geração no metadata do usuário
    await supabase.auth.updateUser({
      data: { 
        player_title: title,
        last_title_generated_at: new Date().toISOString()
      }
    })

    return title
  } catch (err) {
    console.error('Erro ao gerar título:', err)
    return `Explorador Nível ${level}`
  }
}

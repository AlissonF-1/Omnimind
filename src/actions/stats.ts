'use server'

import { createClient } from '@/utils/supabase/server'
import { getUserStudyStats, getUserStreak } from '@/actions/achievements'
import { callAIWithFallback } from '@/lib/ai-fallback'

export async function getDailyStudyLogs() {
  const supabase = await createClient()
  
  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

  const { data, error } = await supabase
    .from('daily_study_logs')
    .select('study_date, review_count, topics')
    .gte('study_date', oneYearAgo.toISOString())
    .order('study_date', { ascending: true })

  if (error) {
    console.error('Erro ao buscar logs de estudo:', error)
    return []
  }

  return data
}

export async function checkNoteRelearningAlert(noteId: string) {
  const supabase = await createClient()

  const { data: flashcards, error } = await supabase
    .from('flashcards')
    .select('id, lapses')
    .eq('note_id', noteId)

  if (error) {
    console.error('Erro ao verificar flashcards da nota:', error)
    return { shouldAlert: false, lapsedPercentage: 0, totalCards: 0, cardsWithLapses: 0 }
  }

  if (!flashcards || flashcards.length === 0) {
    return { shouldAlert: false, lapsedPercentage: 0, totalCards: 0, cardsWithLapses: 0 }
  }

  const cardWithLapses = flashcards.filter((card) => card.lapses > 0).length
  const lapsedPercentage = Math.round((cardWithLapses / flashcards.length) * 100)
  const shouldAlert = lapsedPercentage > 50

  return {
    shouldAlert,
    lapsedPercentage,
    totalCards: flashcards.length,
    cardsWithLapses: cardWithLapses,
  }
}

export async function getUserDashboardStats() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) throw new Error('Não autenticado')

  // 1. Busca workspaces ativos (não arquivados)
  let activeWsIds: string[] = []
  const { data: activeWs, error: activeWsError } = await supabase
    .from('workspaces')
    .select('id')
    .eq('is_archived', false)

  if (activeWsError) {
    const { data: fallbackWs } = await supabase.from('workspaces').select('id')
    activeWsIds = fallbackWs?.map(w => w.id) || []
  } else {
    activeWsIds = activeWs?.map(w => w.id) || []
  }

  if (activeWsIds.length === 0) {
    return { totalCards: 0, overdueCards: 0, streak: 0, retentionRate: 0 }
  }

  const nowIso = new Date().toISOString()

  // Executa as consultas de agregação de contagem em paralelo no banco de dados
  const [totalRes, overdueRes, neverLapsedRes, logsRes] = await Promise.all([
    supabase
      .from('flashcards')
      .select('id, notes!inner(workspace_id)', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .in('notes.workspace_id', activeWsIds),
    supabase
      .from('flashcards')
      .select('id, notes!inner(workspace_id)', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .in('notes.workspace_id', activeWsIds)
      .lte('due', nowIso),
    supabase
      .from('flashcards')
      .select('id, notes!inner(workspace_id)', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .in('notes.workspace_id', activeWsIds)
      .eq('lapses', 0),
    supabase
      .from('daily_study_logs')
      .select('study_date, review_count')
      .eq('user_id', user.id)
      .order('study_date', { ascending: false })
      .limit(365)
  ])

  const totalCards = totalRes.count || 0
  const overdueCards = overdueRes.count || 0
  const neverLapsed = neverLapsedRes.count || 0
  const logs = logsRes.data

  const streak = await getUserStreak(user.id)

  const retentionRate = totalCards > 0 ? Math.round((neverLapsed / totalCards) * 100) : 0

  return {
    totalCards,
    overdueCards,
    streak,
    retentionRate,
  }
}

export async function getWorkspaceFlashcardCounts(workspaceId: string) {
  const supabase = await createClient()

  // Busca as notas e os cards do workspace de forma concorrente em paralelo
  const [notesRes, cardsRes] = await Promise.all([
    supabase
      .from('notes')
      .select('id')
      .eq('workspace_id', workspaceId),
    supabase
      .from('flashcards')
      .select('note_id, notes!inner(workspace_id)')
      .eq('notes.workspace_id', workspaceId)
  ])

  const notes = notesRes.data || []
  const cards = cardsRes.data || []

  const counts: Record<string, number> = {}
  notes.forEach(note => {
    counts[note.id] = 0
  })

  cards.forEach((card: any) => {
    if (counts[card.note_id] !== undefined) {
      counts[card.note_id]++
    }
  })

  return counts
}

export interface CriticalAlert {
  workspaceId: string
  workspaceName: string
  criticalCount: number
}

export async function getCriticalReviewAlerts(): Promise<CriticalAlert[]> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data: criticalCards, error } = await supabase
      .from('flashcards')
      .select(`
        id,
        lapses,
        notes!inner (
          workspace_id,
          workspaces!inner (
            id,
            name
          )
        )
      `)
      .eq('user_id', user.id)
      .lte('due', new Date().toISOString())
      .gte('lapses', 2)

    if (error || !criticalCards) return []

    const alertMap = new Map<string, CriticalAlert>()

    for (const card of criticalCards) {
      // @ts-ignore
      const workspaceInfo = Array.isArray(card.notes) ? card.notes[0]?.workspaces : card.notes?.workspaces
      const wsId = Array.isArray(workspaceInfo) ? workspaceInfo[0]?.id : workspaceInfo?.id
      const wsName = Array.isArray(workspaceInfo) ? workspaceInfo[0]?.name : workspaceInfo?.name

      if (wsId && wsName) {
        const existing = alertMap.get(wsId)
        if (existing) {
          existing.criticalCount += 1
        } else {
          alertMap.set(wsId, { workspaceId: wsId, workspaceName: wsName, criticalCount: 1 })
        }
      }
    }

    return Array.from(alertMap.values()).filter(alert => alert.criticalCount >= 3)
  } catch (error) {
    console.error('Erro no motor de previsão:', error)
    return []
  }
}

// Cards com mais erros acumulados — usados na seção "Pontos cegos" do dashboard
export interface CriticalCard {
  id: string
  front: string
  lapses: number
  notes: {
    title: string | null
    workspace_id: string | null
  } | null
}

export async function getCriticalCards(): Promise<CriticalCard[]> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data, error } = await supabase
      .from('flashcards')
      .select('id, front, lapses, notes(title, workspace_id)')
      .eq('user_id', user.id)
      .gt('lapses', 0)
      .order('lapses', { ascending: false })
      .limit(5)

    if (error || !data) return []

    return data.map((card) => ({
      id: card.id,
      front: card.front,
      lapses: card.lapses,
      notes: Array.isArray(card.notes) ? card.notes[0] ?? null : card.notes ?? null,
    }))
  } catch (error) {
    console.error('Erro ao buscar cards críticos:', error)
    return []
  }
}

export async function getProfileStats() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado')

  // 1. Busca estatísticas do usuário (XP, Nível, Escudos, Conquistas)
  const userStats = await getUserStudyStats()

  // 2. Busca todos os logs de estudo diário para calcular streak recorde, contagem total de revisões e atividade recente
  const { data: logs } = await supabase
    .from('daily_study_logs')
    .select('study_date, review_count')
    .eq('user_id', user.id)
    .order('study_date', { ascending: true })

  let maxStreak = 0
  let currentStreak = 0
  let prevDate: Date | null = null
  let totalReviews = 0

  if (logs && logs.length > 0) {
    for (const log of logs) {
      totalReviews += log.review_count || 0
      const currentDate = new Date(log.study_date)
      currentDate.setHours(0, 0, 0, 0)
      
      if (!prevDate) {
        currentStreak = 1
      } else {
        const diffTime = Math.abs(currentDate.getTime() - prevDate.getTime())
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
        
        if (diffDays === 1) {
          currentStreak++
        } else if (diffDays > 1) {
          if (currentStreak > maxStreak) {
            maxStreak = currentStreak
          }
          currentStreak = 1
        }
      }
      prevDate = currentDate
    }
    if (currentStreak > maxStreak) {
      maxStreak = currentStreak
    }
  }

  // 3. Busca a contagem de notas criadas
  const { count: notesCount } = await supabase
    .from('notes')
    .select('id, workspaces!inner(user_id)', { count: 'exact', head: true })
    .eq('workspaces.user_id', user.id)

  // 4. Gera a atividade recente dos últimos 7 dias
  const last7Days = []
  const today = new Date()
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const dateStr = d.toISOString().split('T')[0]
    const matchingLog = logs?.find((log: any) => (log.study_date?.split('T')[0] || log.study_date) === dateStr)
    last7Days.push({
      date: new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: 'numeric' }).format(d),
      reviews: matchingLog?.review_count || 0
    })
  }

  return {
    user: {
      name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Estudante',
      email: user.email,
      avatarUrl: user.user_metadata?.avatar_url || null,
      avatarIcon: user.user_metadata?.avatar_icon || null,
      playerTitle: user.user_metadata?.player_title || 'Estudante Dedicado'
    },
    totalXp: userStats?.total_xp || 0,
    currentLevel: userStats?.current_level || 1,
    streakShields: userStats?.streak_shields || 0,
    streak: await getUserStreak(user.id),
    maxStreak: maxStreak,
    cardsReviewed: totalReviews,
    notesCreated: notesCount || 0,
    perfectExams: userStats?.perfect_exams_count || 0,
    unlockedAchievements: userStats?.unlocked_achievements || [],
    recentActivity: last7Days
  }
}

export async function getWeeklyLearningCycleReport() {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return { report: 'Não autenticado' }

  const todayStr = new Date().toISOString().split('T')[0]

  try {
    // 1. Verifica se já temos o relatório de hoje salvo no banco
    const { data: todayLog } = await supabase
      .from('daily_study_logs')
      .select('ai_report')
      .eq('user_id', user.id)
      .eq('study_date', todayStr)
      .maybeSingle()

    if (todayLog?.ai_report) {
      return { report: todayLog.ai_report }
    }

    // 2. Busca estatísticas dos flashcards
    const { data: flashcards } = await supabase
      .from('flashcards')
      .select(`
        stability, difficulty, lapses, reps,
        notes!inner(user_id, title)
      `)
      .eq('notes.user_id', user.id)

    if (!flashcards || flashcards.length === 0) {
      return { report: 'Ainda não há dados suficientes de flashcards para gerar o relatório de ciclo. Estude alguns cards primeiro!' }
    }

    const totalCards = flashcards.length
    const masteredCount = flashcards.filter(c => c.stability >= 15).length
    const lowRetentionCount = flashcards.filter(c => c.lapses >= 2 || c.stability < 3).length
    
    const topicLapses: Record<string, number> = {}
    flashcards.forEach(c => {
      const topicName = (c.notes as any)?.title || 'Estudos Gerais'
      topicLapses[topicName] = (topicLapses[topicName] || 0) + (c.lapses || 0)
    })
    const worstTopics = Object.entries(topicLapses)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(entry => `${entry[0]} (Lapsos: ${entry[1]})`)
      .join(', ')

    // 3. IA Llama 3
    const systemPrompt = `Você é um tutor inteligente e motivador (Coach do OmniMind). Seu objetivo é analisar as estatísticas de estudo semanais e gerar um relatório do Ciclo de Aprendizado resumido e motivador em exatamente 2 parágrafos no formato Markdown. Seja direto e encorajador. Fale diretamente com o estudante.`
    const userPrompt = `Aqui estão meus dados acumulados:
- Total de Cards: ${totalCards}
- Cards Consolidados (Stability >= 15d): ${masteredCount} (Taxa: ${Math.round((masteredCount/totalCards)*100)}%)
- Tópicos com dificuldade (Lapses >= 2 ou Stability < 3d): ${lowRetentionCount} cards
- Tópicos com maior recorrência de lapsos: ${worstTopics || 'Nenhum por enquanto'}

Escreva o relatório de ciclo em português. Não use títulos grandes, apenas quebras de parágrafo.`

    const result = await callAIWithFallback(systemPrompt, userPrompt, 'simple', false)

    if (!result.success) {
      throw new Error(result.error || 'Erro na resposta do modelo de IA')
    }

    const reportText = result.content || 'Não foi possível gerar o sumário semanal.'

    // 4. Salva o relatório no log de hoje
    await supabase
      .from('daily_study_logs')
      .upsert({
        user_id: user.id,
        study_date: todayStr,
        ai_report: reportText
      }, { onConflict: 'user_id,study_date' })

    return { report: reportText }

  } catch (error: any) {
    console.error('Erro ao gerar relatório de ciclo semanal:', error)
    return { report: `Não foi possível carregar seu relatório semanal agora. Erro: ${error.message}` }
  }
}
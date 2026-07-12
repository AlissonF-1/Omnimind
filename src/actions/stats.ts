'use server'

import { createClient } from '@/utils/supabase/server'

export async function getDailyStudyLogs() {
  const supabase = await createClient()
  
  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

  const { data, error } = await supabase
    .from('daily_study_logs')
    .select('study_date, review_count')
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
      .select('study_date')
      .eq('user_id', user.id)
      .order('study_date', { ascending: false })
      .limit(365)
  ])

  const totalCards = totalRes.count || 0
  const overdueCards = overdueRes.count || 0
  const neverLapsed = neverLapsedRes.count || 0
  const logs = logsRes.data

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

  const { data: notes } = await supabase
    .from('notes')
    .select('id')
    .eq('workspace_id', workspaceId)

  if (!notes) return {}

  const noteIds = notes.map(n => n.id)
  const { data: cards } = await supabase
    .from('flashcards')
    .select('note_id')
    .in('note_id', noteIds)

  const counts: Record<string, number> = {}
  notes.forEach(note => {
    counts[note.id] = cards?.filter(c => c.note_id === note.id).length ?? 0
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
'use server'

import { createClient } from '@/utils/supabase/server'
import { fsrs, Rating, Card as FSRSCard } from 'ts-fsrs'
import { revalidatePath } from 'next/cache'
import { checkAndUnlockAchievements, addXp, incrementQuestProgress, getUserStreak, getUserStudyStats } from '@/actions/achievements'
import { AchievementDetails, XP_CONFIG } from '@/types/achievements'
import { getDynamicDailyGoal } from '@/actions/calendar'

// Tipagem mais forte para o estado do card (vindo do banco)
interface FsrsCardState {
  due: string
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  reps: number
  lapses: number
  state: number
  last_review?: string | null
  learning_steps?: number
}

/**
 * Busca flashcards vencidos ou em modo Sprint, podendo filtrar por Workspace ou Nota específica.
 */
export async function getDueFlashcards(filters?: { workspaceId?: string; noteId?: string }) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (userError || !user) return []

  try {
    // 1. Busca workspaces em Sprint
    const { data: sprintWs } = await supabase
      .from('workspaces')
      .select('id')
      .eq('is_sprint_mode', true)
      .gte('sprint_date', new Date().toISOString())
      .eq('user_id', user.id)

    const sprintWsIds = sprintWs?.map(ws => ws.id) || []

    // 2. Busca workspaces ativos (não arquivados) de forma robusta
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

    if (activeWsIds.length === 0) return []

    // 3. Monta o filtro OR de forma otimizada para o Postgres
    const nowIso = new Date().toISOString()
    let orFilter = `due.is.null,state.eq.0,state.is.null,due.lte.${nowIso}`

    if (sprintWsIds.length > 0) {
      orFilter += `,notes.workspace_id.in.(${sprintWsIds.join(',')})`
    }

    // 4. Query principal otimizada (filtros aplicados diretamente no banco de dados)
    let query = supabase
      .from('flashcards')
      .select(`
        *,
        notes!inner (
          id, title, content, workspace_id, user_id  
        )
      `)
      .eq('notes.user_id', user.id)
      .in('notes.workspace_id', activeWsIds)
      .or(orFilter)

    if (filters?.noteId) {
      query = query.eq('note_id', filters.noteId)
    } else if (filters?.workspaceId) {
      query = query.eq('notes.workspace_id', filters.workspaceId)
    }

    const { data, error } = await query

    if (error || !data) return []

    const now = new Date().getTime()
    const dueCards = data.filter((card: any) => {
      if (!card.due || card.state === 0 || card.state === null) return true
      
      const isDue = new Date(card.due).getTime() <= now
      const isSprint = sprintWsIds.includes(card.notes.workspace_id)
      
      return isDue || isSprint
    })

    // Ordena por due (cards mais antigos/urgentes primeiro, cards novos no final)
    dueCards.sort((a: any, b: any) => {
      const timeA = a.due ? new Date(a.due).getTime() : 0
      const timeB = b.due ? new Date(b.due).getTime() : 0
      return timeA - timeB
    })

    return dueCards
  } catch (error) {
    console.error('[getDueFlashcards] Erro inesperado:', error)
    return []
  }
}

/**
 * Submete uma revisão de flashcard usando FSRS
 */
export async function submitReview(
  cardId: string,
  currentFsrsState: FsrsCardState,
  grade: Rating
): Promise<{ success?: boolean; error?: string; newlyUnlocked?: AchievementDetails[]; leveledUp?: { oldLevel: number; newLevel: number } | null; earnedDisciplineBadge?: boolean }> {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (userError || !user) {
    console.error('[submitReview] Usuário não autenticado:', userError)
    return { error: 'Usuário não autenticado' }
  }

  // Validação básica dos dados
  if (!cardId) return { error: 'ID do flashcard inválido' }
  if (!currentFsrsState) return { error: 'Estado do flashcard inválido' }

  try {
    // 1. Verifica se o flashcard pertence ao usuário
    const { data: card, error: cardError } = await supabase
      .from('flashcards')
      .select('id, note_id')
      .eq('id', cardId)
      .single()

    if (cardError || !card) {
      console.error('[submitReview] Flashcard não encontrado:', cardError)
      return { error: 'Flashcard não encontrado' }
    }

    // Verifica se o flashcard está em uma nota do usuário
    const { data: note, error: noteError } = await supabase
      .from('notes')
      .select('user_id')
      .eq('id', card.note_id)
      .single()

    if (noteError || !note || note.user_id !== user.id) {
      console.error('[submitReview] Acesso negado ao flashcard.')
      return { error: 'Acesso negado' }
    }

    // 2. Processa com FSRS
    const f = fsrs()
    const cardState: FSRSCard = {
      due: new Date(currentFsrsState.due),
      stability: currentFsrsState.stability,
      difficulty: currentFsrsState.difficulty,
      elapsed_days: currentFsrsState.elapsed_days,
      scheduled_days: currentFsrsState.scheduled_days,
      reps: currentFsrsState.reps,
      lapses: currentFsrsState.lapses,
      state: currentFsrsState.state,
      last_review: currentFsrsState.last_review ? new Date(currentFsrsState.last_review) : undefined,
      learning_steps: currentFsrsState.learning_steps || 0,
    }

    const validGrade = grade as 1 | 2 | 3 | 4
    const schedulingCards = f.repeat(cardState, new Date())
    const nextCardState = schedulingCards[validGrade].card

    // 3. Atualiza no banco
    const { error: updateError } = await supabase
      .from('flashcards')
      .update({
        due: nextCardState.due.toISOString(),
        stability: nextCardState.stability,
        difficulty: nextCardState.difficulty,
        elapsed_days: nextCardState.elapsed_days,
        scheduled_days: nextCardState.scheduled_days,
        reps: nextCardState.reps,
        lapses: nextCardState.lapses,
        state: nextCardState.state,
        updated_at: new Date().toISOString(),
      })
      .eq('id', cardId)

    if (updateError) {
      console.error('[submitReview] Erro ao atualizar flashcard:', updateError)
      return { error: `Erro ao salvar revisão: ${updateError.message}` }
    }

    // 4. Incrementa log de estudo (assíncrono, não bloquear)
    const { error: rpcError } = await supabase.rpc('increment_study_log', { p_user_id: user.id })
    if (rpcError) {
      console.error('[submitReview] Erro ao atualizar log de estudo (não crítico):', rpcError)
      // Não falha a operação principal
    }

    // 4.1. Verifica e atualiza estatísticas de gamificação (XP, Quests e Escudo)
    let levelUpData = null
    let earnedDisciplineBadge = false
    try {
      // Multiplicador FSRS-XP
      let xpAwarded = XP_CONFIG.REVIEW_CARD // Padrão: 10
      if (currentFsrsState.due) {
        const dueDate = new Date(currentFsrsState.due)
        const dueDay = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate())
        const today = new Date()
        const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())

        const diffTime = todayDay.getTime() - dueDay.getTime()
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))

        if (diffDays === -1 || diffDays === 0 || diffDays === 1) {
          xpAwarded = 15
          earnedDisciplineBadge = true
        } else if (diffDays > 3 || diffDays < -3) {
          xpAwarded = 5
        }
      }

      // Adiciona XP calculado
      const xpRes = await addXp(xpAwarded)
      if (xpRes?.leveledUp) {
        levelUpData = { oldLevel: xpRes.oldLevel, newLevel: xpRes.newLevel }
      }

      // Incrementa progresso da quest "Guerreiro do Dia"
      const questRes = await incrementQuestProgress('guerreiro', 1)
      if (questRes?.leveledUp?.leveledUp) {
        levelUpData = { oldLevel: questRes.leveledUp.oldLevel, newLevel: questRes.leveledUp.newLevel }
      }

      const todayStr = new Date().toISOString().split('T')[0]
      const { data: logToday } = await supabase
        .from('daily_study_logs')
        .select('review_count')
        .eq('user_id', user.id)
        .eq('study_date', todayStr)
        .maybeSingle()

      if (logToday) {
        const reviewCount = logToday.review_count

        // Busca meta dinâmica do calendário
        const { goal: dynamicGoal } = await getDynamicDailyGoal()

        // Se completou a meta diária dinâmica, marca no stats
        if (reviewCount >= dynamicGoal) {
          await supabase
            .from('user_study_stats')
            .update({ daily_goal_completed: true })
            .eq('user_id', user.id)
        }

        // Se for a primeira revisão do dia, calcula a streak e atualiza
        if (reviewCount === 1) {
          await getUserStreak(user.id)
        }
      }
    } catch (goalErr) {
      console.error('[submitReview] Erro ao processar gamificação e meta diária:', goalErr)
    }

    // 5. Revalida paths
    revalidatePath('/dashboard/revisoes')
    revalidatePath('/dashboard')
    // Pode revalidar também o workspace específico? Vamos buscar workspace_id da nota
    const { data: wsData } = await supabase
      .from('notes')
      .select('workspace_id')
      .eq('id', card.note_id)
      .single()
    if (wsData?.workspace_id) {
      revalidatePath(`/dashboard/${wsData.workspace_id}`)
    }

    // 6. Roda a checagem de conquistas após as atualizações de estudos
    const newlyUnlocked = await checkAndUnlockAchievements()

    return { success: true, newlyUnlocked, leveledUp: levelUpData, earnedDisciplineBadge }
  } catch (error) {
    console.error('[submitReview] Erro inesperado:', error)
    return { error: error instanceof Error ? error.message : 'Erro interno no processamento' }
  }
}
'use server'

import { createClient } from '@/utils/supabase/server'
import { fsrs, Rating, Card as FSRSCard } from 'ts-fsrs'
import { revalidatePath } from 'next/cache'
import { checkAndUnlockAchievements, addXp, incrementQuestProgress, getUserStreak, getUserStudyStats, grantSpecificAchievement } from '@/actions/achievements'
import { AchievementDetails, XP_CONFIG } from '@/types/achievements'
import { getDynamicDailyGoal } from '@/actions/calendar'

// Helper para obter a data local (Brasil) no formato YYYY-MM-DD
function getLocalISODate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { 
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date)
}

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
  grade: Rating,
  comboCount: number = 0
): Promise<{ 
  success?: boolean; 
  error?: string; 
  newlyUnlocked?: AchievementDetails[]; 
  leveledUp?: { oldLevel: number; newLevel: number } | null; 
  earnedDisciplineBadge?: boolean;
  masteryLevelUp?: { oldLevel: number; newLevel: number; workspaceName: string } | null;
}> {
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
      .select('user_id, workspace_id, workspaces(name, mastery_level, mastery_xp)')
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
    const workspaceName = (note as any).workspaces?.name || 'Estudos Gerais'
    const isCorrect = grade === Rating.Good || grade === Rating.Easy
    const { error: rpcError } = await supabase.rpc('increment_study_log', { 
      p_user_id: user.id, 
      p_topic: workspaceName,
      p_is_correct: isCorrect
    })
    if (rpcError) {
      console.error('[submitReview] Erro ao atualizar log de estudo (não crítico):', rpcError)
      // Não falha a operação principal
    }

    // 4.1. Verifica e atualiza estatísticas de gamificação (XP, Quests e Escudo)
    let levelUpData = null
    let earnedDisciplineBadge = false
    const timeAchievements: any[] = []
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

      // Aplica multiplicador do Combo de Precisão ("Pegada do Mestre")
      if (comboCount >= 10) {
        xpAwarded = xpAwarded * 3
      } else if (comboCount >= 5) {
        xpAwarded = xpAwarded * 2
      }

      // Adiciona XP calculado
      const xpRes = await addXp(xpAwarded)
      if (xpRes?.leveledUp) {
        levelUpData = { oldLevel: xpRes.oldLevel, newLevel: xpRes.newLevel }
      }

      const questRes = await incrementQuestProgress('guerreiro', 1)
      if (questRes?.leveledUp?.leveledUp) {
        levelUpData = { oldLevel: questRes.leveledUp.oldLevel, newLevel: questRes.leveledUp.newLevel }
      }

      // Verificação de Conquistas de Horário
      const now = new Date()
      // Pegar a hora local (São Paulo)
      const saoPauloTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
      const hour = saoPauloTime.getHours()
      
      if (hour >= 4 && hour < 7) {
        const ach = await grantSpecificAchievement('passaro_madrugador')
        if (ach) timeAchievements.push(ach)
      } else if (hour >= 0 && hour < 4) {
        const ach = await grantSpecificAchievement('coruja_noturna')
        if (ach) timeAchievements.push(ach)
      }

      const todayStr = getLocalISODate(new Date())
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

    // 4.2. Lógica do Domínio/Maestria do Workspace
    let masteryLevelUp = null
    try {
      if (note && note.workspaces && note.workspace_id) {
        const currentLevel = (note.workspaces as any).mastery_level || 1
        const currentXp = (note.workspaces as any).mastery_xp || 0
        
        let masteryXpGain = 5
        if (isCorrect) {
          if (currentFsrsState.due) {
            const dueDate = new Date(currentFsrsState.due)
            const dueDay = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate())
            const today = new Date()
            const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
            const diffTime = todayDay.getTime() - dueDay.getTime()
            const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))
            
            if (diffDays === -1 || diffDays === 0 || diffDays === 1) {
              masteryXpGain = 10
            }
          }
        } else {
          masteryXpGain = -1
        }

        const newXp = Math.max(0, currentXp + masteryXpGain)
        const newLevel = Math.min(10, Math.floor(newXp / 100) + 1)

        // Se subiu de nível, salva
        if (newLevel !== currentLevel) {
          masteryLevelUp = {
            oldLevel: currentLevel,
            newLevel: newLevel,
            workspaceName: (note.workspaces as any).name || 'Matéria'
          }
          
          // Se chegou ao nível máximo 10 (Patriarca), atualiza título global do usuário
          if (newLevel === 10) {
            const workspaceName = (note.workspaces as any).name || 'Matéria'
            await supabase.auth.updateUser({
              data: { player_title: `Patriarca de ${workspaceName}` }
            })
          }
        }

        // Atualiza no banco com RLS/coluna fallback silenciosa
        await supabase
          .from('workspaces')
          .update({
            mastery_level: newLevel,
            mastery_xp: newXp
          })
          .eq('id', note.workspace_id)
      }
    } catch (masteryErr) {
      console.warn('[submitReview] Erro ao atualizar maestria (pode ser que as colunas da migration não estejam criadas na nuvem ainda):', masteryErr)
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
    const allNewlyUnlocked = [...newlyUnlocked, ...timeAchievements]

    return { success: true, newlyUnlocked: allNewlyUnlocked, leveledUp: levelUpData, earnedDisciplineBadge, masteryLevelUp }
  } catch (error) {
    console.error('[submitReview] Erro inesperado:', error)
    return { error: error instanceof Error ? error.message : 'Erro interno no processamento' }
  }
}

/**
 * Busca todos os flashcards do usuário (novos, vencidos ou vencendo nos próximos 15 dias)
 * e os ordena por estabilidade (stability) crescente (menor estabilidade primeiro).
 */
export async function getUltimatumCards(filters?: { workspaceId?: string }) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (userError || !user) return []

  try {
    // 1. Busca todos os workspaces ativos do usuário
    const { data: activeWs } = await supabase
      .from('workspaces')
      .select('id')
      .eq('is_archived', false)
      .eq('user_id', user.id)

    const activeWsIds = activeWs?.map(w => w.id) || []
    if (activeWsIds.length === 0) return []

    // 2. Calcula data limite de 15 dias no futuro
    const fifteenDaysFromNow = new Date()
    fifteenDaysFromNow.setDate(fifteenDaysFromNow.getDate() + 15)
    const limitIso = fifteenDaysFromNow.toISOString()

    // 3. Query principal: cards sem data de vencimento OR vencidos OR vencendo nos próximos 15 dias
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
      .or(`due.is.null,state.eq.0,state.is.null,due.lte.${limitIso}`)

    if (filters?.workspaceId) {
      query = query.eq('notes.workspace_id', filters.workspaceId)
    }

    const { data, error } = await query

    if (error || !data) return []

    // 4. Ordena por estabilidade crescente (stability menor primeiro)
    const sorted = [...data]
    sorted.sort((a: any, b: any) => {
      const stabA = a.stability !== undefined && a.stability !== null ? a.stability : 0
      const stabB = b.stability !== undefined && b.stability !== null ? b.stability : 0
      return stabA - stabB
    })

    return sorted
  } catch (error) {
    console.error('[getUltimatumCards] Erro inesperado:', error)
    return []
  }
}
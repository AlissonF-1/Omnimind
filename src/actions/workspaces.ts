'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function getWorkspaces() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('workspaces')
    .select('id, name, description, is_archived')
    .order('created_at', { ascending: false })

  if (error) {
    console.warn('Erro ao buscar workspaces com is_archived:', error)
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('workspaces')
      .select('id, name, description')
      .order('created_at', { ascending: false })

    if (fallbackError) {
      console.error('Erro ao buscar workspaces:', fallbackError)
      return []
    }

    return (fallbackData ?? []).map((workspace: any) => ({
      ...workspace,
      is_archived: false,
    }))
  }

  return data
}

export async function getWorkspaceById(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('workspaces')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return null
  return data
}

export async function createWorkspace(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) throw new Error('Usuário não autenticado')

  const name = formData.get('name') as string
  const description = formData.get('description') as string

  if (!name || name.trim() === '') return { error: 'O nome é obrigatório' }

  const { error } = await supabase.from('workspaces').insert({
    user_id: user.id,
    name: name.trim(),
    description: description.trim() || null,
    is_archived: false,
  })

  if (error) return { error: error.message }

  revalidatePath('/dashboard')
  return { success: true }
}

export async function updateWorkspace(id: string, formData: FormData) {
  const supabase = await createClient()
  const name = formData.get('name') as string
  const description = formData.get('description') as string

  if (!name || name.trim() === '') return { error: 'O nome é obrigatório' }

  const { data, error } = await supabase
    .from('workspaces')
    .update({
      name: name.trim(),
      description: description.trim() || null,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return { error: error.message }

  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/${id}`)
  return { success: true, workspace: data }
}

export async function archiveWorkspace(id: string, archive: boolean) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('workspaces')
    .update({ is_archived: archive })
    .eq('id', id)
    .select()
    .single()

  if (error) return { error: error.message }

  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/${id}`)
  return { success: true, workspace: data }
}

export async function deleteWorkspace(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('workspaces')
    .delete()
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard')
  return { success: true }
}

export async function toggleSprintMode(workspaceId: string, isSprint: boolean, sprintDate: string | null) {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('workspaces')
    .update({
      is_sprint_mode: isSprint,
      sprint_date: sprintDate
    })
    .eq('id', workspaceId)

  if (error) throw new Error(error.message)

  revalidatePath(`/dashboard/${workspaceId}`)
  revalidatePath('/dashboard/revisoes')
  return { success: true }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
}

export async function getWorkspacesHealth(): Promise<Array<{
  id: string
  name: string
  description: string | null
  score: number
  status: 'green' | 'yellow' | 'red'
  totalCards: number
  reviewedCards: number
}>> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    // 1. Busca todos os workspaces ativos do usuário
    const { data: workspaces, error: wsErr } = await supabase
      .from('workspaces')
      .select('id, name, description')
      .eq('user_id', user.id)
      .eq('is_archived', false)

    if (wsErr || !workspaces) {
      console.error('Erro ao buscar workspaces para health:', wsErr)
      return []
    }

    // 2. Busca todos os flashcards do usuário com o workspace_id correspondente
    const { data: cards, error: cardsErr } = await supabase
      .from('flashcards')
      .select('reps, lapses, notes!inner(workspace_id)')
      .eq('user_id', user.id)

    if (cardsErr) {
      console.error('Erro ao buscar cards para health:', cardsErr)
      return workspaces.map(w => ({
        id: w.id,
        name: w.name,
        description: w.description,
        score: 100,
        status: 'green',
        totalCards: 0,
        reviewedCards: 0
      }))
    }

    // 3. Agrupa os cards por workspace_id
    const cardsByWorkspace: Record<string, typeof cards> = {}
    for (const card of cards || []) {
      const wsId = (card.notes as any)?.workspace_id
      if (wsId) {
        if (!cardsByWorkspace[wsId]) {
          cardsByWorkspace[wsId] = []
        }
        cardsByWorkspace[wsId].push(card)
      }
    }

    // 4. Calcula o score de saúde de cada workspace
    return workspaces.map(workspace => {
      const wsCards = cardsByWorkspace[workspace.id] || []
      const totalCards = wsCards.length
      
      let reviewedCards = 0
      let totalCorrectness = 0

      for (const card of wsCards) {
        if (card.reps && card.reps > 0) {
          reviewedCards++
          const cardCorrectness = Math.max(0, Math.min(1, (card.reps - (card.lapses || 0)) / card.reps))
          totalCorrectness += cardCorrectness
        }
      }

      const score = reviewedCards > 0 
        ? Math.round((totalCorrectness / reviewedCards) * 100) 
        : 100 // 100% por padrão se não houver revisões realizadas

      let status: 'green' | 'yellow' | 'red' = 'green'
      if (score < 65) {
        status = 'red'
      } else if (score < 85) {
        status = 'yellow'
      }

      return {
        id: workspace.id,
        name: workspace.name,
        description: workspace.description,
        score,
        status,
        totalCards,
        reviewedCards
      }
    })
  } catch (err) {
    console.error('Erro em getWorkspacesHealth:', err)
    return []
  }
}
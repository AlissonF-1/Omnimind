'use server'

import { createClient } from '@/utils/supabase/server'
import { UserPreferences, DEFAULT_PREFERENCES } from '@/types/settings'
import { revalidatePath } from 'next/cache'

export async function getUserPreferences(): Promise<UserPreferences> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    console.error('Error fetching preferences:', error)
    return { ...DEFAULT_PREFERENCES, user_id: user.id }
  }

  if (!data) {
    // Inicializa as preferências
    const { data: newPrefs, error: insertError } = await supabase
      .from('user_preferences')
      .insert({
        user_id: user.id,
        ...DEFAULT_PREFERENCES
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error creating default preferences:', insertError)
      return { ...DEFAULT_PREFERENCES, user_id: user.id }
    }
    return newPrefs as UserPreferences
  }

  return { ...DEFAULT_PREFERENCES, ...data } as UserPreferences
}

export async function updateUserPreferences(updates: Partial<Omit<UserPreferences, 'user_id' | 'updated_at'>>) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('user_preferences')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    console.error('Error updating preferences:', error)
    throw new Error('Falha ao atualizar preferências')
  }
  
  revalidatePath('/dashboard', 'layout')
  return data
}

export async function exportUserData() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Exportar anotações, flashcards e dados do usuário
  const [workspaces, notes, flashcards, stats] = await Promise.all([
    supabase.from('workspaces').select('*').eq('user_id', user.id),
    supabase.from('notes').select('*'), // RLs garante apenas as do usuário
    supabase.from('flashcards').select('*'), // RLS
    supabase.from('user_study_stats').select('*').eq('user_id', user.id).maybeSingle()
  ])

  const exportData = {
    exportDate: new Date().toISOString(),
    userStats: stats.data || {},
    workspaces: workspaces.data || [],
    notes: notes.data || [],
    flashcards: flashcards.data || []
  }

  return JSON.stringify(exportData, null, 2)
}

export async function deleteAllUserData(confirmationText: string) {
  if (confirmationText !== 'CONCORDO EM APAGAR TUDO') {
    throw new Error('Confirmação incorreta')
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  try {
    // 1. Gera backup ANTES de deletar
    const backupJson = await exportUserData()

    // 2. Busca os workspaces do usuário para deletar as notas em segurança
    const { data: userWorkspaces } = await supabase
      .from('workspaces').select('id').eq('user_id', user.id)
    const wsIds = userWorkspaces?.map(w => w.id) || []

    // 3. Deleta das tabelas independentes em paralelo
    await Promise.all([
      supabase.from('review_logs').delete().eq('user_id', user.id),
      supabase.from('daily_study_logs').delete().eq('user_id', user.id),
      supabase.from('exam_goals').delete().eq('user_id', user.id),
      supabase.from('user_study_stats').delete().eq('user_id', user.id),
      supabase.from('user_preferences').delete().eq('user_id', user.id)
    ])

    // 4. Deleta dependentes sequencialmente
    await supabase.from('flashcards').delete().eq('user_id', user.id)
    
    if (wsIds.length > 0) {
      await supabase.from('notes').delete().in('workspace_id', wsIds)
    }
    
    await supabase.from('workspaces').delete().eq('user_id', user.id)
    
    // 5. Retorna o backup para o cliente
    return { success: true, backupJson }
  } catch (error) {
    console.error('Error deleting data:', error)
    throw new Error('Falha ao apagar dados')
  }
}

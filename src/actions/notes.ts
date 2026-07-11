'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { indexNote } from '@/actions/embeddings'

export async function getNotes(workspaceId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    console.error('[getNotes] Usuário não autenticado.')
    return []
  }

  const { data: workspace, error: workspaceError } = await supabase
    .from('workspaces')
    .select('id')
    .eq('id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (workspaceError || !workspace) {
    console.error('[getNotes] Workspace não encontrado ou sem permissão:', workspaceError)
    return []
  }

  // IMPORTANTE: Adicionado a coluna 'topic' no select
  const { data, error } = await supabase
    .from('notes')
    .select('id, title, updated_at, topic')
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('[getNotes] Erro ao buscar notas:', error)
    return []
  }

  return data
}

export async function getNoteById(noteId: string, workspaceId?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    console.error('[getNoteById] Usuário não autenticado.')
    return null
  }

  let query = supabase
    .from('notes')
    .select('*')
    .eq('id', noteId)

  if (workspaceId) {
    query = query.eq('workspace_id', workspaceId)
  }

  const { data, error } = await query.single()

  if (error) {
    console.error('[getNoteById] Erro ao buscar nota:', error)
    return null
  }

  if (data.user_id !== user.id) {
    console.error('[getNoteById] Usuário não tem permissão para acessar esta nota.')
    return null
  }

  return data
}

export async function createNote(workspaceId: string) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (userError || !user) {
    console.error('[createNote] Usuário não autenticado.')
    throw new Error('Não autenticado')
  }

  const { data: workspace, error: workspaceError } = await supabase
    .from('workspaces')
    .select('id')
    .eq('id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (workspaceError || !workspace) {
    console.error('[createNote] Workspace não encontrado ou sem permissão:', workspaceError)
    throw new Error('Workspace não encontrado ou acesso negado.')
  }

  const { data, error } = await supabase
    .from('notes')
    .insert({
      user_id: user.id,
      workspace_id: workspaceId,
      title: 'Nova Anotação',
      content: '',
      topic: 'Geral' // Definindo tópico padrão na criação
    })
    .select('id')
    .single()

  if (error) {
    console.error('[createNote] Erro ao criar nota:', error)
    throw new Error(`Erro ao criar nota: ${error.message}`)
  }

  revalidatePath(`/dashboard/${workspaceId}`)
  revalidatePath(`/dashboard/${workspaceId}/note/${data.id}`)

  return data.id
}

export async function updateNote(noteId: string, title: string, content: string) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (userError || !user) return { error: 'Não autenticado' }

  const { data: existingNote, error: fetchError } = await supabase
    .from('notes')
    .select('id, user_id, workspace_id')
    .eq('id', noteId)
    .single()

  if (fetchError || !existingNote) return { error: 'Nota não encontrada' }
  if (existingNote.user_id !== user.id) return { error: 'Acesso negado' }

  const trimmedTitle = title?.trim() || 'Sem título'
  const trimmedContent = content || ''

  const { error: updateError } = await supabase
    .from('notes')
    .update({
      title: trimmedTitle,
      content: trimmedContent,
      updated_at: new Date().toISOString(),
    })
    .eq('id', noteId)

  if (updateError) {
    console.error('[updateNote] Erro ao atualizar:', updateError)
    return { error: `Erro ao atualizar nota: ${updateError.message}` }
  }

  revalidatePath(`/dashboard/${existingNote.workspace_id}`)
  revalidatePath(`/dashboard/${existingNote.workspace_id}/note/${noteId}`)

  indexNote(noteId, trimmedTitle, trimmedContent).catch((err) => {
    console.error('[updateNote] Falha na indexação assíncrona:', err)
  })

  return { success: true }
}

// ============================================================================
// NOVAS ACTIONS: Operações granulares para o WorkspaceNotesGrid
// ============================================================================

export async function updateNoteTitle(noteId: string, newTitle: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado')

  const trimmedTitle = newTitle.trim() || 'Sem título'

  const { data: note, error: fetchError } = await supabase
    .from('notes')
    .select('workspace_id, user_id')
    .eq('id', noteId)
    .single()

  if (fetchError || note?.user_id !== user.id) throw new Error('Acesso negado ou nota inexistente')

  const { error } = await supabase
    .from('notes')
    .update({ 
      title: trimmedTitle,
      updated_at: new Date().toISOString() 
    })
    .eq('id', noteId)

  if (error) throw new Error(error.message)

  revalidatePath(`/dashboard/${note.workspace_id}`)
  return { success: true }
}

export async function updateNoteTopic(noteId: string, topic: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado')

  const trimmedTopic = topic.trim() || 'Geral'

  const { data: note, error: fetchError } = await supabase
    .from('notes')
    .select('workspace_id, user_id')
    .eq('id', noteId)
    .single()

  if (fetchError || note?.user_id !== user.id) throw new Error('Acesso negado ou nota inexistente')

  const { error } = await supabase
    .from('notes')
    .update({ 
      topic: trimmedTopic,
      updated_at: new Date().toISOString() 
    })
    .eq('id', noteId)

  if (error) throw new Error(error.message)

  revalidatePath(`/dashboard/${note.workspace_id}`)
  return { success: true }
}

export async function deleteNote(noteId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado')

  // Precisamos do workspace_id ANTES de deletar para revalidar a rota
  const { data: note, error: fetchError } = await supabase
    .from('notes')
    .select('workspace_id, user_id')
    .eq('id', noteId)
    .single()

  if (fetchError || note?.user_id !== user.id) throw new Error('Acesso negado ou nota inexistente')

  const { error } = await supabase
    .from('notes')
    .delete()
    .eq('id', noteId)

  if (error) throw new Error(error.message)

  revalidatePath(`/dashboard/${note.workspace_id}`)
  return { success: true }
}

export async function updateNoteContent(noteId: string, content: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { data: note, error: fetchError } = await supabase
    .from('notes')
    .select('workspace_id, user_id')
    .eq('id', noteId)
    .single()

  if (fetchError || note?.user_id !== user.id) return { error: 'Acesso negado' }

  const { error: updateError } = await supabase
    .from('notes')
    .update({ 
      content: content || '', 
      updated_at: new Date().toISOString() 
    })
    .eq('id', noteId)

  if (updateError) return { error: updateError.message }

  // Revalida a página da nota para refletir as mudanças
  revalidatePath(`/dashboard/${note.workspace_id}/note/${noteId}`)
  return { success: true }
}
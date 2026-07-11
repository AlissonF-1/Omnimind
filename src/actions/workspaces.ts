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
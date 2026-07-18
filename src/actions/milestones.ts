'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export type JourneyMilestone = {
  id: string
  user_id: string
  title: string
  milestone_date: string
  type: string
  created_at: string
}

export async function addMilestone(title: string, type: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  try {
    const { data, error } = await supabase
      .from('journey_milestones')
      .insert({
        user_id: user.id,
        title,
        type
      })
      .select()
      .single()

    if (error) {
      console.warn('[addMilestone] Erro ao inserir marco (pode ser que as tabelas de migração não estejam criadas ainda):', error)
      return null
    }

    revalidatePath('/dashboard/conquistas')
    return data
  } catch (err) {
    console.error('[addMilestone] Erro inesperado:', err)
    return null
  }
}

export async function getMilestones(): Promise<JourneyMilestone[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  try {
    const { data, error } = await supabase
      .from('journey_milestones')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.warn('[getMilestones] Erro ao obter marcos (pode ser que as tabelas de migração não estejam criadas ainda):', error)
      return []
    }

    return data ?? []
  } catch (err) {
    console.error('[getMilestones] Erro inesperado:', err)
    return []
  }
}

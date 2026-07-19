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
      console.warn('[addMilestone] Erro ao inserir marco:', error)
      return null
    }

    revalidatePath('/dashboard/conquistas')
    return data
  } catch (err) {
    console.error('[addMilestone] Erro inesperado:', err)
    return null
  }
}

export async function getMilestones(typeFilter?: string): Promise<JourneyMilestone[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  try {
    let query = supabase
      .from('journey_milestones')
      .select('*')
      .eq('user_id', user.id)
      .order('milestone_date', { ascending: false })

    if (typeFilter && typeFilter !== 'all') {
      query = query.eq('type', typeFilter)
    }

    const { data, error } = await query

    if (error) {
      console.warn('[getMilestones] Erro ao obter marcos:', error)
      return []
    }

    return data ?? []
  } catch (err) {
    console.error('[getMilestones] Erro inesperado:', err)
    return []
  }
}

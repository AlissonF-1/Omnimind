import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Usuário não autenticado' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('workspaces')
      .select('id, name')
      .eq('user_id', user.id)
      .order('name', { ascending: true })

    if (error) throw error

    // ✅ Correção: Se data for null, retorna um array vazio [] em vez de null
    return NextResponse.json({ workspaces: data || [] })
  } catch (error: any) {
    console.error('Erro no Clipper Workspaces:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
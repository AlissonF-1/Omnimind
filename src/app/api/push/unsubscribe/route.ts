import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

export async function DELETE(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Usuário não autenticado.' }, { status: 401 })
    }

    const { endpoint } = await req.json()

    if (!endpoint) {
      // Se não vier endpoint, remove todas as subscriptions do usuário
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', user.id)
    } else {
      // Remove apenas a subscription com o endpoint específico
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', user.id)
        .contains('subscription', { endpoint })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Erro na rota api/push/unsubscribe:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

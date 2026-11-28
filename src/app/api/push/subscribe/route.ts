import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { parsePushSubscription } from '@/lib/push/subscription'

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Usuário não autenticado.' }, { status: 401 })
    }

    const { subscription: raw } = (await req.json().catch(() => null)) ?? {}
    const subscription = parsePushSubscription(raw)

    if (!subscription) {
      return NextResponse.json({ error: 'Assinatura inválida.' }, { status: 400 })
    }

    // Salva a assinatura usando upsert para evitar chaves duplicadas
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: user.id,
          subscription: subscription,
        },
        { onConflict: 'user_id,endpoint' }
      )

    if (error) {
      console.error('Erro ao salvar inscrição push no Supabase:', error.code)
      return NextResponse.json({ error: 'Não foi possível salvar a assinatura.' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Erro na rota api/push/subscribe:', error)
    return NextResponse.json({ error: 'Não foi possível salvar a assinatura.' }, { status: 500 })
  }
}

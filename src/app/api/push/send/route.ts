import { createHash, timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { parsePushSubscription } from '@/lib/push/subscription'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

type ScheduledTarget = {
  subscription: unknown
  due_count: number
  workspace_id: string | null
  streak: number
  daily_goal: number
}

function authorized(request: Request, secret: string) {
  const candidate = request.headers.get('authorization')
  if (!candidate?.startsWith('Bearer ')) return false
  const digest = (value: string) => createHash('sha256').update(value).digest()
  return timingSafeEqual(digest(candidate.slice(7)), digest(secret))
}

function notification(target: ScheduledTarget) {
  const hasDueCards = target.due_count > 0
  const path = hasDueCards ? '/dashboard/revisoes' : '/dashboard'
  const url = new URL(path, process.env.NEXT_PUBLIC_SITE_URL || 'https://omnimind-tau.vercel.app')
  if (hasDueCards && target.workspace_id) url.searchParams.set('workspaceId', target.workspace_id)

  let body: string
  if (!hasDueCards) {
    body = target.streak > 0
      ? 'Você está em dia há ' + target.streak + ' dia(s). Que tal criar uma nova nota?'
      : 'Suas revisões estão em dia. Que tal explorar suas notas?'
  } else if (target.streak >= 3 && target.daily_goal > target.due_count) {
    body = 'Você está com ' + target.streak + ' dias de sequência! Faltam ' +
      (target.daily_goal - target.due_count) + ' cards para a meta do dia.'
  } else {
    body = target.due_count === 1 ? 'Você tem 1 card pendente para revisar.' :
      'Você tem ' + target.due_count + ' cards pendentes para revisar.'
  }

  return JSON.stringify({
    title: hasDueCards ? '🔥 Hora de Estudo OmniMind!' : '✨ Suas revisões estão em dia!',
    body, icon: '/icon-transparent-192.png?v=2', badge: '/notification-badge.png?v=2', data: { url: url.href },
    actions: hasDueCards ? [
      { action: 'review-now', title: '✅ Revisar agora' },
      { action: 'snooze-1h', title: '⏰ Lembrar em 1h' },
    ] : [{ action: 'open-app', title: '🚀 Abrir OmniMind' }],
  })
}

function result(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
}

async function handleSend(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || !authorized(request, cronSecret)) return result({ error: 'Não autorizado.' }, 401)

  const token = process.env.PUSH_DB_TOKEN
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!token || !/^[0-9a-f]{64}$/.test(token) || !url || !anonKey || !publicKey || !privateKey) {
    return result({ error: 'Agendamento de Push indisponível.' }, 503)
  }

  try {
    const db = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await db.rpc('get_scheduled_push_targets', { p_token: token })
      .abortSignal(AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]))
    if (error || !Array.isArray(data)) return result({ error: 'Agendamento de Push indisponível.' }, 503)

    let notifiedCount = 0
    let errorCount = 0
    webpush.setVapidDetails('mailto:suporte@omnimind.com', publicKey, privateKey)
    const targets = data as ScheduledTarget[]
    for (let offset = 0; offset < targets.length; offset += 5) {
      const batch = await Promise.allSettled(targets.slice(offset, offset + 5).map(async (target) => {
        const subscription = parsePushSubscription(target.subscription)
        if (!subscription) throw new Error('Invalid subscription')
        await webpush.sendNotification(subscription, notification(target), { timeout: 7000 })
      }))
      for (const entry of batch) {
        if (entry.status === 'fulfilled') notifiedCount++
        else errorCount++
      }
    }
    return result({ success: errorCount === 0, notifiedCount, errorCount })
  } catch {
    return result({ error: 'Agendamento de Push indisponível.' }, 503)
  }
}

export async function POST(request: Request) { return handleSend(request) }
export async function GET(request: Request) { return handleSend(request) }

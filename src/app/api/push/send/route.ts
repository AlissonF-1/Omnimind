import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import webpush from 'web-push'

// Configura o web-push com as chaves VAPID
const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
const privateKey = process.env.VAPID_PRIVATE_KEY || ''

if (publicKey && privateKey) {
  webpush.setVapidDetails(
    'mailto:suporte@omnimind.com',
    publicKey,
    privateKey
  )
}

// Helper para calcular a contagem de cards pendentes para um usuário específico (bypassing auth session checks)
async function getUserDueCardsCount(supabase: any, userId: string): Promise<number> {
  // 1. Busca workspaces ativos (não arquivados) do usuário
  const { data: workspaces } = await supabase
    .from('workspaces')
    .select('id, is_sprint_mode, sprint_date')
    .eq('user_id', userId)
    .eq('is_archived', false)

  if (!workspaces || workspaces.length === 0) return 0

  const activeWorkspaceIds = workspaces.map((ws: any) => ws.id)
  
  // Determina quais workspaces estão em Sprint ativa
  const now = new Date()
  const sprintWsIds = workspaces
    .filter((ws: any) => ws.is_sprint_mode && ws.sprint_date && new Date(ws.sprint_date) >= now)
    .map((ws: any) => ws.id)

  // 2. Busca flashcards das notas pertencentes a essas workspaces
  const { data: cards, error } = await supabase
    .from('flashcards')
    .select('id, due, state, notes!inner(workspace_id)')
    .eq('notes.user_id', userId)
    .in('notes.workspace_id', activeWorkspaceIds)

  if (error || !cards) return 0

  // 3. Filtra os vencidos ou em Sprint ativa
  const nowTime = now.getTime()
  const dueCount = cards.filter((card: any) => {
    const cardWorkspaceId = card.notes?.workspace_id
    if (!cardWorkspaceId) return false
    
    const isNew = !card.due || card.state === 0 || card.state === null
    const isDue = card.due ? new Date(card.due).getTime() <= nowTime : false
    const isSprint = sprintWsIds.includes(cardWorkspaceId)

    return isNew || isDue || isSprint
  }).length

  return dueCount
}

export async function POST(req: Request) {
  try {
    // 1. Validação de segurança por token do Cron Secret
    const apiKeyHeader = req.headers.get('x-api-key')
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && apiKeyHeader !== cronSecret) {
      return NextResponse.json({ error: 'Não autorizado. Token de segurança inválido.' }, { status: 401 })
    }

    const supabase = await createClient()

    // 2. Busca todas as assinaturas de push registradas
    const { data: subscriptions, error: subError } = await supabase
      .from('push_subscriptions')
      .select('*')

    if (subError || !subscriptions || subscriptions.length === 0) {
      return NextResponse.json({ success: true, message: 'Nenhuma assinatura registrada para notificar.' })
    }

    let notifiedCount = 0
    let errorCount = 0

    // Envia notificações agrupadas por usuário
    for (const subItem of subscriptions) {
      const userId = subItem.user_id
      const subscriptionData = subItem.subscription

      // 3. Calcula o total de cards pendentes para este usuário específico
      const dueCount = await getUserDueCardsCount(supabase, userId)

      if (dueCount > 0) {
        const estimatedMinutes = Math.max(2, Math.round(dueCount * 0.5))
        const payload = JSON.stringify({
          title: '🔥 Hora de Estudo OmniMind!',
          body: `Você tem ${dueCount} cards pendentes. Isso vai demorar apenas ${estimatedMinutes} minutos. Vamos revisar?`,
          url: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/dashboard/revisoes`
        })

        try {
          await webpush.sendNotification(subscriptionData, payload)
          notifiedCount++
        } catch (pushErr: any) {
          console.error(`Erro ao enviar push para usuário ${userId}:`, pushErr)
          // Se a assinatura expirou ou é inválida, remove do banco de dados
          if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
            await supabase
              .from('push_subscriptions')
              .delete()
              .eq('id', subItem.id)
          }
          errorCount++
        }
      }
    }

    return NextResponse.json({
      success: true,
      notifiedCount,
      errorCount
    })

  } catch (error: any) {
    console.error('Erro na rota api/push/send:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

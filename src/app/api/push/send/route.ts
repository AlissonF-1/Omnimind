import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { getUserStreak } from '@/actions/achievements'
import { getDynamicDailyGoal } from '@/actions/calendar'

async function getMostUrgentWorkspaceId(supabase: any, userId: string): Promise<string | null> {
  const { data: workspaces } = await supabase
    .from('workspaces')
    .select('id')
    .eq('user_id', userId)
    .eq('is_archived', false)
    .limit(1)
  return workspaces && workspaces.length > 0 ? workspaces[0].id : null
}

export const dynamic = 'force-dynamic'; 
export const runtime = 'nodejs';

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

// ⚠️ FLAG DE TESTE: Ignora a contagem de cards e envia uma notificação de teste para TODOS os usuários registrados
const SKIP_DUE_CHECK = false; // Mude para false quando quiser voltar ao normal

async function getUserDueCardsCount(supabase: any, userId: string): Promise<number> {
  // ... (seu código original de contagem permanece idêntico) ...
  const { data: workspaces } = await supabase
    .from('workspaces')
    .select('id, is_sprint_mode, sprint_date')
    .eq('user_id', userId)
    .eq('is_archived', false)

  if (!workspaces || workspaces.length === 0) return 0

  const activeWorkspaceIds = workspaces.map((ws: any) => ws.id)
  const now = new Date()
  const sprintWsIds = workspaces
    .filter((ws: any) => ws.is_sprint_mode && ws.sprint_date && new Date(ws.sprint_date) >= now)
    .map((ws: any) => ws.id)

  const { data: cards, error } = await supabase
    .from('flashcards')
    .select('id, due, state, notes!inner(workspace_id)')
    .eq('notes.user_id', userId)
    .in('notes.workspace_id', activeWorkspaceIds)

  if (error || !cards) return 0

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

async function getUserDoNotDisturb(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('user_preferences')
    .select('do_not_disturb')
    .eq('user_id', userId)
    .maybeSingle()
  return data?.do_not_disturb === true
}

async function handleSend(req: Request) {
  try {
    // 1. Validação de segurança por token
    const apiKeyHeader = req.headers.get('x-api-key') || req.headers.get('authorization')?.replace('Bearer ', '')
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

    console.log(`[DEBUG] Encontradas ${subscriptions.length} assinaturas no banco.`);

    let notifiedCount = 0
    let errorCount = 0
    let skippedDndCount = 0

    // Envia notificações agrupadas por usuário
    for (const subItem of subscriptions) {
      const userId = subItem.user_id
      // 🛡️ AQUI ESTÁ A CORREÇÃO: Garante que o objeto subscription seja um objeto JS válido
      let subscriptionData = subItem.subscription;
      if (typeof subscriptionData === 'string') {
        try {
          subscriptionData = JSON.parse(subscriptionData);
        } catch (e) {
          console.error(`[ERRO] Falha ao parsear JSON da assinatura do usuário ${userId}. Ignorando.`);
          errorCount++;
          continue;
        }
      }

      // 3. Verifica Modo Não Perturbe
      const doNotDisturb = await getUserDoNotDisturb(supabase, userId)
      if (doNotDisturb) {
        skippedDndCount++
        continue
      }

      // 4. Calcula o total de cards pendentes (ou ignora se estiver no modo de teste)
      let dueCount = 0;
      if (SKIP_DUE_CHECK) {
        dueCount = 1; // Força a entrada no bloco de envio
        console.log(`[DEBUG] Modo de teste ativado. Enviando notificação de teste para ${userId}`);
      } else {
        dueCount = await getUserDueCardsCount(supabase, userId);
      }

      // 1. Pega dados de gamificação
      const streak = await getUserStreak(userId)
      const dailyGoal = await getDynamicDailyGoal(userId)

      let title = ''
      let bodyMessage = ''
      let targetUrl = ''
      let actions = []

      if (dueCount > 0 || SKIP_DUE_CHECK) {
        // 🚨 PRIORIDADE 1: Cards pendentes para revisar
        const estimatedMinutes = Math.max(2, Math.round(dueCount * 0.5))
        title = SKIP_DUE_CHECK ? '🧠 TESTE DE NOTIFICAÇÃO' : '🔥 Hora de Estudo OmniMind!'

        if (SKIP_DUE_CHECK) {
          bodyMessage = 'Esta é uma notificação de teste. Sua assinatura está funcionando!'
        } else if (streak >= 3 && dailyGoal) {
          const remaining = Math.max(0, dailyGoal.goal - dueCount)
          bodyMessage = `🔥 Você está com ${streak} dias de streak! Faltam ${remaining} cards para cumprir a meta do dia.`
        } else if (dueCount > 5) {
          bodyMessage = `📚 Você tem ${dueCount} cards acumulados. Revisar agora leva cerca de ${estimatedMinutes} minutos.`
        } else {
          bodyMessage = `Você tem ${dueCount} card${dueCount > 1 ? 's' : ''} pendente${dueCount > 1 ? 's' : ''} para revisar. Vamos manter a mente afiada?`
        }

        const topWorkspaceId = await getMostUrgentWorkspaceId(supabase, userId)
        targetUrl = topWorkspaceId
          ? `${process.env.NEXT_PUBLIC_SITE_URL || 'https://omnimind-tau.vercel.app'}/dashboard/revisoes?workspaceId=${topWorkspaceId}`
          : `${process.env.NEXT_PUBLIC_SITE_URL || 'https://omnimind-tau.vercel.app'}/dashboard/revisoes`

        actions = [
          { action: 'review-now', title: '✅ Revisar agora' },
          { action: 'snooze-1h', title: '⏰ Lembrar em 1h' }
        ]
      } else {
        // ✨ PRIORIDADE 2: Lembrete diário / Check-in quando todas as revisões já estão em dia
        title = '✨ Suas revisões estão em dia!'

        if (streak >= 1) {
          bodyMessage = `🔥 Incrível! Suas revisões estão completas e seu streak é de ${streak} dia${streak > 1 ? 's' : ''}! Que tal criar uma nova nota hoje?`
        } else {
          bodyMessage = '🧠 Seu segundo cérebro está em dia! Que tal registrar um novo conceito ou explorar suas notas no OmniMind?'
        }

        targetUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://omnimind-tau.vercel.app'}/dashboard`
        actions = [
          { action: 'open-app', title: '🚀 Abrir OmniMind' }
        ]
      }

      // 4. Monta o Payload com Botões de Ação
      const payload = JSON.stringify({
        title,
        body: bodyMessage,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: { url: targetUrl },
        actions
      })

      try {
        console.log(`[DEBUG] Tentando enviar para: ${subscriptionData.endpoint}`)
        await webpush.sendNotification(subscriptionData, payload)
        notifiedCount++
        console.log(`[DEBUG] Notificação enviada com sucesso para ${userId}`)
      } catch (pushErr: any) {
        console.error(`[ERRO] Falha ao enviar push para usuário ${userId}:`, {
          statusCode: pushErr.statusCode,
          message: pushErr.message,
          endpoint: subscriptionData.endpoint || 'N/A'
        })
        // Se a assinatura expirou, remove do banco
        if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
          console.log(`[DEBUG] Removendo assinatura expirada: ${subItem.id}`)
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('id', subItem.id)
        }
        errorCount++
      }
    }

    console.log(`[RESUMO] Enviadas: ${notifiedCount}, Erros: ${errorCount}, DND ignorados: ${skippedDndCount}`);

    return NextResponse.json({
      success: true,
      notifiedCount,
      errorCount,
      skippedDndCount
    })

  } catch (error: any) {
    console.error('Erro na rota api/push/send:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: Request) { return handleSend(req) }
export async function GET(req: Request) { return handleSend(req) }
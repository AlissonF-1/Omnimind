import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import webpush from 'web-push'

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
const SKIP_DUE_CHECK = true; // Mude para false quando quiser voltar ao normal

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

      if (dueCount > 0) {
        const estimatedMinutes = Math.max(2, Math.round(dueCount * 0.5))
        const payload = JSON.stringify({
          title: SKIP_DUE_CHECK ? '🧠 TESTE DE NOTIFICAÇÃO' : '🔥 Hora de Estudo OmniMind!',
          body: SKIP_DUE_CHECK 
            ? 'Esta é uma notificação de teste. Sua assinatura está funcionando!' 
            : `Você tem ${dueCount} cards pendentes. Isso vai demorar apenas ${estimatedMinutes} minutos. Vamos revisar?`,
          url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://omnimind-tau.vercel.app'}/dashboard/revisoes`,
          icon: '/icon-192x192.png',
          badge: '/notification-badge.png'
        })

        try {
          console.log(`[DEBUG] Tentando enviar para: ${subscriptionData.endpoint}`);
          await webpush.sendNotification(subscriptionData, payload)
          notifiedCount++
          console.log(`[DEBUG] Notificação enviada com sucesso para ${userId}`);
        } catch (pushErr: any) {
          console.error(`[ERRO] Falha crítica ao enviar push para usuário ${userId}:`, {
            statusCode: pushErr.statusCode,
            message: pushErr.message,
            endpoint: subscriptionData.endpoint || 'N/A'
          });
          // Se a assinatura expirou, remove do banco
          if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
            console.log(`[DEBUG] Removendo assinatura expirada: ${subItem.id}`);
            await supabase
              .from('push_subscriptions')
              .delete()
              .eq('id', subItem.id)
          }
          errorCount++
        }
      } else {
        console.log(`[DEBUG] Usuário ${userId} não tem cards pendentes. Nenhuma notificação enviada.`);
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
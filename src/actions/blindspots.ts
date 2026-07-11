'use server'

import { createClient } from '@/utils/supabase/server'
import { callAIWithFallback } from '@/lib/ai-fallback'

export interface BlindSpot {
  note_id: string
  workspace_id: string
  note_title: string
  workspace_name: string
  critical_cards: number
  total_lapses: number
}

// 1. Busca os tópicos com mais erros
export async function getBlindSpots(workspaceId?: string): Promise<BlindSpot[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase.rpc('get_user_blind_spots', {
    p_user_id: user.id,
    p_workspace_id: workspaceId || null,
    p_limit: 5
  })

  if (error) {
    console.error('Erro ao buscar pontos cegos:', error)
    return []
  }

  return data as BlindSpot[]
}

// 2. O Loop Fechado: Monta o prompt de reforço pegando os cards críticos
export async function generateReinforcementPrompt(noteId: string): Promise<{ prompt?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  // Puxa os 10 cards mais errados daquela anotação
  const { data: cards, error } = await supabase
    .from('flashcards')
    .select('front, back, lapses')
    .eq('note_id', noteId)
    .eq('user_id', user.id)
    .gt('lapses', 0)
    .order('lapses', { ascending: false })
    .limit(10)

  if (error || !cards || cards.length === 0) {
    return { error: 'Não foi possível carregar os conceitos críticos.' }
  }

  const conceptsList = cards
    .map((c, index) => `${index + 1}. ${c.front}\n(Minha resposta original era: ${c.back})`)
    .join('\n\n')

  const prompt = `Estes são os conceitos que estudei recentemente mas estou errando de forma repetida:\n\n${conceptsList}\n\nAtue como um professor socrático. Explique cada um desses conceitos de uma forma completamente diferente da padrão, usando analogias inusitadas do dia a dia. Meu objetivo é consolidar esses pontos cegos. Após explicar, me faça uma pergunta curta para testar meu entendimento.`

  return { prompt }
}

// 3. Relatório de Insights do Tutor AI
export async function getTutorBlindSpotsDiagnostic(): Promise<{ diagnostic?: string; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Não autenticado' }

    // Busca os 8 flashcards mais errados do usuário de forma geral
    const { data: cards, error } = await supabase
      .from('flashcards')
      .select('front, back, lapses, notes(title)')
      .eq('user_id', user.id)
      .gt('lapses', 0)
      .order('lapses', { ascending: false })
      .limit(8)

    if (error) {
      console.error('Erro ao buscar cards críticos para diagnóstico:', error)
      return { error: 'Erro ao carregar dados do banco.' }
    }

    if (!cards || cards.length === 0) {
      return { diagnostic: 'Você está indo super bem! Não temos pontos cegos registrados hoje. Continue revisando para manter sua mente afiada!' }
    }

    const errorsList = cards
      .map((c) => {
        const noteData = c.notes as any
        const title = Array.isArray(noteData) 
          ? noteData[0]?.title 
          : noteData?.title
        return `Nota: "${title || 'Sem título'}" | Pergunta: "${c.front}" -> Resposta Correta: "${c.back}"`
      })
      .join('\n')

    const systemPrompt = `
Você é o Tutor AI do OmniMind. Sua missão é fazer um diagnóstico cognitivo resumido e prático com base nos erros frequentes de flashcards do estudante.
Analise a lista de perguntas e respostas que o estudante está errando repetidamente e forneça um conselho de estudo preciso, didático e encorajador.

Diretrizes obrigatórias:
- O diagnóstico deve ter no máximo 40 palavras. Seja extremamente direto.
- Identifique o padrão conceitual do erro se houver (ex: misturar conceitos de exatas, confundir etapas de processos ou fórmulas).
- Sugira o que focar no reestudo das notas.
- Responda em português (pt-BR).
`

    const userMessage = `
Aqui estão as questões que estou errando repetidamente:
${errorsList}

Gere o diagnóstico rápido de pontos cegos.
`

    const result = await callAIWithFallback(systemPrompt, userMessage, 'simple', false)

    if (!result.success) {
      throw new Error(result.error)
    }

    return { diagnostic: result.content?.trim() }
  } catch (error: any) {
    console.error('Tutor Diagnostic Error:', error)
    return { error: error.message }
  }
}
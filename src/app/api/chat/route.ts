import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@/utils/supabase/server'
import { embedQuery } from '@/lib/embeddings'
import { incrementTutorQueriesCount, addXp, incrementQuestProgress, checkAndUnlockAchievements } from '@/actions/achievements'
import { XP_CONFIG } from '@/types/achievements'
import { createExamGoal } from '@/actions/calendar'

const MAX_CONTEXT_TOKENS = 6000

function truncateContext(chunks: string[], maxTokens: number): string[] {
  let totalTokens = 0
  const truncated: string[] = []

  for (const chunk of chunks) {
    const estimatedTokens = chunk.split(/\s+/).length * 1.3
    if (totalTokens + estimatedTokens > maxTokens) break
    truncated.push(chunk)
    totalTokens += estimatedTokens
  }

  return truncated
}

function streamJsonLines(lines: Array<{ type: string; data: unknown }>) {
  return new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()

      for (const line of lines) {
        controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`))
      }

      controller.close()
    },
  })
}

export async function POST(req: Request) {
  try {
    const { question, workspaceId, persona, history, model: reqModel, ecoMode } = await req.json()
    const trimmedQuery = typeof question === 'string' ? question.trim() : ''

    if (!trimmedQuery || trimmedQuery.length < 3) {
      return Response.json({ error: 'Pergunta muito curta.' }, { status: 400 })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return Response.json({ error: 'GEMINI_API_KEY não configurada.' }, { status: 500 })
    }

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return Response.json({ error: 'Usuário não autenticado.' }, { status: 401 })
    }



    const queryEmbedding = await embedQuery(trimmedQuery)

    const { data: matches, error: rpcError } = await supabase.rpc('match_content_embeddings', {
      query_embedding: queryEmbedding,
      match_threshold: 0.65,
      match_count: 10,
      p_user_id: user.id,
      p_workspace_id: workspaceId || null,
    })

    if (rpcError) {
      return Response.json({ error: 'Falha ao buscar conteúdo relevante.' }, { status: 500 })
    }

    if (!matches || matches.length === 0) {
      return new Response(
        streamJsonLines([
          { type: 'sources', data: [] },
          { type: 'model', data: ecoMode ? 'Gemini 1.5 Flash-8B (Eco)' : 'Gemini 2.5 Flash' },
          {
            type: 'text',
            data: 'Não encontrei nenhuma informação nas suas anotações sobre este assunto. Tente reformular.',
          },
        ]),
        {
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
          },
        }
      )
    }

    const contextChunks = matches.map((m: any, idx: number) => `[Fonte ${idx + 1}]: ${m.chunk_text}`)
    const truncatedChunks = truncateContext(contextChunks, MAX_CONTEXT_TOKENS)

    const noteIds = [...new Set(matches.map((m: any) => m.note_id).filter(Boolean))]
    const { data: notes } = await supabase.from('notes').select('id, title').in('id', noteIds)
    const noteMap = new Map(notes?.map((n: any) => [n.id, n.title]) || [])

    const sources = matches.map((m: any) => ({
      id: m.id,
      title: m.note_id ? noteMap.get(m.note_id) : 'Flashcard',
      type: m.source_type,
      similarity: m.similarity,
      workspaceId: workspaceId || null,
      noteId: m.note_id || null,
    }))

    let personaPrompt = ''
    if (persona === 'grill') {
      personaPrompt = `
Você é uma banca examinadora de concurso público ou banca de TCC de extrema exigência.
Sua missão é testar o conhecimento do estudante ao limite.
- Critique a resposta dele de forma firme se ela for muito superficial, incompleta ou carecer de detalhes técnicos do contexto.
- Faça perguntas desafiadoras baseadas nas contradições ou pontos fracos do contexto fornecido para ver se ele realmente domina o tema.
- Seja formal, incisivo e firme. Não faça elogios fáceis.
`
    } else if (persona === 'eli5') {
      personaPrompt = `
Você é um especialista em simplificação de conceitos complexos (Explain Like I'm 5).
Sua missão é explicar qualquer conceito do contexto de forma extremamente lúdica, simples e divertida.
- Use metáforas cotidianas simples, analogias fáceis e historinhas curtas.
- Evite jargões técnicos difíceis; se precisar usá-los, explique-os logo em seguida em termos muito simples e infantis.
`
    } else {
      // Tutor Socrático (Padrão)
      personaPrompt = `
Você é um Tutor Socrático altamente capacitado.
Sua missão é guiar o estudante a raciocinar por conta própria.
- Em vez de dar respostas prontas imediatamente, forneça explicações ricas em analogias úteis e instigantes baseadas no contexto.
- Sempre termine sua resposta fazendo uma pequena pergunta provocativa ou de fixação para testar se ele entendeu o conceito.
`
    }

    const systemPrompt = `Você é o assistente virtual do OmniMind.
${personaPrompt}

  Regras obrigatórias:
  - Responda diretamente, sem saudação, sem autoapresentação e sem frases de abertura.
  - Não use títulos de introdução como "Olá", "Claro" ou similares.
  - Não comece com markdown heading se ele não trouxer valor real para a resposta.
  - Baseie-se UNICAMENTE no contexto fornecido.
  - Se a informação não estiver no contexto, diga exatamente: "Com base nas suas anotações, não possuo informações suficientes para responder a esta pergunta."
  - Ao usar informações do contexto, cite a fonte no formato [Fonte X].
  - Estruture a resposta em tópicos curtos e objetivos quando fizer sentido.
  - Responda em português (pt-BR).
  - Se o usuário pedir para criar, agendar ou marcar uma prova/meta de estudo (ex: "Marca uma prova de Cálculo para 20/08"), você OBRIGATORIAMENTE deve responder de forma prestativa e amigável confirmando a prova e incluindo no final da resposta exatamente esta tag silenciosa de ação: [ACTION:CREATE_EXAM_GOAL|title=Título da Prova|date=AAAA-MM-DD]. Calcule o ano atual como ${new Date().getFullYear()} caso o usuário fale apenas dia/mês (ex: 20/08 vira 2026-08-20). Fale quantos dias faltam e quantos cards ele deve revisar por dia para se preparar.


  **CONTEXTO EXTRAÍDO DAS ANOTAÇÕES:**
  ${truncatedChunks.join('\n\n')}`

    let geminiModelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
    if (ecoMode) {
      geminiModelName = 'gemini-1.5-flash-8b'
    } else if (reqModel === 'groq') {
      // Groq usa fallback via ai-fallback.ts — mantemos gemini como base mas marcamos no label
      geminiModelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
    }
    // openrouter também cai no fallback automático em ai-fallback.ts para outras rotas

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: geminiModelName,
      systemInstruction: systemPrompt
    })

    const contents: any[] = []
    if (Array.isArray(history)) {
      for (const turn of history) {
        // Ignora mensagens com erro ou vazias
        if (!turn.content) continue
        contents.push({
          role: turn.role === 'ai' ? 'model' : 'user',
          parts: [{ text: turn.content }]
        })
      }
    }

    contents.push({
      role: 'user',
      parts: [{ text: `Pergunta: ${trimmedQuery}` }]
    })

    const resultStream = await model.generateContentStream({
      contents,
      generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
    })

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()

        try {
          // Lança todas as tarefas secundárias em background (fire-and-forget)
          const backgroundUpdates = Promise.all([
            incrementTutorQueriesCount().catch(err => console.error('Erro ao somar query:', err)),
            incrementQuestProgress('curioso', 1).catch(err => console.error('Erro ao somar quest:', err)),
            addXp(XP_CONFIG.CHAT_MESSAGE).catch(err => {
              console.error('Erro ao adicionar XP do chat:', err)
              return null
            }).then(xpRes => {
              if (xpRes && xpRes.leveledUp) {
                controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'level-up', data: { oldLevel: xpRes.oldLevel, newLevel: xpRes.newLevel } })}\n`))
              }
            })
          ])

          // Stream começa IMEDIATAMENTE:
          controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'sources', data: sources })}\n`))
          const modelLabel = ecoMode 
            ? 'Gemini 1.5 Flash-8B (Eco)' 
            : reqModel === 'groq' 
              ? 'Llama 3 70B (Groq)'
              : reqModel === 'openrouter' 
                ? 'OpenRouter (Auto)'
                : 'Gemini 2.5 Flash'
          controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'model', data: modelLabel })}\n`))

          let accumulatedText = ''
          for await (const chunk of resultStream.stream) {
            const chunkText = chunk.text()
            if (chunkText) {
              accumulatedText += chunkText
              controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'text', data: chunkText })}\n`))
            }
          }

          // Executa a action de agendamento de prova se detectada no stream
          const actionRegex = /\[ACTION:CREATE_EXAM_GOAL\|title=([^|]+)\|date=([^\]]+)\]/
          const actionMatch = accumulatedText.match(actionRegex)
          if (actionMatch) {
            const title = actionMatch[1].trim()
            const dateStr = actionMatch[2].trim()
            try {
              await createExamGoal(title, dateStr)
              controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'action-complete', data: { action: 'create_exam_goal', title, date: dateStr } })}\n`))
            } catch (actionErr) {
              console.error('[Tutor Agent Action] Erro ao criar meta de prova:', actionErr)
            }
          }

          // Aguarda updates em background e checa conquistas APÓS possíveis actions
          await backgroundUpdates
          const newlyUnlocked = await checkAndUnlockAchievements().catch(err => {
            console.error('Erro ao checar conquistas pós-stream:', err)
            return []
          })
          if (newlyUnlocked && newlyUnlocked.length > 0) {
            newlyUnlocked.forEach((achievement) => {
              controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'achievement-unlocked', data: achievement })}\n`))
            })
          }

          controller.close()
        } catch (error) {
          controller.error(error)
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    })
  } catch (error: any) {
    console.error('Erro na API de Chat:', error)
    if (error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('quota')) {
      return Response.json({
        error: 'Limite da IA atingido. Aguarde alguns segundos e tente novamente.',
        retryAfter: 15
      }, { status: 429 })
    }
    return Response.json({ error: 'Erro interno de servidor' }, { status: 500 })
  }
}
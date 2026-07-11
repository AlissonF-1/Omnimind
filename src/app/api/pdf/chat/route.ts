// src/app/api/chat/route.ts
import { createClient } from '@/utils/supabase/server'
import { embedQuery } from '@/lib/embeddings'
import { GoogleGenerativeAI } from '@google/generative-ai'

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

export async function POST(req: Request) {
  try {
    const { question, workspaceId } = await req.json()
    const trimmedQuery = question?.trim()

    if (!trimmedQuery || trimmedQuery.length < 3) {
      return new Response(JSON.stringify({ error: 'Pergunta muito curta.' }), { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Usuário não autenticado.' }), { status: 401 })
    }

    // 1. Gera embedding da pergunta
    const queryEmbedding = await embedQuery(trimmedQuery)

    // 2. Busca os fragmentos mais relevantes
    const { data: matches, error: rpcError } = await supabase.rpc('match_content_embeddings', {
      query_embedding: queryEmbedding,
      match_threshold: 0.65,
      match_count: 10,
      p_user_id: user.id,
      p_workspace_id: workspaceId || null,
    })

    // Se não encontrou nada nas anotações, devolve uma resposta educada
    if (rpcError || !matches || matches.length === 0) {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(JSON.stringify({ type: 'sources', data: [] }) + '\n'))
          controller.enqueue(new TextEncoder().encode(JSON.stringify({ type: 'text', data: 'Não encontrei nenhuma informação nas suas anotações sobre este assunto. Tente reformular.' }) + '\n'))
          controller.close()
        }
      })
      return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })
    }

    // 3. Prepara contexto e fontes
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
      noteId: m.note_id || null
    }))

    // 4. Engenharia de Prompt
    const systemPrompt = `Você é o assistente virtual do OmniMind. Responda baseando-se UNICAMENTE no contexto fornecido. Se não estiver no contexto, diga que não sabe. Ao usar informações, cite a fonte no formato [Fonte X]. Estruture a resposta com tópicos.\n\n**CONTEXTO EXTRAÍDO DAS ANOTAÇÕES:**\n${truncatedChunks.join('\n\n')}`

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.5-flash' })

    // Pede para o Gemini iniciar o Streaming
    const resultStream = await model.generateContentStream({
      contents: [
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'user', parts: [{ text: `Pergunta: ${trimmedQuery}` }] }
      ],
      generationConfig: { temperature: 0.1, maxOutputTokens: 800 }
    })

    // 5. Monta o Stream de saída para o navegador ler
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()
        
        // Primeiro envia as fontes (Sources)
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'sources', data: sources }) + '\n'))

        // Depois começa a cuspir as letras uma a uma (Text)
        for await (const chunk of resultStream.stream) {
          const chunkText = chunk.text()
          if (chunkText) {
            controller.enqueue(encoder.encode(JSON.stringify({ type: 'text', data: chunkText }) + '\n'))
          }
        }
        controller.close()
      }
    })

    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } })
  } catch (error) {
    console.error('Erro na API de Chat:', error)
    return new Response(JSON.stringify({ error: 'Erro interno de servidor' }), { status: 500 })
  }
}
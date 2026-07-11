'use server'

import { createClient } from '@/utils/supabase/server'
import { embedQuery } from '@/lib/embeddings'
import { randomUUID } from 'crypto'

interface RAGResponse {
  answer: string
  sources: {
    id: string
    title: string | null
    type: string
    similarity: number
    snippet?: string // trecho exato usado no contexto
  }[]
  error?: string
  cached?: boolean
}

// Cache em memória (simples, com TTL)
const cache = new Map<string, { response: RAGResponse; timestamp: number }>()
const CACHE_TTL = 60 * 60 * 1000 // 1 hora
const MAX_CONTEXT_TOKENS = 6000 // estimativa para não estourar limite do Gemini

/**
 * Gera uma chave de cache única para a pergunta e workspace
 */
function getCacheKey(query: string, workspaceId?: string): string {
  return `${query.trim().toLowerCase()}|${workspaceId || 'global'}`
}

/**
 * Trunca o contexto se ultrapassar o limite aproximado de tokens
 * (conta palavras, já que tokens ≈ palavras * 1.3)
 */
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

/**
 * Busca informações relevantes e gera resposta usando RAG
 */
export async function askOmniMind(question: string, workspaceId?: string): Promise<RAGResponse> {
  const startTime = Date.now()
  const trimmedQuery = question.trim()

  // 1. Validação básica
  if (trimmedQuery.length < 3) {
    return {
      answer: '',
      sources: [],
      error: 'A pergunta deve ter pelo menos 3 caracteres.',
    }
  }

  // 2. Verifica cache (resposta idêntica)
  const cacheKey = getCacheKey(trimmedQuery, workspaceId)
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[RAG] Cache hit para: "${trimmedQuery}"`)
    return { ...cached.response, cached: true }
  }

  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return {
        answer: '',
        sources: [],
        error: 'Usuário não autenticado. Faça login novamente.',
      }
    }

    // 3. Gera embedding da pergunta
    const queryEmbedding = await embedQuery(trimmedQuery)

    // 4. Busca os fragmentos mais relevantes (threshold ajustado para 0.65 para capturar mais conteúdo)
    const { data: matches, error: rpcError } = await supabase.rpc('match_content_embeddings', {
      query_embedding: queryEmbedding,
      match_threshold: 0.65,
      match_count: 10, // busca 10, mas pode truncar depois
      p_user_id: user.id,
      p_workspace_id: workspaceId || null,
    })

    if (rpcError) {
      console.error('[RAG] Erro na busca vetorial:', rpcError)
      throw new Error('Falha ao buscar conteúdo relevante. Tente novamente.')
    }

    // 5. Se não encontrou nada, retorna mensagem amigável
    if (!matches || matches.length === 0) {
      return {
        answer: 'Não encontrei nenhuma informação nas suas anotações sobre este assunto. Tente reformular a pergunta ou certifique-se de que o material foi indexado.',
        sources: [],
      }
    }

    // 6. Prepara contexto e fontes (com snippets)
    const contextChunks = matches.map((m: any, index: number) => {
      const sourceLabel = m.source_type === 'flashcard' ? 'Flashcard' : 'Nota'
      return `[${sourceLabel} ${index + 1}]: ${m.chunk_text}`
    })

    // Trunca contexto se necessário
    const truncatedChunks = truncateContext(contextChunks, MAX_CONTEXT_TOKENS)

    // Busca títulos das notas
    const noteIds = [...new Set(matches.map((m: any) => m.note_id).filter(Boolean))]
    const { data: notes } = await supabase
      .from('notes')
      .select('id, title')
      .in('id', noteIds)

    const noteMap = new Map(notes?.map((n: any) => [n.id, n.title]) || [])

    // Monta sources com snippets
    const sources = matches.map((m: any) => ({
      id: m.id,
      title: m.note_id ? noteMap.get(m.note_id) : 'Flashcard',
      type: m.source_type,
      similarity: m.similarity,
      snippet: m.chunk_text.substring(0, 200) + (m.chunk_text.length > 200 ? '...' : ''),
    }))

    // 7. Engenharia de Prompt aprimorada
    const systemPrompt = `
Você é o assistente virtual do OmniMind, um aplicativo de "Segundo Cérebro" que ajuda usuários a relembrar e conectar conhecimento.

**INSTRUÇÕES OBRIGATÓRIAS:**
1. Responda **baseando-se UNICAMENTE** no contexto fornecido abaixo.
2. Se a resposta **não estiver** no contexto, responda EXATAMENTE: "Com base nas suas anotações, não possuo informações suficientes para responder a esta pergunta."
3. **NUNCA** adicione conhecimento externo, opiniões ou suposições.
4. Ao usar informações do contexto, **cite a fonte** no formato [Fonte X] (ex: [Nota 1], [Flashcard 2]).
5. Estruture a resposta em **tópicos claros** e use **linguagem didática**.
6. Se houver múltiplas fontes, **consolide** as informações de forma coerente.
7. Responda **em português** (pt-BR).

**CONTEXTO EXTRAÍDO DAS SUAS ANOTAÇÕES:**
${truncatedChunks.join('\n\n')}
    `

    // 8. Chamada à API Gemini com timeout e modelo configurável
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      console.error('[RAG] GEMINI_API_KEY não configurada')
      throw new Error('Configuração da IA está incompleta. Contate o suporte.')
    }

    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash' // mais rápido e barato
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000) // 15 segundos

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: systemPrompt }] },
          { role: 'user', parts: [{ text: `Pergunta: ${trimmedQuery}` }] },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 800,
          topP: 0.95,
        },
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[RAG] Erro Gemini:', response.status, errorText)
      throw new Error(`Falha na comunicação com a IA (status ${response.status}). Tente novamente.`)
    }

    const data = await response.json()
    const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'Desculpe, não consegui gerar uma resposta. Tente reformular.'

    // 9. Monta resposta final com metadados
    const result: RAGResponse = {
      answer,
      sources,
      cached: false,
    }

    // 10. Salva no cache (apenas se não houve erro)
    cache.set(cacheKey, { response: result, timestamp: Date.now() })

    console.log(`[RAG] Query processada em ${Date.now() - startTime}ms, fontes: ${sources.length}`)

    return result
  } catch (error: any) {
    console.error('[RAG] Erro:', error)

    // Tratamento específico para timeout
    if (error.name === 'AbortError') {
      return {
        answer: '',
        sources: [],
        error: 'A IA demorou muito para responder. Tente novamente com uma pergunta mais direta.',
      }
    }

    return {
      answer: '',
      sources: [],
      error: error.message || 'Erro interno no processamento. Tente novamente.',
    }
  }
}
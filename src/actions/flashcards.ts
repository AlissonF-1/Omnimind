'use server'

import { createClient } from '@/utils/supabase/server'
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai'
import { deleteEmbeddingsForFlashcard, indexFlashcard } from '@/actions/embeddings'
import { createHash } from 'crypto'

export async function generateFlashcardsFromNote(noteId: string, content: string, mode: 'default' | 'concurso' = 'default') {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) throw new Error('Usuário não autenticado')
    if (!content || content.trim().length < 50) {
      throw new Error('A anotação é muito curta para gerar cards.')
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
    
    // Define a instrução baseada no modo selecionado
    let systemInstruction = "Você é um especialista em neurociência, cognição profunda e criação de flashcards para retenção de memória. Sua missão é escanear o texto fornecido e mapear Entidades de Conhecimento. Extraia camadas inteligentes de estudo utilizando a Técnica de Feynman para analogias e Gatilhos de Memória para mnemônicos. OBRIGATORIAMENTE, para cada flashcard, extraia e devolva o bloco de texto exato da nota que serviu de base para aquele card no campo 'source_chunk'. Preencha o JSON estritamente conforme o schema solicitado."

    if (mode === 'concurso') {
      systemInstruction += " **MODO CONCURSO ATIVADO:** O foco principal deve ser na criação de perguntas sobre Lei Seca, exceções, pegadinhas e jurisprudência. Para cada conceito ou artigo, priorize perguntas do tipo: 'Qual a exceção a essa regra?', 'Quando este artigo NÃO se aplica?', 'O que a lei diz sobre X?'. Evite perguntas abertas demais; foque na literalidade e nas pegadinhas clássicas de prova."
    }

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: SchemaType.ARRAY,
          description: "Lista de flashcards extraídos da nota",
          items: {
            type: SchemaType.OBJECT,
            properties: {
              front: {
                type: SchemaType.STRING,
                description: "A pergunta do flashcard (curta e direta)."
              },
              back: {
                type: SchemaType.STRING,
                description: "A resposta do flashcard (precisa e focada em aprendizado ativo)."
              },
              analogia: {
                type: SchemaType.STRING,
                nullable: true,
                description: "Feynman Engine: Se o conceito for abstrato ou complexo, gere uma analogia extremamente simples do dia a dia. Caso contrário, retorne null."
              },
              mnemonico: {
                type: SchemaType.STRING,
                nullable: true,
                description: "Módulo de Mnemônicos: Se for uma regra extensa, lista, lei ou exceção, crie um acrônimo/mnemônico eficaz. Caso contrário, retorne null."
              },
              source_chunk: {
                type: SchemaType.STRING,
                description: "Copie exatamente o parágrafo ou sentença do texto original que originou este flashcard e cujo contexto explica a resposta."
              }
            },
            required: ["front", "back", "source_chunk"]
          }
        }
      },
      systemInstruction: systemInstruction
    })

    const prompt = `
      Analise o texto Markdown abaixo e extraia os conceitos mais importantes, gerando os flashcards.
      
      Texto para análise:
      ${content}
    `

    const result = await model.generateContent(prompt)
    const responseText = result.response.text()
    
    const cardsGenerated: { front: string, back: string, analogia?: string, mnemonico?: string, source_chunk: string }[] = JSON.parse(responseText)

    if (!cardsGenerated || cardsGenerated.length === 0) {
      throw new Error('A IA não conseguiu extrair conceitos desta nota.')
    }

    const flashcardsToInsert = cardsGenerated.map(card => {
      const hash = createHash('md5').update(card.source_chunk).digest('hex')
      
      return {
        user_id: user.id,
        note_id: noteId,
        front: card.front,
        back: card.back,
        analogia: card.analogia || null,
        mnemonico: card.mnemonico || null,
        source_anchor: hash
      }
    })

    const { data: insertedCards, error } = await supabase
      .from('flashcards')
      .insert(flashcardsToInsert)
      .select(`
        id, front, back, analogia, mnemonico, note_id, user_id, source_anchor,
        notes!inner ( workspace_id )
      `)

    if (error) throw new Error(`Erro ao salvar cards: ${error.message}`)

    for (const card of insertedCards ?? []) {
      try {
        await indexFlashcard(card)
      } catch (err) {
        console.error('Falha ao indexar flashcard:', err)
      }
    }

    return { success: true, count: flashcardsToInsert.length }
  } catch (error: any) {
    console.error('Erro na geração de flashcards:', error)
    return { error: error.message || 'Erro desconhecido ao gerar cards' }
  }
}

export async function deleteFlashcard(cardId: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Usuário não autenticado')

    const { error } = await supabase
      .from('flashcards')
      .delete()
      .eq('id', cardId)
      .eq('user_id', user.id)

    if (error) throw new Error(`Erro ao deletar card do banco: ${error.message}`)

    await deleteEmbeddingsForFlashcard(cardId)

    return { success: true }
  } catch (error: any) {
    console.error('Erro na deleção de flashcard:', error)
    return { error: error.message || 'Erro ao deletar card' }
  }
}

export async function getFlashcardsByNote(noteId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { data, error } = await supabase
    .from('flashcards')
    .select(`id, front, back, analogia, mnemonico, note_id, user_id, source_anchor, notes!inner ( workspace_id )`)
    .eq('note_id', noteId)
    .eq('user_id', user.id)

  if (error) {
    console.error('Erro ao buscar flashcards:', error)
    return { error: error.message }
  }

  return { success: true, cards: data }
}

export async function createFlashcard(
  noteId: string,
  front: string,
  back: string,
  analogia?: string | null,
  mnemonico?: string | null
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { data: inserted, error } = await supabase
    .from('flashcards')
    .insert({
      user_id: user.id,
      note_id: noteId,
      front,
      back,
      analogia: analogia ?? null,
      mnemonico: mnemonico ?? null,
      source_anchor: null 
    })
    .select(`id, front, back, analogia, mnemonico, note_id, user_id, source_anchor, notes!inner ( workspace_id )`)
    .single()

  if (error) {
    console.error('Erro ao criar flashcard:', error)
    return { error: error.message }
  }

  try {
    await indexFlashcard(inserted as any)
  } catch (e) {
    console.error('Falha ao indexar flashcard criado:', e)
  }

  return { success: true, card: inserted }
}

export async function updateFlashcard(
  cardId: string,
  fields: { front?: string; back?: string; analogia?: string | null; mnemonico?: string | null }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { data: updated, error } = await supabase
    .from('flashcards')
    .update({
      ...fields,
      updated_at: new Date().toISOString(),
    })
    .eq('id', cardId)
    .eq('user_id', user.id)
    .select(`id, front, back, analogia, mnemonico, note_id, user_id, source_anchor, notes!inner ( workspace_id )`)
    .single()

  if (error) {
    console.error('Erro ao atualizar flashcard:', error)
    return { error: error.message }
  }

  try {
    await indexFlashcard(updated as any)
  } catch (e) {
    console.error('Falha ao reindexar flashcard atualizado:', e)
  }

  return { success: true, card: updated }
}

export async function generateAIClozeCard(
  sentence: string
): Promise<{ front?: string; back?: string; error?: string }> {
  try {
    const systemPrompt = `
Você é um professor especializado em criar flashcards do tipo preencher lacunas (cloze deletion) para alta memorização.
Sua tarefa é receber uma frase de estudo, identificar a palavra ou expressão curta mais crítica para a memorização (como datas, leis, nomes de processos ou conceitos fundamentais) e substituí-la por "[...]".

Você deve responder obrigatoriamente no formato JSON estruturado com a seguinte estrutura:
{
  "front": "A frase original com o termo crítico substituído por [...]",
  "back": "O termo ocultado exato"
}

Diretrizes:
- Escolha apenas um termo principal para ocultar.
- Preserve o restante da frase de forma literal.
`

    const userMessage = `Gere um cloze para a seguinte frase:\n"${sentence}"`

    const { callAIWithFallback } = await import('@/lib/ai-fallback')
    const result = await callAIWithFallback(systemPrompt, userMessage, 'simple', true)

    if (!result.success) {
      throw new Error(result.error)
    }

    let cleaned = result.content?.trim() || ''
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '').trim()
    }

    const parsed = JSON.parse(cleaned) as { front: string; back: string }
    
    if (!parsed.front || !parsed.back) {
      throw new Error('JSON de resposta incompleto')
    }

    return { front: parsed.front, back: parsed.back }
  } catch (error: any) {
    console.error('AICloze Generation Error:', error)
    return { error: error.message }
  }
}
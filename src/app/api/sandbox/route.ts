import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { embedQuery } from '@/lib/embeddings'
import { callAIWithFallback } from '@/lib/ai-fallback'
import { grantSpecificAchievement } from '@/actions/achievements'

// Limpa marcações markdown de blocos de código JSON caso o LLM insira na resposta
function cleanJsonResponseText(text: string): string {
  let cleaned = text.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '')
  }
  return cleaned.trim()
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File
    const workspaceId = formData.get('workspaceId') as string | null

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo de áudio enviado.' }, { status: 400 })
    }

    // 1. Transcreve o áudio usando Groq Whisper
    const groqApiKey = process.env.GROQ_API_KEY
    if (!groqApiKey) {
      return NextResponse.json({ error: 'GROQ_API_KEY não configurada.' }, { status: 500 })
    }

    const apiFormData = new FormData()
    apiFormData.append('file', file)
    apiFormData.append('model', 'whisper-large-v3-turbo')
    apiFormData.append('language', 'pt')

    const whisperResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
      },
      body: apiFormData,
    })

    if (!whisperResponse.ok) {
      if (whisperResponse.status === 429) {
        return NextResponse.json(
          { error: 'Serviço de transcrição sobrecarregado. Aguarde e tente novamente.' },
          { status: 429 }
        )
      }
      const errorText = await whisperResponse.text()
      throw new Error(`Groq Whisper falhou: ${errorText}`)
    }

    const whisperData = await whisperResponse.json()
    const transcriptionText = (whisperData.text || '').trim()

    if (!transcriptionText) {
      return NextResponse.json({ 
        transcription: '', 
        score: 0, 
        feedback: 'Não foi possível detectar nenhuma fala no áudio enviado. Por favor, tente falar mais perto do microfone.',
        matchedNotes: []
      })
    }

    // 2. RAG: Busca semântica para encontrar notas relevantes
    let matchedNotesTitles: string[] = []
    let notesContext = ''

    try {
      const queryEmbedding = await embedQuery(transcriptionText)
      
      const { data: matches, error: rpcError } = await supabase.rpc('match_content_embeddings', {
        query_embedding: queryEmbedding,
        match_threshold: 0.35, // Um pouco mais flexível para explicações orais
        match_count: 4,
        p_user_id: user.id,
        p_workspace_id: workspaceId && workspaceId !== 'all' ? workspaceId : null
      })

      if (rpcError) {
        console.error('[Feynman API] Erro na busca de embeddings RAG:', rpcError)
      } else if (matches && matches.length > 0) {
        // Obter os IDs das notas para buscar os títulos originais e complementar o contexto
        const noteIds = Array.from(new Set(matches.map((m: any) => m.note_id).filter(Boolean))) as string[]
        
        if (noteIds.length > 0) {
          const { data: notesData } = await supabase
            .from('notes')
            .select('id, title')
            .in('id', noteIds)
          
          if (notesData) {
            matchedNotesTitles = notesData.map(n => n.title)
          }
        }

        notesContext = matches
          .map((m: any) => `[Anotação: ${m.note_id || 'Nota Sem Nome'}]\n${m.chunk_text}`)
          .join('\n\n')
      }
    } catch (embeddingError) {
      console.error('[Feynman API] Falha ao processar embeddings / RAG:', embeddingError)
    }

    // 3. Avaliação de Feynman com Llama 3 via Groq (ou Fallback)
    let dynamicInstruction = ""
    if (notesContext.length > 1000) {
      dynamicInstruction = "\nIMPORTANTE: Como o contexto recuperado é extenso, seja extremamente conciso e vá direto ao ponto no seu feedback (use no máximo 1 ou 2 frases curtas)."
    }

    const systemPrompt = `Você é um tutor de Feynman. O usuário explicou um conceito por voz.
Compare a explicação dele com o contexto das anotações dele fornecido abaixo (caso exista).
Dê uma nota de 0 a 10 baseada na precisão e clareza da explicação (0 = errou tudo/vazio, 10 = explicou perfeitamente).
Em seguida, em um feedback de no máximo 2 frases, aponte de forma construtiva o que ele esqueceu de mencionar ou explicou de forma confusa.
${dynamicInstruction}

Você deve responder OBRIGATORIAMENTE no formato JSON estruturado com a seguinte estrutura:
{
  "score": number,
  "feedback": "string"
}`

    const userMessage = `
[CONTEXTO DAS ANOTAÇÕES DO USUÁRIO]
${notesContext || 'Nenhuma anotação relevante encontrada.'}

[EXPLICAÇÃO DO USUÁRIO POR VOZ]
"${transcriptionText}"
`

    const aiRes = await callAIWithFallback(systemPrompt, userMessage, 'critical', true)
    
    if (!aiRes.success) {
      throw new Error(aiRes.error)
    }

    const cleanedContent = cleanJsonResponseText(aiRes.content || '')
    const parsed = JSON.parse(cleanedContent) as { score: number; feedback: string }
    const finalScore = typeof parsed.score === 'number' ? parsed.score : 0

    // Verifica Conquista do Prêmio Nobel (Score >= 9)
    let unlockedNobel = false
    if (finalScore >= 9) {
      const achievement = await grantSpecificAchievement('premio_nobel')
      if (achievement) unlockedNobel = true
    }

    return NextResponse.json({
      transcription: transcriptionText,
      score: finalScore,
      feedback: parsed.feedback || 'Explicado com sucesso.',
      matchedNotes: matchedNotesTitles,
      unlockedNobel
    })

  } catch (error: any) {
    console.error('[Feynman Sandbox API Error]:', error)
    return NextResponse.json({ 
      error: error.message || 'Erro interno no processamento do Sandbox.' 
    }, { status: 500 })
  }
}

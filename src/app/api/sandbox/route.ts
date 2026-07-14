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
    const file = formData.get('file') as File | null
    const textInput = formData.get('text') as string | null
    const workspaceId = formData.get('workspaceId') as string | null

    if (!file && !textInput) {
      return NextResponse.json({ error: 'Nenhum arquivo de áudio ou texto de explicação enviado.' }, { status: 400 })
    }

    let transcriptionText = ''

    // 1. Transcreve o áudio se houver arquivo, ou pega o texto direto
    if (textInput) {
      transcriptionText = textInput.trim()
    } else if (file) {
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
      transcriptionText = (whisperData.text || '').trim()
    }

    if (!transcriptionText) {
      return NextResponse.json({ 
        transcription: '', 
        score: 0, 
        strengths: 'Nenhuma fala ou texto detectado.',
        gaps: 'Tente explicar novamente com mais detalhes.',
        corrections: '',
        mentioned: [],
        forgotten: [],
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
    const systemPrompt = `Você é um tutor especialista na Técnica Feynman. O usuário explicou um conceito (por voz ou texto).
Sua missão é comparar a explicação dele com o contexto das anotações dele fornecido abaixo.
Você deve avaliar a clareza, a precisão conceitual e a simplicidade (linguagem compreensível).

Analise o texto e responda OBRIGATORIAMENTE no formato JSON estruturado com a seguinte estrutura:
{
  "score": number (de 0 a 10),
  "strengths": "string (resumo curto em markdown dos acertos da explicação)",
  "gaps": "string (resumo curto em markdown dos pontos importantes esquecidos ou mal explicados)",
  "corrections": "string (resumo curto em markdown apenas se houver algum erro crasso ou equívoco conceitual falado, caso contrário deixe string vazia)",
  "mentioned": ["array de strings curtas dos conceitos-chave que o usuário citou com sucesso"],
  "forgotten": ["array de strings curtas de conceitos-chave importantes no contexto das notas que o usuário deveria ter citado, mas esqueceu"]
}`

    const userMessage = `
[CONTEXTO DAS ANOTAÇÕES DO USUÁRIO]
${notesContext || 'Nenhuma anotação relevante encontrada.'}

[EXPLICAÇÃO DO USUÁRIO]
"${transcriptionText}"
`

    const aiRes = await callAIWithFallback(systemPrompt, userMessage, 'critical', true)
    
    if (!aiRes.success) {
      throw new Error(aiRes.error)
    }

    const cleanedContent = cleanJsonResponseText(aiRes.content || '')
    const parsed = JSON.parse(cleanedContent) as { 
      score: number; 
      strengths: string;
      gaps: string;
      corrections: string;
      mentioned: string[];
      forgotten: string[];
    }
    
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
      strengths: parsed.strengths || '',
      gaps: parsed.gaps || '',
      corrections: parsed.corrections || '',
      mentioned: parsed.mentioned || [],
      forgotten: parsed.forgotten || [],
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

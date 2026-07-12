'use server'

import { callAIWithFallback } from '@/lib/ai-fallback'

// Limpa marcações markdown de blocos de código JSON caso o LLM insira na resposta
function cleanJsonResponseText(text: string): string {
  let cleaned = text.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '')
  }
  return cleaned.trim()
}

export async function formatMarkdownWithGroq(text: string): Promise<{ formattedText: string; error?: string }> {
  try {
    const systemPrompt = `
Você é um formatador de texto especializado em Markdown.
Sua única função é receber um texto bagunçado ou mal formatado e retornar o MESMO TEXTO perfeitamente formatado em Markdown, com hierarquia de títulos (H1, H2, H3), negritos para destacar palavras-chave e bullet points para listas.
NÃO adicione introduções como "Aqui está o texto". Retorne APENAS o texto formatado.
NÃO resuma nem corte informações. Preserve o conteúdo original.
    `

    const result = await callAIWithFallback(systemPrompt, text, 'simple', false)

    if (!result.success) {
      throw new Error(result.error)
    }

    return { formattedText: result.content || text }
  } catch (error: any) {
    console.error('Groq/OpenRouter Format Error:', error)
    return { formattedText: text, error: error.message }
  }
}

export async function evaluateAnswerWithGroq(
  question: string,
  correctAnswer: string,
  userAnswer: string
): Promise<{ correct: boolean; feedback: string; error?: string }> {
  try {
    const systemPrompt = `
Você é um tutor de estudos altamente capacitado.
Sua tarefa é analisar a resposta de um estudante a um flashcard e compará-la com a resposta correta esperada.

Você deve responder obrigatoriamente no formato JSON estruturado com a seguinte estrutura:
{
  "correct": boolean,
  "feedback": "string (máximo de 3 frases)"
}

Instruções para avaliação:
- Se o estudante acertou os conceitos principais, defina "correct" como true.
- Se ele errou ou esqueceu os pontos chave, defina "correct" como false.
- No "feedback", dê um feedback de no máximo 3 frases em português (pt-BR), corrigindo se ele tiver errado de forma construtiva e didática, e reforçando se ele tiver acertado.
- Como o estudante pode ter respondido falando, considere sinônimos, abreviações comuns e respostas conceituais corretas mesmo que com palavras diferentes.
`

    const userMessage = `
A pergunta do flashcard é: "${question}"
A resposta correta esperada é: "${correctAnswer}"
O usuário respondeu: "${userAnswer}"
`

    const result = await callAIWithFallback(systemPrompt, userMessage, 'critical', true)

    if (!result.success) {
      throw new Error(result.error)
    }

    const cleanedContent = cleanJsonResponseText(result.content || '')
    if (!cleanedContent) {
      throw new Error('Nenhum conteúdo retornado da API de IA')
    }

    const parsed = JSON.parse(cleanedContent) as { correct: boolean; feedback: string }
    return {
      correct: !!parsed.correct,
      feedback: parsed.feedback || 'Não foi possível gerar um feedback no momento.'
    }
  } catch (error: any) {
    console.error('Groq/OpenRouter Evaluation Error:', error)
    return {
      correct: false,
      feedback: 'Desculpe, ocorreu um erro ao avaliar sua resposta. Por favor, compare com o gabarito abaixo.',
      error: error.message
    }
  }
}

export async function generateDistractorsWithGroq(
  question: string,
  correctAnswer: string
): Promise<{ correct: string; distractors: string[]; error?: string }> {
  try {
    const systemPrompt = `
Você é um elaborador de questões de provas e concursos de alto nível.
Sua missão é criar 3 alternativas incorretas ("distratores") plausíveis e desafiadoras para a pergunta informada, tendo como base a resposta correta informada.

Instruções importantes:
- Os distratores devem ser incorretos, mas parecerem plausíveis para quem não estudou.
- Evite distratores obviamente bobos, engraçados ou fáceis.
- Devem ter tom formal, serem concisos (no máximo 1 frase curta cada) e compatíveis com a resposta correta em tamanho e estilo.
- Responda OBRIGATORIAMENTE em formato JSON estruturado com a seguinte estrutura:
{
  "distractors": ["string", "string", "string"]
}
`

    const userMessage = `
A pergunta do flashcard é: "${question}"
A resposta correta é: "${correctAnswer}"
Gere os 3 distratores plausíveis em português (pt-BR).
`

    const result = await callAIWithFallback(systemPrompt, userMessage, 'simple', true)

    if (!result.success) {
      throw new Error(result.error)
    }

    const cleanedContent = cleanJsonResponseText(result.content || '')
    if (!cleanedContent) {
      throw new Error('Nenhum conteúdo retornado da API de IA')
    }

    const parsed = JSON.parse(cleanedContent) as { distractors: string[] }
    return {
      correct: correctAnswer,
      distractors: Array.isArray(parsed.distractors) ? parsed.distractors.slice(0, 3) : []
    }
  } catch (error: any) {
    console.error('Groq/OpenRouter Distractors Error:', error)
    return {
      correct: correctAnswer,
      distractors: [
        'Alternativa incorreta A (erro de conexão)',
        'Alternativa incorreta B (erro de conexão)',
        'Alternativa incorreta C (erro de conexão)'
      ],
      error: error.message
    }
  }
}

/**
 * Transcreve um arquivo de áudio enviado como FormData usando a API do Groq Whisper
 */
export async function transcribeAudio(formData: FormData): Promise<{ text: string; error?: string }> {
  try {
    const groqApiKey = process.env.GROQ_API_KEY
    if (!groqApiKey) {
      throw new Error('GROQ_API_KEY não configurada no ambiente.')
    }

    const file = formData.get('file') as File
    if (!file) {
      throw new Error('Nenhum arquivo de áudio enviado.')
    }

    const apiFormData = new FormData()
    apiFormData.append('file', file)
    apiFormData.append('model', 'whisper-large-v3-turbo')
    apiFormData.append('language', 'pt')

    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
      },
      body: apiFormData,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Erro na API do Groq Whisper (Status ${response.status}): ${errorText}`)
    }

    const data = await response.json()
    return { text: data.text || '' }
  } catch (error: any) {
    console.error('Groq Whisper Transcription Error:', error)
    return { text: '', error: error.message || 'Erro inesperado na transcrição' }
  }
}
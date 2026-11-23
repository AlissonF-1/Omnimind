import { createHash } from 'crypto'

export type EmbeddingTask = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'

export function hashContent(text: string): string {
  return createHash('sha256').update(text.trim()).digest('hex')
}

export async function embedText(
  text: string,
  taskType: EmbeddingTask = 'RETRIEVAL_DOCUMENT'
): Promise<number[]> {
  const trimmed = text.trim()
  if (trimmed.length < 3) {
    throw new Error('Texto muito curto para gerar embedding.')
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY não configurada.')
  }

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent'

  const response = await fetch(url, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      content: {
        parts: [{ text: trimmed }]
      },
      taskType: taskType,
      // FUNDAMENTAL: Redução de dimensionalidade (MRL) para 768.
      // Mantém a compatibilidade estrita com nossa tabela content_embeddings (vector(768)) no pgvector!
      outputDimensionality: 768
    })
  })

  if (!response.ok) {
    throw new Error(`Falha ao gerar embedding (HTTP ${response.status}).`)
  }

  const data = await response.json()
  const values = data?.embedding?.values

  if (!values || !Array.isArray(values) || values.length === 0) {
    throw new Error('Embedding vazio retornado pela API.')
  }

  return values
}

export async function embedQuery(query: string): Promise<number[]> {
  return embedText(query, 'RETRIEVAL_QUERY')
}

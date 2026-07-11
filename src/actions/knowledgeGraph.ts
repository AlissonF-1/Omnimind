'use server'

import { createClient } from '@/utils/supabase/server'

export interface GraphNode {
  id: string
  label: string
  topic: string
}

export interface GraphLink {
  source: string
  target: string
  value: number
}

export interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return normA === 0 || normB === 0 ? 0 : dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

export async function getWorkspaceGraph(workspaceId: string): Promise<GraphData> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    console.error('[getWorkspaceGraph] Usuário não autenticado.')
    return { nodes: [], links: [] }
  }

  // 1. Busca todas as notas deste workspace
  const { data: notes, error: notesError } = await supabase
    .from('notes')
    .select('id, title, topic')
    .eq('workspace_id', workspaceId)

  if (notesError || !notes) {
    console.error('[getWorkspaceGraph] Erro ao buscar notas:', notesError)
    return { nodes: [], links: [] }
  }

  // 2. Busca os embeddings correspondentes a estas notas
  const { data: embeddings, error: embError } = await supabase
    .from('content_embeddings')
    .select('source_id, embedding')
    .eq('workspace_id', workspaceId)
    .eq('source_type', 'note')

  if (embError || !embeddings) {
    console.error('[getWorkspaceGraph] Erro ao buscar embeddings:', embError)
    return { nodes: notes.map(n => ({ id: n.id, label: n.title, topic: n.topic || 'Geral' })), links: [] }
  }

  // Mapeia source_id para embedding array
  const embeddingMap = new Map<string, number[]>()
  for (const emb of embeddings) {
    if (emb.embedding) {
      let vector: number[] = []
      if (typeof emb.embedding === 'string') {
        vector = JSON.parse(emb.embedding)
      } else if (Array.isArray(emb.embedding)) {
        vector = emb.embedding as number[]
      }
      if (vector.length > 0) {
        embeddingMap.set(emb.source_id, vector)
      }
    }
  }

  // Criar os nós do Grafo
  const nodes: GraphNode[] = notes.map(n => ({
    id: n.id,
    label: n.title,
    topic: n.topic || 'Geral'
  }))

  const links: GraphLink[] = []

  // Calcular conexões: para cada nota, encontrar as notas mais similares
  for (let i = 0; i < notes.length; i++) {
    const noteA = notes[i]
    const vecA = embeddingMap.get(noteA.id)
    if (!vecA) continue

    const similarities: { targetId: string; value: number }[] = []

    for (let j = 0; j < notes.length; j++) {
      if (i === j) continue
      const noteB = notes[j]
      const vecB = embeddingMap.get(noteB.id)
      if (!vecB) continue

      const sim = cosineSimilarity(vecA, vecB)
      // Limiar mínimo de similaridade para criar uma conexão relevante
      if (sim > 0.4) {
        similarities.push({ targetId: noteB.id, value: sim })
      }
    }

    // Ordenar as notas mais próximas e pegar as top 2 conexões para não sobrecarregar
    similarities.sort((a, b) => b.value - a.value)
    const topConnections = similarities.slice(0, 2)

    for (const conn of topConnections) {
      const exists = links.some(
        l => (l.source === noteA.id && l.target === conn.targetId) ||
             (l.source === conn.targetId && l.target === noteA.id)
      )
      if (!exists) {
        links.push({
          source: noteA.id,
          target: conn.targetId,
          value: parseFloat(conn.value.toFixed(3))
        })
      }
    }
  }

  return { nodes, links }
}

'use server'

import { createClient } from '@/utils/supabase/server'
import { embedQuery } from '@/lib/embeddings'
import type { EmbeddingSourceType, SemanticSearchResult } from '@/types/search'

interface MatchRow {
  id: string
  source_type: EmbeddingSourceType
  source_id: string
  workspace_id: string | null
  note_id: string | null
  chunk_text: string
  similarity: number
}

export async function semanticSearch(
  query: string,
  options?: { workspaceId?: string; limit?: number; threshold?: number }
) {
  try {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      return { error: 'Digite pelo menos 2 caracteres para buscar.' }
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Não autenticado' }

    const queryEmbedding = await embedQuery(trimmed)

    // 1. Executa busca vetorial (RPC de embeddings)
    const vectorPromise = supabase.rpc('match_content_embeddings', {
      query_embedding: queryEmbedding,
      match_threshold: options?.threshold ?? 0.45,
      match_count: options?.limit ?? 25, // Buscamos um pouco mais para a mesclagem
      p_user_id: user.id,
      p_workspace_id: options?.workspaceId ?? null,
    })

    // 2. Executa busca textual exata (ILIKE usando o índice GIN pg_trgm)
    let textQuery = supabase
      .from('content_embeddings')
      .select('id, source_type, source_id, workspace_id, note_id, chunk_text')
      .eq('user_id', user.id)
      .ilike('chunk_text', `%${trimmed}%`)

    if (options?.workspaceId) {
      textQuery = textQuery.eq('workspace_id', options.workspaceId)
    }

    const [vectorRes, textRes] = await Promise.all([
      vectorPromise,
      textQuery.limit(options?.limit ?? 25)
    ])

    if (vectorRes.error) {
      if (vectorRes.error.message.includes('match_content_embeddings')) {
        return {
          error:
            'Busca semântica não configurada. Execute a migration SQL em supabase/migrations/20250704163000_semantic_search.sql no Supabase.',
        }
      }
      throw vectorRes.error
    }

    const vectorRows = (vectorRes.data ?? []) as MatchRow[]
    const textRows = (textRes.data ?? []) as any[]

    // 3. Mesclar resultados (Busca Híbrida)
    const mergedMap = new Map<string, MatchRow>()

    // Inserir os vetoriais primeiro
    for (const v of vectorRows) {
      mergedMap.set(v.id, { ...v })
    }

    // Inserir/atualizar com os textuais
    for (const t of textRows) {
      if (mergedMap.has(t.id)) {
        // Se bateu na vetorial e na textual, ganha boost de relevância
        const existing = mergedMap.get(t.id)!
        existing.similarity = Math.min(existing.similarity + 0.15, 1.0)
      } else {
        // Se bateu apenas na textual, ganha similaridade de 0.90 (relevância alta de match exato)
        mergedMap.set(t.id, {
          id: t.id,
          source_type: t.source_type,
          source_id: t.source_id,
          workspace_id: t.workspace_id,
          note_id: t.note_id,
          chunk_text: t.chunk_text,
          similarity: 0.90,
        })
      }
    }

    // Ordenar e limitar aos mais relevantes
    const rows = Array.from(mergedMap.values())
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, options?.limit ?? 20)

    const rawResults = await enrichResults(rows)

    // 4. Agrupamento por Nota (Collapsing)
    const groupedResults: SemanticSearchResult[] = []
    const noteGroups = new Map<string, SemanticSearchResult>()

    for (const result of rawResults) {
      if (result.noteId) {
        if (noteGroups.has(result.noteId)) {
          const group = noteGroups.get(result.noteId)!
          if (!group.additionalChunks) group.additionalChunks = []

          // Evitar duplicados
          if (group.id !== result.id && !group.additionalChunks.some(c => c.id === result.id)) {
            group.additionalChunks.push({
              id: result.id,
              chunkText: result.chunkText,
              similarity: result.similarity,
            })
          }
          // Preservar a maior similaridade no cabeçalho do card
          if (result.similarity > group.similarity) {
            group.similarity = result.similarity
            group.chunkText = result.chunkText
          }
        } else {
          noteGroups.set(result.noteId, result)
          groupedResults.push(result)
        }
      } else {
        groupedResults.push(result)
      }
    }

    return { success: true, results: groupedResults, query: trimmed }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro na busca semântica'
    console.error('semanticSearch:', message)
    return { error: message }
  }
}

async function enrichResults(rows: MatchRow[]): Promise<SemanticSearchResult[]> {
  if (rows.length === 0) return []

  const supabase = await createClient()

  const noteIds = new Set<string>()
  const workspaceIds = new Set<string>()

  for (const row of rows) {
    const noteId = row.note_id ?? (row.source_type === 'note' ? row.source_id : null)
    if (noteId) noteIds.add(noteId)
    if (row.workspace_id) workspaceIds.add(row.workspace_id)
  }

  const [{ data: notes }, { data: workspaces }] = await Promise.all([
    supabase.from('notes').select('id, title, workspace_id, created_at').in('id', [...noteIds]),
    workspaceIds.size > 0
      ? supabase.from('workspaces').select('id, name').in('id', [...workspaceIds])
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ])

  const noteMap = new Map(notes?.map((n) => [n.id, n]) ?? [])
  const workspaceMap = new Map(workspaces?.map((w) => [w.id, w.name]) ?? [])

  return rows.map((row) => {
    const noteId = row.note_id ?? (row.source_type === 'note' ? row.source_id : null)
    const note = noteId ? noteMap.get(noteId) : null
    const workspaceId = row.workspace_id ?? note?.workspace_id ?? null
    const workspaceName = workspaceId ? (workspaceMap.get(workspaceId) ?? null) : null

    const href =
      workspaceId && noteId
        ? `/dashboard/${workspaceId}/note/${noteId}`
        : '/dashboard'

    return {
      id: row.id,
      sourceType: row.source_type,
      sourceId: row.source_id,
      workspaceId,
      noteId,
      noteTitle: note?.title ?? null,
      workspaceName,
      chunkText: row.chunk_text,
      similarity: row.similarity,
      href,
      createdAt: note?.created_at ?? undefined,
    }
  })
}

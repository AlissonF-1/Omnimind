import 'server-only'

import type { createClient } from '@/utils/supabase/server'
import { embedQuery } from '@/lib/embeddings'
import { isAssistantId, type AssistantSource } from './contracts'

type Database = Awaited<ReturnType<typeof createClient>>
type Workspace = { id: string; name: string }
type EmbeddingRow = { id: string; workspace_id: string | null; note_id: string | null; source_type: string; chunk_text: string }
type Match = { id: string; similarity: number }

export class AssistantScopeError extends Error {}

export async function authorizeAssistantWorkspace(db: Database, userId: string, workspaceId: unknown): Promise<Workspace | null> {
  if (workspaceId === null || workspaceId === undefined || workspaceId === '') return null
  if (!isAssistantId(workspaceId)) throw new AssistantScopeError()
  const { data, error } = await db.from('workspaces').select('id,name').eq('id', workspaceId).eq('user_id', userId)
    .maybeSingle().overrideTypes<Workspace, { merge: false }>()
  if (error) throw new Error('WORKSPACE_READ_FAILED')
  if (!data) throw new AssistantScopeError()
  return data
}

export async function gatherAssistantSources(db: Database, userId: string, workspace: Workspace | null, question: string) {
  const embedding = await embedQuery(question)
  const { data: matches, error: matchError } = await db.rpc('match_content_embeddings', {
    query_embedding: embedding,
    match_threshold: 0.65,
    match_count: 10,
    p_user_id: userId,
    p_workspace_id: workspace?.id ?? null,
  })
  if (matchError || !Array.isArray(matches)) throw new Error('SEMANTIC_SEARCH_FAILED')

  // A RPC ordena candidatos. Somente as linhas relidas sob a sessão atual podem entrar no contexto.
  const ranked: Match[] = matches.flatMap((match) =>
    isAssistantId(match?.id) && typeof match.similarity === 'number' && Number.isFinite(match.similarity)
      ? [{ id: match.id, similarity: match.similarity }] : [],
  )
  if (!ranked.length) return []

  const query = db.from('content_embeddings').select('id,workspace_id,note_id,source_type,chunk_text')
    .eq('user_id', userId).in('id', [...new Set(ranked.map(({ id }) => id))])
  const scopedQuery = workspace ? query.eq('workspace_id', workspace.id) : query
  const { data: rows, error: rowsError } = await scopedQuery.overrideTypes<EmbeddingRow[], { merge: false }>()
  if (rowsError) throw new Error('EMBEDDING_READ_FAILED')

  const noteIds = [...new Set((rows ?? []).map(({ note_id }) => note_id).filter(isAssistantId))]
  const notes = noteIds.length ? await db.from('notes').select('id,title').eq('user_id', userId).in('id', noteIds)
    .overrideTypes<{ id: string; title: string | null }[], { merge: false }>() : null
  if (notes?.error) throw new Error('NOTE_READ_FAILED')
  const titles = new Map((notes?.data ?? []).map(({ id, title }) => [id, title]))
  const byId = new Map((rows ?? []).map((row) => [row.id, row]))

  const selected: { source: AssistantSource; text: string }[] = []
  const seen = new Set<string>()
  let estimatedTokens = 0
  for (const match of ranked) {
    const row = byId.get(match.id)
    if (!row?.chunk_text?.trim() || seen.has(row.id) || (row.note_id && !titles.has(row.note_id))) continue
    const estimated = row.chunk_text.split(/\s+/).length * 1.3
    if (estimatedTokens + estimated > 6000) continue
    estimatedTokens += estimated
    seen.add(row.id)
    selected.push({
      text: row.chunk_text,
      source: {
        id: row.id, title: row.note_id ? titles.get(row.note_id) ?? null : null,
        type: row.source_type, similarity: match.similarity, workspaceId: row.workspace_id, noteId: row.note_id,
      },
    })
  }
  return selected
}

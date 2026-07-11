'use server'

import { createClient } from '@/utils/supabase/server'
import { embedText, hashContent } from '@/lib/embeddings'
import type { EmbeddingSourceType } from '@/types/search'

const MIN_INDEX_LENGTH = 10

interface UpsertEmbeddingParams {
  userId: string
  workspaceId: string | null
  noteId: string | null
  sourceType: EmbeddingSourceType
  sourceId: string
  text: string
}

async function upsertEmbedding({
  userId,
  workspaceId,
  noteId,
  sourceType,
  sourceId,
  text,
}: UpsertEmbeddingParams): Promise<boolean> {
  const trimmed = text.trim()
  if (trimmed.length < MIN_INDEX_LENGTH) return false

  const contentHash = hashContent(trimmed)
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('content_embeddings')
    .select('content_hash')
    .eq('user_id', userId)
    .eq('source_type', sourceType)
    .eq('source_id', sourceId)
    .maybeSingle()

  if (existing?.content_hash === contentHash) return false

  const embedding = await embedText(trimmed, 'RETRIEVAL_DOCUMENT')

  const { error } = await supabase.from('content_embeddings').upsert(
    {
      user_id: userId,
      workspace_id: workspaceId,
      note_id: noteId,
      source_type: sourceType,
      source_id: sourceId,
      chunk_text: trimmed.slice(0, 4000),
      content_hash: contentHash,
      embedding,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,source_type,source_id' }
  )

  if (error) {
    console.error('Erro ao salvar embedding:', error)
    throw new Error(error.message)
  }

  return true
}

export async function indexNote(noteId: string, title: string, content: string) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Não autenticado' }

    const { data: note } = await supabase
      .from('notes')
      .select('id, workspace_id, user_id')
      .eq('id', noteId)
      .eq('user_id', user.id)
      .single()

    if (!note) return { error: 'Nota não encontrada' }

    const text = `# ${title}\n\n${content}`.trim()
    await upsertEmbedding({
      userId: user.id,
      workspaceId: note.workspace_id,
      noteId: note.id,
      sourceType: 'note',
      sourceId: note.id,
      text,
    })

    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao indexar nota'
    console.error('indexNote:', message)
    return { error: message }
  }
}

interface FlashcardRow {
  id: string
  front: string
  back: string
  analogia: string | null
  mnemonico: string | null
  note_id: string
  user_id: string
  notes: { workspace_id: string } | { workspace_id: string }[]
}

function resolveWorkspaceId(notes: FlashcardRow['notes']): string {
  return Array.isArray(notes) ? notes[0].workspace_id : notes.workspace_id
}

export async function indexFlashcard(flashcard: FlashcardRow) {
  const workspaceId = resolveWorkspaceId(flashcard.notes)
  const entries: { sourceType: EmbeddingSourceType; text: string }[] = [
    { sourceType: 'flashcard_front', text: flashcard.front },
    { sourceType: 'flashcard_back', text: flashcard.back },
  ]

  if (flashcard.analogia?.trim()) {
    entries.push({ sourceType: 'analogia', text: flashcard.analogia })
  }
  if (flashcard.mnemonico?.trim()) {
    entries.push({ sourceType: 'mnemonico', text: flashcard.mnemonico })
  }

  let indexed = 0
  for (const entry of entries) {
    const didIndex = await upsertEmbedding({
      userId: flashcard.user_id,
      workspaceId,
      noteId: flashcard.note_id,
      sourceType: entry.sourceType,
      sourceId: flashcard.id,
      text: entry.text,
    })
    if (didIndex) indexed++
  }

  return { indexed }
}

export async function deleteEmbeddingsForFlashcard(flashcardId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('content_embeddings')
    .delete()
    .eq('user_id', user.id)
    .eq('source_id', flashcardId)
    .in('source_type', ['flashcard_front', 'flashcard_back', 'analogia', 'mnemonico'])
}

export async function backfillEmbeddings() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Não autenticado' }

    const { data: notes } = await supabase
      .from('notes')
      .select('id, title, content')
      .eq('user_id', user.id)

    let notesIndexed = 0
    for (const note of notes ?? []) {
      const result = await indexNote(note.id, note.title, note.content ?? '')
      if (result.success) notesIndexed++
    }

    const { data: flashcards } = await supabase
      .from('flashcards')
      .select(`
        id, front, back, analogia, mnemonico, note_id, user_id,
        notes!inner ( workspace_id )
      `)
      .eq('user_id', user.id)

    let cardsIndexed = 0
    for (const card of flashcards ?? []) {
      await indexFlashcard(card as FlashcardRow)
      cardsIndexed++
    }

    return {
      success: true,
      notesIndexed,
      cardsIndexed,
      totalEmbeddings: (notes ?? []).length + (flashcards ?? []).length * 4,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro no backfill'
    console.error('backfillEmbeddings:', message)
    return { error: message }
  }
}

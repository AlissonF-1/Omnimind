export const EMBEDDING_MODEL = 'text-embedding-004' as const
export const EMBEDDING_DIMENSIONS = 768

export type EmbeddingSourceType =
  | 'note'
  | 'flashcard_front'
  | 'flashcard_back'
  | 'analogia'
  | 'mnemonico'

export interface SemanticSearchResult {
  id: string
  sourceType: EmbeddingSourceType
  sourceId: string
  workspaceId: string | null
  noteId: string | null
  noteTitle: string | null
  workspaceName: string | null
  chunkText: string
  similarity: number
  href: string
  additionalChunks?: { id: string; chunkText: string; similarity: number }[]
  createdAt?: string
}

export const SOURCE_TYPE_LABELS: Record<EmbeddingSourceType, string> = {
  note: 'Nota',
  flashcard_front: 'Flashcard (pergunta)',
  flashcard_back: 'Flashcard (resposta)',
  analogia: 'Analogia',
  mnemonico: 'Mnemônico',
}

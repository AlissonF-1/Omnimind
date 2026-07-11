-- Busca Semântica: pgvector + tabela de embeddings
-- Execute no Supabase SQL Editor ou via `supabase db push`

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS content_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  note_id UUID REFERENCES notes(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (
    source_type IN ('note', 'flashcard_front', 'flashcard_back', 'analogia', 'mnemonico')
  ),
  source_id UUID NOT NULL,
  chunk_text TEXT NOT NULL,
  content_hash TEXT NOT NULL DEFAULT '',
  embedding vector(768) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS content_embeddings_user_idx
  ON content_embeddings (user_id);

CREATE INDEX IF NOT EXISTS content_embeddings_workspace_idx
  ON content_embeddings (workspace_id);

CREATE INDEX IF NOT EXISTS content_embeddings_hnsw_idx
  ON content_embeddings
  USING hnsw (embedding vector_cosine_ops);

ALTER TABLE content_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own embeddings" ON content_embeddings;
CREATE POLICY "Users manage own embeddings"
  ON content_embeddings
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Busca por similaridade de cosseno (1 - distância <=> )
CREATE OR REPLACE FUNCTION match_content_embeddings(
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  p_user_id uuid,
  p_workspace_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  source_type text,
  source_id uuid,
  workspace_id uuid,
  note_id uuid,
  chunk_text text,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ce.id,
    ce.source_type,
    ce.source_id,
    ce.workspace_id,
    ce.note_id,
    ce.chunk_text,
    (1 - (ce.embedding <=> query_embedding))::float AS similarity
  FROM content_embeddings ce
  WHERE ce.user_id = p_user_id
    AND (p_workspace_id IS NULL OR ce.workspace_id = p_workspace_id)
    AND (1 - (ce.embedding <=> query_embedding)) > match_threshold
  ORDER BY ce.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION match_content_embeddings TO authenticated;

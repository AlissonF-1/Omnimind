BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = public, extensions, pg_catalog;

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
CREATE INDEX IF NOT EXISTS content_embeddings_source_id_idx ON public.content_embeddings (source_id);
CREATE INDEX IF NOT EXISTS idx_content_embeddings_user_workspace ON public.content_embeddings (user_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_content_embeddings_text_search ON public.content_embeddings USING gin (chunk_text gin_trgm_ops);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class
    WHERE oid = 'public.content_embeddings'::regclass AND relrowsecurity
  ) THEN
    RAISE EXCEPTION 'A indexação exige RLS ativa em public.content_embeddings.';
  END IF;
END;
$$;

-- Restringe também quando há políticas permissivas adicionais em instalações antigas.
CREATE POLICY omnimind_embedding_owner_scope ON public.content_embeddings
  AS RESTRICTIVE FOR ALL TO authenticated, anon
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (workspace_id IS NULL OR EXISTS (
      SELECT 1 FROM public.workspaces AS w
      WHERE w.id = content_embeddings.workspace_id AND w.user_id = (SELECT auth.uid())
    ))
    AND (note_id IS NULL OR EXISTS (
      SELECT 1 FROM public.notes AS n
      WHERE n.id = content_embeddings.note_id AND n.user_id = (SELECT auth.uid())
        AND (content_embeddings.workspace_id IS NULL OR n.workspace_id = content_embeddings.workspace_id)
    ))
  );

REVOKE ALL ON public.content_embeddings FROM PUBLIC, anon;
GRANT SELECT, DELETE ON public.content_embeddings TO authenticated;
GRANT INSERT (user_id, workspace_id, note_id, source_type, source_id, chunk_text, content_hash, embedding, updated_at),
      UPDATE (user_id, workspace_id, note_id, source_type, source_id, chunk_text, content_hash, embedding, updated_at)
      ON public.content_embeddings TO authenticated;

COMMIT;

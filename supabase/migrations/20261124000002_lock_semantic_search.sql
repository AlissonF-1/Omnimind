-- Preserva a assinatura usada pela busca, pelo grafo, pelo Assistente e pelo Feynman.
DO $migration$
DECLARE
  vector_schema name;
  rpc_signature text;
  vector_type regtype;
  existing_rpc oid;
BEGIN
  SELECT n.nspname INTO vector_schema
  FROM pg_catalog.pg_extension AS ext
  JOIN pg_catalog.pg_namespace AS n ON n.oid = ext.extnamespace
  WHERE ext.extname = 'vector';

  IF vector_schema IS NULL THEN
    RAISE EXCEPTION 'A extensão vector deve estar instalada antes desta migration.';
  END IF;

  vector_type := pg_catalog.to_regtype(pg_catalog.format('%I.vector', vector_schema));
  rpc_signature := pg_catalog.format(
    'public.match_content_embeddings(%I.vector,double precision,integer,uuid,uuid)', vector_schema
  );
  existing_rpc := pg_catalog.to_regprocedure(rpc_signature);
  IF existing_rpc IS NULL OR vector_type IS NULL THEN
    RAISE EXCEPTION 'A assinatura instalada de match_content_embeddings difere da migration original.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'match_content_embeddings' AND p.oid <> existing_rpc
  ) THEN
    RAISE EXCEPTION 'A busca contém sobrecargas. Revise todas as assinaturas antes de aplicar a correção.';
  END IF;

  EXECUTE pg_catalog.format($definition$
    CREATE OR REPLACE FUNCTION public.match_content_embeddings(
      query_embedding %1$I.vector(768),
      match_threshold double precision,
      match_count integer,
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
      similarity double precision
    )
    LANGUAGE plpgsql
    SECURITY INVOKER
    SET search_path = ''
    AS $function$
    DECLARE
      session_user_id uuid := auth.uid();
    BEGIN
      IF session_user_id IS NULL OR p_user_id IS DISTINCT FROM session_user_id THEN
        RAISE EXCEPTION 'Busca indisponível para esta sessão.' USING ERRCODE = '42501';
      END IF;
      IF p_workspace_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.workspaces AS w WHERE w.id = p_workspace_id AND w.user_id = session_user_id
      ) THEN
        RAISE EXCEPTION 'Workspace indisponível para esta sessão.' USING ERRCODE = '42501';
      END IF;
      IF match_count IS NULL OR match_count NOT BETWEEN 1 AND 100 OR match_threshold IS NULL
        OR match_threshold NOT BETWEEN -1 AND 1 OR query_embedding IS NULL THEN
        RAISE EXCEPTION 'Parâmetros de busca inválidos.' USING ERRCODE = '22023';
      END IF;

      RETURN QUERY
      SELECT ce.id, ce.source_type, ce.source_id, ce.workspace_id, ce.note_id, ce.chunk_text,
        1 - (ce.embedding OPERATOR(%1$I.<=>) query_embedding)
      FROM public.content_embeddings AS ce
      WHERE ce.user_id = session_user_id
        AND (p_workspace_id IS NULL OR ce.workspace_id = p_workspace_id)
        AND 1 - (ce.embedding OPERATOR(%1$I.<=>) query_embedding) > match_threshold
      ORDER BY ce.embedding OPERATOR(%1$I.<=>) query_embedding
      LIMIT match_count;
    END;
    $function$
  $definition$, vector_schema);

  EXECUTE 'REVOKE ALL ON FUNCTION ' || rpc_signature || ' FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION ' || rpc_signature || ' TO authenticated';
END;
$migration$;

-- A função roda como o titular da sessão. A política existente restringe as linhas.
GRANT SELECT ON TABLE public.content_embeddings TO authenticated;

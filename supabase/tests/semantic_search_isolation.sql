-- Execute em um Supabase descartável após aplicar as migrations de busca.
BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000005001', 'semantic-a@example.test'),
  ('00000000-0000-4000-8000-000000005002', 'semantic-b@example.test');
INSERT INTO public.workspaces (id, user_id, name) VALUES
  ('00000000-0000-4000-8000-000000005011', '00000000-0000-4000-8000-000000005001', 'Workspace A'),
  ('00000000-0000-4000-8000-000000005012', '00000000-0000-4000-8000-000000005002', 'Workspace B');

DO $$ BEGIN
  PERFORM pg_catalog.set_config('mentor_test.vector', '[' || '1,' || repeat('0,', 766) || '0]', true);
END; $$;

DO $$
DECLARE
  signature oid;
  type_name text;
BEGIN
  SELECT p.oid, pg_catalog.format_type(p.proargtypes[0], NULL) INTO STRICT signature, type_name
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'match_content_embeddings';
  IF (SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid = signature)
    OR has_function_privilege('anon', signature, 'EXECUTE')
    OR has_function_privilege('public', signature, 'EXECUTE')
    OR NOT has_function_privilege('authenticated', signature, 'EXECUTE') THEN
    RAISE EXCEPTION 'Privilégios efetivos incorretos na busca.';
  END IF;

  PERFORM set_config('mentor_test.type_name', type_name, true);
  EXECUTE 'INSERT INTO public.content_embeddings (user_id, workspace_id, source_type, source_id, chunk_text, embedding)
    SELECT user_id, id, ''note'', id, name, $1::' || type_name || ' FROM public.workspaces WHERE id IN
      (''00000000-0000-4000-8000-000000005011'', ''00000000-0000-4000-8000-000000005012'')'
  USING current_setting('mentor_test.vector');
END;
$$;

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  search_sql text := 'SELECT chunk_text FROM public.match_content_embeddings($1::'
    || current_setting('mentor_test.type_name') || ', 0.5, 10, $2, $3)';
  query_vector text := current_setting('mentor_test.vector');
  alice uuid := '00000000-0000-4000-8000-000000005001';
  bob uuid := '00000000-0000-4000-8000-000000005002';
  bob_workspace uuid := '00000000-0000-4000-8000-000000005012';
  results text[];
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{}', true);
  BEGIN
    EXECUTE search_sql USING query_vector, alice, NULL::uuid;
    RAISE EXCEPTION 'Sessão sem identidade consultou a busca.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub', alice::text, true);
  EXECUTE 'SELECT array_agg(chunk_text) FROM (' || search_sql || ') AS results'
    INTO results USING query_vector, alice, NULL::uuid;
  IF results IS DISTINCT FROM ARRAY['Workspace A'] THEN RAISE EXCEPTION 'A conta A recebeu dados incorretos.'; END IF;

  BEGIN
    EXECUTE search_sql USING query_vector, bob, NULL::uuid;
    RAISE EXCEPTION 'Identidade divergente foi aceita.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    EXECUTE search_sql USING query_vector, alice, bob_workspace;
    RAISE EXCEPTION 'Workspace de outra conta foi aceito.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub', bob::text, true);
  EXECUTE 'SELECT array_agg(chunk_text) FROM (' || search_sql || ') AS results'
    INTO results USING query_vector, bob, bob_workspace;
  IF results IS DISTINCT FROM ARRAY['Workspace B'] THEN RAISE EXCEPTION 'A conta B recebeu dados incorretos.'; END IF;
END;
$$;

RESET ROLE;
ROLLBACK;
SELECT 'Busca semântica: isolamento e privilégios validados.' AS resultado;

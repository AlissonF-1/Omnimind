-- Apenas em banco descartável com as migrations de fundação aplicadas.
BEGIN;
SET LOCAL search_path = public, extensions;

INSERT INTO auth.users (id, email) VALUES
  ('5a000000-0000-4000-8000-000000000001', 'legacy-a@example.test'),
  ('5b000000-0000-4000-8000-000000000001', 'legacy-b@example.test');
INSERT INTO public.workspaces (id, user_id, name, is_archived) VALUES
  ('5a000000-0000-4000-8000-000000000002', '5a000000-0000-4000-8000-000000000001', 'Teste A', false),
  ('5b000000-0000-4000-8000-000000000002', '5b000000-0000-4000-8000-000000000001', 'Teste B', false);
INSERT INTO public.notes (id, workspace_id, user_id, title, content) VALUES
  ('5a000000-0000-4000-8000-000000000003', '5a000000-0000-4000-8000-000000000002', '5a000000-0000-4000-8000-000000000001', 'Nota A', 'Fixture'),
  ('5b000000-0000-4000-8000-000000000003', '5b000000-0000-4000-8000-000000000002', '5b000000-0000-4000-8000-000000000001', 'Nota B', 'Fixture');
INSERT INTO public.flashcards (id, note_id, user_id, front, back, reps, lapses) VALUES
  ('5a000000-0000-4000-8000-000000000004', '5a000000-0000-4000-8000-000000000003', '5a000000-0000-4000-8000-000000000001', 'Pergunta', 'Resposta', 2, 1);

DO $$
BEGIN
  IF (SELECT count(*) FROM pg_catalog.pg_proc WHERE pronamespace = 'public'::regnamespace
      AND proname IN ('get_workspace_health', 'increment_study_log', 'get_user_blind_spots')) <> 5
    OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc WHERE pronamespace = 'public'::regnamespace
        AND proname IN ('get_workspace_health', 'increment_study_log', 'get_user_blind_spots')
        AND (prosecdef OR has_function_privilege('public', oid, 'EXECUTE')
          OR has_function_privilege('anon', oid, 'EXECUTE')
          OR NOT has_function_privilege('authenticated', oid, 'EXECUTE'))
    ) THEN
    RAISE EXCEPTION 'Assinaturas ou privilégios inesperados nas RPCs legadas';
  END IF;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '5a000000-0000-4000-8000-000000000001', true);

DO $$
DECLARE
  a uuid := '5a000000-0000-4000-8000-000000000001';
  b uuid := '5b000000-0000-4000-8000-000000000001';
  hour_slot integer := extract(hour FROM now() AT TIME ZONE 'America/Sao_Paulo')::integer + 1;
  score record;
  document_vector vector := ('[1,' || repeat('0,', 766) || '0]')::vector;
  own_workspace uuid := '5a000000-0000-4000-8000-000000000002';
  own_note uuid := '5a000000-0000-4000-8000-000000000003';
  foreign_workspace uuid := '5b000000-0000-4000-8000-000000000002';
  foreign_note uuid := '5b000000-0000-4000-8000-000000000003';
BEGIN
  SELECT * INTO STRICT score FROM public.get_workspace_health(a);
  IF score.workspace_name IS DISTINCT FROM 'Teste A' OR score.total_cards IS DISTINCT FROM 1
    OR score.reviewed_cards IS DISTINCT FROM 1 OR score.avg_correctness IS DISTINCT FROM 0.5 THEN
    RAISE EXCEPTION 'A RPC mudou o cálculo de saúde do workspace';
  END IF;
  IF (SELECT email FROM public.profiles WHERE id = a) IS DISTINCT FROM 'legacy-a@example.test'
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = b) THEN
    RAISE EXCEPTION 'A criação de perfil ou o isolamento falhou';
  END IF;
  IF (SELECT total_lapses FROM public.get_user_blind_spots(a, own_workspace)) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'O catálogo perdeu o resultado dos pontos cegos';
  END IF;
  BEGIN
    PERFORM public.get_user_blind_spots(b);
    RAISE EXCEPTION 'Pontos cegos de outra conta ficaram acessíveis';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM public.increment_study_log(a);
  PERFORM public.increment_study_log(a, 'SQL');
  PERFORM public.increment_study_log(a, 'SQL', true);
  PERFORM public.increment_study_log(a, 'JOIN', false);
  IF NOT EXISTS (SELECT 1 FROM public.daily_study_logs WHERE user_id = a AND study_date = current_date
      AND review_count = 4 AND topics = ARRAY['SQL', 'JOIN']
      AND hourly_reviews[hour_slot] = 2 AND hourly_correct[hour_slot] = 1) THEN
    RAISE EXCEPTION 'O log não preservou a contagem legada e o registro por hora';
  END IF;

  BEGIN
    PERFORM public.get_workspace_health(b);
    RAISE EXCEPTION 'A saúde de outra conta ficou acessível';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.increment_study_log(b, 'SQL');
    RAISE EXCEPTION 'O log de outra conta foi alterado pela RPC legada';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.increment_study_log(b, 'SQL', true);
    RAISE EXCEPTION 'O log de outra conta foi alterado pela RPC horária';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  INSERT INTO public.push_subscriptions (user_id, subscription)
  VALUES (a, '{"endpoint":"https://example.test/push","keys":{"auth":"old"}}');
  INSERT INTO public.push_subscriptions (user_id, subscription)
  VALUES (a, '{"endpoint":"https://example.test/push","keys":{"auth":"new"}}')
  ON CONFLICT (user_id, endpoint) DO UPDATE SET subscription = excluded.subscription;
  IF (SELECT count(*) FROM public.push_subscriptions WHERE user_id = a) <> 1
    OR (SELECT subscription #>> '{keys,auth}' FROM public.push_subscriptions WHERE user_id = a) IS DISTINCT FROM 'new' THEN
    RAISE EXCEPTION 'A assinatura do mesmo endpoint não foi atualizada';
  END IF;

  INSERT INTO public.content_embeddings (user_id, workspace_id, note_id, source_type, source_id, chunk_text, content_hash, embedding, updated_at)
  VALUES (a, own_workspace, own_note, 'note', own_note, 'Antes', 'hash-1', document_vector, now());
  INSERT INTO public.content_embeddings (user_id, workspace_id, note_id, source_type, source_id, chunk_text, content_hash, embedding, updated_at)
  VALUES (a, own_workspace, own_note, 'note', own_note, 'Depois', 'hash-2', document_vector, now())
  ON CONFLICT (user_id, source_type, source_id) DO UPDATE
    SET user_id = excluded.user_id, workspace_id = excluded.workspace_id, note_id = excluded.note_id,
        source_type = excluded.source_type, source_id = excluded.source_id, chunk_text = excluded.chunk_text,
        content_hash = excluded.content_hash, embedding = excluded.embedding, updated_at = excluded.updated_at;
  IF (SELECT content_hash FROM public.content_embeddings WHERE source_id = own_note) IS DISTINCT FROM 'hash-2'
    OR (SELECT chunk_text FROM public.match_content_embeddings(document_vector, 0.5, 10, a, own_workspace)) IS DISTINCT FROM 'Depois' THEN
    RAISE EXCEPTION 'A busca não encontrou o embedding atualizado pelo titular';
  END IF;

  BEGIN
    UPDATE public.content_embeddings SET workspace_id = foreign_workspace WHERE source_id = own_note;
    RAISE EXCEPTION 'Foi possível vincular um embedding a workspace de outra conta';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.content_embeddings SET note_id = foreign_note WHERE source_id = own_note;
    RAISE EXCEPTION 'Foi possível vincular um embedding a nota de outra conta';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

SELECT set_config('request.jwt.claim.sub', '5b000000-0000-4000-8000-000000000001', true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.push_subscriptions) OR EXISTS (SELECT 1 FROM public.daily_study_logs)
    OR EXISTS (SELECT 1 FROM public.content_embeddings) THEN
    RAISE EXCEPTION 'Histórico de outra conta ficou visível';
  END IF;
  INSERT INTO public.push_subscriptions (user_id, subscription)
  VALUES ('5b000000-0000-4000-8000-000000000001', '{"endpoint":"https://example.test/push"}');
END;
$$;

SELECT set_config('request.jwt.claim.sub', '5a000000-0000-4000-8000-000000000001', true);
DO $$
BEGIN
  DELETE FROM public.content_embeddings WHERE source_id = '5a000000-0000-4000-8000-000000000003';
  IF NOT FOUND THEN RAISE EXCEPTION 'O titular não conseguiu remover o embedding'; END IF;
END;
$$;

ROLLBACK;
SELECT 'Fundação legada: RPCs, Push e embeddings verificados.' AS resultado;

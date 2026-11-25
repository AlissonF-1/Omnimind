-- Execute somente em banco descartável após aplicar a sequência completa.
BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('6a000000-0000-4000-8000-000000000001', 'release-a@example.test'),
  ('6b000000-0000-4000-8000-000000000001', 'release-b@example.test');
INSERT INTO public.workspaces (id, user_id, name) VALUES
  ('6a000000-0000-4000-8000-000000000002', '6a000000-0000-4000-8000-000000000001', 'Fixture A'),
  ('6b000000-0000-4000-8000-000000000002', '6b000000-0000-4000-8000-000000000001', 'Fixture B');
INSERT INTO public.notes (id, workspace_id, user_id, title) VALUES
  ('6a000000-0000-4000-8000-000000000003', '6a000000-0000-4000-8000-000000000002', '6a000000-0000-4000-8000-000000000001', 'Nota A'),
  ('6b000000-0000-4000-8000-000000000003', '6b000000-0000-4000-8000-000000000002', '6b000000-0000-4000-8000-000000000001', 'Nota B');
INSERT INTO public.push_subscriptions (user_id, subscription) VALUES
  ('6a000000-0000-4000-8000-000000000001', '{"endpoint":"https://example.test/push/a"}'),
  ('6b000000-0000-4000-8000-000000000001', '{"endpoint":"https://example.test/push/b"}');
INSERT INTO public.user_preferences (user_id, do_not_disturb, daily_goal_default) VALUES
  ('6a000000-0000-4000-8000-000000000001', false, 17),
  ('6b000000-0000-4000-8000-000000000001', true, 20);
INSERT INTO public.daily_study_logs (user_id, study_date)
SELECT '6a000000-0000-4000-8000-000000000001', (now() AT TIME ZONE 'America/Sao_Paulo')::date - offset_days
FROM unnest(ARRAY[0, 1, 3]) AS offset_days;
INSERT INTO public.flashcards (user_id, note_id, front, back) VALUES
  ('6a000000-0000-4000-8000-000000000001', '6a000000-0000-4000-8000-000000000003', 'A', 'B');
INSERT INTO storage.objects (bucket_id, name, owner) VALUES
  ('note_files', '6a000000-0000-4000-8000-000000000002/release.pdf', '6a000000-0000-4000-8000-000000000001'),
  ('note_images', '6a000000-0000-4000-8000-000000000003/release.png', '6a000000-0000-4000-8000-000000000001');

DO $$
BEGIN
  IF (SELECT count(*) FROM storage.buckets WHERE id IN ('note_files', 'note_images') AND public = false) <> 2 THEN
    RAISE EXCEPTION 'Os buckets de notas precisam estar privados';
  END IF;
END;
$$;

SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM public.get_scheduled_push_targets(repeat('a', 64));
    RAISE EXCEPTION 'Agendamento habilitado sem credencial';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

INSERT INTO push_private.cron_credentials (token_hash) VALUES (sha256(convert_to(repeat('a', 64), 'UTF8')));

SET LOCAL ROLE anon;
DO $$
BEGIN
  IF has_table_privilege('anon', 'public.push_subscriptions', 'SELECT')
    OR has_schema_privilege('anon', 'push_private', 'USAGE') THEN
    RAISE EXCEPTION 'Anon recebeu acesso direto às assinaturas ou à configuração';
  END IF;
  BEGIN
    PERFORM public.get_scheduled_push_targets(repeat('b', 64));
    RAISE EXCEPTION 'Agendamento aceitou credencial incorreta';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF NOT EXISTS (SELECT 1 FROM public.get_scheduled_push_targets(repeat('a', 64))
      WHERE due_count = 1 AND streak = 2 AND daily_goal = 17)
    OR (SELECT count(*) FROM public.get_scheduled_push_targets(repeat('a', 64))) <> 1 THEN
    RAISE EXCEPTION 'Agendamento não respeitou os destinatários e os dados de revisão';
  END IF;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '6a000000-0000-4000-8000-000000000001', true);
DO $$
BEGIN
  IF (SELECT count(*) FROM storage.objects WHERE name LIKE '6a000000-%/release.%') <> 2 THEN
    RAISE EXCEPTION 'Titular ficou sem acesso aos anexos';
  END IF;
  IF (SELECT count(*) FROM public.push_subscriptions) <> 1 THEN
    RAISE EXCEPTION 'Assinatura alheia visível ou assinatura própria ausente';
  END IF;
  IF has_function_privilege('authenticated', 'public.get_scheduled_push_targets(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Sessão de usuário recebeu a função de cron';
  END IF;
  BEGIN
    INSERT INTO public.notes(user_id, workspace_id, title)
    VALUES ('6a000000-0000-4000-8000-000000000001','6b000000-0000-4000-8000-000000000002','Fixture inválida');
    RAISE EXCEPTION 'Nota aceitou workspace de outra conta';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.flashcards(user_id, note_id, front, back)
    VALUES ('6a000000-0000-4000-8000-000000000001','6b000000-0000-4000-8000-000000000003','A','B');
    RAISE EXCEPTION 'Flashcard aceitou nota de outra conta';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

SELECT set_config('request.jwt.claim.sub', '6b000000-0000-4000-8000-000000000001', true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.objects WHERE name LIKE '6a000000-%/release.%') THEN
    RAISE EXCEPTION 'Outra conta conseguiu ler anexos privados';
  END IF;
END;
$$;

ROLLBACK;

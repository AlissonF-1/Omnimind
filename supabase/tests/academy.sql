-- Executar somente em um banco descartável com Auth e as migrations da Academy.
BEGIN;
INSERT INTO auth.users (id, email) VALUES
  ('ac000000-0000-4000-8000-000000000001', 'academy-a@example.test'),
  ('ac000000-0000-4000-8000-000000000002', 'academy-b@example.test');
INSERT INTO public.workspaces (id,user_id,name) VALUES
  ('ac000000-0000-4000-8000-000000000009','ac000000-0000-4000-8000-000000000001','Academy A');
INSERT INTO public.notes (id,user_id,workspace_id,title) VALUES
  ('ac000000-0000-4000-8000-000000000010','ac000000-0000-4000-8000-000000000001','ac000000-0000-4000-8000-000000000009','Vocabulário A');

DO $$
DECLARE p public.academy_releases%ROWTYPE;
DECLARE pages jsonb;
DECLARE answer_keys jsonb;
BEGIN
  SELECT * INTO p FROM public.academy_releases WHERE id = 'academy-pilot' AND version = 1;
  SELECT jsonb_agg(lesson ORDER BY id) INTO pages FROM public.academy_lessons WHERE release_id = p.id AND version = p.version;
  SELECT jsonb_object_agg(lesson_id || '/' || exercise_id, grading) INTO answer_keys
    FROM academy_private.answer_keys WHERE release_id = p.id AND version = p.version;
  IF public.academy_import_release(p.id,p.version,p.digest,p.catalog,pages,answer_keys) <> 'already_imported' THEN
    RAISE EXCEPTION 'Importação duplicada não foi idempotente';
  END IF;
  BEGIN
    PERFORM public.academy_import_release(p.id,p.version,p.digest,p.catalog || '{"pilot":false}'::jsonb,pages,answer_keys);
    RAISE EXCEPTION 'Conteúdo da versão publicada foi sobrescrito';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  IF public.academy_import_release(p.id,p.version + 1,repeat('c',64),p.catalog,pages,answer_keys) <> 'imported' THEN
    RAISE EXCEPTION 'O importador rejeitou uma nova versão válida';
  END IF;
  IF (SELECT count(*) FROM public.academy_releases WHERE id = p.id) <> 2
    OR (SELECT version FROM public.academy_current_releases WHERE id = p.id) <> p.version + 1 THEN
    RAISE EXCEPTION 'O importador deve preservar a versão anterior e publicar a nova';
  END IF;
END;
$$;

SET LOCAL ROLE anon;
DO $$
BEGIN
  IF has_table_privilege('anon','public.academy_lessons','select') OR
    has_function_privilege('anon','public.academy_study(text,integer,text,text,text,text,uuid)','execute') THEN
    RAISE EXCEPTION 'Acesso anônimo aberto';
  END IF;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','ac000000-0000-4000-8000-000000000001',true);
INSERT INTO public.academy_profiles (minutes_per_day) VALUES (25);
DO $$
DECLARE outcome jsonb;
BEGIN
  IF has_schema_privilege('authenticated','academy_private','usage') OR
    has_function_privilege('authenticated','public.academy_import_release(text,integer,text,jsonb,jsonb,jsonb)','execute') OR
    has_table_privilege('authenticated','public.academy_attempts','insert') THEN
    RAISE EXCEPTION 'Aluno consegue ler gabaritos ou registrar evidência diretamente';
  END IF;
  IF EXISTS (SELECT 1 FROM public.academy_lessons WHERE lesson::text ~ '"(accepted|hiddenCases|solution|explanation)"\s*:') THEN
    RAISE EXCEPTION 'Material público contém campos privados';
  END IF;
  IF public.academy_export_vocabulary('academy-pilot',1,'hello-my-name','ac000000-0000-4000-8000-000000000010') <> 3
    OR public.academy_export_vocabulary('academy-pilot',1,'hello-my-name','ac000000-0000-4000-8000-000000000010') <> 0 THEN
    RAISE EXCEPTION 'Exportação de vocabulário ausente ou duplicada';
  END IF;
  BEGIN
    PERFORM public.academy_study('academy-pilot',1,'decisoes-em-python','start');
    RAISE EXCEPTION 'Pré-requisito ignorado';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM public.academy_study('academy-pilot',1,'variaveis-e-saida','draft',NULL,'print(5)');
  outcome := public.academy_study('academy-pilot',1,'variaveis-e-saida','answer','prever-saida','9','ac000000-0000-4000-8001-000000000001');
  IF (outcome->>'correct')::boolean OR outcome->>'feedback' LIKE '%resultado 5%' THEN
    RAISE EXCEPTION 'Resposta errada aceita ou solução liberada';
  END IF;
  outcome := public.academy_study('academy-pilot',1,'variaveis-e-saida','answer','prever-saida','5','ac000000-0000-4000-8001-000000000002');
  IF NOT (outcome->>'correct')::boolean OR (outcome->>'completed')::boolean THEN RAISE EXCEPTION 'Critério de conclusão incorreto'; END IF;
  PERFORM public.academy_study('academy-pilot',1,'variaveis-e-saida','answer','prever-saida','5','ac000000-0000-4000-8001-000000000002');
  outcome := public.academy_study('academy-pilot',1,'variaveis-e-saida','answer','conferir-estoque','4','ac000000-0000-4000-8001-000000000003');
  IF NOT (outcome->>'completed')::boolean OR (SELECT count(*) FROM public.academy_attempts) <> 3 THEN
    RAISE EXCEPTION 'Aula não concluiu ou tentativas duplicadas';
  END IF;
  PERFORM public.academy_study('academy-pilot',1,'decisoes-em-python','start');
  BEGIN
    PERFORM public.academy_study('academy-pilot',1,'variaveis-e-saida','review','relembrar','11','ac000000-0000-4000-8001-000000000004');
    RAISE EXCEPTION 'Revisão foi aceita antes da data';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END;
$$;
RESET ROLE;

UPDATE public.academy_progress SET review_due_at = now() - interval '1 day'
  WHERE user_id = 'ac000000-0000-4000-8000-000000000001' AND lesson_id = 'variaveis-e-saida';
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM public.academy_study('academy-pilot',1,'variaveis-e-saida','review','relembrar','11','ac000000-0000-4000-8001-000000000004');
  PERFORM public.academy_study('academy-pilot',1,'variaveis-e-saida','review','relembrar','11','ac000000-0000-4000-8001-000000000004');
  IF NOT EXISTS (SELECT FROM public.academy_progress WHERE lesson_id = 'variaveis-e-saida'
      AND python_draft = 'print(5)' AND review_count = 1 AND review_due_at > now()) THEN
    RAISE EXCEPTION 'Recuperação de rascunho ou agenda de revisão falhou';
  END IF;
END;
$$;
SELECT set_config('request.jwt.claim.sub','ac000000-0000-4000-8000-000000000002',true);
DO $$
BEGIN
  IF EXISTS (SELECT FROM public.academy_profiles) OR EXISTS (SELECT FROM public.academy_progress)
    OR EXISTS (SELECT FROM public.academy_attempts) THEN
    RAISE EXCEPTION 'A outra conta teve acesso ao estudo desta conta';
  END IF;
  BEGIN
    PERFORM public.academy_export_vocabulary('academy-pilot',1,'hello-my-name','ac000000-0000-4000-8000-000000000010');
    RAISE EXCEPTION 'Conta B conseguiu adicionar flashcards a uma nota alheia';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
ROLLBACK;

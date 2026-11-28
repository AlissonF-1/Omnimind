-- Use depois de importar content/academy/v2.example.json, apenas em banco descartável.
BEGIN;
INSERT INTO auth.users (id,email) VALUES
  ('ab100000-0000-4000-8000-000000000001','academy-v2-a@example.test'),
  ('ab100000-0000-4000-8000-000000000002','academy-v2-b@example.test');

SET LOCAL ROLE anon;
DO $$
BEGIN
  IF has_function_privilege('public.academy_study(text,integer,text,text,text,text,uuid)','execute')
     OR has_table_privilege('public.academy_verified_exercises','select') THEN
    RAISE EXCEPTION 'Sessão anônima tem acesso';
  END IF;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000001',true);
DO $$
DECLARE ex record;
DECLARE feedback jsonb;
DECLARE first_request uuid := gen_random_uuid();
BEGIN
  IF has_schema_privilege('academy_private','usage')
    OR has_function_privilege('public.academy_import_release_v2(text,integer,text,jsonb,jsonb,jsonb)','execute')
    OR has_table_privilege('public.academy_python_drafts','insert')
    OR has_table_privilege('public.academy_recognized_exercises','insert') THEN
    RAISE EXCEPTION 'Estudante pode importar, ler chaves ou forjar progresso';
  END IF;
  IF EXISTS (
    SELECT FROM public.academy_lessons WHERE release_id = 'academy-authoring-v2'
      AND lesson::text ~ '"(accepted|acceptedByField|correctOrder|correctLines|correctOptionId|pairs|hiddenCases|solution|explanation)"\s*:'
  ) THEN RAISE EXCEPTION 'Material público contém chaves'; END IF;

  FOR ex IN SELECT * FROM (VALUES
    ('escolher-funcao','"escrever"','"ler"'),
    ('ordenar-fluxo','["ler","calcular","mostrar"]','["ler","mostrar","calcular"]'),
    ('montar-python','[{"id":"laco","indent":0},{"id":"mostrar","indent":1}]','[{"id":"laco","indent":0},{"id":"mostrar","indent":0}]'),
    ('associar-funcoes','{"mostrar":"saida","capturar":"entrada"}','{"capturar":"saida","mostrar":"saida"}'),
    ('prever-console',E'A\r\n3\n',E' a\n3'),
    ('rastrear-itens','{"inicial":"3","final":"5"}','{"inicial":3,"final":"5"}'),
    ('complete-funcao','{"funcao":" PRINT "}','{"funcao":"print","extra":"print"}')
  ) sample(id, good, bad)
  LOOP
    feedback := public.academy_study('academy-authoring-v2',1,'variaveis-e-saida','answer',ex.id,ex.bad,gen_random_uuid());
    IF feedback->>'correct' <> 'false' OR feedback->>'feedback' NOT LIKE 'Releia%' THEN
      RAISE EXCEPTION 'Resposta errada aceita ou chave revelada em %', ex.id;
    END IF;
    feedback := public.academy_study('academy-authoring-v2',1,'variaveis-e-saida','answer',ex.id,ex.good,gen_random_uuid());
    IF feedback->>'correct' <> 'true' OR feedback->>'completed' <> 'false' THEN
      RAISE EXCEPTION 'Resposta certa recusada ou conclusão prematura em %', ex.id;
    END IF;
  END LOOP;
  feedback := public.academy_study('academy-authoring-v2',1,'variaveis-e-saida','answer','rastrear-itens','{',gen_random_uuid());
  IF feedback->>'correct' <> 'false' THEN RAISE EXCEPTION 'JSON inválido aceito'; END IF;
  PERFORM public.academy_study('academy-authoring-v2',1,'variaveis-e-saida','answer','prever-saida','5',first_request);
  PERFORM public.academy_study('academy-authoring-v2',1,'variaveis-e-saida','answer','prever-saida','9',first_request);
  IF (SELECT count(*) FROM public.academy_attempts WHERE request_id = first_request) <> 1 THEN
    RAISE EXCEPTION 'Reenvio criou uma segunda tentativa';
  END IF;
  feedback := public.academy_study('academy-authoring-v2',1,'variaveis-e-saida','answer','conferir-estoque','4',gen_random_uuid());
  IF feedback->>'completed' <> 'true' THEN RAISE EXCEPTION 'Conclusão não foi registrada'; END IF;

  PERFORM public.academy_study('academy-authoring-v2',1,'variaveis-e-saida','draft','atualizar-estoque','print(5)');
  PERFORM public.academy_study('academy-authoring-v2',1,'variaveis-e-saida','draft','ler-e-atualizar','print(int(input()) + 2)');
  PERFORM public.academy_study('academy-authoring-v2',1,'variaveis-e-saida','draft','atualizar-estoque','print(6)');
  IF (SELECT count(*) FROM public.academy_python_drafts WHERE release_id = 'academy-authoring-v2') <> 2
     OR NOT EXISTS (SELECT FROM public.academy_python_drafts WHERE exercise_id = 'ler-e-atualizar' AND code = 'print(int(input()) + 2)')
     OR NOT EXISTS (SELECT FROM public.academy_python_drafts WHERE exercise_id = 'atualizar-estoque' AND code = 'print(6)') THEN
    RAISE EXCEPTION 'Rascunhos não ficaram isolados por desafio';
  END IF;
  BEGIN
    PERFORM public.academy_study('academy-authoring-v2',1,'variaveis-e-saida','draft','escolher-funcao','print(1)');
    RAISE EXCEPTION 'Exercício não Python aceitou rascunho';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;

  PERFORM public.academy_study('academy-pilot',1,'variaveis-e-saida','answer','prever-saida','5','ab100000-0000-4000-8001-000000000001');
  PERFORM public.academy_study('academy-pilot',1,'variaveis-e-saida','draft',NULL,'print(5)');
END;
$$;

SELECT set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000002',true);
DO $$
BEGIN
  IF EXISTS (SELECT FROM public.academy_python_drafts) OR EXISTS (SELECT FROM public.academy_verified_exercises) THEN
    RAISE EXCEPTION 'Vazamento entre duas contas';
  END IF;
  PERFORM public.academy_study('academy-pilot',1,'variaveis-e-saida','answer','prever-saida','5',gen_random_uuid());
  PERFORM public.academy_study('academy-pilot',1,'variaveis-e-saida','answer','conferir-estoque','4',gen_random_uuid());
END;
$$;
RESET ROLE;

DO $$
DECLARE release_catalog jsonb;
DECLARE pages jsonb;
DECLARE keys jsonb;
DECLARE incompatible record;
BEGIN
  SELECT catalog || '{"schemaVersion":2}' INTO release_catalog FROM public.academy_releases WHERE id = 'academy-pilot' AND version = 1;
  SELECT jsonb_agg(CASE WHEN id IN ('variaveis-e-saida','decisoes-em-python')
    THEN lesson || '{"progressFromVersion":1}' ELSE lesson END ORDER BY id)
    INTO pages FROM public.academy_lessons WHERE release_id = 'academy-pilot' AND version = 1;
  SELECT jsonb_object_agg(lesson_id || '/' || exercise_id,grading) INTO keys
    FROM academy_private.answer_keys WHERE release_id = 'academy-pilot' AND version = 1;
  FOR incompatible IN SELECT * FROM (VALUES
    ('objective',release_catalog,jsonb_set(pages,'{3,objectives}','["Objetivo diferente"]'),keys),
    ('criteria',jsonb_set(release_catalog,'{competencies,0,mastery,version}','2'),pages,keys),
    ('answer',release_catalog,pages,jsonb_set(keys,'{variaveis-e-saida/prever-saida,accepted}','["8"]')),
    ('prerequisite',release_catalog,pages #- '{3,progressFromVersion}',keys)
  ) sample(change, catalog, lessons, grading)
  LOOP
    BEGIN
      PERFORM public.academy_import_release_v2('academy-pilot',2,repeat('d',64),incompatible.catalog,incompatible.lessons,incompatible.grading);
      RAISE EXCEPTION 'Mudança incompatível aceita: %', incompatible.change;
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
  END LOOP;
  IF EXISTS (SELECT FROM public.academy_releases WHERE id = 'academy-pilot' AND version = 2) THEN
    RAISE EXCEPTION 'Importação incompatível deixou dados publicados';
  END IF;
  pages := jsonb_set(pages,'{3,title}','"Título editorial revisado"');
  IF public.academy_import_release_v2('academy-pilot',2,repeat('e',64),release_catalog,pages,keys) <> 'imported' THEN
    RAISE EXCEPTION 'Versão equivalente não foi importada';
  END IF;
  IF public.academy_import_release_v2('academy-pilot',2,repeat('e',64),release_catalog,pages,keys) <> 'already_imported' THEN
    RAISE EXCEPTION 'Reimportação equivalente não foi idempotente';
  END IF;
END;
$$;

SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM public.academy_progress p JOIN public.academy_progress q
    ON (p.user_id,p.release_id,p.origin_version,p.lesson_id) = (q.user_id,q.release_id,q.version,q.lesson_id)
    WHERE p.release_id='academy-pilot' AND p.version=2 AND p.completed_at=q.completed_at
      AND p.review_due_at=q.review_due_at AND p.review_count=q.review_count) THEN
    RAISE EXCEPTION 'Conclusão e revisão equivalentes não foram preservadas';
  END IF;
  IF EXISTS (SELECT FROM public.academy_verified_exercises WHERE source_request_id='ab100000-0000-4000-8001-000000000001') THEN
    RAISE EXCEPTION 'Reconhecimento expôs evidência de outra conta';
  END IF;
END;
$$;
SELECT set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000001',true);
DO $$
DECLARE outcome jsonb;
BEGIN
  IF NOT EXISTS (SELECT FROM public.academy_verified_exercises WHERE release_id='academy-pilot' AND version=2
        AND source_request_id='ab100000-0000-4000-8001-000000000001')
    OR NOT EXISTS (SELECT FROM public.academy_python_drafts WHERE release_id='academy-pilot' AND version=2 AND code='print(5)')
    OR EXISTS (SELECT FROM public.academy_attempts WHERE release_id='academy-pilot' AND version=2) THEN
    RAISE EXCEPTION 'Evidência parcial e rascunho não foram transferidos, ou o histórico foi duplicado';
  END IF;
  outcome := public.academy_study('academy-pilot',2,'variaveis-e-saida','answer','conferir-estoque','4',gen_random_uuid());
  IF outcome->>'completed' <> 'true' THEN RAISE EXCEPTION 'Evidência equivalente não contou na conclusão'; END IF;
END;
$$;
ROLLBACK;

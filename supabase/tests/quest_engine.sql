-- Execute em um banco descartável com as duas migrations do módulo aplicadas.
BEGIN;

INSERT INTO auth.users (id, aud, role, email) VALUES
  ('00000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'quest-alice@example.test'),
  ('00000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'quest-bob@example.test');

DO $$
DECLARE
  first_version public.quest_question_versions%ROWTYPE;
  second_version_id uuid;
  correct_id uuid;
  wrong_id uuid;
  second_correct_id uuid;
BEGIN
  IF (SELECT count(*) FROM public.quest_competencies) <> 6
    OR (SELECT count(*) FROM quest_private.questions) <> 10
    OR (SELECT count(*) FROM public.quest_question_versions) <> 10
    OR (SELECT count(*) FROM public.quest_question_options) <> 50
    OR (SELECT count(*) FROM quest_private.question_answer_keys) <> 10 THEN
    RAISE EXCEPTION 'Esperadas seis competências e dez questões publicadas com opções e gabaritos.';
  END IF;

  SELECT version.* INTO STRICT first_version
  FROM public.quest_question_versions AS version
  JOIN quest_private.questions AS question ON question.id = version.question_id
  WHERE question.slug = 'sql-projecao-livros' AND version.version = 1;

  SELECT id INTO STRICT correct_id FROM public.quest_question_options
  WHERE question_version_id = first_version.id AND position = 2;
  SELECT id INTO STRICT wrong_id FROM public.quest_question_options
  WHERE question_version_id = first_version.id AND position = 1;

  BEGIN
    INSERT INTO public.quest_question_versions (question_id, competency_id, version, statement)
    VALUES (first_version.question_id, first_version.competency_id, 1, 'Duplicada');
    RAISE EXCEPTION 'A numeração da versão deve ser única por questão.';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.quest_question_versions (question_id, competency_id, version, statement)
    VALUES (first_version.question_id, first_version.competency_id, 2, 'Incompleta');
    SET CONSTRAINTS public.quest_version_complete IMMEDIATE;
    RAISE EXCEPTION 'Uma publicação incompleta não pode ser confirmada.';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    UPDATE public.quest_question_versions SET statement = 'Alterada' WHERE id = first_version.id;
    RAISE EXCEPTION 'O enunciado publicado deve ser imutável.';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    UPDATE public.quest_question_options SET body = 'Alterado' WHERE id = correct_id;
    RAISE EXCEPTION 'A alternativa publicada deve ser imutável.';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    UPDATE quest_private.question_answer_keys SET correct_option_id = wrong_id
    WHERE question_version_id = first_version.id;
    RAISE EXCEPTION 'O gabarito publicado deve ser imutável.';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  INSERT INTO public.quest_question_versions (question_id, competency_id, version, statement)
  VALUES (first_version.question_id, first_version.competency_id, 2, 'Enunciado da segunda versão')
  RETURNING id INTO second_version_id;

  INSERT INTO public.quest_question_options (question_version_id, position, body)
  SELECT second_version_id, position, body
  FROM public.quest_question_options WHERE question_version_id = first_version.id;

  SELECT id INTO STRICT second_correct_id FROM public.quest_question_options
  WHERE question_version_id = second_version_id AND position = 1;

  BEGIN
    INSERT INTO quest_private.question_answer_keys (question_version_id, correct_option_id, explanations)
    VALUES (second_version_id, correct_id, ARRAY['A', 'B', 'C', 'D', 'E']);
    RAISE EXCEPTION 'O gabarito deve pertencer à mesma versão da alternativa.';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  INSERT INTO quest_private.question_answer_keys (question_version_id, correct_option_id, explanations)
  VALUES (second_version_id, second_correct_id, ARRAY['A', 'B', 'C', 'D', 'E']);
  SET CONSTRAINTS public.quest_version_complete IMMEDIATE;

  PERFORM set_config('quest_test.version_id', first_version.id::text, true);
  PERFORM set_config('quest_test.correct_id', correct_id::text, true);
  PERFORM set_config('quest_test.wrong_id', wrong_id::text, true);
  PERFORM set_config('quest_test.second_correct_id', second_correct_id::text, true);
END;
$$;

SET LOCAL ROLE anon;
DO $$
BEGIN
  IF has_schema_privilege(current_user, 'quest_private', 'USAGE')
    OR has_table_privilege(current_user, 'public.quest_question_versions', 'SELECT')
    OR has_function_privilege(current_user, 'public.quest_get_attempt_feedback(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'O papel anônimo recebeu acesso ao motor.';
  END IF;

  BEGIN
    PERFORM public.quest_submit_answer(NULL, NULL, NULL);
    RAISE EXCEPTION 'O papel anônimo executou a correção.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{}', true);
  BEGIN
    PERFORM public.quest_submit_answer(NULL, NULL, NULL);
    RAISE EXCEPTION 'O papel authenticated sem identidade executou a correção.';
  EXCEPTION WHEN invalid_authorization_specification THEN NULL;
  END;
  IF EXISTS (SELECT 1 FROM public.quest_question_versions) THEN
    RAISE EXCEPTION 'O catálogo foi lido sem identidade autenticada.';
  END IF;
END;
$$;

DO $$
DECLARE
  alice_id constant text := '00000000-0000-4000-8000-000000000001';
  correct_request constant uuid := '00000000-0000-4000-8000-000000000010';
  wrong_request constant uuid := '00000000-0000-4000-8000-000000000011';
  version_id uuid := current_setting('quest_test.version_id');
  correct_id uuid := current_setting('quest_test.correct_id');
  wrong_id uuid := current_setting('quest_test.wrong_id');
  correct_feedback jsonb;
  wrong_feedback jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', alice_id, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', alice_id, 'role', 'authenticated')::text, true);

  IF has_schema_privilege(current_user, 'quest_private', 'USAGE')
    OR has_table_privilege(current_user, 'public.quest_attempts', 'INSERT')
    OR has_table_privilege(current_user, 'public.quest_attempts', 'UPDATE')
    OR has_table_privilege(current_user, 'public.quest_question_versions', 'INSERT') THEN
    RAISE EXCEPTION 'O estudante recebeu privilégios diretos além da leitura esperada.';
  END IF;

  BEGIN
    PERFORM correct_option_id FROM quest_private.question_answer_keys;
    RAISE EXCEPTION 'O estudante conseguiu ler o gabarito diretamente.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  IF (SELECT count(*) FROM public.quest_question_options WHERE question_version_id = version_id) <> 5
    OR EXISTS (
      SELECT 1
      FROM public.quest_question_options AS option_row
      WHERE option_row.question_version_id = version_id
        AND to_jsonb(option_row) - ARRAY['id', 'question_version_id', 'position', 'body'] <> '{}'::jsonb
    ) OR EXISTS (
      SELECT 1
      FROM public.quest_question_versions AS version_row
      WHERE version_row.id = version_id
        AND to_jsonb(version_row) - ARRAY['id', 'question_id', 'competency_id', 'version', 'statement', 'published_at'] <> '{}'::jsonb
    ) THEN
    RAISE EXCEPTION 'A leitura do catálogo deve conter apenas enunciado, metadados e alternativas.';
  END IF;

  BEGIN
    PERFORM public.quest_get_attempt_feedback(correct_request);
    RAISE EXCEPTION 'Houve feedback antes de uma tentativa.';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;

  correct_feedback := public.quest_submit_answer(version_id, correct_id, correct_request);
  IF correct_feedback->'isCorrect' IS DISTINCT FROM 'true'::jsonb
    OR correct_feedback->>'versionId' IS DISTINCT FROM version_id::text
    OR correct_feedback->>'correctOptionId' IS DISTINCT FROM correct_id::text
    OR correct_feedback #>> '{options,1,optionId}' IS DISTINCT FROM correct_id::text
    OR jsonb_array_length(correct_feedback->'options') IS DISTINCT FROM 5
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(correct_feedback->'options') AS option_row(value)
      WHERE coalesce(btrim(option_row.value->>'explanation'), '') = ''
    ) THEN
    RAISE EXCEPTION 'Correção ou explicações da resposta correta inválidas.';
  END IF;

  wrong_feedback := public.quest_submit_answer(version_id, wrong_id, wrong_request);
  IF wrong_feedback->'isCorrect' IS DISTINCT FROM 'false'::jsonb
    OR wrong_feedback->>'selectedOptionId' IS DISTINCT FROM wrong_id::text
    OR wrong_feedback->>'correctOptionId' IS DISTINCT FROM correct_id::text THEN
    RAISE EXCEPTION 'Correção da resposta incorreta inválida.';
  END IF;

  IF public.quest_submit_answer(version_id, correct_id, correct_request) IS DISTINCT FROM correct_feedback
    OR (SELECT count(*) FROM public.quest_attempts) <> 2 THEN
    RAISE EXCEPTION 'O reenvio idêntico deveria reutilizar a tentativa.';
  END IF;

  IF public.quest_get_attempt_feedback((correct_feedback->>'attemptId')::uuid) IS DISTINCT FROM correct_feedback THEN
    RAISE EXCEPTION 'A correção no histórico difere da resposta inicial.';
  END IF;

  BEGIN
    PERFORM public.quest_submit_answer(
      version_id, current_setting('quest_test.second_correct_id')::uuid, gen_random_uuid()
    );
    RAISE EXCEPTION 'A correção aceitou uma alternativa de outra versão.';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;

  PERFORM set_config('quest_test.alice_attempt_id', correct_feedback->>'attemptId', true);
END;
$$;

DO $$
DECLARE
  bob_id constant text := '00000000-0000-4000-8000-000000000002';
  alice_attempt_id uuid := current_setting('quest_test.alice_attempt_id');
  feedback jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', bob_id, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', bob_id, 'role', 'authenticated')::text, true);

  IF EXISTS (SELECT 1 FROM public.quest_attempts) THEN
    RAISE EXCEPTION 'Uma segunda conta conseguiu ler as tentativas da primeira.';
  END IF;

  BEGIN
    PERFORM public.quest_get_attempt_feedback(alice_attempt_id);
    RAISE EXCEPTION 'Uma segunda conta conseguiu ler a correção da primeira.';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;

  feedback := public.quest_submit_answer(
    current_setting('quest_test.version_id')::uuid,
    current_setting('quest_test.correct_id')::uuid,
    '00000000-0000-4000-8000-000000000010'
  );
  IF (feedback->>'attemptId')::uuid IS NOT DISTINCT FROM alice_attempt_id
    OR (SELECT count(*) FROM public.quest_attempts) <> 1 THEN
    RAISE EXCEPTION 'O identificador de reenvio deve ter escopo por usuário.';
  END IF;
END;
$$;
RESET ROLE;

ROLLBACK;
SELECT 'Motor de questões: testes de integração passaram.' AS resultado;

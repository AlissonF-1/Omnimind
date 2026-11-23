-- Execute após as migrations de Questões e Trilhas em um PostgreSQL descartável.
BEGIN;

INSERT INTO auth.users (id, aud, role, email) VALUES
  ('00000000-0000-4000-8000-000000001001', 'authenticated', 'authenticated', 'learn-student@example.test'),
  ('00000000-0000-4000-8000-000000001002', 'authenticated', 'authenticated', 'learn-reviewer@example.test');
INSERT INTO learning_private.challenge_reviewers VALUES ('00000000-0000-4000-8000-000000001002');

DO $$
DECLARE
  pilot uuid := (SELECT id FROM public.learning_paths WHERE slug = 'sql-concursos-e-mercado');
  keys jsonb;
BEGIN
  IF pilot IS NULL OR (SELECT count(*) FROM public.learning_path_steps WHERE path_id = pilot) <> 12
    OR (SELECT count(*) FROM public.learning_step_questions) <> 20
    OR (SELECT count(DISTINCT version_id) FROM public.learning_step_questions) <> 10
    OR EXISTS (
      SELECT 1 FROM public.learning_step_questions AS q
      JOIN public.quest_question_versions AS v ON v.id = q.version_id
      WHERE v.version <> 1
    ) THEN
    RAISE EXCEPTION 'A trilha deve fixar as dez versões piloto em 12 etapas.';
  END IF;
  SELECT jsonb_object_agg(question_version_id, correct_option_id) INTO keys FROM quest_private.question_answer_keys;
  PERFORM set_config('learning_test.keys', keys::text, true);
END;
$$;

SET LOCAL ROLE anon;
DO $$
BEGIN
  IF has_table_privilege(current_user, 'public.learning_paths', 'SELECT')
    OR has_function_privilege(current_user, 'public.learn_enroll(uuid)', 'EXECUTE')
    OR has_schema_privilege(current_user, 'learning_private', 'USAGE') THEN
    RAISE EXCEPTION 'Acesso indevido do papel anônimo.';
  END IF;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{}', true);
  BEGIN
    PERFORM public.learn_enroll(NULL);
    RAISE EXCEPTION 'Inscrição sem identidade aceita.';
  EXCEPTION WHEN invalid_authorization_specification THEN NULL;
  END;
  IF EXISTS (SELECT 1 FROM public.learning_paths) THEN RAISE EXCEPTION 'Catálogo sem identidade.'; END IF;
END;
$$;

DO $$
DECLARE
  keys jsonb := current_setting('learning_test.keys')::jsonb;
  pilot uuid;
  enrollment uuid;
  step record;
  question record;
  first_step uuid;
  first_practice uuid;
  final_step uuid;
  wrong_option uuid;
  chosen uuid;
  attempt_request uuid;
  feedback jsonb;
  replay jsonb;
  assessment_round integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000001001', true);
  SELECT id INTO STRICT pilot FROM public.learning_paths WHERE slug = 'sql-concursos-e-mercado';
  SELECT id INTO STRICT first_step FROM public.learning_path_steps WHERE path_id = pilot AND position = 1;
  SELECT id INTO STRICT first_practice FROM public.learning_path_steps WHERE path_id = pilot AND position = 2;
  SELECT id INTO STRICT final_step FROM public.learning_path_steps WHERE path_id = pilot AND position = 12;
  enrollment := public.learn_enroll(pilot);
  IF enrollment IS DISTINCT FROM public.learn_enroll(pilot) OR (SELECT count(*) FROM public.learning_enrollments) <> 1 THEN
    RAISE EXCEPTION 'A reinscrição deve devolver o mesmo registro.';
  END IF;
  IF has_schema_privilege(current_user, 'quest_private', 'USAGE')
    OR has_table_privilege(current_user, 'public.learning_step_progress', 'INSERT')
    OR public.learn_can_review() THEN
    RAISE EXCEPTION 'Permissões indevidas de estudante.';
  END IF;
  BEGIN
    PERFORM public.learn_confirm_reading(first_step);
    RAISE EXCEPTION 'Leitura concluída antes de ser aberta.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.learn_begin_step(first_practice);
    RAISE EXCEPTION 'Pré-requisito ignorado.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM public.learn_begin_step(first_step);
  IF NOT EXISTS (SELECT 1 FROM public.learning_step_progress WHERE step_id = first_step AND viewed_at IS NOT NULL AND completed_at IS NULL) THEN
    RAISE EXCEPTION 'Visualização precisa permanecer independente da confirmação.';
  END IF;

  FOR step IN SELECT * FROM public.learning_path_steps WHERE path_id = pilot AND position < 12 ORDER BY position LOOP
    PERFORM public.learn_begin_step(step.id);
    CASE step.kind
      WHEN 'reading' THEN
        PERFORM public.learn_confirm_reading(step.id);
        PERFORM public.learn_confirm_reading(step.id);
      WHEN 'practice' THEN
        IF step.id = first_practice THEN
          SELECT q.* INTO STRICT question FROM public.learning_step_questions AS q WHERE q.step_id = final_step AND position = 3;
          BEGIN
            PERFORM public.learn_answer_step(step.id, 1, question.version_id, (keys->>question.version_id::text)::uuid, gen_random_uuid());
            RAISE EXCEPTION 'Versão de outra etapa foi aceita.';
          EXCEPTION WHEN invalid_parameter_value THEN NULL;
          END;
          IF EXISTS (SELECT 1 FROM public.learning_step_progress AS p WHERE p.step_id = step.id AND p.completed_at IS NOT NULL) THEN
            RAISE EXCEPTION 'Prática sem resposta foi concluída.';
          END IF;
        END IF;
        FOR question IN SELECT * FROM public.learning_step_questions AS q WHERE q.step_id = step.id ORDER BY position LOOP
          attempt_request := gen_random_uuid();
          chosen := (keys->>question.version_id::text)::uuid;
          SELECT o.id INTO STRICT wrong_option FROM public.quest_question_options AS o
          WHERE o.question_version_id = question.version_id AND o.id <> chosen ORDER BY position LIMIT 1;
          IF step.id = first_practice AND question.position = 1 THEN
            PERFORM public.quest_submit_answer(question.version_id, chosen, attempt_request);
            IF EXISTS (SELECT 1 FROM public.learning_step_attempts AS a WHERE a.step_id = step.id) THEN
              RAISE EXCEPTION 'Tentativa feita fora da trilha contou como evidência.';
            END IF;
          END IF;
          feedback := public.learn_answer_step(step.id, 1, question.version_id, chosen, attempt_request);
          replay := public.learn_answer_step(step.id, 1, question.version_id, chosen, attempt_request);
          IF feedback IS DISTINCT FROM replay THEN RAISE EXCEPTION 'Reenvio não devolveu o mesmo recibo.'; END IF;
          BEGIN
            PERFORM public.learn_answer_step(step.id, 1, question.version_id, wrong_option, attempt_request);
            RAISE EXCEPTION 'Chave reaproveitada com outra resposta.';
          EXCEPTION WHEN unique_violation THEN NULL;
          END;
        END LOOP;
      WHEN 'challenge' THEN
        BEGIN
          PERFORM public.learn_submit_challenge(step.id, 'texto', 'https://github.com/example/repo');
          RAISE EXCEPTION 'A entrega aceitou dois formatos juntos.';
        EXCEPTION WHEN invalid_parameter_value THEN NULL;
        END;
        PERFORM public.learn_submit_challenge(step.id, 'Minha consulta para revisão manual.', NULL);
        PERFORM public.learn_submit_challenge(step.id, 'Minha consulta para revisão manual.', NULL);
        IF NOT EXISTS (
          SELECT 1 FROM public.learning_step_progress AS p
          WHERE p.step_id = step.id AND p.submitted_at IS NOT NULL AND p.reviewed_at IS NULL AND p.challenge_approved IS NULL
        ) THEN RAISE EXCEPTION 'A entrega recebeu avaliação indevida.'; END IF;
        BEGIN
          PERFORM public.learn_grade_challenge(step.id, enrollment, ARRAY[true, true, true, true]);
          RAISE EXCEPTION 'Estudante avaliou a própria entrega.';
        EXCEPTION WHEN insufficient_privilege THEN NULL;
        END;
    END CASE;
  END LOOP;

  PERFORM public.learn_begin_step(final_step);
  FOR assessment_round IN 1..2 LOOP
    FOR question IN SELECT * FROM public.learning_step_questions AS q WHERE q.step_id = final_step ORDER BY position LOOP
      chosen := (keys->>question.version_id::text)::uuid;
      IF question.position > 5 + assessment_round THEN
        SELECT o.id INTO STRICT chosen FROM public.quest_question_options AS o
        WHERE o.question_version_id = question.version_id AND o.id <> chosen ORDER BY position LIMIT 1;
      END IF;
      PERFORM public.learn_answer_step(final_step, assessment_round, question.version_id, chosen, gen_random_uuid());
    END LOOP;
    IF assessment_round = 1 THEN
      IF EXISTS (SELECT 1 FROM public.learning_step_progress WHERE step_id = final_step AND completed_at IS NOT NULL)
        OR public.learn_restart_assessment(final_step, 1) <> 2
        OR public.learn_restart_assessment(final_step, 1) <> 2 THEN
        RAISE EXCEPTION 'Resultado de 6/10 ou reabertura não respeitou a rodada.';
      END IF;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM public.learning_step_progress WHERE completed_at IS NOT NULL) <> 12
    OR (SELECT count(*) FROM public.learning_step_attempts) <> 30
    OR NOT EXISTS (SELECT 1 FROM public.learning_step_rounds WHERE step_id = final_step AND round = 1 AND correct = 6 AND NOT passed)
    OR NOT EXISTS (SELECT 1 FROM public.learning_step_rounds WHERE step_id = final_step AND round = 2 AND correct = 7 AND passed) THEN
    RAISE EXCEPTION 'Progresso, evidências ou histórico de rodadas divergentes.';
  END IF;
  PERFORM set_config('learning_test.enrollment', enrollment::text, true);
END;
$$;

DO $$
DECLARE
  challenge uuid;
  student_enrollment uuid := current_setting('learning_test.enrollment')::uuid;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000001002', true);
  SELECT id INTO STRICT challenge FROM public.learning_path_steps WHERE kind = 'challenge';
  IF EXISTS (SELECT 1 FROM public.learning_enrollments)
    OR EXISTS (SELECT 1 FROM public.learning_step_progress)
    OR EXISTS (SELECT 1 FROM public.learning_step_attempts)
    OR EXISTS (SELECT 1 FROM public.learning_step_rounds) THEN
    RAISE EXCEPTION 'Outra conta leu dados individuais.';
  END IF;
  IF (SELECT count(*) FROM public.learn_review_queue(challenge)) <> 1 THEN
    RAISE EXCEPTION 'Revisor autorizado não encontrou a entrega pendente.';
  END IF;
  PERFORM public.learn_grade_challenge(challenge, student_enrollment, ARRAY[true, false, true, true]);
  PERFORM public.learn_grade_challenge(challenge, student_enrollment, ARRAY[true, false, true, true]);
  IF EXISTS (SELECT 1 FROM public.learn_review_queue(challenge)) THEN RAISE EXCEPTION 'Fila contém uma entrega já avaliada.'; END IF;

  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000001001', true);
  IF NOT EXISTS (
    SELECT 1 FROM public.learning_step_progress
    WHERE step_id = challenge AND reviewed_at IS NOT NULL AND challenge_approved = false
  ) THEN RAISE EXCEPTION 'Resultado da rubrica não foi persistido para o titular.'; END IF;
END;
$$;
RESET ROLE;
ROLLBACK;

SELECT 'Trilhas: testes de integração passaram.' AS result;

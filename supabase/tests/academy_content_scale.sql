\set ON_ERROR_STOP on
\set VERBOSITY terse

DO $$ BEGIN
  IF current_database() <> 'academy_scale_001_synthetic' THEN
    RAISE EXCEPTION 'Use apenas a base descartável academy_scale_001_synthetic';
  END IF;
  IF EXISTS (SELECT FROM public.academy_releases WHERE id = 'omni-content-001') THEN
    RAISE EXCEPTION 'Inicie em uma base de teste sem as edições editoriais';
  END IF;
END $$;

\i :edition1

CREATE FUNCTION pg_temp.expect(ok boolean, description text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Falhou: %', description; END IF;
END $$;

-- Derive submitted answers inside the test connection; psql never prints their values.
CREATE TEMP VIEW scale_replies AS
SELECT version, lesson_id, exercise_id, grading->>'phase' AS phase,
  CASE grading->>'kind'
    WHEN 'text' THEN grading->'accepted'->>0
    WHEN 'output' THEN grading->'accepted'->>0
    WHEN 'multiple-choice' THEN (grading->'correctOptionId')::text
    WHEN 'ordering' THEN (grading->'correctOrder')::text
    WHEN 'parsons' THEN (grading->'correctLines')::text
    WHEN 'matching' THEN (grading->'pairs')::text
    WHEN 'trace' THEN (SELECT jsonb_object_agg(key, value->0)::text FROM jsonb_each(grading->'acceptedByField'))
    WHEN 'fill-in' THEN (SELECT jsonb_object_agg(key, value->0)::text FROM jsonb_each(grading->'acceptedByField'))
  END AS reply
FROM academy_private.answer_keys WHERE release_id = 'omni-content-001' AND grading ? 'phase';
GRANT SELECT ON scale_replies TO authenticated;

SELECT pg_temp.expect((SELECT count(*) FROM public.academy_lessons WHERE release_id = 'omni-content-001' AND version = 1) = 10,
  'a edição 1 tem 10 aulas');

SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000051';
DO $$ DECLARE exercise record;
BEGIN
  FOR exercise IN SELECT * FROM scale_replies WHERE version = 1 AND phase <> 'review' ORDER BY lesson_id, exercise_id LOOP
    PERFORM pg_temp.expect((public.academy_study('omni-content-001', 1, exercise.lesson_id, 'answer',
      exercise.exercise_id, exercise.reply, gen_random_uuid())->>'correct')::boolean, 'correção da edição 1');
  END LOOP;
  FOR exercise IN SELECT e->>'id' AS id FROM public.academy_lessons l
    CROSS JOIN LATERAL jsonb_array_elements(l.lesson->'exercises') e
    WHERE l.release_id = 'omni-content-001' AND l.version = 1 AND l.id = 'tech-04' AND e->>'kind' = 'python'
  LOOP
    PERFORM public.academy_study('omni-content-001', 1, 'tech-04', 'draft', exercise.id,
      '# fixture ' || exercise.id);
  END LOOP;
END $$;
RESET ROLE;

UPDATE public.academy_progress SET review_due_at = now() - interval '1 minute'
WHERE user_id = '00000000-0000-4000-8000-000000000051' AND release_id = 'omni-content-001'
  AND version = 1 AND lesson_id = 'english-01';

SET ROLE authenticated;
DO $$ DECLARE exercise record;
BEGIN
  SELECT * INTO STRICT exercise FROM scale_replies WHERE version = 1 AND lesson_id = 'english-01' AND phase = 'review';
  PERFORM pg_temp.expect((public.academy_study('omni-content-001', 1, 'english-01', 'review',
    exercise.exercise_id, exercise.reply, gen_random_uuid())->>'correct')::boolean, 'revisão anterior à importação');
END $$;
SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000052';
DO $$ DECLARE exercise record;
BEGIN
  SELECT * INTO STRICT exercise FROM scale_replies WHERE version = 1 AND lesson_id = 'tech-01' AND phase <> 'review'
    ORDER BY exercise_id LIMIT 1;
  PERFORM public.academy_study('omni-content-001', 1, 'tech-01', 'answer', exercise.exercise_id, 'fixture incorreta', gen_random_uuid());
END $$;
RESET ROLE;

CREATE TEMP TABLE scale_old_progress AS SELECT * FROM public.academy_progress;
CREATE TEMP TABLE scale_old_attempts AS SELECT * FROM public.academy_attempts;
CREATE TEMP TABLE scale_old_drafts AS SELECT * FROM public.academy_python_drafts;
SELECT pg_temp.expect((SELECT count(*) FROM scale_old_progress WHERE completed_at IS NOT NULL) = 10
  AND (SELECT sum(review_count) FROM scale_old_progress) = 1
  AND (SELECT count(*) FROM scale_old_drafts) = 2, 'fixture possui 10 conclusões, uma revisão e dois rascunhos');

\i :edition2

CREATE TEMP TABLE scale_import_snapshot AS SELECT
  (SELECT count(*) FROM public.academy_progress) AS progress,
  (SELECT count(*) FROM public.academy_recognized_exercises) AS recognized,
  (SELECT count(*) FROM public.academy_python_drafts) AS drafts;

\i :edition2

SELECT pg_temp.expect((SELECT version FROM public.academy_current_releases WHERE id = 'omni-content-001') = 2
  AND (SELECT count(*) FROM public.academy_lessons WHERE release_id = 'omni-content-001' AND version = 2) = 20
  AND (SELECT count(*) FROM public.academy_lessons WHERE release_id = 'omni-content-001' AND version = 1) = 10
  AND (SELECT count(*) FROM public.academy_lessons WHERE release_id = 'academy-pilot') = 4, 'edições e piloto preservados');
SELECT pg_temp.expect((SELECT (progress, recognized, drafts) FROM scale_import_snapshot) = ROW(
  (SELECT count(*) FROM public.academy_progress), (SELECT count(*) FROM public.academy_recognized_exercises),
  (SELECT count(*) FROM public.academy_python_drafts)), 'reimportação sem duplicatas');
SELECT pg_temp.expect(NOT EXISTS (SELECT * FROM scale_old_progress EXCEPT SELECT * FROM public.academy_progress)
  AND NOT EXISTS (TABLE scale_old_attempts EXCEPT TABLE public.academy_attempts)
  AND NOT EXISTS (TABLE public.academy_attempts EXCEPT TABLE scale_old_attempts)
  AND NOT EXISTS (TABLE scale_old_drafts EXCEPT TABLE public.academy_python_drafts), 'histórico original intacto');
SELECT pg_temp.expect((SELECT count(*) FROM public.academy_progress WHERE release_id = 'omni-content-001' AND version = 2)
  = (SELECT count(*) FROM scale_old_progress) AND NOT EXISTS (
    SELECT FROM scale_old_progress old LEFT JOIN public.academy_progress new
      ON (new.user_id, new.release_id, new.lesson_id, new.origin_version, new.version)
        = (old.user_id, old.release_id, old.lesson_id, 1, 2)
    WHERE new.user_id IS NULL OR (new.completed_at, new.last_activity, new.review_count, new.review_due_at)
      IS DISTINCT FROM (old.completed_at, old.last_activity, old.review_count, old.review_due_at)
  ), 'transferência de progresso parcial, conclusões e agenda');
SELECT pg_temp.expect(NOT EXISTS (
    SELECT user_id, release_id, lesson_id, exercise_id, code FROM scale_old_drafts
    EXCEPT SELECT user_id, release_id, lesson_id, exercise_id, code FROM public.academy_python_drafts WHERE version = 2
  ) AND (SELECT count(*) FROM public.academy_python_drafts WHERE version = 2) = 2
  AND NOT EXISTS (
    SELECT user_id, lesson_id, exercise_id, request_id FROM scale_old_attempts WHERE is_correct AND NOT is_review
    EXCEPT SELECT user_id, lesson_id, exercise_id, source_request_id FROM public.academy_recognized_exercises WHERE version = 2
  ), 'rascunhos e evidência vinculada às tentativas originais');

SET ROLE authenticated;
DO $$ BEGIN
  PERFORM pg_temp.expect((SELECT count(*) FROM public.academy_progress) = 2
    AND (SELECT count(*) FROM public.academy_attempts) = 1
    AND NOT EXISTS (SELECT FROM public.academy_python_drafts), 'conta B não acessa os dados da conta A');
  BEGIN
    PERFORM public.academy_study('omni-content-001', 2, 'tech-06', 'start');
    RAISE EXCEPTION 'Conta sem pré-requisito iniciou aula';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.expect(NOT has_schema_privilege(current_user, 'academy_private', 'USAGE'), 'gabaritos privados');
END $$;

SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000051';
DO $$ DECLARE exercise record; grade jsonb; checks integer := 0;
BEGIN
  PERFORM public.academy_study('omni-content-001', 2, 'tech-06', 'start');
  PERFORM public.academy_study('omni-content-001', 2, 'english-06', 'start');
  BEGIN
    PERFORM public.academy_study('omni-content-001', 2, 'tech-07', 'start');
    RAISE EXCEPTION 'Aula subsequente abriu antes da conclusão';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  FOR exercise IN SELECT * FROM scale_replies WHERE version = 2 AND phase <> 'review'
    AND lesson_id NOT IN (SELECT lesson_id FROM scale_replies WHERE version = 1) ORDER BY lesson_id, exercise_id
  LOOP
    grade := public.academy_study('omni-content-001', 2, exercise.lesson_id, 'answer', exercise.exercise_id,
      'fixture incorreta', gen_random_uuid());
    PERFORM pg_temp.expect((grade->>'correct')::boolean = false, 'resposta incorreta');
    grade := public.academy_study('omni-content-001', 2, exercise.lesson_id, 'answer', exercise.exercise_id,
      exercise.reply, gen_random_uuid());
    PERFORM pg_temp.expect((grade->>'correct')::boolean AND length(grade->>'feedback') > 0, 'resposta correta com feedback');
    checks := checks + 1;
  END LOOP;
  PERFORM pg_temp.expect((SELECT count(*) FROM public.academy_progress WHERE version = 2 AND completed_at IS NOT NULL) = 20,
    'conclusão e desbloqueio das 10 aulas novas');
  RAISE NOTICE 'Exercícios novos com acerto e erro verificados: %', checks;
END $$;
RESET ROLE;

UPDATE public.academy_progress SET review_due_at = now() - interval '1 minute'
WHERE user_id = '00000000-0000-4000-8000-000000000051' AND version = 2 AND release_id = 'omni-content-001'
  AND origin_version IS NULL;
SET ROLE authenticated;
DO $$ DECLARE exercise record; checks integer := 0;
BEGIN
  FOR exercise IN SELECT * FROM scale_replies WHERE version = 2 AND phase = 'review'
    AND lesson_id NOT IN (SELECT lesson_id FROM scale_replies WHERE version = 1) ORDER BY lesson_id
  LOOP
    PERFORM pg_temp.expect((public.academy_study('omni-content-001', 2, exercise.lesson_id, 'review', exercise.exercise_id,
      'fixture incorreta', gen_random_uuid())->>'correct')::boolean = false, 'erro em revisão nova');
    PERFORM pg_temp.expect((public.academy_study('omni-content-001', 2, exercise.lesson_id, 'review', exercise.exercise_id,
      exercise.reply, gen_random_uuid())->>'correct')::boolean, 'acerto em revisão nova');
    checks := checks + 1;
  END LOOP;
  PERFORM pg_temp.expect(checks = 10, 'uma revisão por aula nova');
  RAISE NOTICE 'Revisões novas com acerto e erro verificados: %', checks;
END $$;
RESET ROLE;

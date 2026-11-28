BEGIN;

CREATE TABLE public.academy_python_drafts (
  user_id uuid NOT NULL,
  release_id text NOT NULL,
  version integer NOT NULL,
  lesson_id text NOT NULL,
  exercise_id text NOT NULL,
  code text NOT NULL CHECK (octet_length(code) <= 12000),
  PRIMARY KEY (user_id, release_id, version, lesson_id, exercise_id),
  FOREIGN KEY (user_id, release_id, version, lesson_id)
    REFERENCES public.academy_progress(user_id, release_id, version, lesson_id) ON DELETE CASCADE
);

ALTER TABLE public.academy_progress ADD COLUMN origin_version integer;
ALTER TABLE public.academy_progress ADD CONSTRAINT academy_progress_origin_fk
  FOREIGN KEY (user_id, release_id, origin_version, lesson_id)
  REFERENCES public.academy_progress(user_id, release_id, version, lesson_id);
ALTER TABLE public.academy_progress ADD CONSTRAINT academy_progress_origin_older CHECK (origin_version < version);

CREATE INDEX academy_progress_publication ON public.academy_progress (release_id, version, lesson_id);
CREATE INDEX academy_attempts_publication ON public.academy_attempts (release_id, version, lesson_id) WHERE is_correct AND NOT is_review;

CREATE TABLE public.academy_recognized_exercises (
  user_id uuid NOT NULL,
  release_id text NOT NULL,
  version integer NOT NULL,
  lesson_id text NOT NULL,
  exercise_id text NOT NULL,
  source_request_id uuid NOT NULL,
  PRIMARY KEY (user_id, release_id, version, lesson_id, exercise_id),
  FOREIGN KEY (user_id, release_id, version, lesson_id)
    REFERENCES public.academy_progress(user_id, release_id, version, lesson_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, source_request_id) REFERENCES public.academy_attempts(user_id, request_id)
);
CREATE INDEX academy_recognized_publication ON public.academy_recognized_exercises (release_id, version, lesson_id);

ALTER TABLE public.academy_python_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_recognized_exercises ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.academy_python_drafts, public.academy_recognized_exercises FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.academy_python_drafts, public.academy_recognized_exercises TO authenticated;
CREATE POLICY academy_drafts_own ON public.academy_python_drafts FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY academy_recognitions_own ON public.academy_recognized_exercises FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

INSERT INTO public.academy_python_drafts (user_id, release_id, version, lesson_id, exercise_id, code)
SELECT p.user_id, p.release_id, p.version, p.lesson_id, e.item->>'id', p.python_draft
FROM public.academy_progress p
JOIN public.academy_lessons l ON (l.release_id,l.version,l.id) = (p.release_id,p.version,p.lesson_id)
CROSS JOIN LATERAL jsonb_array_elements(l.lesson->'exercises') e(item)
WHERE p.python_draft IS NOT NULL AND e.item->>'kind' = 'python';

CREATE VIEW public.academy_verified_exercises WITH (security_invoker = true) AS
  SELECT user_id, release_id, version, lesson_id, exercise_id, request_id AS source_request_id
  FROM public.academy_attempts WHERE is_correct AND NOT is_review
  UNION ALL
  SELECT user_id, release_id, version, lesson_id, exercise_id, source_request_id
  FROM public.academy_recognized_exercises;
REVOKE ALL ON public.academy_verified_exercises FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.academy_verified_exercises TO authenticated;

CREATE FUNCTION academy_private.normalize_answer(value text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = '' AS $$
  SELECT lower(trim(regexp_replace(value, '[[:space:]]+', ' ', 'g')));
$$;

CREATE FUNCTION academy_private.verify_answer(grading jsonb, value text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = '' AS $$
DECLARE
  kind text := grading->>'kind';
  submitted jsonb;
BEGIN
  IF kind = 'text' THEN
    RETURN EXISTS (
      SELECT FROM jsonb_array_elements_text(grading->'accepted') expected(answer)
      WHERE academy_private.normalize_answer(expected.answer) = academy_private.normalize_answer(value)
    );
  END IF;
  IF kind = 'output' THEN
    RETURN EXISTS (
      SELECT FROM jsonb_array_elements_text(grading->'accepted') expected(answer)
      WHERE rtrim(replace(expected.answer, E'\r\n', E'\n'), E' \t\n\r') = rtrim(replace(value, E'\r\n', E'\n'), E' \t\n\r')
    );
  END IF;
  BEGIN
    submitted := value::jsonb;
  EXCEPTION WHEN invalid_text_representation OR untranslatable_character OR numeric_value_out_of_range OR program_limit_exceeded THEN
    RETURN false;
  END;
  CASE kind
    WHEN 'multiple-choice' THEN RETURN submitted = grading->'correctOptionId';
    WHEN 'ordering' THEN RETURN submitted = grading->'correctOrder';
    WHEN 'parsons' THEN RETURN submitted = grading->'correctLines';
    WHEN 'matching' THEN RETURN submitted = grading->'pairs';
    WHEN 'trace', 'fill-in' THEN
      IF jsonb_typeof(submitted) <> 'object' THEN RETURN false; END IF;
      RETURN ARRAY(SELECT x FROM jsonb_object_keys(submitted) x ORDER BY x) =
             ARRAY(SELECT x FROM jsonb_object_keys(grading->'acceptedByField') x ORDER BY x)
        AND NOT EXISTS (
          SELECT FROM jsonb_each(grading->'acceptedByField') field
          WHERE jsonb_typeof(submitted->field.key) <> 'string' OR NOT EXISTS (
            SELECT FROM jsonb_array_elements_text(field.value) expected(answer)
            WHERE CASE WHEN kind = 'trace' THEN trim(expected.answer) = trim(submitted->>field.key)
              ELSE academy_private.normalize_answer(expected.answer) = academy_private.normalize_answer(submitted->>field.key) END
          )
        );
    ELSE RETURN false;
  END CASE;
END;
$$;

-- Compare content stored in the database. The curator cannot bypass this check with a claimed hash.
CREATE FUNCTION academy_private.lesson_evidence(p_id text, p_version integer, p_lesson text)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  WITH RECURSIVE material AS (
    SELECT l.lesson, r.catalog FROM public.academy_lessons l
    JOIN public.academy_releases r ON (r.id,r.version) = (l.release_id,l.version)
    WHERE (l.release_id,l.version,l.id) = (p_id,p_version,p_lesson)
  ), competency_ids(id) AS (
    SELECT x FROM material, jsonb_array_elements_text(lesson->'competencies') x
    UNION
    SELECT requirement FROM competency_ids c, material,
      jsonb_array_elements(catalog->'competencies') skill,
      jsonb_array_elements_text(skill->'prerequisites') requirement
    WHERE skill->>'id' = c.id
  ), resource_ids(id) AS (
    SELECT x FROM material, jsonb_array_elements_text(lesson->'resources') x
    UNION SELECT x->>'resource' FROM material, jsonb_array_elements(lesson->'exercises') x
    UNION SELECT x->>'audio' FROM material, jsonb_array_elements(lesson->'dialogue') x
    UNION SELECT x->>'audio' FROM material, jsonb_array_elements(lesson->'vocabulary') x
  )
  SELECT jsonb_build_object(
    'objectives', lesson->'objectives',
    'prerequisites', lesson->'prerequisites',
    'directCompetencies', lesson->'competencies',
    'dialogue', lesson->'dialogue',
    'vocabulary', lesson->'vocabulary',
    'visual', lesson->'visual',
    'criteria', (SELECT jsonb_object_agg(x->>'id', jsonb_build_object('mastery',x->'mastery','prerequisites',x->'prerequisites'))
      FROM jsonb_array_elements(catalog->'competencies') x WHERE x->>'id' IN (SELECT id FROM competency_ids)),
    'exercises', (SELECT jsonb_object_agg(x->>'id',x - 'hints') FROM jsonb_array_elements(lesson->'exercises') x),
    'grading', (SELECT jsonb_object_agg(exercise_id, grading - 'explanation') FROM academy_private.answer_keys
      WHERE (release_id,version,lesson_id) = (p_id,p_version,p_lesson)),
    'resources', (SELECT jsonb_object_agg(x->>'id',x) FROM jsonb_array_elements(catalog->'resources') x
      WHERE x->>'id' IN (SELECT id FROM resource_ids))
  ) FROM material;
$$;

CREATE FUNCTION public.academy_import_release_v2(p_id text, p_version integer, p_digest text, p_catalog jsonb, p_lessons jsonb, p_keys jsonb)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  imported text;
  target jsonb;
  lesson_id text;
  source_version integer;
  old_evidence jsonb;
BEGIN
  IF p_catalog->'schemaVersion' IS DISTINCT FROM '2'::jsonb THEN
    RAISE EXCEPTION 'Use o contrato v2' USING ERRCODE = '22023';
  END IF;
  imported := public.academy_import_release(p_id, p_version, p_digest, p_catalog, p_lessons, p_keys);
  IF imported <> 'imported' THEN RETURN imported; END IF;

  FOR target IN SELECT x FROM jsonb_array_elements(p_lessons) x WHERE x ? 'progressFromVersion'
  LOOP
    lesson_id := target->>'id';
    source_version := (target->>'progressFromVersion')::integer;
    IF source_version IS NULL OR source_version < 1 OR source_version >= p_version THEN
      RAISE EXCEPTION 'Origem de progresso inválida para %', lesson_id USING ERRCODE = '22023';
    END IF;
    old_evidence := academy_private.lesson_evidence(p_id,source_version,lesson_id);
    IF old_evidence IS NULL OR old_evidence IS DISTINCT FROM academy_private.lesson_evidence(p_id,p_version,lesson_id) THEN
      RAISE EXCEPTION 'Equivalência recusada para %', lesson_id USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
      SELECT FROM jsonb_array_elements_text(target->'prerequisites') required(id)
      WHERE NOT EXISTS (SELECT FROM jsonb_array_elements(p_lessons) x
        WHERE x->>'id' = required.id AND x->>'progressFromVersion' = source_version::text)
    ) THEN RAISE EXCEPTION 'Pré-requisito de % sem equivalência com a mesma origem', lesson_id USING ERRCODE = '22023'; END IF;
  END LOOP;

  WITH transfers AS (
    SELECT x->>'id' AS id, (x->>'progressFromVersion')::integer AS origin
    FROM jsonb_array_elements(p_lessons) x WHERE x ? 'progressFromVersion'
  )
  INSERT INTO public.academy_progress (user_id, release_id, version, lesson_id, last_activity, completed_at, review_due_at, review_count, origin_version)
    SELECT p.user_id,p.release_id,p_version,p.lesson_id,p.last_activity,p.completed_at,p.review_due_at,p.review_count,p.version
    FROM public.academy_progress p JOIN transfers t ON (p.lesson_id,p.version) = (t.id,t.origin)
    WHERE p.release_id = p_id;

  INSERT INTO public.academy_python_drafts (user_id,release_id,version,lesson_id,exercise_id,code)
    SELECT d.user_id,d.release_id,p_version,d.lesson_id,d.exercise_id,d.code
    FROM public.academy_progress p JOIN public.academy_python_drafts d
      ON (d.user_id,d.release_id,d.version,d.lesson_id) = (p.user_id,p.release_id,p.origin_version,p.lesson_id)
    WHERE p.release_id = p_id AND p.version = p_version;

  INSERT INTO public.academy_recognized_exercises (user_id,release_id,version,lesson_id,exercise_id,source_request_id)
    SELECT DISTINCT ON (p.user_id,p.lesson_id,e.exercise_id) p.user_id,p.release_id,p_version,p.lesson_id,e.exercise_id,e.source_request_id
    FROM public.academy_progress p JOIN public.academy_verified_exercises e
      ON (e.user_id,e.release_id,e.version,e.lesson_id) = (p.user_id,p.release_id,p.origin_version,p.lesson_id)
    WHERE p.release_id = p_id AND p.version = p_version
    ORDER BY p.user_id,p.lesson_id,e.exercise_id,e.source_request_id;
  RETURN imported;
END;
$$;

CREATE OR REPLACE FUNCTION public.academy_study(
  p_id text, p_version integer, p_lesson text, p_action text,
  p_exercise text DEFAULT NULL, p_value text DEFAULT NULL, p_request uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid uuid := auth.uid();
  material jsonb;
  grading jsonb;
  result public.academy_progress%ROWTYPE;
  previous public.academy_attempts%ROWTYPE;
  python_ids text[];
  draft_exercise text;
  correct boolean;
  reviewing boolean := p_action = 'review';
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sessão necessária' USING ERRCODE = '42501'; END IF;
  IF p_action IS NULL OR p_action NOT IN ('start','answer','review','draft')
    OR pg_catalog.octet_length(coalesce(p_value,'')) > 12000 THEN
    RAISE EXCEPTION 'Atividade inválida' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(p_id, 47));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text, 48));
  SELECT lesson INTO material FROM public.academy_lessons WHERE release_id = p_id AND version = p_version AND id = p_lesson;
  IF material IS NULL THEN RAISE EXCEPTION 'Aula indisponível' USING ERRCODE = '22023'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(material->'prerequisites') requirement(id)
    WHERE NOT EXISTS (SELECT 1 FROM public.academy_progress
      WHERE user_id = uid AND release_id = p_id AND version = p_version AND lesson_id = requirement.id AND completed_at IS NOT NULL)
  ) THEN RAISE EXCEPTION 'Pré-requisito pendente' USING ERRCODE = '42501'; END IF;

  INSERT INTO public.academy_progress (user_id, release_id, version, lesson_id)
    VALUES (uid, p_id, p_version, p_lesson)
    ON CONFLICT (user_id, release_id, version, lesson_id) DO UPDATE SET last_activity = now()
    RETURNING * INTO result;
  IF p_action = 'start' THEN RETURN jsonb_build_object('started', true); END IF;
  IF p_action = 'draft' THEN
    SELECT array_agg(x->>'id') INTO python_ids FROM jsonb_array_elements(material->'exercises') x WHERE x->>'kind' = 'python';
    draft_exercise := coalesce(p_exercise, CASE WHEN cardinality(python_ids) = 1 THEN python_ids[1] END);
    IF draft_exercise IS NULL OR NOT coalesce(draft_exercise = ANY(python_ids), false) OR p_value IS NULL THEN
      RAISE EXCEPTION 'Desafio Python inválido' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.academy_python_drafts (user_id,release_id,version,lesson_id,exercise_id,code)
      VALUES (uid,p_id,p_version,p_lesson,draft_exercise,p_value)
      ON CONFLICT (user_id,release_id,version,lesson_id,exercise_id) DO UPDATE SET code = excluded.code;
    IF cardinality(python_ids) = 1 THEN
      UPDATE public.academy_progress SET python_draft = p_value WHERE user_id = uid AND release_id = p_id
        AND version = p_version AND lesson_id = p_lesson;
    END IF;
    RETURN jsonb_build_object('saved', true);
  END IF;

  IF p_request IS NULL OR p_exercise IS NULL OR p_value IS NULL THEN
    RAISE EXCEPTION 'Resposta inválida' USING ERRCODE = '22023';
  END IF;
  SELECT k.grading INTO grading FROM academy_private.answer_keys k
    WHERE k.release_id = p_id AND k.version = p_version AND k.lesson_id = p_lesson AND k.exercise_id = p_exercise;
  IF grading IS NULL OR NOT grading ? 'phase' OR reviewing IS DISTINCT FROM (grading->>'phase' = 'review') THEN
    RAISE EXCEPTION 'Exercício sem correção no servidor' USING ERRCODE = '22023';
  END IF;
  IF grading->>'kind' = 'text' AND length(trim(p_value)) NOT BETWEEN 1 AND 600 THEN
    RAISE EXCEPTION 'Resposta inválida' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO previous FROM public.academy_attempts WHERE user_id = uid AND request_id = p_request;
  IF FOUND THEN
    IF (previous.release_id, previous.version, previous.lesson_id, previous.exercise_id, previous.is_review)
      IS DISTINCT FROM (p_id, p_version, p_lesson, p_exercise, reviewing) THEN
      RAISE EXCEPTION 'Identificador de envio em uso' USING ERRCODE = '23505';
    END IF;
    correct := previous.is_correct;
  ELSE
    IF reviewing AND (result.review_due_at IS NULL OR result.review_due_at > now()) THEN
      RAISE EXCEPTION 'Revisão ainda indisponível' USING ERRCODE = '22023';
    END IF;
    correct := coalesce(academy_private.verify_answer(grading,p_value),false);
    INSERT INTO public.academy_attempts (user_id, request_id, release_id, version, lesson_id, exercise_id, is_correct, is_review)
      VALUES (uid, p_request, p_id, p_version, p_lesson, p_exercise, correct, reviewing);

    IF correct AND reviewing THEN
      UPDATE public.academy_progress SET review_count = review_count + 1, review_due_at = now() + interval '7 days'
        WHERE user_id = uid AND release_id = p_id AND version = p_version AND lesson_id = p_lesson RETURNING * INTO result;
    ELSIF correct AND result.completed_at IS NULL AND NOT EXISTS (
      SELECT 1 FROM academy_private.answer_keys k
      WHERE k.release_id = p_id AND k.version = p_version AND k.lesson_id = p_lesson
        AND k.grading->>'phase' IN ('practice','challenge') AND NOT EXISTS (
          SELECT 1 FROM public.academy_verified_exercises a WHERE a.user_id = uid AND a.release_id = p_id AND a.version = p_version
            AND a.lesson_id = p_lesson AND a.exercise_id = k.exercise_id
        )
    ) THEN
      UPDATE public.academy_progress SET completed_at = now(), review_due_at = now() + interval '1 day'
        WHERE user_id = uid AND release_id = p_id AND version = p_version AND lesson_id = p_lesson RETURNING * INTO result;
    END IF;
  END IF;
  RETURN jsonb_build_object('correct', correct, 'completed', result.completed_at IS NOT NULL,
    'feedback', CASE WHEN correct THEN grading->>'explanation' ELSE 'Releia o exemplo ou experimente uma dica e tente novamente.' END);
END;
$$;

REVOKE EXECUTE ON FUNCTION academy_private.lesson_evidence(text,integer,text),
  academy_private.verify_answer(jsonb,text), academy_private.normalize_answer(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.academy_import_release_v2(text,integer,text,jsonb,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.academy_study(text,integer,text,text,text,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academy_study(text,integer,text,text,text,text,uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;

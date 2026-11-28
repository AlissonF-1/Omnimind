BEGIN;

CREATE SCHEMA academy_private;
REVOKE ALL ON SCHEMA academy_private FROM PUBLIC, anon, authenticated;

CREATE TABLE public.academy_releases (
  id text NOT NULL CHECK (id ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  version integer NOT NULL CHECK (version > 0),
  digest text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  catalog jsonb NOT NULL CHECK (jsonb_typeof(catalog) = 'object'),
  published_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, version)
);

CREATE TABLE public.academy_lessons (
  release_id text NOT NULL,
  version integer NOT NULL,
  id text NOT NULL CHECK (id ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  lesson jsonb NOT NULL CHECK (jsonb_typeof(lesson) = 'object'),
  PRIMARY KEY (release_id, version, id),
  FOREIGN KEY (release_id, version) REFERENCES public.academy_releases(id, version)
);

CREATE TABLE academy_private.answer_keys (
  release_id text NOT NULL,
  version integer NOT NULL,
  lesson_id text NOT NULL,
  exercise_id text NOT NULL,
  grading jsonb NOT NULL CHECK (jsonb_typeof(grading) = 'object'),
  PRIMARY KEY (release_id, version, lesson_id, exercise_id),
  FOREIGN KEY (release_id, version, lesson_id) REFERENCES public.academy_lessons(release_id, version, id)
);

CREATE TABLE public.academy_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  minutes_per_day integer NOT NULL CHECK (minutes_per_day BETWEEN 10 AND 120)
);

CREATE TABLE public.academy_progress (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  release_id text NOT NULL,
  version integer NOT NULL,
  lesson_id text NOT NULL,
  last_activity timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  review_due_at timestamptz,
  review_count integer NOT NULL DEFAULT 0 CHECK (review_count >= 0),
  python_draft text CHECK (octet_length(python_draft) <= 12000),
  PRIMARY KEY (user_id, release_id, version, lesson_id),
  FOREIGN KEY (release_id, version, lesson_id) REFERENCES public.academy_lessons(release_id, version, id),
  CHECK ((completed_at IS NULL) = (review_due_at IS NULL))
);

CREATE TABLE public.academy_attempts (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  release_id text NOT NULL,
  version integer NOT NULL,
  lesson_id text NOT NULL,
  exercise_id text NOT NULL,
  is_correct boolean NOT NULL,
  is_review boolean NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, request_id),
  FOREIGN KEY (release_id, version, lesson_id) REFERENCES public.academy_lessons(release_id, version, id)
);

CREATE INDEX academy_attempts_evidence ON public.academy_attempts
  (user_id, release_id, version, lesson_id, exercise_id) WHERE is_correct;
CREATE INDEX academy_progress_reviews ON public.academy_progress (user_id, review_due_at) WHERE review_due_at IS NOT NULL;

ALTER TABLE public.academy_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_private.answer_keys ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.academy_releases, public.academy_lessons, public.academy_profiles,
  public.academy_progress, public.academy_attempts, academy_private.answer_keys FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.academy_releases, public.academy_lessons, public.academy_profiles,
  public.academy_progress, public.academy_attempts TO authenticated;
GRANT INSERT, UPDATE ON public.academy_profiles TO authenticated;

CREATE POLICY academy_releases_read ON public.academy_releases FOR SELECT TO authenticated USING (true);
CREATE POLICY academy_lessons_read ON public.academy_lessons FOR SELECT TO authenticated USING (true);
CREATE POLICY academy_profiles_own ON public.academy_profiles FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY academy_progress_own ON public.academy_progress FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY academy_attempts_own ON public.academy_attempts FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE VIEW public.academy_current_releases WITH (security_invoker = true) AS
  SELECT DISTINCT ON (id) id, version, catalog FROM public.academy_releases ORDER BY id, version DESC;
REVOKE ALL ON public.academy_current_releases FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.academy_current_releases TO authenticated;

CREATE FUNCTION public.academy_import_release(p_id text, p_version integer, p_digest text, p_catalog jsonb, p_lessons jsonb, p_keys jsonb)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE existing public.academy_releases%ROWTYPE;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id, 47));
  SELECT * INTO existing FROM public.academy_releases WHERE id = p_id AND version = p_version;
  IF FOUND THEN
    IF existing.digest = p_digest AND existing.catalog = p_catalog
      AND (SELECT coalesce(jsonb_agg(lesson ORDER BY id), '[]'::jsonb) FROM public.academy_lessons
            WHERE release_id = p_id AND version = p_version) = (SELECT jsonb_agg(x ORDER BY x->>'id') FROM jsonb_array_elements(p_lessons) x)
      AND (SELECT coalesce(jsonb_object_agg(lesson_id || '/' || exercise_id, grading), '{}'::jsonb) FROM academy_private.answer_keys
            WHERE release_id = p_id AND version = p_version) = p_keys THEN
      RETURN 'already_imported';
    END IF;
    RAISE EXCEPTION 'Versão já registrada com conteúdo diferente' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM public.academy_releases WHERE id = p_id AND version > p_version) THEN
    RAISE EXCEPTION 'Versão anterior à versão instalada' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.academy_releases (id, version, digest, catalog) VALUES (p_id, p_version, p_digest, p_catalog);
  INSERT INTO public.academy_lessons (release_id, version, id, lesson)
    SELECT p_id, p_version, x->>'id', x FROM jsonb_array_elements(p_lessons) x;
  INSERT INTO academy_private.answer_keys (release_id, version, lesson_id, exercise_id, grading)
    SELECT p_id, p_version, split_part(key, '/', 1), split_part(key, '/', 2), value FROM jsonb_each(p_keys);
  RETURN 'imported';
END;
$$;

CREATE FUNCTION public.academy_study(
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
  correct boolean;
  reviewing boolean := p_action = 'review';
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sessão necessária' USING ERRCODE = '42501'; END IF;
  IF p_action IS NULL OR p_action NOT IN ('start','answer','review','draft')
    OR pg_catalog.octet_length(coalesce(p_value,'')) > 12000 THEN
    RAISE EXCEPTION 'Atividade inválida' USING ERRCODE = '22023';
  END IF;
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
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(material->'exercises') x WHERE x->>'kind' = 'python') THEN
      RAISE EXCEPTION 'Aula sem laboratório' USING ERRCODE = '22023';
    END IF;
    UPDATE public.academy_progress SET python_draft = p_value WHERE user_id = uid AND release_id = p_id
      AND version = p_version AND lesson_id = p_lesson;
    RETURN jsonb_build_object('saved', true);
  END IF;

  IF p_request IS NULL OR p_exercise IS NULL OR length(trim(coalesce(p_value,''))) NOT BETWEEN 1 AND 600 THEN
    RAISE EXCEPTION 'Resposta inválida' USING ERRCODE = '22023';
  END IF;
  SELECT k.grading INTO grading FROM academy_private.answer_keys k
    WHERE k.release_id = p_id AND k.version = p_version AND k.lesson_id = p_lesson AND k.exercise_id = p_exercise;
  IF grading IS NULL OR grading->>'kind' <> 'text'
    OR reviewing IS DISTINCT FROM (grading->>'phase' = 'review') THEN
    RAISE EXCEPTION 'Exercício sem correção no servidor' USING ERRCODE = '22023';
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
    correct := EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(grading->'accepted') accepted(answer)
      WHERE lower(regexp_replace(trim(accepted.answer), '[[:space:]]+', ' ', 'g')) =
            lower(trim(regexp_replace(p_value, '[[:space:]]+', ' ', 'g')))
    );
    INSERT INTO public.academy_attempts (user_id, request_id, release_id, version, lesson_id, exercise_id, is_correct, is_review)
      VALUES (uid, p_request, p_id, p_version, p_lesson, p_exercise, correct, reviewing);

    IF correct AND reviewing THEN
      UPDATE public.academy_progress SET review_count = review_count + 1, review_due_at = now() + interval '7 days'
        WHERE user_id = uid AND release_id = p_id AND version = p_version AND lesson_id = p_lesson RETURNING * INTO result;
    ELSIF correct AND result.completed_at IS NULL AND NOT EXISTS (
      SELECT 1 FROM academy_private.answer_keys k
      WHERE k.release_id = p_id AND k.version = p_version AND k.lesson_id = p_lesson
        AND k.grading->>'kind' = 'text' AND k.grading->>'phase' <> 'review' AND NOT EXISTS (
          SELECT 1 FROM public.academy_attempts a WHERE a.user_id = uid AND a.release_id = p_id AND a.version = p_version
            AND a.lesson_id = p_lesson AND a.exercise_id = k.exercise_id AND a.is_correct
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

REVOKE EXECUTE ON FUNCTION public.academy_import_release(text, integer, text, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.academy_study(text, integer, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academy_study(text, integer, text, text, text, text, uuid) TO authenticated;

COMMIT;

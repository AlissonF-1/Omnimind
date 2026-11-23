CREATE SCHEMA learning_private;
REVOKE ALL ON SCHEMA learning_private FROM PUBLIC, anon, authenticated;

CREATE TABLE public.learning_paths (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  kind text NOT NULL CHECK (kind IN ('concurso', 'mercado')),
  title text NOT NULL CHECK (btrim(title) <> ''),
  description text NOT NULL CHECK (btrim(description) <> ''),
  published_at timestamptz
);

CREATE TABLE public.learning_path_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  path_id uuid NOT NULL REFERENCES public.learning_paths(id),
  position integer NOT NULL CHECK (position > 0),
  topic text NOT NULL CHECK (btrim(topic) <> ''),
  title text NOT NULL CHECK (btrim(title) <> ''),
  kind text NOT NULL CHECK (kind IN ('reading', 'practice', 'challenge', 'assessment')),
  body text CHECK (btrim(body) <> ''),
  passing_score integer,
  rubric text[],
  UNIQUE (path_id, position),
  UNIQUE (path_id, id),
  CHECK ((kind IN ('reading', 'challenge')) = (body IS NOT NULL)),
  CHECK ((kind = 'assessment' AND passing_score > 0 AND passing_score IS NOT NULL)
      OR (kind <> 'assessment' AND passing_score IS NULL)),
  CHECK ((kind = 'challenge' AND rubric IS NOT NULL AND array_ndims(rubric) = 1
      AND array_lower(rubric, 1) = 1 AND cardinality(rubric) BETWEEN 1 AND 8
      AND array_position(rubric, NULL) IS NULL)
      OR (kind <> 'challenge' AND rubric IS NULL))
);

CREATE TABLE public.learning_step_questions (
  step_id uuid NOT NULL REFERENCES public.learning_path_steps(id),
  version_id uuid NOT NULL REFERENCES public.quest_question_versions(id),
  position integer NOT NULL CHECK (position > 0),
  PRIMARY KEY (step_id, version_id),
  UNIQUE (step_id, position)
);
CREATE INDEX learning_step_questions_version_idx ON public.learning_step_questions (version_id);

CREATE TABLE public.learning_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  path_id uuid NOT NULL REFERENCES public.learning_paths(id),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, path_id),
  UNIQUE (id, path_id)
);
CREATE INDEX learning_enrollments_path_idx ON public.learning_enrollments (path_id);

CREATE TABLE public.learning_step_progress (
  enrollment_id uuid NOT NULL,
  path_id uuid NOT NULL,
  step_id uuid NOT NULL,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz CHECK (completed_at >= viewed_at),
  submission_text text CHECK (char_length(btrim(submission_text)) BETWEEN 1 AND 12000),
  submission_url text CHECK (char_length(submission_url) <= 2048
    AND submission_url ~ '^https://[[:alnum:]][^/@?#[:space:][:cntrl:]]*/[^[:space:][:cntrl:]]+$'
    AND strpos(submission_url, chr(92)) = 0),
  submitted_at timestamptz CHECK (submitted_at >= viewed_at),
  reviewed_at timestamptz CHECK (reviewed_at >= submitted_at),
  review_checks boolean[],
  challenge_approved boolean,
  PRIMARY KEY (enrollment_id, step_id),
  FOREIGN KEY (enrollment_id, path_id) REFERENCES public.learning_enrollments(id, path_id) ON DELETE CASCADE,
  FOREIGN KEY (path_id, step_id) REFERENCES public.learning_path_steps(path_id, id),
  CHECK ((submitted_at IS NULL AND num_nonnulls(submission_text, submission_url) = 0)
      OR (submitted_at IS NOT NULL AND num_nonnulls(submission_text, submission_url) = 1
        AND completed_at IS NOT NULL AND completed_at = submitted_at)),
  CHECK ((reviewed_at IS NULL AND review_checks IS NULL AND challenge_approved IS NULL)
      OR (reviewed_at IS NOT NULL AND submitted_at IS NOT NULL AND review_checks IS NOT NULL
          AND challenge_approved IS NOT NULL))
);
CREATE INDEX learning_progress_challenge_queue_idx
  ON public.learning_step_progress (step_id, submitted_at, enrollment_id)
  WHERE submitted_at IS NOT NULL AND reviewed_at IS NULL;

CREATE TABLE public.learning_step_rounds (
  enrollment_id uuid NOT NULL,
  step_id uuid NOT NULL,
  round integer NOT NULL CHECK (round > 0),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz CHECK (finished_at >= started_at),
  correct integer,
  total integer,
  passed boolean,
  PRIMARY KEY (enrollment_id, step_id, round),
  FOREIGN KEY (enrollment_id, step_id) REFERENCES public.learning_step_progress(enrollment_id, step_id) ON DELETE CASCADE,
  CHECK ((finished_at IS NULL AND num_nonnulls(correct, total, passed) = 0)
    OR (finished_at IS NOT NULL AND num_nonnulls(correct, total, passed) = 3 AND total > 0 AND correct BETWEEN 0 AND total))
);

CREATE TABLE public.learning_step_attempts (
  enrollment_id uuid NOT NULL,
  step_id uuid NOT NULL,
  round integer NOT NULL,
  version_id uuid NOT NULL,
  attempt_id uuid NOT NULL UNIQUE REFERENCES public.quest_attempts(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  PRIMARY KEY (enrollment_id, step_id, round, version_id),
  UNIQUE (enrollment_id, step_id, round, request_id),
  FOREIGN KEY (enrollment_id, step_id, round) REFERENCES public.learning_step_rounds(enrollment_id, step_id, round) ON DELETE CASCADE,
  FOREIGN KEY (step_id, version_id) REFERENCES public.learning_step_questions(step_id, version_id)
);

CREATE TABLE learning_private.challenge_reviewers (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE learning_private.challenge_reviewers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON learning_private.challenge_reviewers FROM PUBLIC, anon, authenticated;

ALTER TABLE public.learning_paths ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_path_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_step_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_step_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_step_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_step_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.learning_paths, public.learning_path_steps, public.learning_step_questions,
  public.learning_enrollments, public.learning_step_progress, public.learning_step_rounds,
  public.learning_step_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.learning_paths, public.learning_path_steps, public.learning_step_questions,
  public.learning_enrollments, public.learning_step_progress, public.learning_step_rounds,
  public.learning_step_attempts TO authenticated;

CREATE POLICY learning_published_paths ON public.learning_paths FOR SELECT TO authenticated
  USING (published_at <= now() AND (SELECT auth.uid()) IS NOT NULL);
CREATE POLICY learning_published_steps ON public.learning_path_steps FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.learning_paths AS p WHERE p.id = path_id));
CREATE POLICY learning_published_questions ON public.learning_step_questions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.learning_path_steps AS s WHERE s.id = step_id));
CREATE POLICY learning_own_enrollments ON public.learning_enrollments FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY learning_own_progress ON public.learning_step_progress FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.learning_enrollments AS e WHERE e.id = enrollment_id));
CREATE POLICY learning_own_rounds ON public.learning_step_rounds FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.learning_enrollments AS e WHERE e.id = enrollment_id));
CREATE POLICY learning_own_attempts ON public.learning_step_attempts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.learning_enrollments AS e WHERE e.id = enrollment_id));

CREATE FUNCTION learning_private.lock_enrollment(p_step_id uuid) RETURNS uuid
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  enrollment uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão necessária.' USING ERRCODE = '28000';
  END IF;

  SELECT e.id INTO enrollment
  FROM public.learning_enrollments AS e
  JOIN public.learning_path_steps AS s ON s.path_id = e.path_id
  JOIN public.learning_paths AS p ON p.id = e.path_id
  WHERE s.id = p_step_id AND e.user_id = auth.uid() AND p.published_at <= now()
  FOR UPDATE OF e;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Etapa indisponível para esta inscrição.' USING ERRCODE = '42501';
  END IF;
  RETURN enrollment;
END;
$$;

CREATE FUNCTION public.learn_enroll(p_path_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  learner uuid := auth.uid();
  enrollment uuid;
BEGIN
  IF learner IS NULL THEN
    RAISE EXCEPTION 'Sessão necessária.' USING ERRCODE = '28000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.learning_paths WHERE id = p_path_id AND published_at <= now()) THEN
    RAISE EXCEPTION 'Trilha indisponível.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.learning_enrollments (path_id, user_id) VALUES (p_path_id, learner)
  ON CONFLICT (user_id, path_id) DO NOTHING RETURNING id INTO enrollment;
  IF NOT FOUND THEN
    SELECT id INTO STRICT enrollment FROM public.learning_enrollments WHERE user_id = learner AND path_id = p_path_id;
  END IF;
  RETURN enrollment;
END;
$$;

CREATE FUNCTION public.learn_begin_step(p_step_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  enrollment uuid := learning_private.lock_enrollment(p_step_id);
  step public.learning_path_steps%ROWTYPE;
BEGIN
  SELECT * INTO STRICT step FROM public.learning_path_steps WHERE id = p_step_id;
  IF EXISTS (
    SELECT 1 FROM public.learning_path_steps AS prior
    WHERE prior.path_id = step.path_id AND prior.position < step.position
    AND NOT EXISTS (
      SELECT 1 FROM public.learning_step_progress AS progress
      WHERE progress.enrollment_id = enrollment AND progress.step_id = prior.id
        AND progress.completed_at IS NOT NULL
    )
  ) THEN
    RAISE EXCEPTION 'Complete as etapas anteriores.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.learning_step_progress (enrollment_id, path_id, step_id)
  VALUES (enrollment, step.path_id, step.id) ON CONFLICT DO NOTHING;
  IF step.kind IN ('practice', 'assessment') THEN
    INSERT INTO public.learning_step_rounds (enrollment_id, step_id, round)
    VALUES (enrollment, step.id, 1) ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

CREATE FUNCTION public.learn_confirm_reading(p_step_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  enrollment uuid := learning_private.lock_enrollment(p_step_id);
BEGIN
  UPDATE public.learning_step_progress AS progress
  SET completed_at = coalesce(progress.completed_at, clock_timestamp())
  FROM public.learning_path_steps AS step
  WHERE step.id = p_step_id AND step.kind = 'reading'
    AND progress.step_id = step.id AND progress.enrollment_id = enrollment;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Abra a leitura antes de confirmar.' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE FUNCTION public.learn_submit_challenge(p_step_id uuid, p_text text, p_url text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  enrollment uuid := learning_private.lock_enrollment(p_step_id);
  progress public.learning_step_progress%ROWTYPE;
  delivery_text text := nullif(btrim(p_text, E' \t\r\n'), '');
  delivery_url text := nullif(btrim(p_url, E' \t\r\n'), '');
  delivery_at timestamptz := clock_timestamp();
BEGIN
  SELECT p.* INTO progress FROM public.learning_step_progress AS p
  JOIN public.learning_path_steps AS s ON s.id = p.step_id
  WHERE p.enrollment_id = enrollment AND p.step_id = p_step_id AND s.kind = 'challenge';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Abra o desafio antes de entregar.' USING ERRCODE = '42501';
  END IF;
  IF num_nonnulls(delivery_text, delivery_url) <> 1 THEN
    RAISE EXCEPTION 'Envie uma resposta ou um link.' USING ERRCODE = '22023';
  END IF;
  IF progress.submitted_at IS NOT NULL THEN
    IF progress.submission_text IS DISTINCT FROM delivery_text OR progress.submission_url IS DISTINCT FROM delivery_url THEN
      RAISE EXCEPTION 'Já existe uma entrega para esta etapa.' USING ERRCODE = '23505';
    END IF;
    RETURN;
  END IF;

  UPDATE public.learning_step_progress SET submission_text = delivery_text, submission_url = delivery_url,
    submitted_at = delivery_at, completed_at = delivery_at
  WHERE enrollment_id = enrollment AND step_id = p_step_id;
END;
$$;

CREATE FUNCTION public.learn_answer_step(
  p_step_id uuid, p_round integer, p_version_id uuid, p_option_id uuid, p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  enrollment uuid := learning_private.lock_enrollment(p_step_id);
  receipt public.quest_attempts%ROWTYPE;
  work public.learning_step_rounds%ROWTYPE;
  feedback jsonb;
  target integer;
  answered integer;
  score integer;
  threshold integer;
  passed_round boolean;
  finished timestamptz;
BEGIN
  IF p_round IS NULL OR p_round < 1 OR p_version_id IS NULL OR p_option_id IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'Tentativa incompleta.' USING ERRCODE = '22023';
  END IF;

  SELECT a.* INTO receipt FROM public.learning_step_attempts AS link
  JOIN public.quest_attempts AS a ON a.id = link.attempt_id
  WHERE link.enrollment_id = enrollment AND link.step_id = p_step_id
    AND link.round = p_round AND link.request_id = p_request_id AND a.user_id = auth.uid();
  IF FOUND THEN
    IF receipt.question_version_id <> p_version_id OR receipt.selected_option_id <> p_option_id THEN
      RAISE EXCEPTION 'Este envio já está associado a outra resposta.' USING ERRCODE = '23505';
    END IF;
    RETURN public.quest_get_attempt_feedback(receipt.id);
  END IF;

  SELECT r.* INTO work FROM public.learning_step_rounds AS r
  WHERE r.enrollment_id = enrollment AND r.step_id = p_step_id AND r.round = p_round;
  IF NOT FOUND OR work.finished_at IS NOT NULL THEN
    RAISE EXCEPTION 'A rodada não está aberta.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.learning_step_questions WHERE step_id = p_step_id AND version_id = p_version_id) THEN
    RAISE EXCEPTION 'Questão fora desta etapa.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.learning_step_attempts
    WHERE enrollment_id = enrollment AND step_id = p_step_id AND round = p_round AND version_id = p_version_id
  ) THEN
    RAISE EXCEPTION 'Questão já respondida nesta rodada.' USING ERRCODE = '23505';
  END IF;

  feedback := public.quest_submit_answer(p_version_id, p_option_id, pg_catalog.gen_random_uuid());
  INSERT INTO public.learning_step_attempts (enrollment_id, step_id, round, version_id, attempt_id, request_id)
  VALUES (enrollment, p_step_id, p_round, p_version_id, (feedback->>'attemptId')::uuid, p_request_id);

  SELECT count(*) INTO target FROM public.learning_step_questions WHERE step_id = p_step_id;
  SELECT count(*), count(*) FILTER (WHERE a.is_correct) INTO answered, score
  FROM public.learning_step_attempts AS link JOIN public.quest_attempts AS a ON a.id = link.attempt_id
  WHERE link.enrollment_id = enrollment AND link.step_id = p_step_id AND link.round = p_round
    AND a.user_id = auth.uid();
  IF answered = target THEN
    SELECT passing_score INTO threshold FROM public.learning_path_steps WHERE id = p_step_id;
    passed_round := threshold IS NULL OR score >= threshold;
    finished := clock_timestamp();
    UPDATE public.learning_step_rounds SET finished_at = finished, correct = score, total = target, passed = passed_round
    WHERE enrollment_id = enrollment AND step_id = p_step_id AND round = p_round;
    IF passed_round THEN
      UPDATE public.learning_step_progress SET completed_at = finished
      WHERE enrollment_id = enrollment AND step_id = p_step_id;
    END IF;
  END IF;
  RETURN feedback;
END;
$$;

CREATE FUNCTION public.learn_restart_assessment(p_step_id uuid, p_round integer) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  enrollment uuid := learning_private.lock_enrollment(p_step_id);
  next_round integer;
BEGIN
  SELECT max(r.round) INTO next_round FROM public.learning_step_rounds AS r
  WHERE r.enrollment_id = enrollment AND r.step_id = p_step_id;
  IF NOT EXISTS (
    SELECT 1 FROM public.learning_step_rounds AS r
    JOIN public.learning_path_steps AS s ON s.id = r.step_id AND s.kind = 'assessment'
    WHERE r.enrollment_id = enrollment AND r.step_id = p_step_id AND r.round = p_round AND r.passed = false
  ) THEN
    RAISE EXCEPTION 'Somente uma avaliação encerrada abaixo da meta pode ser refeita.' USING ERRCODE = '42501';
  END IF;
  IF next_round > p_round THEN
    RETURN next_round;
  END IF;
  INSERT INTO public.learning_step_rounds (enrollment_id, step_id, round)
  VALUES (enrollment, p_step_id, p_round + 1);
  RETURN p_round + 1;
END;
$$;

CREATE FUNCTION public.learn_can_review() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM learning_private.challenge_reviewers WHERE user_id = auth.uid())
$$;

CREATE FUNCTION public.learn_review_queue(p_step_id uuid)
RETURNS TABLE (enrollment_id uuid, submission_text text, submission_url text, submitted_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.learn_can_review() THEN
    RAISE EXCEPTION 'Revisor não autorizado.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT p.enrollment_id, p.submission_text, p.submission_url, p.submitted_at
    FROM public.learning_step_progress AS p
    JOIN public.learning_enrollments AS e ON e.id = p.enrollment_id
    JOIN public.learning_path_steps AS s ON s.id = p.step_id
    WHERE p.step_id = p_step_id AND s.kind = 'challenge' AND e.user_id <> auth.uid()
      AND p.submitted_at IS NOT NULL AND p.reviewed_at IS NULL
    ORDER BY p.submitted_at, p.enrollment_id LIMIT 50;
END;
$$;

CREATE FUNCTION public.learn_grade_challenge(p_step_id uuid, p_enrollment_id uuid, p_checks boolean[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  expected integer;
  prior_checks boolean[];
  prior_review timestamptz;
BEGIN
  IF NOT public.learn_can_review() THEN
    RAISE EXCEPTION 'Revisor não autorizado.' USING ERRCODE = '42501';
  END IF;
  SELECT cardinality(s.rubric), p.review_checks, p.reviewed_at INTO expected, prior_checks, prior_review
  FROM public.learning_step_progress AS p
  JOIN public.learning_path_steps AS s ON s.id = p.step_id AND s.kind = 'challenge'
  JOIN public.learning_enrollments AS e ON e.id = p.enrollment_id
  WHERE p.step_id = p_step_id AND p.enrollment_id = p_enrollment_id
    AND p.submitted_at IS NOT NULL AND e.user_id <> auth.uid()
  FOR UPDATE OF p;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entrega indisponível para avaliação.' USING ERRCODE = '42501';
  END IF;
  IF p_checks IS NULL OR array_ndims(p_checks) IS DISTINCT FROM 1 OR array_lower(p_checks, 1) IS DISTINCT FROM 1
    OR cardinality(p_checks) <> expected OR array_position(p_checks, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Rubrica incompleta.' USING ERRCODE = '22023';
  END IF;
  IF prior_review IS NOT NULL THEN
    IF prior_checks IS DISTINCT FROM p_checks THEN
      RAISE EXCEPTION 'A avaliação já foi registrada.' USING ERRCODE = '23505';
    END IF;
    RETURN;
  END IF;
  UPDATE public.learning_step_progress
  SET reviewed_at = clock_timestamp(), review_checks = p_checks, challenge_approved = (false <> ALL(p_checks))
  WHERE step_id = p_step_id AND enrollment_id = p_enrollment_id;
END;
$$;

REVOKE ALL ON FUNCTION learning_private.lock_enrollment(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.learn_enroll(uuid), public.learn_begin_step(uuid), public.learn_confirm_reading(uuid),
  public.learn_submit_challenge(uuid, text, text), public.learn_answer_step(uuid, integer, uuid, uuid, uuid),
  public.learn_restart_assessment(uuid, integer), public.learn_can_review(), public.learn_review_queue(uuid),
  public.learn_grade_challenge(uuid, uuid, boolean[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.learn_enroll(uuid), public.learn_begin_step(uuid), public.learn_confirm_reading(uuid),
  public.learn_submit_challenge(uuid, text, text), public.learn_answer_step(uuid, integer, uuid, uuid, uuid),
  public.learn_restart_assessment(uuid, integer), public.learn_can_review(), public.learn_review_queue(uuid),
  public.learn_grade_challenge(uuid, uuid, boolean[]) TO authenticated;

CREATE SCHEMA quest_private;
REVOKE ALL ON SCHEMA quest_private FROM PUBLIC, anon, authenticated;

CREATE TABLE public.quest_competencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text NOT NULL CHECK (name ~ '[^[:space:]]')
);

CREATE TABLE quest_private.questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

CREATE TABLE public.quest_question_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES quest_private.questions(id),
  competency_id uuid NOT NULL REFERENCES public.quest_competencies(id),
  version integer NOT NULL CHECK (version > 0),
  statement text NOT NULL CHECK (statement ~ '[^[:space:]]'),
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, version)
);

CREATE INDEX quest_versions_competency_idx
  ON public.quest_question_versions (competency_id, published_at DESC);

CREATE TABLE public.quest_question_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_version_id uuid NOT NULL REFERENCES public.quest_question_versions(id),
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 5),
  body text NOT NULL CHECK (body ~ '[^[:space:]]'),
  UNIQUE (question_version_id, position),
  UNIQUE (question_version_id, id)
);

CREATE UNIQUE INDEX quest_options_distinct_body_idx
  ON public.quest_question_options (question_version_id, lower(btrim(body)));

CREATE TABLE quest_private.question_answer_keys (
  question_version_id uuid PRIMARY KEY REFERENCES public.quest_question_versions(id),
  correct_option_id uuid NOT NULL,
  explanations text[] NOT NULL CHECK ((
    array_dims(explanations) = '[1:5]'
    AND explanations[1] ~ '[^[:space:]]' AND explanations[2] ~ '[^[:space:]]'
    AND explanations[3] ~ '[^[:space:]]' AND explanations[4] ~ '[^[:space:]]'
    AND explanations[5] ~ '[^[:space:]]'
  ) IS TRUE),
  FOREIGN KEY (question_version_id, correct_option_id)
    REFERENCES public.quest_question_options (question_version_id, id)
);

CREATE TABLE public.quest_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  question_version_id uuid NOT NULL REFERENCES public.quest_question_versions(id),
  selected_option_id uuid NOT NULL,
  is_correct boolean NOT NULL,
  answered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, request_id),
  FOREIGN KEY (question_version_id, selected_option_id)
    REFERENCES public.quest_question_options (question_version_id, id)
);

CREATE INDEX quest_attempts_history_idx
  ON public.quest_attempts (user_id, answered_at DESC, id);

ALTER TABLE quest_private.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quest_private.question_answer_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_competencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_question_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_question_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA quest_private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE
  public.quest_competencies, public.quest_question_versions,
  public.quest_question_options, public.quest_attempts
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE
  public.quest_competencies, public.quest_question_versions,
  public.quest_question_options, public.quest_attempts
  TO authenticated;

CREATE POLICY quest_competencies_read ON public.quest_competencies
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY quest_versions_read ON public.quest_question_versions
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY quest_options_read ON public.quest_question_options
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY quest_attempts_read_own ON public.quest_attempts
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

-- A publicação pode inserir as linhas em etapas dentro da mesma transação.
CREATE FUNCTION quest_private.check_published_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT count(*) FROM public.quest_question_options WHERE question_version_id = NEW.id) <> 5
    OR NOT EXISTS (
      SELECT 1 FROM quest_private.question_answer_keys WHERE question_version_id = NEW.id
    ) THEN
    RAISE EXCEPTION 'A versão publicada exige cinco alternativas e um gabarito.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER quest_version_complete
  AFTER INSERT ON public.quest_question_versions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION quest_private.check_published_version();

CREATE FUNCTION quest_private.reject_published_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Publique uma nova versão para modificar a questão.'
    USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER quest_version_immutable
  BEFORE UPDATE OR DELETE ON public.quest_question_versions
  FOR EACH ROW EXECUTE FUNCTION quest_private.reject_published_change();
CREATE TRIGGER quest_option_immutable
  BEFORE UPDATE OR DELETE ON public.quest_question_options
  FOR EACH ROW EXECUTE FUNCTION quest_private.reject_published_change();
CREATE TRIGGER quest_answer_key_immutable
  BEFORE UPDATE OR DELETE ON quest_private.question_answer_keys
  FOR EACH ROW EXECUTE FUNCTION quest_private.reject_published_change();

CREATE FUNCTION public.quest_get_attempt_feedback(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  feedback jsonb;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Sessão necessária.' USING ERRCODE = '28000';
  END IF;

  SELECT jsonb_build_object(
    'attemptId', attempt.id,
    'versionId', attempt.question_version_id,
    'selectedOptionId', attempt.selected_option_id,
    'correctOptionId', answer_key.correct_option_id,
    'isCorrect', attempt.is_correct,
    'answeredAt', attempt.answered_at,
    'options', (
      SELECT jsonb_agg(jsonb_build_object(
        'optionId', option_row.id,
        'position', option_row.position,
        'explanation', answer_key.explanations[option_row.position]
      ) ORDER BY option_row.position)
      FROM public.quest_question_options AS option_row
      WHERE option_row.question_version_id = attempt.question_version_id
    )
  ) INTO feedback
  FROM public.quest_attempts AS attempt
  JOIN quest_private.question_answer_keys AS answer_key
    ON answer_key.question_version_id = attempt.question_version_id
  WHERE attempt.id = p_attempt_id AND attempt.user_id = current_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tentativa não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  RETURN feedback;
END;
$$;

CREATE FUNCTION public.quest_submit_answer(
  p_version_id uuid,
  p_option_id uuid,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  answer_is_correct boolean;
  saved_attempt public.quest_attempts%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Sessão necessária.' USING ERRCODE = '28000';
  END IF;

  IF p_version_id IS NULL OR p_option_id IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'Identificadores da resposta incompletos.' USING ERRCODE = '22023';
  END IF;

  SELECT option_row.id = answer_key.correct_option_id INTO answer_is_correct
  FROM public.quest_question_options AS option_row
  JOIN quest_private.question_answer_keys AS answer_key
    ON answer_key.question_version_id = option_row.question_version_id
  WHERE option_row.question_version_id = p_version_id AND option_row.id = p_option_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Alternativa inválida para esta versão.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.quest_attempts (
    user_id, request_id, question_version_id, selected_option_id, is_correct
  ) VALUES (
    current_user_id, p_request_id, p_version_id, p_option_id, answer_is_correct
  )
  ON CONFLICT (user_id, request_id) DO NOTHING
  RETURNING * INTO saved_attempt;

  IF NOT FOUND THEN
    SELECT * INTO STRICT saved_attempt
    FROM public.quest_attempts
    WHERE user_id = current_user_id AND request_id = p_request_id;

    IF saved_attempt.question_version_id <> p_version_id OR saved_attempt.selected_option_id <> p_option_id THEN
      RAISE EXCEPTION 'Identificador de envio já associado a outra resposta.' USING ERRCODE = '23505';
    END IF;
  END IF;

  RETURN public.quest_get_attempt_feedback(saved_attempt.id);
END;
$$;

REVOKE ALL ON FUNCTION quest_private.check_published_version() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION quest_private.reject_published_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.quest_get_attempt_feedback(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.quest_submit_answer(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quest_get_attempt_feedback(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.quest_submit_answer(uuid, uuid, uuid) TO authenticated;

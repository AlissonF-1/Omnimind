BEGIN;

CREATE TABLE public.sql_lab_attempts (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  id uuid NOT NULL,
  challenge_slug text NOT NULL CHECK (challenge_slug IN ('select-where', 'and-or', 'join', 'group-having', 'count-null')),
  submission text NOT NULL CHECK (char_length(submission) BETWEEN 1 AND 4000 AND btrim(submission) <> ''),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  formative_feedback text CHECK (formative_feedback IS NULL OR char_length(formative_feedback) BETWEEN 1 AND 5000),
  PRIMARY KEY (user_id, id)
);

CREATE INDEX sql_lab_attempts_recent ON public.sql_lab_attempts (user_id, challenge_slug, submitted_at DESC);

ALTER TABLE public.sql_lab_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sql_lab_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT (id, challenge_slug, submission), UPDATE (formative_feedback) ON public.sql_lab_attempts TO authenticated;

CREATE POLICY sql_lab_attempts_select_own ON public.sql_lab_attempts
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY sql_lab_attempts_insert_own ON public.sql_lab_attempts
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY sql_lab_attempts_update_own ON public.sql_lab_attempts
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

COMMIT;

BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000000001', 'sql-lab-a@example.test'),
  ('00000000-0000-4000-8000-000000000002', 'sql-lab-b@example.test');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);

INSERT INTO public.sql_lab_attempts (id, challenge_slug, submission)
  VALUES ('00000000-0000-4000-8000-000000000021', 'join', 'SELECT nome FROM clientes');
INSERT INTO public.sql_lab_attempts (id, challenge_slug, submission)
  VALUES ('00000000-0000-4000-8000-000000000021', 'join', 'SELECT outro')
  ON CONFLICT (user_id,id) DO NOTHING;
UPDATE public.sql_lab_attempts SET formative_feedback = 'Revise o relacionamento.' WHERE id = '00000000-0000-4000-8000-000000000021';

DO $$
BEGIN
  IF (SELECT submission FROM public.sql_lab_attempts) IS DISTINCT FROM 'SELECT nome FROM clientes'
    OR (SELECT formative_feedback FROM public.sql_lab_attempts) IS DISTINCT FROM 'Revise o relacionamento.' THEN
    RAISE EXCEPTION 'A tentativa original ou seu feedback não foram preservados';
  END IF;
  BEGIN
    UPDATE public.sql_lab_attempts SET submission = 'SELECT outro';
    RAISE EXCEPTION 'A consulta gravada pode ser sobrescrita';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.sql_lab_attempts (user_id,id,challenge_slug,submission)
      VALUES ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000022','join','SELECT 1');
    RAISE EXCEPTION 'É possível definir o titular de uma tentativa';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.sql_lab_attempts) THEN RAISE EXCEPTION 'Tentativa de outra conta ficou visível'; END IF;
  UPDATE public.sql_lab_attempts SET formative_feedback = 'Texto de outra conta';
  IF FOUND THEN RAISE EXCEPTION 'Uma conta alterou a tentativa de outra'; END IF;
END $$;

SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM public.sql_lab_attempts;
    RAISE EXCEPTION 'Conta anônima acessou o histórico';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

ROLLBACK;

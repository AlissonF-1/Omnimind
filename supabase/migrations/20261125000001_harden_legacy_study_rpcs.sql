BEGIN;
SET LOCAL lock_timeout = '5s';

LOCK TABLE public.daily_study_logs IN SHARE MODE;

DO $$
DECLARE
  original_log oid := pg_catalog.to_regprocedure('public.increment_study_log(uuid)');
  legacy_log oid := pg_catalog.to_regprocedure('public.increment_study_log(uuid,text)');
  hourly_log oid := pg_catalog.to_regprocedure('public.increment_study_log(uuid,text,boolean)');
  health oid := pg_catalog.to_regprocedure('public.get_workspace_health(uuid)');
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc AS p
    WHERE p.pronamespace = 'public'::regnamespace
      AND ((p.proname = 'increment_study_log' AND p.oid IS DISTINCT FROM original_log
            AND p.oid IS DISTINCT FROM legacy_log AND p.oid IS DISTINCT FROM hourly_log)
        OR (p.proname = 'get_workspace_health' AND p.oid IS DISTINCT FROM health))
  ) THEN
    RAISE EXCEPTION 'Há assinaturas legadas adicionais. Confira os chamadores e as dependências antes de reconciliar.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_index AS i
    WHERE i.indrelid = 'public.daily_study_logs'::regclass
      AND i.indisunique AND i.indisvalid AND i.indisready AND i.indimmediate
      AND i.indpred IS NULL AND i.indexprs IS NULL AND i.indnkeyatts = 2
      AND ARRAY(
        SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY AS key(attnum, position)
        JOIN pg_catalog.pg_attribute AS a ON a.attrelid = i.indrelid AND a.attnum = key.attnum
        WHERE key.position <= i.indnkeyatts ORDER BY a.attname
      ) = ARRAY['study_date', 'user_id']
  ) THEN
    IF EXISTS (
      SELECT 1 FROM public.daily_study_logs
      WHERE user_id IS NOT NULL AND study_date IS NOT NULL
      GROUP BY user_id, study_date HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'Existem logs duplicados por titular e data. Reconcilie os registros antes de aplicar.';
    END IF;

    CREATE UNIQUE INDEX daily_study_logs_user_study_date_uidx
      ON public.daily_study_logs (user_id, study_date);
  END IF;

  -- Os três chamadores ficam distintos por aridade. PostgreSQL exige recriar
  -- as variantes com defaults. RESTRICT protege objetos dependentes.
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE oid = legacy_log AND pronargdefaults > 0) THEN
    DROP FUNCTION public.increment_study_log(uuid, text) RESTRICT;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE oid = hourly_log AND pronargdefaults > 0) THEN
    DROP FUNCTION public.increment_study_log(uuid, text, boolean) RESTRICT;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_workspace_health(p_user_id uuid)
RETURNS TABLE (
  workspace_id uuid, workspace_name text, workspace_description text,
  total_cards bigint, reviewed_cards bigint, avg_correctness double precision
)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Workspace indisponível para esta sessão.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY SELECT w.id, w.name, w.description, count(f.id), count(*) FILTER (WHERE f.reps > 0),
    avg(CASE WHEN f.reps > 0 THEN greatest(0, least(1, (f.reps - coalesce(f.lapses, 0))::double precision / f.reps)) END)
  FROM public.workspaces AS w
  LEFT JOIN public.notes AS n ON n.workspace_id = w.id AND n.user_id = p_user_id
  LEFT JOIN public.flashcards AS f ON f.note_id = n.id AND f.user_id = p_user_id
  WHERE w.user_id = p_user_id AND w.is_archived = false
  GROUP BY w.id, w.name, w.description;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_study_log(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Log indisponível para esta sessão.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.daily_study_logs AS log (user_id, study_date, review_count)
  VALUES (p_user_id, current_date, 1)
  ON CONFLICT (user_id, study_date) DO UPDATE
  SET review_count = log.review_count + 1, updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_study_log(p_user_id uuid, p_topic text)
RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Log indisponível para esta sessão.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.daily_study_logs AS log (user_id, study_date, review_count, topics)
  VALUES (p_user_id, current_date, 1, CASE WHEN p_topic IS NULL THEN '{}'::text[] ELSE ARRAY[p_topic] END)
  ON CONFLICT (user_id, study_date) DO UPDATE
  SET review_count = log.review_count + 1,
      topics = CASE
        WHEN p_topic IS NOT NULL AND NOT (p_topic = ANY(coalesce(log.topics, '{}'::text[])))
          THEN array_append(coalesce(log.topics, '{}'::text[]), p_topic)
        ELSE coalesce(log.topics, '{}'::text[])
      END,
      updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_study_log(p_user_id uuid, p_topic text, p_is_correct boolean)
RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  hour_slot integer := extract(hour FROM now() AT TIME ZONE 'America/Sao_Paulo')::integer + 1;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Log indisponível para esta sessão.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.daily_study_logs AS log (user_id, study_date, review_count, topics, hourly_reviews, hourly_correct)
  VALUES (
    p_user_id, current_date, 1, CASE WHEN p_topic IS NULL THEN '{}'::text[] ELSE ARRAY[p_topic] END,
    ARRAY(SELECT CASE WHEN i = hour_slot THEN 1 ELSE 0 END FROM generate_series(1, 24) AS i ORDER BY i),
    ARRAY(SELECT CASE WHEN i = hour_slot AND p_is_correct THEN 1 ELSE 0 END FROM generate_series(1, 24) AS i ORDER BY i)
  )
  ON CONFLICT (user_id, study_date) DO UPDATE
  SET review_count = log.review_count + 1,
      topics = CASE
        WHEN p_topic IS NOT NULL AND NOT (p_topic = ANY(coalesce(log.topics, '{}'::text[])))
          THEN array_append(coalesce(log.topics, '{}'::text[]), p_topic)
        ELSE coalesce(log.topics, '{}'::text[])
      END,
      hourly_reviews[hour_slot] = coalesce(log.hourly_reviews[hour_slot], 0) + 1,
      hourly_correct[hour_slot] = coalesce(log.hourly_correct[hour_slot], 0) + CASE WHEN p_is_correct THEN 1 ELSE 0 END,
      updated_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_workspace_health(uuid), public.increment_study_log(uuid), public.increment_study_log(uuid, text),
  public.increment_study_log(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_workspace_health(uuid), public.increment_study_log(uuid), public.increment_study_log(uuid, text),
  public.increment_study_log(uuid, text, boolean) TO authenticated;

COMMIT;

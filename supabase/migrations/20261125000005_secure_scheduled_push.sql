BEGIN;

DROP POLICY IF EXISTS "Permitir leitura pública de assinaturas" ON public.push_subscriptions;
REVOKE SELECT ON public.push_subscriptions FROM PUBLIC, anon;

CREATE SCHEMA push_private;
REVOKE ALL ON SCHEMA push_private FROM PUBLIC, anon, authenticated;

CREATE TABLE push_private.cron_credentials (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  token_hash bytea NOT NULL CHECK (octet_length(token_hash) = 32)
);
ALTER TABLE push_private.cron_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON push_private.cron_credentials FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.get_scheduled_push_targets(p_token text)
RETURNS TABLE (subscription jsonb, due_count integer, workspace_id uuid, streak integer, daily_goal integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' OR NOT EXISTS (
    SELECT 1 FROM push_private.cron_credentials AS credential
    WHERE credential.token_hash = pg_catalog.sha256(pg_catalog.convert_to(p_token, 'UTF8'))
  ) THEN
    RAISE EXCEPTION 'Agendamento indisponível.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH recipients AS (
    SELECT DISTINCT ps.user_id, prefs.daily_goal_default
    FROM public.push_subscriptions AS ps
    LEFT JOIN public.user_preferences AS prefs ON prefs.user_id = ps.user_id
    WHERE ps.user_id IS NOT NULL AND NOT coalesce(prefs.do_not_disturb, false)
  ), statistics AS (
    SELECT r.user_id, target.id AS workspace_id,
      (SELECT count(*)::integer FROM public.flashcards AS f
        JOIN public.notes AS n ON n.id = f.note_id AND n.user_id = r.user_id
        JOIN public.workspaces AS w ON w.id = n.workspace_id AND w.user_id = r.user_id AND w.is_archived = false
       WHERE f.user_id = r.user_id AND (f.state = 0 OR f.due <= now()
           OR (w.is_sprint_mode AND w.sprint_date >= now()))) AS due_count,
      (SELECT count(*)::integer FROM (
         SELECT log.study_date, row_number() OVER (ORDER BY log.study_date DESC) AS position,
                max(log.study_date) OVER () AS newest_date
         FROM public.daily_study_logs AS log
         WHERE log.user_id = r.user_id AND log.study_date BETWEEN today - 364 AND today
       ) AS log WHERE log.newest_date >= today - 1
           AND log.study_date = log.newest_date - (log.position::integer - 1)) AS streak,
      CASE WHEN exam.exam_date IS NULL THEN
          CASE WHEN r.daily_goal_default BETWEEN 1 AND 100 THEN r.daily_goal_default ELSE 10 END
        ELSE greatest(5, least(50, ceil((
          SELECT count(*) FROM public.flashcards AS f
          WHERE f.user_id = r.user_id AND f.state <> 0 AND f.due <= exam.exam_date::timestamptz
        )::numeric / greatest(1, exam.exam_date - today))::integer))
      END AS daily_goal
    FROM recipients AS r
    LEFT JOIN LATERAL (
      SELECT w.id FROM public.workspaces AS w WHERE w.user_id = r.user_id AND w.is_archived = false
      ORDER BY w.created_at DESC, w.id LIMIT 1
    ) AS target ON true
    LEFT JOIN LATERAL (
      SELECT g.exam_date FROM public.exam_goals AS g WHERE g.user_id = r.user_id AND g.exam_date >= today
      ORDER BY g.is_active_goal DESC NULLS LAST, g.exam_date LIMIT 1
    ) AS exam ON true
  )
  SELECT ps.subscription, s.due_count, s.workspace_id, s.streak, s.daily_goal
  FROM statistics AS s JOIN public.push_subscriptions AS ps ON ps.user_id = s.user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_scheduled_push_targets(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_scheduled_push_targets(text) TO anon;

COMMIT;

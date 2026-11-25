BEGIN;

-- O trigger continua vinculado em instalações existentes. Só ajustamos o ACL e o search_path.
ALTER FUNCTION public.handle_new_user() SET search_path = '';
ALTER FUNCTION public.update_modified_column() SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.handle_new_user(), public.update_modified_column() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_user_blind_spots(
  p_user_id uuid, p_workspace_id uuid DEFAULT NULL, p_limit integer DEFAULT 5
)
RETURNS TABLE (
  note_id uuid, workspace_id uuid, note_title text, workspace_name text,
  critical_cards bigint, total_lapses bigint
)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Pontos cegos indisponíveis para esta sessão.' USING ERRCODE = '42501';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'O limite deve estar entre 1 e 100.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT n.id, w.id, n.title, w.name, count(f.id) FILTER (WHERE f.lapses > 1), sum(f.lapses)
  FROM public.notes AS n
  JOIN public.flashcards AS f ON f.note_id = n.id AND f.user_id = p_user_id
  JOIN public.workspaces AS w ON w.id = n.workspace_id AND w.user_id = p_user_id
  WHERE n.user_id = p_user_id AND (p_workspace_id IS NULL OR n.workspace_id = p_workspace_id)
  GROUP BY n.id, w.id, n.title, w.name
  HAVING sum(f.lapses) > 0
  ORDER BY sum(f.lapses) DESC
  LIMIT p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_blind_spots(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_blind_spots(uuid, uuid, integer) TO authenticated;

COMMIT;

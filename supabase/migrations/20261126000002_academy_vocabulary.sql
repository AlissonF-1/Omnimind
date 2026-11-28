BEGIN;

CREATE FUNCTION public.academy_export_vocabulary(p_id text, p_version integer, p_lesson text, p_note uuid)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  uid uuid := auth.uid();
  vocabulary jsonb;
  added integer;
BEGIN
  IF uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.notes n JOIN public.workspaces w ON w.id = n.workspace_id
    WHERE n.id = p_note AND n.user_id = uid AND w.user_id = uid
  ) THEN RAISE EXCEPTION 'Nota indisponível' USING ERRCODE = '42501'; END IF;
  SELECT lesson->'vocabulary' INTO vocabulary FROM public.academy_lessons
    WHERE release_id = p_id AND version = p_version AND id = p_lesson;
  IF jsonb_typeof(vocabulary) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Aula sem vocabulário' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_note::text, 49));

  INSERT INTO public.flashcards (user_id, note_id, front, back, source_anchor)
    SELECT uid, p_note, card.term, card.translation || E'\n\n' || card.example, card.anchor
    FROM (
      SELECT DISTINCT ON (lower(x->>'term')) x->>'term' AS term, x->>'translation' AS translation, x->>'example' AS example,
        -- Repeat imports for the same lesson and note preserve the existing card and its FSRS state.
        'academy:' || p_id || ':' || p_lesson || ':' || md5(lower(x->>'term')) AS anchor
      FROM jsonb_array_elements(vocabulary) x ORDER BY lower(x->>'term'), x->>'term'
    ) card
    WHERE NOT EXISTS (
      SELECT 1 FROM public.flashcards f
      WHERE f.user_id = uid AND f.note_id = p_note AND f.source_anchor = card.anchor
    );
  GET DIAGNOSTICS added = ROW_COUNT;
  RETURN added;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.academy_export_vocabulary(text, integer, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academy_export_vocabulary(text, integer, text, uuid) TO authenticated;

COMMIT;

BEGIN;

CREATE TABLE public.academy_practice_items (
  id text NOT NULL CHECK (id ~ '^TECH-[A-Z0-9]+-[0-9]{4,6}$' OR id ~ '^EN-[A-Z0-9]+-[0-9]{4,6}$'),
  version integer NOT NULL CHECK (version BETWEEN 1 AND 999999),
  current_version boolean NOT NULL DEFAULT true,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 180),
  topic text NOT NULL CHECK (length(topic) BETWEEN 1 AND 250),
  module text NOT NULL CHECK (length(module) BETWEEN 1 AND 100),
  formations text[] NOT NULL CHECK (cardinality(formations) BETWEEN 1 AND 2 AND formations <@ ARRAY['tech','english']),
  lessons text[] NOT NULL DEFAULT '{}',
  skills text[] NOT NULL CHECK (cardinality(skills) BETWEEN 1 AND 32),
  misconceptions text[] NOT NULL DEFAULT '{}',
  prerequisites text[] NOT NULL DEFAULT '{}',
  difficulty text NOT NULL CHECK (difficulty IN ('basic','intermediate','application')),
  kind text NOT NULL CHECK (kind IN ('multiple-choice','output','trace','fill-in','ordering','parsons','matching','text','python')),
  activity jsonb NOT NULL CHECK (jsonb_typeof(activity) = 'object' AND octet_length(activity::text) <= 32768),
  digest bytea NOT NULL CHECK (octet_length(digest) = 32),
  PRIMARY KEY (id, version)
);
CREATE UNIQUE INDEX academy_practice_items_current ON public.academy_practice_items (id) WHERE current_version;
CREATE INDEX academy_practice_items_topic ON public.academy_practice_items (topic, id) WHERE current_version;
CREATE INDEX academy_practice_items_format ON public.academy_practice_items (kind, difficulty, id) WHERE current_version;
CREATE INDEX academy_practice_items_level ON public.academy_practice_items (difficulty, id) WHERE current_version;
CREATE INDEX academy_practice_items_module ON public.academy_practice_items (module, id) WHERE current_version;
CREATE INDEX academy_practice_items_skills ON public.academy_practice_items USING gin (skills) WHERE current_version;
CREATE INDEX academy_practice_items_lessons ON public.academy_practice_items USING gin (lessons) WHERE current_version;

CREATE TABLE public.academy_practice_skills (
  id text PRIMARY KEY,
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 500)
);
CREATE TABLE academy_private.practice_keys (
  item_id text NOT NULL,
  version integer NOT NULL,
  grading jsonb NOT NULL CHECK (jsonb_typeof(grading) = 'object' AND octet_length(grading::text) <= 65536),
  PRIMARY KEY (item_id, version),
  FOREIGN KEY (item_id, version) REFERENCES public.academy_practice_items(id, version)
);
CREATE TABLE public.academy_practice_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  filters jsonb NOT NULL,
  requested smallint NOT NULL CHECK (requested IN (5,10,15,30)),
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (user_id, request_id)
);
CREATE INDEX academy_practice_sessions_history ON public.academy_practice_sessions (user_id, created_at DESC, id DESC);
CREATE INDEX academy_practice_sessions_unfinished ON public.academy_practice_sessions (user_id, created_at DESC, id DESC) WHERE finished_at IS NULL;
CREATE TABLE public.academy_practice_slots (
  session_id uuid NOT NULL REFERENCES public.academy_practice_sessions(id) ON DELETE CASCADE,
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 30),
  item_id text NOT NULL,
  version integer NOT NULL,
  reason text NOT NULL CHECK (reason IN ('mistake','skill','pattern','unseen','ready','selected')),
  request_id uuid,
  outcome text CHECK (outcome IN ('correct','incorrect','practiced')),
  credit smallint CHECK (credit BETWEEN 0 AND 100),
  feedback text,
  answered_at timestamptz,
  PRIMARY KEY (session_id, position),
  UNIQUE (session_id, item_id),
  UNIQUE (session_id, request_id),
  CHECK ((outcome IS NULL) = (answered_at IS NULL) AND (outcome IS NULL) = (request_id IS NULL)),
  CHECK ((outcome IN ('correct','incorrect')) IS NOT DISTINCT FROM (credit IS NOT NULL) OR (outcome IS NULL AND credit IS NULL)),
  FOREIGN KEY (item_id, version) REFERENCES public.academy_practice_items(id, version)
);

-- This summary stores one row per practiced edition. Session slots remain the audit history.
CREATE TABLE public.academy_practice_state (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  version integer NOT NULL,
  last_outcome text CHECK (last_outcome IN ('correct','incorrect','practiced')),
  last_answered_at timestamptz,
  last_error_at timestamptz,
  error_count integer NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  draft text CHECK (octet_length(draft) <= 12000),
  PRIMARY KEY (user_id, item_id, version),
  FOREIGN KEY (item_id, version) REFERENCES public.academy_practice_items(id, version)
);
CREATE INDEX academy_practice_state_errors ON public.academy_practice_state (user_id, last_error_at DESC)
  WHERE last_outcome = 'incorrect';

ALTER TABLE public.academy_practice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_practice_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_practice_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_practice_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_practice_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_private.practice_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.academy_practice_items, public.academy_practice_skills, public.academy_practice_sessions,
  public.academy_practice_slots, public.academy_practice_state, academy_private.practice_keys FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.academy_practice_items, public.academy_practice_skills, public.academy_practice_sessions,
  public.academy_practice_slots, public.academy_practice_state TO authenticated;
CREATE POLICY practice_items_read ON public.academy_practice_items FOR SELECT TO authenticated USING (true);
CREATE POLICY practice_skills_read ON public.academy_practice_skills FOR SELECT TO authenticated USING (true);
CREATE POLICY practice_sessions_own ON public.academy_practice_sessions FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY practice_slots_own ON public.academy_practice_slots FOR SELECT TO authenticated USING (
  EXISTS (SELECT FROM public.academy_practice_sessions s WHERE s.id = session_id AND s.user_id = (SELECT auth.uid()))
);
CREATE POLICY practice_state_own ON public.academy_practice_state FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

-- Release curator only. Published rows and answer keys are immutable.
CREATE FUNCTION public.academy_practice_import(p_items jsonb, p_skills jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  entry jsonb; item_activity jsonb; item_key jsonb; payload_digest bytea;
  item_id text; item_version integer; existing public.academy_practice_items%ROWTYPE;
  added integer := 0; unchanged integer := 0;
BEGIN
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_typeof(p_skills) IS DISTINCT FROM 'object'
    OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION 'Pacote de práticas inválido' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(p_items) x) <> jsonb_array_length(p_items) THEN
    RAISE EXCEPTION 'IDs editoriais duplicados' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(4325901);
  INSERT INTO public.academy_practice_skills (id,label) SELECT key,value FROM jsonb_each_text(p_skills)
    ON CONFLICT (id) DO UPDATE SET label=excluded.label WHERE academy_practice_skills.label IS DISTINCT FROM excluded.label;
  FOR entry IN SELECT x FROM jsonb_array_elements(p_items) x LOOP
    item_id := entry->>'id'; item_version := (entry->>'version')::integer;
    item_activity := entry->'activity'; item_key := entry->'grading';
    IF item_version IS NULL OR item_version NOT BETWEEN 1 AND 999999
      OR (item_activity->>'id') IS DISTINCT FROM lower(item_id) OR (item_activity->>'kind') IS DISTINCT FROM (entry->>'kind')
      OR (item_key->>'kind') IS DISTINCT FROM (entry->>'kind')
      OR EXISTS (SELECT FROM jsonb_object_keys(item_activity) k
        WHERE k NOT IN ('id','kind','phase','prompt','hints','options','items','lines','maxIndent','left','right','fields','multilineFields','starter','publicCases'))
      OR item_activity::text ~ '"(accepted|acceptedByField|correctOptionId|correctOrder|acceptedOrders|correctLines|pairs|solution|hiddenCases|reference|criteria|distractors|checks)"[[:space:]]*:'
      OR EXISTS (SELECT FROM jsonb_array_elements_text(entry->'skills') x
        WHERE NOT EXISTS (SELECT FROM public.academy_practice_skills s WHERE s.id=x))
      OR EXISTS (SELECT FROM jsonb_array_elements_text(entry->'lessons') ref
        WHERE NOT EXISTS (SELECT FROM public.academy_current_releases r JOIN public.academy_lessons l
          ON (l.release_id,l.version)=(r.id,r.version) WHERE r.id=split_part(ref,'/',1) AND l.id=split_part(ref,'/',2)
          AND ref=r.id||'/'||l.id)) THEN
      RAISE EXCEPTION 'Atividade incompatível %', item_id USING ERRCODE = '22023';
    END IF;
    payload_digest := sha256(convert_to((entry-'version')::text,'UTF8'));
    SELECT * INTO existing FROM public.academy_practice_items i WHERE i.id=item_id AND i.version=item_version;
    IF FOUND THEN
      IF existing.digest <> payload_digest THEN RAISE EXCEPTION 'Versão imutável %.%',item_id,item_version USING ERRCODE = '23505'; END IF;
      unchanged := unchanged+1;
      CONTINUE;
    END IF;
    SELECT * INTO existing FROM public.academy_practice_items i WHERE i.id=item_id AND i.current_version;
    IF FOUND THEN
      IF existing.digest=payload_digest THEN unchanged:=unchanged+1; CONTINUE; END IF;
      IF existing.version>=item_version THEN RAISE EXCEPTION 'Edição antiga %',item_id USING ERRCODE='22023'; END IF;
      UPDATE public.academy_practice_items i SET current_version=false WHERE i.id=item_id AND i.current_version;
    END IF;
    INSERT INTO public.academy_practice_items (id,version,title,topic,module,formations,lessons,skills,misconceptions,
      prerequisites,difficulty,kind,activity,digest)
    VALUES (item_id,item_version,entry->>'title',entry->>'topic',entry->>'module',
      ARRAY(SELECT jsonb_array_elements_text(entry->'formations')),ARRAY(SELECT jsonb_array_elements_text(entry->'lessons')),
      ARRAY(SELECT jsonb_array_elements_text(entry->'skills')),ARRAY(SELECT jsonb_array_elements_text(entry->'misconceptions')),
      ARRAY(SELECT jsonb_array_elements_text(entry->'prerequisites')),entry->>'difficulty',entry->>'kind',item_activity,payload_digest);
    INSERT INTO academy_private.practice_keys (item_id,version,grading) VALUES (item_id,item_version,item_key);
    added := added+1;
  END LOOP;
  RETURN jsonb_build_object('inserted',added,'unchanged',unchanged);
END $$;

CREATE FUNCTION academy_private.practice_validate_filters(p_filters jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
  IF jsonb_typeof(p_filters) IS DISTINCT FROM 'object' OR octet_length(p_filters::text) > 2048
    OR EXISTS (SELECT FROM jsonb_each(p_filters) f WHERE f.key NOT IN ('topic','skill','difficulty','kind','mode','lesson','formation','module')
        OR jsonb_typeof(f.value) <> 'string' OR length(f.value #>> '{}') NOT BETWEEN 1 AND 250)
    OR coalesce(p_filters->>'mode','all') NOT IN ('all','unseen','mistakes','recommended')
    OR (p_filters ? 'formation' AND p_filters->>'formation' NOT IN ('tech','english'))
    OR (p_filters ? 'difficulty' AND p_filters->>'difficulty' NOT IN ('basic','intermediate','application'))
    OR (p_filters ? 'kind' AND p_filters->>'kind' NOT IN ('multiple-choice','output','trace','fill-in','ordering','parsons','matching','text','python')) THEN
    RAISE EXCEPTION 'Filtros inválidos' USING ERRCODE='22023';
  END IF;
END $$;

CREATE FUNCTION academy_private.practice_ranked(p_user uuid, p_filters jsonb, p_after text DEFAULT NULL)
RETURNS TABLE(item_id text, version integer, title text, topic text, kind text, difficulty text, reason text, priority integer)
LANGUAGE sql STABLE SET search_path = '' AS $$
  WITH recent_errors AS MATERIALIZED (
    SELECT i.skills,i.misconceptions,s.error_count FROM public.academy_practice_state s
    JOIN public.academy_practice_items i ON (i.id,i.version)=(s.item_id,s.version) AND i.current_version
    WHERE s.user_id=p_user AND s.last_outcome='incorrect' AND s.last_error_at>=now()-interval '14 days'
  ), studied AS MATERIALIZED (
    SELECT p.release_id,p.lesson_id FROM public.academy_progress p JOIN public.academy_current_releases r
      ON (r.id,r.version)=(p.release_id,p.version) WHERE p.user_id=p_user AND p.completed_at IS NOT NULL
  ), ready AS (
    SELECT r.id||'/'||l.id AS topic_ref FROM public.academy_current_releases r JOIN public.academy_lessons l
      ON (l.release_id,l.version)=(r.id,r.version)
    WHERE EXISTS (SELECT FROM studied s WHERE s.release_id=r.id AND s.lesson_id=l.id)
      OR (jsonb_array_length(l.lesson->'prerequisites')>0 AND NOT EXISTS (
        SELECT FROM jsonb_array_elements_text(l.lesson->'prerequisites') ref
        WHERE NOT EXISTS (SELECT FROM studied s WHERE s.release_id=r.id AND s.lesson_id=ref)))
  ), signals AS (
    SELECT ARRAY(SELECT DISTINCT unnest(skills) FROM recent_errors) AS weak_skills,
      ARRAY(SELECT x FROM recent_errors CROSS JOIN LATERAL unnest(misconceptions) x GROUP BY x HAVING sum(error_count)>=2) AS recurring,
      ARRAY(SELECT topic_ref FROM ready) AS studied
  ), ranked AS (
    SELECT i.id,i.version,i.title,i.topic,i.kind,i.difficulty,
      CASE WHEN s.last_outcome='incorrect' THEN 'mistake'
        WHEN i.misconceptions && signals.recurring THEN 'pattern'
        WHEN i.skills && signals.weak_skills THEN 'skill'
        WHEN s.last_outcome IS NULL THEN 'unseen'
        WHEN i.lessons && signals.studied THEN 'ready'
        ELSE 'selected' END AS reason,
      (CASE WHEN s.last_outcome='incorrect' AND s.last_error_at>=now()-interval '14 days' THEN 100
        WHEN s.last_outcome='incorrect' THEN 55 ELSE 0 END
        + CASE WHEN i.misconceptions && signals.recurring THEN 35 ELSE 0 END
        + CASE WHEN i.skills && signals.weak_skills THEN 30 ELSE 0 END
        + CASE WHEN s.last_outcome IS NULL THEN 15 ELSE 0 END
        + CASE WHEN i.lessons && signals.studied THEN 5 ELSE 0 END) AS priority
    FROM public.academy_practice_items i CROSS JOIN signals LEFT JOIN public.academy_practice_state s
      ON (s.user_id,s.item_id,s.version)=(p_user,i.id,i.version)
    WHERE i.current_version AND (p_after IS NULL OR i.id>p_after)
      AND (NOT p_filters ? 'topic' OR i.topic=p_filters->>'topic')
      AND (NOT p_filters ? 'skill' OR i.skills @> ARRAY[p_filters->>'skill'])
      AND (NOT p_filters ? 'lesson' OR i.lessons @> ARRAY[p_filters->>'lesson'])
      AND (NOT p_filters ? 'formation' OR i.formations @> ARRAY[p_filters->>'formation'])
      AND (NOT p_filters ? 'module' OR i.module=p_filters->>'module')
      AND (NOT p_filters ? 'kind' OR i.kind=p_filters->>'kind')
      AND (NOT p_filters ? 'difficulty' OR i.difficulty=p_filters->>'difficulty')
      AND (coalesce(p_filters->>'mode','all')<>'unseen' OR s.last_outcome IS NULL)
      AND (coalesce(p_filters->>'mode','all')<>'mistakes' OR s.last_outcome='incorrect')
  )
  SELECT * FROM ranked;
$$;

CREATE FUNCTION public.academy_practice_catalog(p_filters jsonb DEFAULT '{}', p_after text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := auth.uid(); result jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sessão necessária' USING ERRCODE='42501'; END IF;
  PERFORM academy_private.practice_validate_filters(p_filters);
  IF length(p_after)>80 THEN RAISE EXCEPTION 'Cursor inválido' USING ERRCODE='22023'; END IF;
  WITH page AS (SELECT * FROM academy_private.practice_ranked(uid,p_filters,p_after) ORDER BY item_id LIMIT 21),
  visible AS (SELECT * FROM page ORDER BY item_id LIMIT 20)
  SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(v)-'priority' ORDER BY v.item_id) FROM visible v),'[]'::jsonb),
    'next',CASE WHEN (SELECT count(*) FROM page)>20 THEN (SELECT max(item_id) FROM visible) END) INTO result;
  RETURN result;
END $$;

CREATE FUNCTION public.academy_practice_overview(p_filters jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := auth.uid(); result jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sessão necessária' USING ERRCODE='42501'; END IF;
  PERFORM academy_private.practice_validate_filters(p_filters);
  WITH active AS MATERIALIZED (SELECT id,version,topic,skills,kind,module FROM public.academy_practice_items WHERE current_version),
  skill_ids AS (SELECT DISTINCT unnest(skills) AS id FROM active),
  states AS MATERIALIZED (
    SELECT s.last_outcome,s.last_error_at,i.skills FROM public.academy_practice_state s JOIN active i ON (i.id,i.version)=(s.item_id,s.version)
    WHERE s.user_id=uid AND s.last_outcome IS NOT NULL
  ), weak AS (
    SELECT sk.id,sk.label,count(*) AS errors,max(s.last_error_at) AS recent
    FROM states s CROSS JOIN LATERAL unnest(s.skills) k JOIN public.academy_practice_skills sk ON sk.id=k
    WHERE s.last_outcome='incorrect' AND s.last_error_at>=now()-interval '14 days'
    GROUP BY sk.id,sk.label ORDER BY errors DESC,recent DESC,sk.id LIMIT 6
  ), suggested AS (
    SELECT item_id,title,reason FROM academy_private.practice_ranked(uid,'{}')
    WHERE reason IN ('mistake','pattern','skill','unseen','ready') ORDER BY priority DESC,item_id LIMIT 3
  )
  SELECT jsonb_build_object(
    'available',(SELECT count(*) FROM active),
    'filtered',(SELECT count(*) FROM academy_private.practice_ranked(uid,p_filters)),
    'answered',(SELECT count(*) FROM states WHERE last_outcome IN ('correct','incorrect')),
    'correct',(SELECT count(*) FROM states WHERE last_outcome='correct'),
    'incorrect',(SELECT count(*) FROM states WHERE last_outcome='incorrect'),
    'practiced',(SELECT count(*) FROM states WHERE last_outcome='practiced'),
    'topics',coalesce((SELECT jsonb_agg(topic ORDER BY topic) FROM (SELECT DISTINCT topic FROM active) x),'[]'::jsonb),
    'modules',coalesce((SELECT jsonb_agg(module ORDER BY module) FROM (SELECT DISTINCT module FROM active) x),'[]'::jsonb),
    'kinds',coalesce((SELECT jsonb_agg(kind ORDER BY kind) FROM (SELECT DISTINCT kind FROM active) x),'[]'::jsonb),
    'skills',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'label',s.label) ORDER BY s.id)
      FROM skill_ids i JOIN public.academy_practice_skills s ON s.id=i.id),'[]'::jsonb),
    'weak',coalesce((SELECT jsonb_agg(to_jsonb(w)-'recent' ORDER BY w.errors DESC,w.recent DESC,w.id) FROM weak w),'[]'::jsonb),
    'recommended',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM suggested r),'[]'::jsonb)) INTO result;
  RETURN result;
END $$;

CREATE FUNCTION public.academy_practice_start(p_request uuid, p_size integer, p_filters jsonb DEFAULT '{}', p_item text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := auth.uid(); session uuid; saved_filters jsonb; saved_size integer; selected integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sessão necessária' USING ERRCODE='42501'; END IF;
  IF p_request IS NULL OR p_size IS NULL OR p_size NOT IN (5,10,15,30) OR length(p_item)>80 THEN
    RAISE EXCEPTION 'Sessão inválida' USING ERRCODE='22023';
  END IF;
  PERFORM academy_private.practice_validate_filters(p_filters);
  saved_filters := p_filters || CASE WHEN p_item IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('item',p_item) END;
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,3301));
  SELECT s.id,s.requested INTO session,saved_size FROM public.academy_practice_sessions s
    WHERE s.user_id=uid AND s.request_id=p_request AND s.filters=saved_filters;
  IF FOUND THEN
    IF saved_size<>p_size THEN RAISE EXCEPTION 'Identificador em uso' USING ERRCODE='23505'; END IF;
    RETURN session;
  END IF;
  INSERT INTO public.academy_practice_sessions (user_id,request_id,filters,requested)
    VALUES (uid,p_request,saved_filters,p_size) RETURNING id INTO session;
  INSERT INTO public.academy_practice_slots (session_id,position,item_id,version,reason)
  SELECT session,row_number() OVER (ORDER BY ranking DESC,item_id)::smallint,item_id,version,reason
  FROM (
    SELECT r.*, CASE WHEN p_filters->>'mode'='all' OR NOT p_filters ? 'mode' THEN 0 ELSE r.priority END AS ranking
    FROM academy_private.practice_ranked(uid,p_filters) r WHERE p_item IS NULL OR r.item_id=p_item
    ORDER BY ranking DESC,item_id LIMIT p_size
  ) picked;
  GET DIAGNOSTICS selected = ROW_COUNT;
  IF selected=0 THEN RAISE EXCEPTION 'Nenhuma questão para estes filtros' USING ERRCODE='P0002'; END IF;
  RETURN session;
END $$;

CREATE FUNCTION academy_private.practice_output(value text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = '' AS $$
  SELECT regexp_replace(replace(replace(value,E'\r\n',E'\n'),E'\r',E'\n'), E'\n$', '');
$$;

CREATE FUNCTION academy_private.practice_grade(p_key jsonb,p_value text)
RETURNS smallint LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = '' AS $$
DECLARE response jsonb; partial integer; total integer; correct boolean; kind text := p_key->>'kind';
BEGIN
  IF kind='output' THEN
    correct := EXISTS (SELECT FROM jsonb_array_elements_text(p_key->'accepted') x WHERE academy_private.practice_output(x)=academy_private.practice_output(p_value));
  ELSIF kind='fill-in' OR (kind='trace' AND p_key ? 'multilineFields') OR (kind='ordering' AND p_key ? 'acceptedOrders') OR (kind='matching' AND p_key->'partial'='true') THEN
    BEGIN response:=p_value::jsonb;
    EXCEPTION WHEN invalid_text_representation OR untranslatable_character OR numeric_value_out_of_range OR program_limit_exceeded THEN RETURN 0; END;
    IF kind IN ('fill-in','trace') THEN
      IF jsonb_typeof(response)<>'object' THEN RETURN 0; END IF;
      correct := ARRAY(SELECT k FROM jsonb_object_keys(response) k ORDER BY k)
        = ARRAY(SELECT k FROM jsonb_object_keys(p_key->'acceptedByField') k ORDER BY k)
        AND NOT EXISTS (
          SELECT FROM jsonb_each(p_key->'acceptedByField') f WHERE jsonb_typeof(response->f.key) IS DISTINCT FROM 'string'
            OR NOT EXISTS (SELECT FROM jsonb_array_elements_text(f.value) x WHERE CASE
                WHEN kind='fill-in' THEN x=response->>f.key
                WHEN (p_key->'multilineFields') ? f.key THEN academy_private.practice_output(x)=academy_private.practice_output(response->>f.key)
                ELSE trim(x)=trim(response->>f.key) END)
        );
    ELSIF kind='ordering' THEN
      correct := response=p_key->'correctOrder' OR EXISTS (SELECT FROM jsonb_array_elements(p_key->'acceptedOrders') x WHERE x=response);
    ELSE
      IF jsonb_typeof(response)<>'object' OR ARRAY(SELECT k FROM jsonb_object_keys(response) k ORDER BY k)
        <> ARRAY(SELECT k FROM jsonb_object_keys(p_key->'pairs') k ORDER BY k) THEN RETURN 0; END IF;
      SELECT count(*) FILTER (WHERE response->p.key=p.value), count(*) INTO partial,total FROM jsonb_each(p_key->'pairs') p;
      IF total<2 THEN RETURN 0; END IF;
      RETURN round(100.0*partial/total)::smallint;
    END IF;
  ELSE
    correct := academy_private.verify_answer(p_key,p_value);
  END IF;
  RETURN CASE WHEN correct THEN 100 ELSE 0 END;
END $$;

CREATE FUNCTION public.academy_practice_submit(p_session uuid,p_position integer,p_request uuid,p_value text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := auth.uid(); slot public.academy_practice_slots%ROWTYPE; key jsonb; awarded smallint;
  response text; notes text; selected text; attempt_time timestamptz;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sessão necessária' USING ERRCODE='42501'; END IF;
  IF p_position IS NULL OR p_position NOT BETWEEN 1 AND 30 OR p_request IS NULL OR p_value IS NULL OR octet_length(p_value)>12000 THEN
    RAISE EXCEPTION 'Envio inválido' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM public.academy_practice_sessions s WHERE s.id=p_session AND s.user_id=uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sessão indisponível' USING ERRCODE='42501'; END IF;
  SELECT * INTO slot FROM public.academy_practice_slots s WHERE s.session_id=p_session AND s.position=p_position;
  IF NOT FOUND THEN RAISE EXCEPTION 'Atividade indisponível' USING ERRCODE='22023'; END IF;
  IF slot.answered_at IS NOT NULL THEN
    IF slot.request_id<>p_request THEN RAISE EXCEPTION 'Atividade já registrada' USING ERRCODE='23505'; END IF;
    RETURN jsonb_build_object('outcome',slot.outcome,'credit',slot.credit,'feedback',slot.feedback);
  END IF;
  IF EXISTS (SELECT FROM public.academy_practice_slots s WHERE s.session_id=p_session AND s.position<p_position AND s.answered_at IS NULL) THEN
    RAISE EXCEPTION 'Responda a atividade anterior' USING ERRCODE='22023';
  END IF;
  SELECT k.grading INTO STRICT key FROM academy_private.practice_keys k WHERE (k.item_id,k.version)=(slot.item_id,slot.version);
  IF key->>'kind'='python' THEN
    IF trim(p_value)='' THEN RAISE EXCEPTION 'Informe o código da prática' USING ERRCODE='22023'; END IF;
    response:='practiced'; notes:='Prática registrada. Use os exemplos públicos para conferir seu código.';
  ELSE
    awarded:=academy_private.practice_grade(key,p_value);
    response:=CASE WHEN awarded=100 THEN 'correct' ELSE 'incorrect' END;
    IF awarded=100 THEN notes:=key->>'explanation';
    ELSIF awarded>0 THEN notes:='Parte dos pares está correta. Compare os conceitos e tente novamente em outra sessão.';
    ELSIF key->>'kind'='multiple-choice' AND p_value ~ '^"[A-Za-z0-9-]{1,80}"$' THEN
      selected:=p_value::jsonb #>> '{}'; notes:=key->'distractors'->>selected;
    END IF;
    notes:=coalesce(notes,'Releia a proposta e volte a praticar este ponto.');
  END IF;
  attempt_time:=clock_timestamp();
  UPDATE public.academy_practice_slots s SET request_id=p_request,outcome=response,credit=awarded,feedback=notes,answered_at=attempt_time
    WHERE s.session_id=p_session AND s.position=p_position;
  INSERT INTO public.academy_practice_state AS prev (user_id,item_id,version,last_outcome,last_answered_at,last_error_at,error_count,draft)
    VALUES (uid,slot.item_id,slot.version,response,attempt_time,CASE WHEN response='incorrect' THEN attempt_time END,
      CASE WHEN response='incorrect' THEN 1 ELSE 0 END,CASE WHEN response='practiced' THEN p_value END)
    ON CONFLICT (user_id,item_id,version) DO UPDATE SET
      last_outcome=CASE WHEN excluded.last_answered_at>=coalesce(prev.last_answered_at,'-infinity') THEN excluded.last_outcome ELSE prev.last_outcome END,
      last_answered_at=greatest(prev.last_answered_at,excluded.last_answered_at),
      last_error_at=greatest(prev.last_error_at,excluded.last_error_at),error_count=prev.error_count+excluded.error_count,
      draft=coalesce(excluded.draft,prev.draft);
  IF NOT EXISTS (SELECT FROM public.academy_practice_slots s WHERE s.session_id=p_session AND s.answered_at IS NULL) THEN
    UPDATE public.academy_practice_sessions SET finished_at=attempt_time WHERE id=p_session;
  END IF;
  RETURN jsonb_build_object('outcome',response,'credit',awarded,'feedback',notes);
END $$;

CREATE FUNCTION public.academy_practice_save_code(p_session uuid,p_position integer,p_code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := auth.uid(); slot public.academy_practice_slots%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sessão necessária' USING ERRCODE='42501'; END IF;
  IF p_code IS NULL OR octet_length(p_code)>12000 THEN RAISE EXCEPTION 'Rascunho inválido' USING ERRCODE='22023'; END IF;
  SELECT a.* INTO slot FROM public.academy_practice_slots a JOIN public.academy_practice_sessions s ON s.id=a.session_id
    JOIN public.academy_practice_items i ON (i.id,i.version)=(a.item_id,a.version) AND i.kind='python'
    WHERE s.user_id=uid AND a.session_id=p_session AND a.position=p_position;
  IF NOT FOUND THEN RAISE EXCEPTION 'Laboratório indisponível' USING ERRCODE='42501'; END IF;
  INSERT INTO public.academy_practice_state (user_id,item_id,version,draft) VALUES (uid,slot.item_id,slot.version,p_code)
    ON CONFLICT (user_id,item_id,version) DO UPDATE SET draft=excluded.draft;
END $$;

REVOKE EXECUTE ON FUNCTION public.academy_practice_import(jsonb,jsonb), academy_private.practice_validate_filters(jsonb),
  academy_private.practice_ranked(uuid,jsonb,text), academy_private.practice_output(text), academy_private.practice_grade(jsonb,text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.academy_practice_catalog(jsonb,text), public.academy_practice_overview(jsonb),
  public.academy_practice_start(uuid,integer,jsonb,text), public.academy_practice_submit(uuid,integer,uuid,text),
  public.academy_practice_save_code(uuid,integer,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academy_practice_catalog(jsonb,text), public.academy_practice_overview(jsonb),
  public.academy_practice_start(uuid,integer,jsonb,text), public.academy_practice_submit(uuid,integer,uuid,text),
  public.academy_practice_save_code(uuid,integer,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;

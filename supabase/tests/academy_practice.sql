\set ON_ERROR_STOP on
\set VERBOSITY terse
DO $$ BEGIN
  IF current_database() !~ '^academy_practice_[a-z0-9_]+_synthetic$' THEN
    RAISE EXCEPTION 'Execute somente na base sintética de práticas';
  END IF;
  IF EXISTS (SELECT FROM public.academy_practice_items) THEN RAISE EXCEPTION 'Comece com o banco opcional vazio'; END IF;
END $$;

CREATE TEMP TABLE previous_progress AS TABLE public.academy_progress;
CREATE TEMP TABLE previous_attempts AS TABLE public.academy_attempts;
CREATE TEMP TABLE previous_drafts AS TABLE public.academy_python_drafts;
CREATE TEMP TABLE previous_lessons AS TABLE public.academy_lessons;
\i :practice_content
\i :practice_content

CREATE FUNCTION pg_temp.expect(ok boolean, name text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Falhou: %',name; END IF; END $$;

SELECT pg_temp.expect((SELECT count(*) FROM public.academy_practice_items)=82,'82 itens sem duplicação');
SELECT pg_temp.expect(NOT has_function_privilege('authenticated','public.academy_practice_import(jsonb,jsonb)','EXECUTE')
  AND NOT has_function_privilege('anon','public.academy_practice_catalog(jsonb,text)','EXECUTE')
  AND NOT has_schema_privilege('authenticated','academy_private','USAGE')
  AND NOT has_table_privilege('authenticated','public.academy_practice_slots','UPDATE'),'grants restritos');

SELECT pg_temp.expect(academy_private.practice_grade('{"kind":"fill-in","acceptedByField":{"name":["Nome"]}}','{"name":"Nome"}')=100
  AND academy_private.practice_grade('{"kind":"fill-in","acceptedByField":{"name":["Nome"]}}','{"name":"nome"}')=0
  AND academy_private.practice_grade('{"kind":"fill-in","acceptedByField":{"name":["Nome"]}}','{"name":"Nome","extra":"x"}')=0,
  'lacuna sensível a caixa e campos exatos');
SELECT pg_temp.expect(academy_private.practice_grade('{"kind":"output","accepted":["a \nb\n"]}',E'a \r\nb')=100
  AND academy_private.practice_grade('{"kind":"output","accepted":["a \nb\n"]}',E'a\nb\n')=0
  AND academy_private.practice_grade('{"kind":"output","accepted":["a \nb\n"]}',E'a \nb\n\n')=0,'espaços e quebras preservados');
SELECT pg_temp.expect(academy_private.practice_grade('{"kind":"trace","multilineFields":["value"],"acceptedByField":{"value":["A\nB"],"n":["3"]}}','{"value":"A\r\nB\n","n":"3"}')=100
  AND academy_private.practice_grade('{"kind":"trace","acceptedByField":{"value":["3"],"n":["2"]}}','{"value":"3"}')=0,'rastreamento multilinear e campos obrigatórios');
SELECT pg_temp.expect(academy_private.practice_grade('{"kind":"ordering","correctOrder":["a","b","c"],"acceptedOrders":[["b","a","c"]]}','["b","a","c"]')=100
  AND academy_private.practice_grade('{"kind":"ordering","correctOrder":["a","b","c"],"acceptedOrders":[["b","a","c"]]}','["b","a","a"]')=0,'equivalência explícita');
SELECT pg_temp.expect(academy_private.practice_grade('{"kind":"matching","partial":true,"pairs":{"1":"a","2":"b","3":"c"}}','{"1":"a","2":"c","3":"b"}')=33
  AND academy_private.practice_grade('{"kind":"matching","partial":true,"pairs":{"1":"a","2":"b","3":"c"}}','{"1":"a","2":"b"}')=0,
  'pontuação parcial e preenchimento obrigatório');
SELECT pg_temp.expect(academy_private.practice_grade('{"kind":"text","accepted":["uma resposta"]}',' Uma   resposta ')=100,'resposta curta reutiliza o corretor');

CREATE TEMP VIEW practice_answers AS SELECT item_id,grading->>'kind' AS kind,
  CASE grading->>'kind'
    WHEN 'text' THEN grading->'accepted'->>0
    WHEN 'output' THEN grading->'accepted'->>0
    WHEN 'multiple-choice' THEN (grading->'correctOptionId')::text
    WHEN 'ordering' THEN (grading->'correctOrder')::text
    WHEN 'parsons' THEN (grading->'correctLines')::text
    WHEN 'matching' THEN (grading->'pairs')::text
    WHEN 'trace' THEN (SELECT jsonb_object_agg(key,value->0)::text FROM jsonb_each(grading->'acceptedByField'))
    WHEN 'fill-in' THEN (SELECT jsonb_object_agg(key,value->0)::text FROM jsonb_each(grading->'acceptedByField'))
  END AS answer FROM academy_private.practice_keys;
GRANT SELECT ON practice_answers TO authenticated;

SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000051';
DO $$ DECLARE example record; session uuid; requested uuid; grade jsonb; total integer:=0; labs integer:=0;
BEGIN
  FOR example IN SELECT * FROM practice_answers ORDER BY item_id LOOP
    IF example.kind='python' THEN
      session:=public.academy_practice_start(gen_random_uuid(),5,'{}',example.item_id);
      PERFORM public.academy_practice_save_code(session,1,'# rascunho antes da resposta');
      PERFORM pg_temp.expect(EXISTS (SELECT FROM public.academy_practice_state WHERE item_id=example.item_id
        AND draft='# rascunho antes da resposta' AND last_outcome IS NULL),'rascunho recuperável sem nota');
      grade:=public.academy_practice_submit(session,1,gen_random_uuid(),'# prática registrada');
      PERFORM pg_temp.expect(grade->>'outcome'='practiced' AND grade->>'credit' IS NULL,'Python formativo');
      labs:=labs+1;
    ELSE
      session:=public.academy_practice_start(gen_random_uuid(),5,'{}',example.item_id);
      requested:=gen_random_uuid();
      grade:=public.academy_practice_submit(session,1,requested,'@@ incorreta @@');
      PERFORM pg_temp.expect(grade->>'outcome'='incorrect' AND grade->>'credit'='0','resposta incorreta');
      PERFORM pg_temp.expect(grade=public.academy_practice_submit(session,1,requested,'@@ incorreta @@'),'envio idempotente');
      session:=public.academy_practice_start(gen_random_uuid(),5,'{"mode":"mistakes"}',example.item_id);
      grade:=public.academy_practice_submit(session,1,gen_random_uuid(),example.answer);
      PERFORM pg_temp.expect(grade->>'outcome'='correct' AND grade->>'credit'='100' AND length(grade->>'feedback')>0,'revisão do erro com feedback');
      total:=total+1;
    END IF;
  END LOOP;
  PERFORM pg_temp.expect(total=72 AND labs=10,'todos os formatos editoriais compatíveis');
  RAISE NOTICE 'Acerto e erro em % itens determinísticos e % registros Python formativos',total,labs;
END $$;

DO $$ DECLARE session uuid; request uuid:=gen_random_uuid(); result jsonb; target text;
BEGIN
  session:=public.academy_practice_start(request,10,'{}');
  PERFORM pg_temp.expect(public.academy_practice_start(request,10,'{}')=session,'criação idempotente');
  PERFORM pg_temp.expect((SELECT count(*) FROM public.academy_practice_slots WHERE session_id=session)=10,'sessão de dez');
  BEGIN
    PERFORM public.academy_practice_submit(session,2,gen_random_uuid(),'@@ incorreta @@');
    RAISE EXCEPTION 'Questão fora da ordem conseguiu ser respondida';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  PERFORM public.academy_practice_submit(session,1,gen_random_uuid(),'@@ incorreta @@');
  PERFORM pg_temp.expect((SELECT min(position) FROM public.academy_practice_slots WHERE session_id=session AND outcome IS NULL)=2,
    'retomada começa no próximo item');
  SELECT item_id INTO target FROM public.academy_practice_slots WHERE session_id=session AND position=1;
  result:=public.academy_practice_overview('{}');
  PERFORM pg_temp.expect(result->>'answered'='72' AND result->>'incorrect'='1' AND result->>'practiced'='10', 'estatísticas reais');
  PERFORM pg_temp.expect(jsonb_array_length(result->'weak')>0 AND result->'recommended'->0->>'item_id'=target,'recomendação por erro recente e competência');
  PERFORM pg_temp.expect((public.academy_practice_catalog('{"mode":"mistakes"}') #>> '{items,0,item_id}')=target,'lista somente erros');
  PERFORM pg_temp.expect(jsonb_array_length(public.academy_practice_catalog('{"mode":"unseen"}')->'items')=0,'itens já respondidos excluídos');
  PERFORM set_config('omni.test.session',session::text,false);
END $$;

SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000052';
DO $$ DECLARE session uuid:=current_setting('omni.test.session')::uuid;
BEGIN
  PERFORM pg_temp.expect(NOT EXISTS (SELECT FROM public.academy_practice_sessions)
    AND NOT EXISTS (SELECT FROM public.academy_practice_state) AND NOT EXISTS (SELECT FROM public.academy_practice_slots),'isolamento A/B por RLS');
  BEGIN
    PERFORM public.academy_practice_submit(session,2,gen_random_uuid(),'indevida');
    RAISE EXCEPTION 'Conta B conseguiu enviar na sessão A';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.academy_practice_save_code(session,1,'# escrita indevida');
    RAISE EXCEPTION 'Conta B conseguiu salvar na sessão A';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM pg_temp.expect((public.academy_practice_overview('{}')->>'answered')='0','estatísticas isoladas');
END $$;
RESET ROLE;

CREATE FUNCTION pg_temp.fixture_item(n integer, edition integer, fixture_module text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('id','TECH-FIX-'||lpad(n::text,4,'0'),'version',edition,
    'title','Atividade sintética '||n,'topic','Fixture de escala','module',fixture_module,'formations',jsonb_build_array('tech'),
    'lessons','[]'::jsonb,'skills',jsonb_build_array('FIXTURE-C01'),'misconceptions','[]'::jsonb,'prerequisites','[]'::jsonb,
    'difficulty','basic','kind','text','activity',jsonb_build_object('id','tech-fix-'||lpad(n::text,4,'0'),'kind','text',
      'phase','practice','prompt','Exemplo artificial '||n||' edição '||edition,'hints','[]'::jsonb),
    'grading',jsonb_build_object('kind','text','accepted',jsonb_build_array(edition::text),'explanation','Resposta da fixture'));
$$;

SELECT public.academy_practice_import(jsonb_build_array(pg_temp.fixture_item(7000,1,'VERSION-FIXTURE')),'{"FIXTURE-C01":"Competência sintética"}');
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000051';
SELECT set_config('omni.test.old',public.academy_practice_start(gen_random_uuid(),5,'{}','TECH-FIX-7000')::text,false);
RESET ROLE;
SELECT public.academy_practice_import(jsonb_build_array(pg_temp.fixture_item(7000,2,'VERSION-FIXTURE')),'{"FIXTURE-C01":"Competência sintética"}');
DO $$ BEGIN
  BEGIN
    PERFORM public.academy_practice_import(jsonb_build_array(pg_temp.fixture_item(7000,2,'DIVERGENT')),'{}');
    RAISE EXCEPTION 'A edição foi sobrescrita';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    PERFORM public.academy_practice_import(jsonb_build_array(jsonb_set(pg_temp.fixture_item(7001,1,'LEAK'),
      '{activity,solution}','"privado"')),'{}');
    RAISE EXCEPTION 'A função aceitou campo privado no catálogo';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
SET ROLE authenticated;
DO $$ DECLARE old_id uuid:=current_setting('omni.test.old')::uuid; new_id uuid;
BEGIN
  new_id:=public.academy_practice_start(gen_random_uuid(),5,'{}','TECH-FIX-7000');
  PERFORM pg_temp.expect(public.academy_practice_submit(old_id,1,gen_random_uuid(),'1')->>'outcome'='correct'
    AND public.academy_practice_submit(new_id,1,gen_random_uuid(),'2')->>'outcome'='correct','cada sessão corrige a edição original');
  PERFORM pg_temp.expect((SELECT count(*) FROM public.academy_practice_state WHERE item_id='TECH-FIX-7000')=2,'histórico das duas edições');
END $$;
RESET ROLE;

\timing on
SELECT public.academy_practice_import((SELECT jsonb_agg(pg_temp.fixture_item(n,1,'SCALE-FIXTURE')) FROM generate_series(1000,5999) n),'{}');
ANALYZE public.academy_practice_items;
SET ROLE authenticated;
DO $$ DECLARE catalog jsonb; cursor text; items text[]:='{}'; size integer; session uuid;
BEGIN
  LOOP
    catalog:=public.academy_practice_catalog('{"module":"SCALE-FIXTURE"}',cursor);
    PERFORM pg_temp.expect(jsonb_array_length(catalog->'items')<=20,'página limitada');
    items:=items || ARRAY(SELECT x->>'item_id' FROM jsonb_array_elements(catalog->'items') x);
    cursor:=catalog->>'next';
    EXIT WHEN cursor IS NULL;
  END LOOP;
  PERFORM pg_temp.expect(cardinality(items)=5000 AND (SELECT count(DISTINCT a) FROM unnest(items) a)=5000,'5.000 IDs paginados sem repetição ou lacunas');
  FOREACH size IN ARRAY ARRAY[5,10,15,30] LOOP
    session:=public.academy_practice_start(gen_random_uuid(),size,'{"module":"SCALE-FIXTURE"}');
    PERFORM pg_temp.expect((SELECT count(*) FROM public.academy_practice_slots WHERE session_id=session)=size,'tamanhos de sessão');
  END LOOP;
END $$;
RESET ROLE;
\timing off

SELECT pg_temp.expect(NOT EXISTS (TABLE previous_lessons EXCEPT TABLE public.academy_lessons)
  AND (SELECT count(*) FROM public.academy_lessons WHERE release_id='omni-content-001' AND version=2)=20
  AND NOT EXISTS (TABLE previous_progress EXCEPT TABLE public.academy_progress)
  AND NOT EXISTS (TABLE previous_attempts EXCEPT TABLE public.academy_attempts)
  AND NOT EXISTS (TABLE previous_drafts EXCEPT TABLE public.academy_python_drafts),'Academy existente preservada');

BEGIN;
SET LOCAL lock_timeout = '5s';

-- Instalações onde a tabela já existia podem ter pulado o UNIQUE histórico.
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS endpoint text GENERATED ALWAYS AS (subscription->>'endpoint') STORED;
LOCK TABLE public.push_subscriptions IN SHARE MODE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute AS a
    JOIN pg_catalog.pg_attrdef AS d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attrelid = 'public.push_subscriptions'::regclass
      AND a.attname = 'endpoint' AND NOT a.attisdropped AND a.attgenerated = 's'
      AND a.atttypid = 'pg_catalog.text'::regtype
      AND pg_catalog.pg_get_expr(d.adbin, d.adrelid) = '(subscription ->> ''endpoint''::text)'
  ) THEN
    RAISE EXCEPTION 'Definição de endpoint divergente. Revise o esquema de Push.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_index AS i
    WHERE i.indrelid = 'public.push_subscriptions'::regclass
      AND i.indisunique AND i.indisvalid AND i.indisready AND i.indimmediate
      AND i.indpred IS NULL AND i.indexprs IS NULL AND i.indnkeyatts = 2
      AND ARRAY(
        SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY AS key(attnum, position)
        JOIN pg_catalog.pg_attribute AS a ON a.attrelid = i.indrelid AND a.attnum = key.attnum
        WHERE key.position <= i.indnkeyatts ORDER BY a.attname
      ) = ARRAY['endpoint', 'user_id']
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.push_subscriptions
    WHERE user_id IS NOT NULL AND endpoint IS NOT NULL
    GROUP BY user_id, endpoint HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Existem assinaturas duplicadas por titular e endpoint. Reconcilie os registros antes de aplicar.';
  END IF;

  CREATE UNIQUE INDEX push_subscriptions_user_endpoint_uidx
    ON public.push_subscriptions (user_id, endpoint);
END;
$$;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY omnimind_push_owner_scope ON public.push_subscriptions
  AS RESTRICTIVE FOR ALL TO authenticated, anon
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

REVOKE ALL ON public.push_subscriptions FROM PUBLIC, anon;
GRANT SELECT, DELETE ON public.push_subscriptions TO authenticated;
GRANT INSERT (user_id, subscription), UPDATE (user_id, subscription)
  ON public.push_subscriptions TO authenticated;

COMMIT;

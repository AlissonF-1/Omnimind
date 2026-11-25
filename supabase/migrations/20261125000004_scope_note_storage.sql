BEGIN;

-- Bucket metadata only. Object transfers and configuration changes on existing
-- buckets must use Storage. See the rollout procedure in the reconciliation guide.
INSERT INTO storage.buckets (id, name, public) VALUES
  ('note_files', 'note_files', false), ('note_images', 'note_images', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id IN ('note_files', 'note_images') AND public IS DISTINCT FROM false) THEN
    RAISE EXCEPTION 'Torne note_files e note_images privados pela API ou painel do Storage antes de aplicar esta migration.';
  END IF;
END;
$$;

DROP POLICY IF EXISTS "Permitir delete para usuários autenticados" ON storage.objects;
DROP POLICY IF EXISTS "Permitir leitura para usuários autenticados" ON storage.objects;
DROP POLICY IF EXISTS "Permitir update para usuários autenticados" ON storage.objects;
DROP POLICY IF EXISTS "Permitir upload para usuários autenticados" ON storage.objects;
DROP POLICY IF EXISTS "Imagens visíveis para todos" ON storage.objects;
DROP POLICY IF EXISTS "Uploads apenas para autenticados" ON storage.objects;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Usuários deletam próprias imagens') THEN
    -- A política histórica de exclusão não filtrava bucket.
    ALTER POLICY "Usuários deletam próprias imagens" ON storage.objects
      USING (bucket_id NOT IN ('note_files', 'note_images') AND (SELECT auth.uid()) = owner);
  END IF;
END;
$$;

CREATE POLICY omnimind_workspace_pdf_owner ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'note_files' AND strpos(name, '/') > 0 AND EXISTS (
    SELECT 1 FROM public.workspaces AS w
    WHERE w.id::text = split_part(storage.objects.name, '/', 1) AND w.user_id = (SELECT auth.uid())
  ));

CREATE POLICY omnimind_note_image_owner ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'note_images' AND strpos(name, '/') > 0 AND EXISTS (
    SELECT 1 FROM public.notes AS n
    WHERE n.id::text = split_part(storage.objects.name, '/', 1) AND n.user_id = (SELECT auth.uid())
  ));

COMMIT;

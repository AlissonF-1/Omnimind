BEGIN;

-- Filtrar somente user_id permitiria que uma nova linha apontasse para um pai
-- de outra conta. A leitura e a limpeza das linhas existentes continuam por titular.
CREATE POLICY omnimind_owned_note_workspace ON public.notes
  AS RESTRICTIVE FOR ALL TO authenticated, anon
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.workspaces AS w
    WHERE w.id = notes.workspace_id AND w.user_id = (SELECT auth.uid())
  ));

CREATE POLICY omnimind_owned_flashcard_note ON public.flashcards
  AS RESTRICTIVE FOR ALL TO authenticated, anon
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.notes AS n
    WHERE n.id = flashcards.note_id AND n.user_id = (SELECT auth.uid())
  ));

CREATE POLICY omnimind_owned_goal_workspace ON public.exam_goals
  AS RESTRICTIVE FOR ALL TO authenticated, anon
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()) AND (workspace_id IS NULL OR EXISTS (
    SELECT 1 FROM public.workspaces AS w
    WHERE w.id = exam_goals.workspace_id AND w.user_id = (SELECT auth.uid())
  )));

COMMIT;

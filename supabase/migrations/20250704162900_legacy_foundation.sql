BEGIN;

-- Baseline para bancos novos. Em instalações existentes, reconcilie o catálogo
-- e o histórico antes de registrar esta versão. Veja MIGRATION_RECONCILIATION.md.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  full_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.workspaces (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_sprint_mode boolean NOT NULL DEFAULT false,
  sprint_date timestamptz,
  is_archived boolean DEFAULT false
);
CREATE INDEX idx_workspaces_user_id ON public.workspaces (user_id);

CREATE TABLE public.notes (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  topic text DEFAULT 'Geral'
);
CREATE INDEX idx_notes_user_id ON public.notes (user_id);

CREATE TABLE public.flashcards (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  note_id uuid NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  front text NOT NULL,
  back text NOT NULL,
  state smallint NOT NULL DEFAULT 0,
  due timestamptz NOT NULL DEFAULT now(),
  stability double precision NOT NULL DEFAULT 0,
  difficulty double precision NOT NULL DEFAULT 0,
  elapsed_days integer NOT NULL DEFAULT 0,
  scheduled_days integer NOT NULL DEFAULT 0,
  reps integer NOT NULL DEFAULT 0,
  lapses integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  analogia text,
  mnemonico text,
  source_anchor text
);
CREATE INDEX idx_flashcards_user_id ON public.flashcards (user_id);
CREATE INDEX idx_flashcards_note_id ON public.flashcards (note_id);
CREATE INDEX idx_flashcards_due ON public.flashcards (due);

CREATE TABLE public.daily_study_logs (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  study_date date NOT NULL DEFAULT current_date,
  review_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, study_date)
);

CREATE TABLE public.exam_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Prova',
  exam_date date NOT NULL,
  color text DEFAULT '#6366f1',
  is_active_goal boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX idx_exam_goals_user_date ON public.exam_goals (user_id, exam_date);

CREATE TABLE public.daily_quests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  date date DEFAULT current_date,
  quest_id text NOT NULL,
  progress integer DEFAULT 0,
  target integer NOT NULL,
  completed boolean DEFAULT false,
  reward_xp integer DEFAULT 10
);

CREATE TABLE public.user_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme text DEFAULT 'dark',
  clipper_default_workspace_id uuid REFERENCES public.workspaces(id),
  daily_goal_default integer DEFAULT 10,
  do_not_disturb boolean DEFAULT false,
  fsrs_retention_goal numeric DEFAULT 0.90,
  transcription_mode text DEFAULT 'browser',
  tts_voice text DEFAULT 'default',
  ai_font_size text DEFAULT 'normal',
  ai_default_model text DEFAULT 'gemini',
  eco_mode boolean DEFAULT false,
  generate_analogies boolean DEFAULT true,
  enable_sounds boolean DEFAULT true,
  enable_confetti boolean DEFAULT true,
  level_visibility text DEFAULT 'public',
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.user_study_stats (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  current_streak integer DEFAULT 0,
  last_review_date date,
  cards_reviewed_today integer DEFAULT 0,
  updated_at timestamptz DEFAULT timezone('utc', now()),
  daily_goal_completed boolean DEFAULT false,
  streak_multiplier numeric DEFAULT 1.0,
  tutor_queries_count integer DEFAULT 0,
  perfect_exams_count integer DEFAULT 0,
  unlocked_achievements text[] DEFAULT '{}'::text[],
  total_xp integer DEFAULT 0,
  current_level integer DEFAULT 1
);

CREATE TABLE public.concept_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_note_id uuid REFERENCES public.notes(id) ON DELETE CASCADE,
  target_note_id uuid NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  ghost_concept_name text,
  relation_type text DEFAULT 'prerequisite',
  created_at timestamptz DEFAULT now(),
  CONSTRAINT check_source_or_ghost CHECK ((source_note_id IS NULL) <> (ghost_concept_name IS NULL)),
  CONSTRAINT no_self_reference CHECK (source_note_id <> target_note_id),
  UNIQUE (source_note_id, target_note_id, relation_type),
  UNIQUE (ghost_concept_name, target_note_id, relation_type)
);
CREATE INDEX idx_concept_relations_target ON public.concept_relations (target_note_id);
CREATE INDEX idx_concept_relations_source ON public.concept_relations (source_note_id);

CREATE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  RETURN new;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE FUNCTION public.update_modified_column() RETURNS trigger
LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  new.updated_at := now();
  RETURN new;
END;
$$;
CREATE TRIGGER update_profiles_modtime BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();
CREATE TRIGGER update_workspaces_modtime BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();
CREATE TRIGGER update_notes_modtime BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();
CREATE TRIGGER update_flashcards_modtime BEFORE UPDATE ON public.flashcards
  FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();
CREATE TRIGGER update_daily_logs_modtime BEFORE UPDATE ON public.daily_study_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();

REVOKE EXECUTE ON FUNCTION public.handle_new_user(), public.update_modified_column() FROM PUBLIC, anon, authenticated;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_access ON public.profiles FOR ALL TO authenticated
  USING (id = (SELECT auth.uid())) WITH CHECK (id = (SELECT auth.uid()));
ALTER TABLE public.concept_relations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profiles, public.concept_relations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.profiles TO authenticated;

DO $$
DECLARE
  target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'workspaces', 'notes', 'flashcards', 'daily_study_logs', 'exam_goals',
    'daily_quests', 'user_preferences', 'user_study_stats'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', target);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', target);
    EXECUTE format('CREATE POLICY owner_access ON public.%I FOR ALL TO authenticated '
      'USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()))', target);
  END LOOP;
END;
$$;

COMMIT;

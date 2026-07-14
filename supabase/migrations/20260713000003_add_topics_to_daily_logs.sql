-- Add topics array to daily_study_logs to track which workspaces/topics were studied
ALTER TABLE daily_study_logs ADD COLUMN IF NOT EXISTS topics TEXT[] DEFAULT '{}'::TEXT[];

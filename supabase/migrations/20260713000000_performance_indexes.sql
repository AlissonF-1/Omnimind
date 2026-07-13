-- Performance indexes for OmniMind
CREATE INDEX IF NOT EXISTS idx_exam_goals_user_active 
  ON exam_goals(user_id, is_active_goal, exam_date ASC);

CREATE INDEX IF NOT EXISTS idx_flashcards_user_due 
  ON flashcards(user_id, due, state);

CREATE INDEX IF NOT EXISTS idx_daily_study_logs_user_date 
  ON daily_study_logs(user_id, study_date DESC);

CREATE INDEX IF NOT EXISTS idx_daily_quests_user_date 
  ON daily_quests(user_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_user_preferences_user 
  ON user_preferences(user_id);

CREATE INDEX IF NOT EXISTS idx_workspaces_user_archived 
  ON workspaces(user_id, is_archived);

CREATE INDEX IF NOT EXISTS idx_notes_workspace 
  ON notes(workspace_id);

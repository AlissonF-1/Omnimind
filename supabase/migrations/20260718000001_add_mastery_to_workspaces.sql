-- Add mastery columns to workspaces table
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS mastery_level INTEGER DEFAULT 1;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS mastery_xp INTEGER DEFAULT 0;

-- Retroactively populate mastery_xp and mastery_level based on existing flashcard reps and lapses
UPDATE workspaces w
SET 
  mastery_xp = COALESCE(sub.calculated_xp, 0),
  mastery_level = LEAST(10, GREATEST(1, FLOOR(COALESCE(sub.calculated_xp, 0) / 100) + 1))
FROM (
  SELECT 
    n.workspace_id,
    GREATEST(0, SUM(COALESCE(f.reps, 0) * 5 - COALESCE(f.lapses, 0) * 6)) AS calculated_xp
  FROM flashcards f
  JOIN notes n ON f.note_id = n.id
  GROUP BY n.workspace_id
) sub
WHERE w.id = sub.workspace_id;

-- Supabase RPC for optimized workspace health calculation
CREATE OR REPLACE FUNCTION get_workspace_health(p_user_id UUID)
RETURNS TABLE(
  workspace_id UUID, 
  workspace_name TEXT, 
  workspace_description TEXT,
  total_cards BIGINT, 
  reviewed_cards BIGINT, 
  avg_correctness FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    w.id as workspace_id, 
    w.name as workspace_name,
    w.description as workspace_description,
    COUNT(f.id) as total_cards,
    COUNT(CASE WHEN f.reps > 0 THEN 1 END) as reviewed_cards,
    AVG(CASE WHEN f.reps > 0 
        THEN GREATEST(0, LEAST(1, (f.reps - COALESCE(f.lapses,0))::float / f.reps)) 
        END) as avg_correctness
  FROM workspaces w
  LEFT JOIN notes n ON n.workspace_id = w.id
  LEFT JOIN flashcards f ON f.note_id = n.id AND f.user_id = p_user_id
  WHERE w.user_id = p_user_id AND w.is_archived = false
  GROUP BY w.id, w.name, w.description;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

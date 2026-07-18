-- Create journey_milestones table for narrative chronologies
CREATE TABLE IF NOT EXISTS journey_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  milestone_date DATE DEFAULT CURRENT_DATE,
  type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE journey_milestones ENABLE ROW LEVEL SECURITY;

-- Create policy to select milestones
CREATE POLICY "Allow select personal milestones" 
  ON journey_milestones FOR SELECT 
  TO authenticated 
  USING (auth.uid() = user_id);

-- Create policy to insert milestones
CREATE POLICY "Allow insert personal milestones" 
  ON journey_milestones FOR INSERT 
  TO authenticated 
  WITH CHECK (auth.uid() = user_id);

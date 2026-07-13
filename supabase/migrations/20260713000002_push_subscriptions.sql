-- Migration: push_subscriptions table com RLS
-- Execute no Supabase SQL Editor

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

-- Índice no user_id para lookup rápido na rota /send
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON push_subscriptions(user_id);

-- Adiciona coluna de endpoint extraída para facilitar o UNIQUE
ALTER TABLE push_subscriptions 
  ADD COLUMN IF NOT EXISTS endpoint TEXT GENERATED ALWAYS AS (subscription->>'endpoint') STORED;

-- RLS: usuários só podem ver/gerenciar suas próprias subscriptions
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own push subscriptions" ON push_subscriptions;
CREATE POLICY "Users manage own push subscriptions"
  ON push_subscriptions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

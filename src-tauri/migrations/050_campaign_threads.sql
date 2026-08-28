-- Phase 5: Campaign thread tracking foundation.

CREATE TABLE IF NOT EXISTS campaign_threads (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  thread_type TEXT NOT NULL DEFAULT 'plot',
  status TEXT NOT NULL DEFAULT 'active',
  visibility TEXT NOT NULL DEFAULT 'player_safe',
  priority INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  CHECK (thread_type IN ('plot', 'quest', 'faction', 'mystery', 'character', 'threat', 'custom')),
  CHECK (status IN ('active', 'dormant', 'resolved', 'abandoned')),
  CHECK (visibility IN ('player_safe', 'director_only'))
);

CREATE INDEX IF NOT EXISTS idx_campaign_threads_campaign
ON campaign_threads(campaign_id, status, priority DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_campaign_threads_visibility
ON campaign_threads(campaign_id, visibility);

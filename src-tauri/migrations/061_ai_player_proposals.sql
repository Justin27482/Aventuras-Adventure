-- Persist AI Player proposals and GM review state.
CREATE TABLE IF NOT EXISTS ai_player_proposals (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES campaign_sessions(id) ON DELETE CASCADE,
  ai_player_id TEXT NOT NULL REFERENCES ai_players(id) ON DELETE RESTRICT,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  scene_mode TEXT NOT NULL,
  action TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  confidence INTEGER NOT NULL CHECK (confidence BETWEEN 1 AND 10),
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'accepted', 'declined')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_player_proposals_campaign
  ON ai_player_proposals(campaign_id, created_at DESC);

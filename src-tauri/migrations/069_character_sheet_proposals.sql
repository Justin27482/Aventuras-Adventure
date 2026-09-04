-- AI-proposed character definitions and sheets remain pending until explicit GM approval.
CREATE TABLE IF NOT EXISTS character_sheet_proposals (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  setup_session_id TEXT REFERENCES campaign_setup_sessions(id) ON DELETE CASCADE,
  ai_player_id TEXT NOT NULL REFERENCES ai_players(id) ON DELETE RESTRICT,
  character_id TEXT REFERENCES characters(id) ON DELETE CASCADE,
  proposal_type TEXT NOT NULL CHECK (proposal_type IN ('create', 'update')),
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  review_notes TEXT,
  created_at INTEGER NOT NULL,
  reviewed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_character_sheet_proposals_campaign
  ON character_sheet_proposals(campaign_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_character_sheet_proposals_setup
  ON character_sheet_proposals(setup_session_id, created_at);
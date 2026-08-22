-- Phase 2: Dice roll ledger for reproducible, auditable rolls.

CREATE TABLE IF NOT EXISTS roll_ledger (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  session_id TEXT,
  actor_id TEXT,
  notation TEXT NOT NULL,
  seed TEXT NOT NULL,
  rolls TEXT NOT NULL,
  modifier INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  dc INTEGER,
  outcome TEXT,
  reason TEXT,
  visibility TEXT NOT NULL DEFAULT 'player_safe',
  bias_applied TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES campaign_sessions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_roll_ledger_campaign ON roll_ledger(campaign_id, created_at);
CREATE INDEX IF NOT EXISTS idx_roll_ledger_actor ON roll_ledger(campaign_id, actor_id);
CREATE INDEX IF NOT EXISTS idx_roll_ledger_session ON roll_ledger(session_id, created_at);

-- Party-pending campaigns and first-class setup sessions independent of normal Session 1+.
CREATE TABLE IF NOT EXISTS campaign_formation_state (
  campaign_id TEXT PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('party_pending', 'ready')),
  required_ai_player_ids TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL CHECK (source IN ('created_pending', 'converted', 'established')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS campaign_setup_sessions (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('private_character_creation', 'private_prologue', 'group_session_zero', 'table_bonding')),
  phase TEXT NOT NULL CHECK (phase IN ('introductions', 'premises', 'character_creation', 'bonding', 'secrets', 'free_table')),
  status TEXT NOT NULL CHECK (status IN ('planned', 'active', 'completed', 'abandoned')),
  audience_scope TEXT NOT NULL CHECK (audience_scope IN ('full_table', 'player_subset', 'private_player')),
  audience_ai_player_ids TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  updated_at INTEGER NOT NULL,
  UNIQUE (campaign_id, sequence)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_setup_sessions_one_active
  ON campaign_setup_sessions(campaign_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_campaign_setup_sessions_history
  ON campaign_setup_sessions(campaign_id, sequence DESC);

CREATE TABLE IF NOT EXISTS campaign_setup_session_players (
  setup_session_id TEXT NOT NULL REFERENCES campaign_setup_sessions(id) ON DELETE CASCADE,
  ai_player_id TEXT NOT NULL REFERENCES ai_players(id) ON DELETE RESTRICT,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (setup_session_id, ai_player_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_setup_session_players_ai
  ON campaign_setup_session_players(ai_player_id, setup_session_id);

CREATE TABLE IF NOT EXISTS campaign_setup_chat_messages (
  id TEXT PRIMARY KEY,
  setup_session_id TEXT NOT NULL REFERENCES campaign_setup_sessions(id) ON DELETE CASCADE,
  message_type TEXT NOT NULL CHECK (message_type IN ('proposal', 'roll', 'table_talk', 'narration', 'consent_request', 'system')),
  audience_scope TEXT NOT NULL CHECK (audience_scope IN ('full_table', 'private_subset', 'private_player')),
  visibility TEXT NOT NULL CHECK (visibility IN ('player_safe', 'director_only')),
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_campaign_setup_chat_timeline
  ON campaign_setup_chat_messages(setup_session_id, created_at, id);

CREATE TABLE IF NOT EXISTS campaign_formation_backups (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  snapshot TEXT NOT NULL,
  checksum TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  restored_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_campaign_formation_backups_campaign
  ON campaign_formation_backups(campaign_id, created_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_campaign_formation_backups_immutable
BEFORE UPDATE ON campaign_formation_backups
WHEN OLD.restored_at IS NOT NULL OR NEW.id <> OLD.id OR NEW.campaign_id <> OLD.campaign_id OR NEW.snapshot <> OLD.snapshot OR NEW.checksum <> OLD.checksum OR NEW.created_at <> OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'campaign formation backups are immutable');
END;

INSERT OR IGNORE INTO campaign_formation_state
  (campaign_id, status, required_ai_player_ids, source, created_at, updated_at)
SELECT
  c.id,
  CASE WHEN EXISTS (
    SELECT 1 FROM party_members pm
    WHERE pm.campaign_id = c.id AND pm.active = 1 AND pm.eligibility_status = 'eligible'
  ) THEN 'ready' ELSE 'party_pending' END,
  COALESCE((
    SELECT json_group_array(cap.ai_player_id)
    FROM campaign_ai_players cap
    WHERE cap.campaign_id = c.id AND cap.left_at IS NULL
  ), '[]'),
  'established',
  c.created_at,
  c.updated_at
FROM campaigns c
WHERE c.campaign_type = 'human_gm_ai_players';
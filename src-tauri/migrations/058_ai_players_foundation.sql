-- Global reusable AI Players and campaign-bound character assignments.
CREATE TABLE IF NOT EXISTS ai_players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  base_personality TEXT NOT NULL DEFAULT '{}',
  base_prompt_profile TEXT,
  archived_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_player_relationships (
  id TEXT PRIMARY KEY,
  ai_player_id_a TEXT NOT NULL REFERENCES ai_players(id) ON DELETE CASCADE,
  ai_player_id_b TEXT NOT NULL REFERENCES ai_players(id) ON DELETE CASCADE,
  dynamic TEXT NOT NULL DEFAULT '',
  history TEXT NOT NULL DEFAULT '',
  friction INTEGER NOT NULL DEFAULT 0 CHECK (friction BETWEEN 0 AND 10),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (ai_player_id_a, ai_player_id_b),
  CHECK (ai_player_id_a <> ai_player_id_b)
);

CREATE TABLE IF NOT EXISTS player_characters (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  ai_player_id TEXT NOT NULL REFERENCES ai_players(id) ON DELETE RESTRICT,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  roleplay_notes TEXT,
  character_secrets TEXT NOT NULL DEFAULT '[]',
  inter_player_relationship_overrides TEXT NOT NULL DEFAULT '{}',
  joined_at INTEGER NOT NULL,
  left_at INTEGER,
  UNIQUE (campaign_id, ai_player_id),
  UNIQUE (campaign_id, character_id)
);

CREATE INDEX IF NOT EXISTS idx_player_characters_campaign
  ON player_characters(campaign_id);
CREATE INDEX IF NOT EXISTS idx_player_characters_ai_player
  ON player_characters(ai_player_id);

CREATE TABLE IF NOT EXISTS player_level_secrets (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES campaign_sessions(id) ON DELETE CASCADE,
  target_ai_player_id TEXT NOT NULL REFERENCES ai_players(id) ON DELETE CASCADE,
  secret_content TEXT NOT NULL,
  revealed_to_ai_player_ids TEXT NOT NULL DEFAULT '[]',
  visibility_scope TEXT NOT NULL CHECK (visibility_scope IN ('specific_ai_player', 'all_ai_players')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_player_level_secrets_target
  ON player_level_secrets(campaign_id, target_ai_player_id);

CREATE TABLE IF NOT EXISTS ai_player_interactions (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES campaign_sessions(id) ON DELETE CASCADE,
  audience_scope TEXT NOT NULL CHECK (audience_scope IN ('full_table', 'player_subset', 'private_player')),
  audience_ai_player_ids TEXT NOT NULL DEFAULT '[]',
  transcript TEXT NOT NULL DEFAULT '[]',
  disclosed_to_audience INTEGER NOT NULL DEFAULT 0 CHECK (disclosed_to_audience IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_player_interactions_session
  ON ai_player_interactions(campaign_id, session_id, created_at);

CREATE TABLE IF NOT EXISTS session_prerolls (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES campaign_sessions(id) ON DELETE CASCADE,
  preroll_type TEXT NOT NULL CHECK (preroll_type IN ('encounter', 'loot')),
  prerolled_data TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'session_start' CHECK (source IN ('session_start', 'mid_turn')),
  used_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_prerolls_session
  ON session_prerolls(session_id, preroll_type, used_at);

ALTER TABLE campaign_settings ADD COLUMN ai_players_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE campaign_settings ADD COLUMN default_ai_player_count INTEGER NOT NULL DEFAULT 4
  CHECK (default_ai_player_count BETWEEN 1 AND 5);

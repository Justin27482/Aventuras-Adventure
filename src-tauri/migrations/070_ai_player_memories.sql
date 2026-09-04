-- Global AI Player memories: an AI Player's own remembered experiences, distinct from
-- GM-authored secrets. Memories are owned by the global profile so they can persist
-- across campaigns, while origin_campaign_id records where the memory was formed so
-- retrieval can gate cross-campaign recall.
CREATE TABLE IF NOT EXISTS ai_player_memories (
  id TEXT PRIMARY KEY,
  ai_player_id TEXT NOT NULL REFERENCES ai_players(id) ON DELETE CASCADE,
  origin_campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
  origin_campaign_title TEXT,
  origin_setup_session_id TEXT REFERENCES campaign_setup_sessions(id) ON DELETE SET NULL,
  origin_session_id TEXT REFERENCES campaign_sessions(id) ON DELETE SET NULL,
  character_id TEXT REFERENCES characters(id) ON DELETE SET NULL,
  character_name TEXT,
  source TEXT NOT NULL DEFAULT 'private_prologue'
    CHECK (source IN ('private_prologue', 'setup_session', 'session', 'gm_authored', 'imported')),
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  keywords TEXT NOT NULL DEFAULT '[]',
  -- 'campaign' recall stays inside origin_campaign_id; 'cross_campaign' may inform
  -- other campaigns as out-of-world life experience; 'never' is retained but not injected.
  scope TEXT NOT NULL DEFAULT 'campaign'
    CHECK (scope IN ('campaign', 'cross_campaign', 'never')),
  injection_mode TEXT NOT NULL DEFAULT 'keyword'
    CHECK (injection_mode IN ('always', 'keyword', 'never')),
  priority INTEGER NOT NULL DEFAULT 5,
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_player_memories_player
  ON ai_player_memories(ai_player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_player_memories_origin_campaign
  ON ai_player_memories(origin_campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_player_memories_setup_session
  ON ai_player_memories(origin_setup_session_id);

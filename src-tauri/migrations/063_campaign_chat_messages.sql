-- Persist the chat-first GM campaign timeline independently from story prose.
CREATE TABLE IF NOT EXISTS campaign_chat_messages (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES campaign_sessions(id) ON DELETE CASCADE,
  message_type TEXT NOT NULL CHECK (message_type IN ('proposal', 'roll', 'table_talk', 'narration', 'consent_request', 'system')),
  audience_scope TEXT NOT NULL CHECK (audience_scope IN ('full_table', 'private_subset', 'private_player')),
  visibility TEXT NOT NULL CHECK (visibility IN ('player_safe', 'director_only')),
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_campaign_chat_messages_timeline
  ON campaign_chat_messages(campaign_id, session_id, created_at);

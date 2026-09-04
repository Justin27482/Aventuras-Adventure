-- Campaign AI Player roster is independent from optional AI Player-to-character control links.
CREATE TABLE IF NOT EXISTS campaign_ai_players (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  ai_player_id TEXT NOT NULL REFERENCES ai_players(id) ON DELETE RESTRICT,
  joined_at INTEGER NOT NULL,
  left_at INTEGER,
  UNIQUE (campaign_id, ai_player_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_ai_players_campaign
  ON campaign_ai_players(campaign_id, joined_at);

-- Preserve existing campaigns: every current character assignment implies a table participant.
INSERT OR IGNORE INTO campaign_ai_players (id, campaign_id, ai_player_id, joined_at, left_at)
SELECT lower(hex(randomblob(16))), campaign_id, ai_player_id, joined_at, left_at
FROM player_characters;

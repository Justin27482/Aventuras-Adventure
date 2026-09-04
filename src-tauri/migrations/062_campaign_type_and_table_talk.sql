-- Add campaign type and table talk intensity for GM Campaign UX.
-- G.9-G.10: Campaign type (human_gm_ai_players, human_gm_solo, ai_gm, human_player)
-- and table talk intensity (0-8 slider for OOC banter).

ALTER TABLE campaigns 
ADD COLUMN campaign_type TEXT NOT NULL DEFAULT 'human_gm_solo' 
CHECK (campaign_type IN ('human_gm_ai_players', 'human_gm_solo', 'ai_gm', 'human_player'));

ALTER TABLE campaign_settings
ADD COLUMN table_talk_intensity INTEGER NOT NULL DEFAULT 4
CHECK (table_talk_intensity BETWEEN 0 AND 8);

CREATE INDEX IF NOT EXISTS idx_campaigns_type ON campaigns(campaign_type);

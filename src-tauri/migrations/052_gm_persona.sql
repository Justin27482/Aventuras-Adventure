-- Phase 5: Campaign GM persona and rules digest support.

ALTER TABLE campaign_settings ADD COLUMN gm_persona TEXT;

CREATE INDEX IF NOT EXISTS idx_campaign_settings_gm_persona
ON campaign_settings(campaign_id);

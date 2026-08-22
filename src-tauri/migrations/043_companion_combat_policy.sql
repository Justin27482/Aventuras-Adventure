-- Store the default companion combat policy separately from dice enforcement.
ALTER TABLE campaign_settings ADD COLUMN companion_combat_policy TEXT NOT NULL DEFAULT 'companions_autonomous';

CREATE INDEX IF NOT EXISTS idx_campaign_settings_companion_policy
  ON campaign_settings(companion_combat_policy);

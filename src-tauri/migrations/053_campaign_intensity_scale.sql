-- Expand Campaign Engine content intensity from levels 0-4 to levels 0-8.
-- SQLite cannot alter a CHECK constraint in place, so rebuild the settings table.
PRAGMA foreign_keys = OFF;

CREATE TABLE campaign_settings_expanded (
    campaign_id TEXT PRIMARY KEY,
    default_party_size INTEGER NOT NULL DEFAULT 4,
    max_party_size INTEGER NOT NULL DEFAULT 6,
    scene_mode TEXT NOT NULL DEFAULT 'free',
    turn_order_mode TEXT NOT NULL DEFAULT 'free',
    dice_enforcement TEXT NOT NULL DEFAULT 'guided',
    nsfw_intensity INTEGER NOT NULL DEFAULT 0,
    world_charter TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    companion_combat_policy TEXT NOT NULL DEFAULT 'companions_autonomous',
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
    CHECK (default_party_size >= 1),
    CHECK (max_party_size >= default_party_size),
    CHECK (nsfw_intensity BETWEEN 0 AND 8)
);

INSERT INTO campaign_settings_expanded (
    campaign_id,
    default_party_size,
    max_party_size,
    scene_mode,
    turn_order_mode,
    dice_enforcement,
    nsfw_intensity,
    world_charter,
    created_at,
    updated_at,
    companion_combat_policy
)
SELECT
    campaign_id,
    default_party_size,
    max_party_size,
    scene_mode,
    turn_order_mode,
    dice_enforcement,
    nsfw_intensity,
    world_charter,
    created_at,
    updated_at,
    companion_combat_policy
FROM campaign_settings;

DROP TABLE campaign_settings;
ALTER TABLE campaign_settings_expanded RENAME TO campaign_settings;

CREATE INDEX IF NOT EXISTS idx_campaign_settings_companion_policy
  ON campaign_settings(companion_combat_policy);

PRAGMA foreign_keys = ON;

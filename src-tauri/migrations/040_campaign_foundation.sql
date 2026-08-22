-- Campaign Engine foundation schema.
-- This is an additive greenfield overlay; legacy stories remain unchanged.

CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    story_id TEXT UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    ruleset_id TEXT,
    spotlight_character_id TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS campaign_settings (
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
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
    CHECK (default_party_size >= 1),
    CHECK (max_party_size >= default_party_size),
    CHECK (nsfw_intensity BETWEEN 0 AND 4)
);

CREATE TABLE IF NOT EXISTS party_members (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL,
    character_id TEXT NOT NULL,
    is_player_character INTEGER NOT NULL DEFAULT 1,
    display_order INTEGER NOT NULL DEFAULT 0,
    joined_at INTEGER NOT NULL,
    left_at INTEGER,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    UNIQUE (campaign_id, character_id)
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_party_members_campaign ON party_members(campaign_id, display_order);
CREATE INDEX IF NOT EXISTS idx_party_members_character ON party_members(character_id);

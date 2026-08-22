-- Campaign Engine agency and session snapshots.
-- Migration 040 remains immutable migration history; this migration extends it.

ALTER TABLE party_members ADD COLUMN eligibility_status TEXT NOT NULL DEFAULT 'eligible';
ALTER TABLE party_members ADD COLUMN actor_category TEXT NOT NULL DEFAULT 'active_companion';
ALTER TABLE party_members ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE party_members ADD COLUMN narrative_control_mode TEXT NOT NULL DEFAULT 'autonomous';
ALTER TABLE party_members ADD COLUMN combat_control_mode TEXT NOT NULL DEFAULT 'autonomous';

CREATE TABLE IF NOT EXISTS actor_control_profiles (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL,
    character_id TEXT NOT NULL,
    actor_category TEXT NOT NULL DEFAULT 'active_companion',
    narrative_control_mode TEXT NOT NULL DEFAULT 'autonomous',
    combat_control_mode TEXT NOT NULL DEFAULT 'autonomous',
    priorities TEXT,
    motivations TEXT,
    fears TEXT,
    value_priorities TEXT,
    red_lines TEXT,
    tactical_preferences TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    UNIQUE (campaign_id, character_id),
    CHECK (actor_category IN ('primary_player_character', 'active_companion', 'inactive_ally', 'friendly_npc', 'neutral_npc', 'enemy', 'gm_actor')),
    CHECK (narrative_control_mode IN ('player_narrative', 'autonomous', 'tactical_delegate', 'tactical_player', 'gm_directed')),
    CHECK (combat_control_mode IN ('player_narrative', 'autonomous', 'tactical_delegate', 'tactical_player', 'gm_directed'))
);

CREATE TABLE IF NOT EXISTS campaign_sessions (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL,
    session_number INTEGER NOT NULL,
    title TEXT,
    primary_character_id TEXT NOT NULL,
    narrative_control_policy TEXT NOT NULL DEFAULT 'primary_player_companions_autonomous',
    combat_control_policy TEXT NOT NULL DEFAULT 'companions_autonomous',
    status TEXT NOT NULL DEFAULT 'active',
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
    FOREIGN KEY (primary_character_id) REFERENCES characters(id) ON DELETE RESTRICT,
    UNIQUE (campaign_id, session_number),
    CHECK (narrative_control_policy IN ('primary_player_companions_autonomous')),
    CHECK (combat_control_policy IN ('companions_autonomous', 'tactical_delegate', 'tactical_player'))
);

CREATE TABLE IF NOT EXISTS session_party_members (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    character_id TEXT NOT NULL,
    party_order INTEGER NOT NULL DEFAULT 0,
    actor_category TEXT NOT NULL DEFAULT 'active_companion',
    narrative_control_mode TEXT NOT NULL DEFAULT 'autonomous',
    combat_control_mode TEXT NOT NULL DEFAULT 'autonomous',
    joined_at INTEGER NOT NULL,
    left_at INTEGER,
    FOREIGN KEY (session_id) REFERENCES campaign_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE RESTRICT,
    UNIQUE (session_id, character_id),
    CHECK (actor_category IN ('primary_player_character', 'active_companion')),
    CHECK (narrative_control_mode IN ('player_narrative', 'autonomous', 'tactical_delegate', 'tactical_player', 'gm_directed')),
    CHECK (combat_control_mode IN ('player_narrative', 'autonomous', 'tactical_delegate', 'tactical_player', 'gm_directed'))
);

CREATE INDEX IF NOT EXISTS idx_actor_control_profiles_campaign ON actor_control_profiles(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_sessions_campaign ON campaign_sessions(campaign_id, session_number);
CREATE INDEX IF NOT EXISTS idx_session_party_members_session ON session_party_members(session_id, party_order);
CREATE INDEX IF NOT EXISTS idx_session_party_members_character ON session_party_members(character_id);

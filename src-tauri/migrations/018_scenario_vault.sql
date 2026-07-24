-- Scenario Vault: Global scenario library for reusable scenario templates
-- Scenarios contain setting, NPCs, and opening data extracted from character cards

CREATE TABLE IF NOT EXISTS scenario_vault (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    
    -- Core content from CardImportResult
    setting_seed TEXT NOT NULL,
    npcs TEXT NOT NULL DEFAULT '[]',
    primary_character_name TEXT NOT NULL DEFAULT '',
    
    -- Opening scene data
    first_message TEXT,
    alternate_greetings TEXT NOT NULL DEFAULT '[]',
    
    -- Organization
    tags TEXT NOT NULL DEFAULT '[]',
    favorite INTEGER NOT NULL DEFAULT 0,
    
    -- Provenance
    source TEXT NOT NULL DEFAULT 'import',
    original_filename TEXT,
    
    -- Metadata
    metadata TEXT,
    
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_scenario_vault_name ON scenario_vault(name);
CREATE INDEX IF NOT EXISTS idx_scenario_vault_favorite ON scenario_vault(favorite);
CREATE INDEX IF NOT EXISTS idx_scenario_vault_source ON scenario_vault(source);

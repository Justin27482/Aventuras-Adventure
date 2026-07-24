-- Character Vault: Global character library for reusable character templates
-- Characters are copied to stories (no sync back)

CREATE TABLE IF NOT EXISTS character_vault (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    
    -- Character type: protagonist or supporting
    character_type TEXT NOT NULL DEFAULT 'supporting' CHECK(character_type IN ('protagonist', 'supporting')),
    
    -- For protagonists: background and motivation (used in wizard)
    background TEXT,
    motivation TEXT,
    
    -- For supporting: role and relationship template
    role TEXT,
    relationship_template TEXT,
    
    -- Common fields (mirroring Character interface)
    traits TEXT NOT NULL DEFAULT '[]',
    visual_descriptors TEXT NOT NULL DEFAULT '[]',
    portrait TEXT,
    
    -- Organization
    tags TEXT NOT NULL DEFAULT '[]',
    favorite INTEGER NOT NULL DEFAULT 0,
    
    -- Metadata
    source TEXT,
    original_story_id TEXT,
    metadata TEXT,
    
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_character_vault_type ON character_vault(character_type);
CREATE INDEX IF NOT EXISTS idx_character_vault_name ON character_vault(name);
CREATE INDEX IF NOT EXISTS idx_character_vault_favorite ON character_vault(favorite);

-- Entries table for lorebook/world state management (per design doc section 3.2)
CREATE TABLE IF NOT EXISTS entries (
    id TEXT PRIMARY KEY,
    story_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,  -- 'character', 'location', 'item', 'faction', 'concept', 'event'
    description TEXT,
    hidden_info TEXT,    -- Information hidden from player but available to AI
    aliases TEXT,        -- JSON array of alternative names/keywords

    -- State tracking (JSON, type-specific)
    state TEXT,          -- Base state with 'type' field
    adventure_state TEXT, -- Adventure mode specific state
    creative_state TEXT,  -- Creative mode specific state

    -- Injection settings (JSON)
    injection TEXT,      -- { mode: 'always'|'keyword'|'never', keywords: [], priority: number }

    -- Usage tracking
    first_mentioned INTEGER,
    last_mentioned INTEGER,
    mention_count INTEGER DEFAULT 0,

    -- Metadata
    created_by TEXT DEFAULT 'user',  -- 'user', 'ai', 'import'
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,

    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
);

-- Indexes for entries
CREATE INDEX IF NOT EXISTS idx_entries_story ON entries(story_id);
CREATE INDEX IF NOT EXISTS idx_entries_type ON entries(story_id, type);
CREATE INDEX IF NOT EXISTS idx_entries_name ON entries(story_id, name);

-- Aventura Initial Schema

-- Stories table
CREATE TABLE IF NOT EXISTS stories (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    genre TEXT,
    template_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    settings TEXT
);

-- Story entries (the actual narrative content)
CREATE TABLE IF NOT EXISTS story_entries (
    id TEXT PRIMARY KEY,
    story_id TEXT NOT NULL,
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    parent_id TEXT,
    position INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    metadata TEXT,
    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
);

-- Characters
CREATE TABLE IF NOT EXISTS characters (
    id TEXT PRIMARY KEY,
    story_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    relationship TEXT,
    traits TEXT,
    status TEXT DEFAULT 'active',
    metadata TEXT,
    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
);

-- Locations
CREATE TABLE IF NOT EXISTS locations (
    id TEXT PRIMARY KEY,
    story_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    visited INTEGER DEFAULT 0,
    current INTEGER DEFAULT 0,
    connections TEXT,
    metadata TEXT,
    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
);

-- Inventory items
CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    story_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    quantity INTEGER DEFAULT 1,
    equipped INTEGER DEFAULT 0,
    location TEXT,
    metadata TEXT,
    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
);

-- Story beats / plot points
CREATE TABLE IF NOT EXISTS story_beats (
    id TEXT PRIMARY KEY,
    story_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    type TEXT,
    status TEXT DEFAULT 'pending',
    triggered_at INTEGER,
    metadata TEXT,
    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
);

-- Templates
CREATE TABLE IF NOT EXISTS templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    genre TEXT,
    system_prompt TEXT NOT NULL,
    initial_state TEXT,
    is_builtin INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
);

-- Settings
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_story_entries_story ON story_entries(story_id);
CREATE INDEX IF NOT EXISTS idx_story_entries_position ON story_entries(story_id, position);
CREATE INDEX IF NOT EXISTS idx_characters_story ON characters(story_id);
CREATE INDEX IF NOT EXISTS idx_locations_story ON locations(story_id);
CREATE INDEX IF NOT EXISTS idx_items_story ON items(story_id);
CREATE INDEX IF NOT EXISTS idx_story_beats_story ON story_beats(story_id);

-- Migration 015: Add branch_id to world state tables
-- This enables per-branch persistence of characters, locations, items, story beats, and lorebook entries

-- Add branch_id to characters
ALTER TABLE characters ADD COLUMN branch_id TEXT REFERENCES branches(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_characters_branch ON characters(story_id, branch_id);

-- Add branch_id to locations
ALTER TABLE locations ADD COLUMN branch_id TEXT REFERENCES branches(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_locations_branch ON locations(story_id, branch_id);

-- Add branch_id to items
ALTER TABLE items ADD COLUMN branch_id TEXT REFERENCES branches(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_items_branch ON items(story_id, branch_id);

-- Add branch_id to story_beats
ALTER TABLE story_beats ADD COLUMN branch_id TEXT REFERENCES branches(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_story_beats_branch ON story_beats(story_id, branch_id);

-- Add branch_id to entries (lorebook)
ALTER TABLE entries ADD COLUMN branch_id TEXT REFERENCES branches(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_entries_branch ON entries(story_id, branch_id);

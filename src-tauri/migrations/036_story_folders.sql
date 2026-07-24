-- Migration 036: Story folders for Library organization

CREATE TABLE IF NOT EXISTS story_folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

ALTER TABLE stories ADD COLUMN folder_id TEXT;

CREATE INDEX IF NOT EXISTS idx_story_folders_name ON story_folders(name);
CREATE INDEX IF NOT EXISTS idx_stories_folder_id ON stories(folder_id);

-- Image Generation System

-- Add visual_descriptors column to characters table
ALTER TABLE characters ADD COLUMN visual_descriptors TEXT DEFAULT '[]';

-- Embedded images table for storing generated images
CREATE TABLE IF NOT EXISTS embedded_images (
    id TEXT PRIMARY KEY,
    story_id TEXT NOT NULL,
    entry_id TEXT NOT NULL,
    source_text TEXT NOT NULL,
    prompt TEXT NOT NULL,
    style_id TEXT NOT NULL,
    model TEXT NOT NULL,
    image_data TEXT NOT NULL DEFAULT '',
    width INTEGER,
    height INTEGER,
    status TEXT DEFAULT 'pending',
    error_message TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE,
    FOREIGN KEY (entry_id) REFERENCES story_entries(id) ON DELETE CASCADE
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_embedded_images_entry ON embedded_images(entry_id);
CREATE INDEX IF NOT EXISTS idx_embedded_images_story ON embedded_images(story_id);
CREATE INDEX IF NOT EXISTS idx_embedded_images_status ON embedded_images(status);

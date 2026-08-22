-- Migration 045: Chapter source entries for imported raw chapter text.

CREATE TABLE IF NOT EXISTS chapter_sources (
    id TEXT PRIMARY KEY,
    story_id TEXT NOT NULL,
    branch_id TEXT,
    title TEXT NOT NULL,
    source_filename TEXT,
    chapter_number INTEGER,
    raw_text TEXT NOT NULL,
    summary TEXT,
    keywords TEXT,
    characters TEXT,
    locations TEXT,
    plot_threads TEXT,
    emotional_tone TEXT,
    source_type TEXT NOT NULL DEFAULT 'import',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE,
    FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE INDEX IF NOT EXISTS idx_chapter_sources_story ON chapter_sources(story_id);
CREATE INDEX IF NOT EXISTS idx_chapter_sources_branch ON chapter_sources(story_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_chapter_sources_number ON chapter_sources(story_id, chapter_number);

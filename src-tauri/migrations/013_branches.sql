-- Migration 013: Add branching support
-- Allows users to branch from any message and explore alternate storylines

-- Fix: Add lorebook_entries_snapshot to checkpoints (was missing)
-- This is required for complete world state restoration when branching
ALTER TABLE checkpoints ADD COLUMN lorebook_entries_snapshot TEXT;

-- New branches table for tracking story branches
CREATE TABLE IF NOT EXISTS branches (
    id TEXT PRIMARY KEY,
    story_id TEXT NOT NULL,
    name TEXT NOT NULL,
    parent_branch_id TEXT,           -- NULL for main branch
    fork_entry_id TEXT NOT NULL,     -- Entry where this branch diverges from parent
    checkpoint_id TEXT,              -- Checkpoint for world state restoration
    created_at INTEGER NOT NULL,

    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_branch_id) REFERENCES branches(id) ON DELETE SET NULL,
    FOREIGN KEY (fork_entry_id) REFERENCES story_entries(id),
    FOREIGN KEY (checkpoint_id) REFERENCES checkpoints(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_branches_story ON branches(story_id);
CREATE INDEX IF NOT EXISTS idx_branches_parent ON branches(parent_branch_id);

-- Add branch_id to story_entries
ALTER TABLE story_entries ADD COLUMN branch_id TEXT REFERENCES branches(id);
CREATE INDEX IF NOT EXISTS idx_story_entries_branch ON story_entries(story_id, branch_id, position);

-- Add branch_id to chapters (chapters belong to specific branches)
ALTER TABLE chapters ADD COLUMN branch_id TEXT REFERENCES branches(id);
CREATE INDEX IF NOT EXISTS idx_chapters_branch ON chapters(story_id, branch_id);

-- Add current_branch_id to stories to track which branch is active
ALTER TABLE stories ADD COLUMN current_branch_id TEXT REFERENCES branches(id);

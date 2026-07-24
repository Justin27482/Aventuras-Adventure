-- Migration 014: Fix branch foreign key constraint
-- The fork_entry_id FK was preventing checkpoint restoration because entries couldn't be deleted
-- while a branch referenced them. Remove the FK constraint but keep the column for reference.
-- SQLite doesn't support ALTER CONSTRAINT, so we need to recreate the table.

-- Disable FK temporarily for this migration
PRAGMA foreign_keys = OFF;

-- Create new table without the problematic FK constraint on fork_entry_id
-- We keep the other FKs that are safe (story, parent_branch, checkpoint all have proper ON DELETE)
CREATE TABLE branches_new (
    id TEXT PRIMARY KEY,
    story_id TEXT NOT NULL,
    name TEXT NOT NULL,
    parent_branch_id TEXT,
    fork_entry_id TEXT NOT NULL,  -- Keep as regular column, no FK constraint
    checkpoint_id TEXT,
    created_at INTEGER NOT NULL,

    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_branch_id) REFERENCES branches_new(id) ON DELETE SET NULL,
    FOREIGN KEY (checkpoint_id) REFERENCES checkpoints(id) ON DELETE SET NULL
);

-- Copy existing data
INSERT INTO branches_new SELECT * FROM branches;

-- Drop old table
DROP TABLE branches;

-- Rename new table
ALTER TABLE branches_new RENAME TO branches;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_branches_story ON branches(story_id);
CREATE INDEX IF NOT EXISTS idx_branches_parent ON branches(parent_branch_id);

-- Re-enable FK
PRAGMA foreign_keys = ON;

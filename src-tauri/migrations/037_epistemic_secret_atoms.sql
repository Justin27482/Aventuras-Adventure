-- Migration 037: Epistemic secret atoms and entry scoping metadata

ALTER TABLE entries ADD COLUMN visibility_scope TEXT DEFAULT 'both';
ALTER TABLE entries ADD COLUMN secrecy_scope TEXT DEFAULT 'public';
ALTER TABLE entries ADD COLUMN reveal_state TEXT DEFAULT 'revealed';

CREATE TABLE IF NOT EXISTS epistemic_secret_atoms (
    id TEXT PRIMARY KEY,
    story_id TEXT NOT NULL,
    parent_entry_id TEXT,
    label TEXT NOT NULL,
    payload_hidden TEXT NOT NULL,
    payload_foreshadow TEXT,
    secrecy_scope TEXT NOT NULL DEFAULT 'director_only', -- public|character_scoped|director_only
    reveal_state TEXT NOT NULL DEFAULT 'hidden',         -- hidden|foreshadowed|revealed
    reveal_constraints TEXT,
    provenance TEXT,
    visibility_scope TEXT NOT NULL DEFAULT 'both',       -- adventure|creative-writing|both
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_entry_id) REFERENCES entries(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_epistemic_secret_atoms_story ON epistemic_secret_atoms(story_id);
CREATE INDEX IF NOT EXISTS idx_epistemic_secret_atoms_parent_entry ON epistemic_secret_atoms(parent_entry_id);
CREATE INDEX IF NOT EXISTS idx_epistemic_secret_atoms_story_reveal ON epistemic_secret_atoms(story_id, reveal_state);

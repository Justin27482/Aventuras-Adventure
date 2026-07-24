-- Migration 038: Epistemic character knowledge edges

CREATE TABLE IF NOT EXISTS epistemic_character_knowledge_edges (
    id TEXT PRIMARY KEY,
    story_id TEXT NOT NULL,
    atom_id TEXT NOT NULL,

    -- Typed character references support canonical, scenario/imported, and runtime identities.
    character_ref_type TEXT NOT NULL, -- story_character|scenario_npc|imported_npc|runtime_character
    character_ref_id TEXT NOT NULL,

    -- Canonical story character row when available.
    character_id TEXT,

    knows INTEGER NOT NULL DEFAULT 0,
    confidence REAL NOT NULL DEFAULT 0.0,
    disclosure_intent REAL NOT NULL DEFAULT 0.0,
    disclosure_policy TEXT NOT NULL DEFAULT 'guarded', -- guarded|selective|candid|manipulative

    rationale_tags TEXT NOT NULL DEFAULT '[]',
    pressure_tags TEXT NOT NULL DEFAULT '[]',

    learned_via TEXT,
    learned_at INTEGER,
    metadata TEXT,
    updated_at INTEGER NOT NULL,

    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE,
    FOREIGN KEY (atom_id) REFERENCES epistemic_secret_atoms(id) ON DELETE CASCADE,
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE SET NULL,

    UNIQUE (story_id, atom_id, character_ref_type, character_ref_id)
);

CREATE INDEX IF NOT EXISTS idx_epistemic_edges_story_atom ON epistemic_character_knowledge_edges(story_id, atom_id);
CREATE INDEX IF NOT EXISTS idx_epistemic_edges_story_character ON epistemic_character_knowledge_edges(story_id, character_id);
CREATE INDEX IF NOT EXISTS idx_epistemic_edges_story_typed_ref ON epistemic_character_knowledge_edges(story_id, character_ref_type, character_ref_id);

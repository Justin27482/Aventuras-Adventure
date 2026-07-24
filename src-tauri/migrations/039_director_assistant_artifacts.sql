-- Migration 039: Director assistant draft artifacts and approval records

CREATE TABLE IF NOT EXISTS director_assistant_artifacts (
    id TEXT PRIMARY KEY,
    story_id TEXT NOT NULL,
    author_type TEXT NOT NULL DEFAULT 'assistant', -- assistant|user
    proposal_type TEXT NOT NULL,
    title TEXT,
    draft_payload TEXT NOT NULL,
    diff_payload TEXT,
    approval_state TEXT NOT NULL DEFAULT 'pending', -- pending|approved|rejected
    approved_by TEXT,
    approved_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_director_artifacts_story_created ON director_assistant_artifacts(story_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_director_artifacts_story_state ON director_assistant_artifacts(story_id, approval_state);

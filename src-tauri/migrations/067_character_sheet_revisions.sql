-- Immutable character-sheet snapshots for GM edits, approved AI proposals, and restores.
CREATE TABLE IF NOT EXISTS character_sheet_revisions (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  parent_revision_id TEXT REFERENCES character_sheet_revisions(id) ON DELETE RESTRICT,
  author_type TEXT NOT NULL CHECK (author_type IN ('gm', 'ai_player')),
  author_ai_player_id TEXT REFERENCES ai_players(id) ON DELETE RESTRICT,
  source TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  CHECK (
    (author_type = 'gm' AND author_ai_player_id IS NULL) OR
    (author_type = 'ai_player' AND author_ai_player_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_character_sheet_revisions_character
  ON character_sheet_revisions(character_id, created_at, id);

CREATE TRIGGER IF NOT EXISTS trg_character_sheet_revisions_immutable
BEFORE UPDATE ON character_sheet_revisions
BEGIN
  SELECT RAISE(ABORT, 'character sheet revisions are immutable');
END;

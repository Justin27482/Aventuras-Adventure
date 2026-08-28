-- Link lorebook entries to reusable ruleset abilities.
ALTER TABLE entries ADD COLUMN ability_id TEXT;
CREATE INDEX IF NOT EXISTS idx_entries_ability_id ON entries(ability_id);
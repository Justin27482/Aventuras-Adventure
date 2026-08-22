-- Phase 3: Ruleset-derived resources and per-character dynamic sheet storage.

CREATE TABLE IF NOT EXISTS ruleset_resources (
  id TEXT PRIMARY KEY,
  ruleset_id TEXT NOT NULL,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  max_formula TEXT NOT NULL,
  min_value INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (ruleset_id) REFERENCES rulesets(id) ON DELETE CASCADE,
  UNIQUE (ruleset_id, key)
);

CREATE TABLE IF NOT EXISTS character_sheets (
  character_id TEXT PRIMARY KEY,
  ruleset_id TEXT NOT NULL,
  stat_values TEXT NOT NULL DEFAULT '{}',
  resource_values TEXT NOT NULL DEFAULT '{}',
  condition_states TEXT NOT NULL DEFAULT '{}',
  level INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
  FOREIGN KEY (ruleset_id) REFERENCES rulesets(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_ruleset_resources_ruleset ON ruleset_resources(ruleset_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_character_sheets_ruleset ON character_sheets(ruleset_id);

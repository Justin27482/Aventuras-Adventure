-- Reusable ruleset-owned spells and creature stat blocks.
CREATE TABLE IF NOT EXISTS ruleset_spells (
  id TEXT PRIMARY KEY,
  ruleset_id TEXT NOT NULL,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  level INTEGER NOT NULL DEFAULT 0,
  notation TEXT,
  resource_cost INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (ruleset_id) REFERENCES rulesets(id) ON DELETE CASCADE,
  UNIQUE (ruleset_id, key)
);

CREATE TABLE IF NOT EXISTS ruleset_creatures (
  id TEXT PRIMARY KEY,
  ruleset_id TEXT NOT NULL,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  creature_type TEXT,
  stat_block TEXT NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (ruleset_id) REFERENCES rulesets(id) ON DELETE CASCADE,
  UNIQUE (ruleset_id, key)
);

CREATE INDEX IF NOT EXISTS idx_ruleset_spells_ruleset ON ruleset_spells(ruleset_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_ruleset_creatures_ruleset ON ruleset_creatures(ruleset_id, sort_order);
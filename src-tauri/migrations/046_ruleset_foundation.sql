-- Phase 2: Ruleset schema foundation.
-- Additive greenfield overlay; campaigns.ruleset_id (added in migration 040) now resolves here.

CREATE TABLE IF NOT EXISTS rulesets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_builtin INTEGER NOT NULL DEFAULT 0,
  dice_system TEXT NOT NULL DEFAULT 'd20',
  default_check_rule_key TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ruleset_stats (
  id TEXT PRIMARY KEY,
  ruleset_id TEXT NOT NULL,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  default_value INTEGER NOT NULL DEFAULT 10,
  min_value INTEGER,
  max_value INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (ruleset_id) REFERENCES rulesets(id) ON DELETE CASCADE,
  UNIQUE (ruleset_id, key)
);

CREATE TABLE IF NOT EXISTS ruleset_skills (
  id TEXT PRIMARY KEY,
  ruleset_id TEXT NOT NULL,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  governing_stat_key TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (ruleset_id) REFERENCES rulesets(id) ON DELETE CASCADE,
  UNIQUE (ruleset_id, key)
);

CREATE TABLE IF NOT EXISTS ruleset_check_rules (
  id TEXT PRIMARY KEY,
  ruleset_id TEXT NOT NULL,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  notation TEXT NOT NULL,
  critical_success_threshold INTEGER,
  critical_failure_threshold INTEGER,
  outcome_bands TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (ruleset_id) REFERENCES rulesets(id) ON DELETE CASCADE,
  UNIQUE (ruleset_id, key)
);

CREATE TABLE IF NOT EXISTS ruleset_conditions (
  id TEXT PRIMARY KEY,
  ruleset_id TEXT NOT NULL,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (ruleset_id) REFERENCES rulesets(id) ON DELETE CASCADE,
  UNIQUE (ruleset_id, key)
);

CREATE TABLE IF NOT EXISTS ruleset_slots (
  id TEXT PRIMARY KEY,
  ruleset_id TEXT NOT NULL,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (ruleset_id) REFERENCES rulesets(id) ON DELETE CASCADE,
  UNIQUE (ruleset_id, key)
);

CREATE TABLE IF NOT EXISTS ruleset_abilities (
  id TEXT PRIMARY KEY,
  ruleset_id TEXT NOT NULL,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  resource_key TEXT,
  resource_cost INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (ruleset_id) REFERENCES rulesets(id) ON DELETE CASCADE,
  UNIQUE (ruleset_id, key)
);

CREATE TABLE IF NOT EXISTS ruleset_levels (
  id TEXT PRIMARY KEY,
  ruleset_id TEXT NOT NULL,
  level INTEGER NOT NULL,
  label TEXT,
  xp_threshold INTEGER,
  stat_bonuses TEXT,
  FOREIGN KEY (ruleset_id) REFERENCES rulesets(id) ON DELETE CASCADE,
  UNIQUE (ruleset_id, level)
);

CREATE INDEX IF NOT EXISTS idx_ruleset_stats_ruleset ON ruleset_stats(ruleset_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_ruleset_skills_ruleset ON ruleset_skills(ruleset_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_ruleset_check_rules_ruleset ON ruleset_check_rules(ruleset_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_ruleset_conditions_ruleset ON ruleset_conditions(ruleset_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_ruleset_slots_ruleset ON ruleset_slots(ruleset_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_ruleset_abilities_ruleset ON ruleset_abilities(ruleset_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_ruleset_levels_ruleset ON ruleset_levels(ruleset_id, level);

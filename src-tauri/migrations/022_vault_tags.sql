CREATE TABLE IF NOT EXISTS vault_tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'character' | 'lorebook' | 'scenario'
  color TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(name, type)
);

CREATE INDEX IF NOT EXISTS idx_vault_tags_type ON vault_tags(type);

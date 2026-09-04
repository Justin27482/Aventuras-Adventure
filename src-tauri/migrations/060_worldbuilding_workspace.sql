-- Persist the pre-campaign worldbuilding workspace and assistant conversation.
CREATE TABLE IF NOT EXISTS worldbuilding_workspaces (
  id TEXT PRIMARY KEY,
  draft TEXT NOT NULL DEFAULT '{}',
  charter TEXT NOT NULL DEFAULT '',
  conversation TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO worldbuilding_workspaces (id, draft, charter, conversation, updated_at)
VALUES ('default', '{}', '', '[]', strftime('%s','now') * 1000);

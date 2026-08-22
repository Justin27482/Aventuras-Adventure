-- Phase 4: Persist scene mode and turn order state for campaigns and entries.

CREATE TABLE IF NOT EXISTS scene_turn_states (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  entry_id TEXT,
  scene_mode TEXT NOT NULL DEFAULT 'free',
  turn_order_mode TEXT NOT NULL DEFAULT 'free',
  active_actor_id TEXT,
  actor_order TEXT NOT NULL DEFAULT '[]',
  turn_number INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (entry_id) REFERENCES story_entries(id) ON DELETE CASCADE,
  UNIQUE (campaign_id, entry_id)
);

CREATE INDEX IF NOT EXISTS idx_scene_turn_states_campaign
ON scene_turn_states(campaign_id, updated_at DESC);
-- Phase 5: Thread beats, clocks, and visibility tracking.

ALTER TABLE campaign_threads ADD COLUMN clock_value INTEGER NOT NULL DEFAULT 0;
ALTER TABLE campaign_threads ADD COLUMN clock_max INTEGER;
ALTER TABLE campaign_threads ADD COLUMN stakes TEXT;

CREATE TABLE IF NOT EXISTS campaign_thread_beats (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  beat_type TEXT NOT NULL DEFAULT 'note',
  visibility TEXT NOT NULL DEFAULT 'player_safe',
  sort_order INTEGER NOT NULL DEFAULT 0,
  occurred_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (thread_id) REFERENCES campaign_threads(id) ON DELETE CASCADE,
  CHECK (beat_type IN ('milestone', 'clue', 'complication', 'clock_tick', 'resolution', 'note')),
  CHECK (visibility IN ('player_safe', 'director_only'))
);

CREATE INDEX IF NOT EXISTS idx_campaign_thread_beats_thread
ON campaign_thread_beats(thread_id, sort_order ASC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_campaign_thread_beats_campaign_visibility
ON campaign_thread_beats(campaign_id, visibility, occurred_at DESC);

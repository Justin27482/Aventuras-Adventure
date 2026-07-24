-- Add resolved_at timestamp for story beats (completed/failed)
ALTER TABLE story_beats ADD COLUMN resolved_at INTEGER;

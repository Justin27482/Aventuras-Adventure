-- A campaign has one Session Zero lifecycle: not started, in progress, or completed.
ALTER TABLE campaign_settings
ADD COLUMN session_zero_status TEXT NOT NULL DEFAULT 'not_started'
CHECK (session_zero_status IN ('not_started', 'in_progress', 'completed'));
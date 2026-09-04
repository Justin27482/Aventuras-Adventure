-- Persist resumable Session Zero state for chat-first AI player campaigns.
ALTER TABLE campaign_settings
ADD COLUMN session_zero_phase TEXT
CHECK (session_zero_phase IN ('introductions', 'premises', 'character_creation', 'bonding', 'secrets'));

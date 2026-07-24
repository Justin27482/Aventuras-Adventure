-- Add reasoning column to story_entries for persisting chain-of-thought/thinking content
-- This stores the AI's reasoning/thinking process separate from the main content

ALTER TABLE story_entries ADD COLUMN reasoning TEXT;

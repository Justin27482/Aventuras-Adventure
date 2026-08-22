-- Migration 044: Editor assistant conversation persistence
-- Stores story-scoped AI chat conversations for the interactive editor assistant.

CREATE TABLE IF NOT EXISTS editor_assistant_conversations (
    id TEXT PRIMARY KEY,
    story_id TEXT NOT NULL,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    messages TEXT NOT NULL,
    chat_messages TEXT NOT NULL DEFAULT '[]',
    pending_edits TEXT NOT NULL DEFAULT '[]',
    ui_state TEXT NOT NULL DEFAULT '{}',
    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_editor_assistant_conversations_story_updated
ON editor_assistant_conversations(story_id, updated_at DESC);

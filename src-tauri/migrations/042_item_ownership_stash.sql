-- Campaign Engine item ownership and shared stash semantics.
-- Nullable ownership means the item is unowned/shared/world loot.

ALTER TABLE items ADD COLUMN owner_character_id TEXT REFERENCES characters(id) ON DELETE SET NULL;
ALTER TABLE items ADD COLUMN slot_key TEXT;
ALTER TABLE items ADD COLUMN container_item_id TEXT REFERENCES items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_items_owner ON items(story_id, owner_character_id);
CREATE INDEX IF NOT EXISTS idx_items_container ON items(story_id, container_item_id);

-- Character portrait images for visual reference and image generation
-- Stored as base64 encoded image data (same format as embedded_images)
-- Portraits are used as reference images when generating story illustrations

ALTER TABLE characters ADD COLUMN portrait TEXT DEFAULT NULL;

-- Tag reusable abilities for scene-selective AI Player context loading.
ALTER TABLE ruleset_abilities ADD COLUMN scene_relevance TEXT NOT NULL DEFAULT '[]';

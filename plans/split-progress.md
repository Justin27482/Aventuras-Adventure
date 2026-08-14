# Split Progress - Aventuras-Adventure

Date: 2026-07-24
Updated: 2026-08-13

## Status
- Phase 0: Complete
- Phase 1: Complete
- Phase 2: Complete
- Phase 3: Complete
- Phase 4-8: Not Started

## What Was Implemented
- Seeded compliance files:
  - CHANGES.md
  - CHANGELOG.md
  - NOTICE.md
- Story input pruning started in adventure direction:
  - Removed creative-only suggestion/assistant controls from ActionInput surface.
  - Kept adventure action-choice regeneration path.
- Wizard mode selection now adventure-first:
  - src/lib/components/wizard/steps/Step1Mode.svelte
  - src/lib/components/wizard/st-import-steps/StepImportStyle.svelte
- Repo initialized as standalone git repository.
- Full creative-writing mode removal (2026-08-13):
  - `StoryMode` collapsed to `'adventure'` only; removed `CreativeEntryState`/`creativeState` from
    the `Entry` type and all read/write paths (database.ts persists `creative_state` column as
    always-null rather than dropping the column, to avoid a schema migration).
  - Deleted the creative-writing-only Suggestions feature entirely: `SuggestionsService.ts`,
    `SuggestionsRefreshService.ts`, `Suggestions.svelte`, `sdk/schemas/suggestions.ts`,
    `prompts/templates/suggestions.ts`, `SuggestionsReadyEvent`, and related translation
    schema/template/service methods. Action choices (adventure) remain fully intact.
  - Removed creative-only branches from `NarrativeService`, `ClassifierService`,
    `ScenarioService` (wizard opening generation/refinement), `GenerationPipeline`,
    `PostGenerationPhase`, `PipelineEventHandler`, `story.svelte.ts`, `ui.svelte.ts`.
  - Deleted dead creative-writing prompt templates (`creative-writing`,
    `editor-creative-writing`, `opening-generation-creative`, `opening-refinement-creative`).
  - Removed the disabled "Creative Writing" cards from `Step1Mode.svelte` and
    `StepImportStyle.svelte`; wizard now presents Adventure as the only mode.
  - Removed the non-functional `epistemicOutlineCreativeEnabled` setting and the dead
    `creative_outline_planning` audience value (neither had any consumer).
  - Verified `svelte-check` (0 errors) and `npm run build` succeed after the refactor.
  - Confirmed the split-database bootstrap (per-app identifier + `aventura-adventure.db`
    filename + copy-and-filter-by-mode on first launch) was already correctly isolating this
    app's data from both the original app and the Aventuras-Creative split.

## Next Tasks
1. Update README, package metadata, and Cargo metadata for Adventure repo identity/description.
2. Optional: rename the "ST import creative cleanup" wizard feature/prompt id to a
   mode-neutral name (functionally fine today, just named oddly).
3. Optional: simplify `EpistemicVisibilityScope`/director schema enums to drop the unused
   `'creative-writing'` member once the epistemic workflow epic is revisited.

## Notes
- This repo was created from snapshot commit 73a970235983cdf538977b7cb5a29680120fc8a5.
- Upstream baseline for CHANGES provenance uses merge-base with upstream/master: 4c2a7481685b818fe0b5146102f0237e5f8b5c63.

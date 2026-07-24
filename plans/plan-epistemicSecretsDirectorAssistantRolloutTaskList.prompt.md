## Detailed Task List: Epistemic Secrets + Director Assistant Rollout

This task list breaks implementation into executable work items with dependencies, outputs, and acceptance checks.

## Phase A: Contracts and Scope (Blocking)

### A1. Define epistemic authority matrix
- Task: Document read/write permissions for Director, Perception, Character, Narrator, Commit, Director Outlining Assistant.
- Output: Permission matrix table in implementation notes.
- Depends on: none.
- Done when:
  - Every agent has explicit allowed channels.
  - No ambiguous ownership of reveal decisions.

### A2. Define canonical context channels
- Task: Freeze channel taxonomy and naming.
- Required channels:
  - player_safe
  - actor_private
  - director_only
  - creative_outline_planning
- Output: Shared constants + doc references for all services.
- Depends on: A1.
- Done when:
  - All pipeline and retrieval tasks reference only these channel IDs.

### A3. Define feature flag and fallback contract
- Task: Specify master toggle, sub-toggles, quality/fast mode behavior, and strict OFF compatibility.
- Output: Settings contract doc + acceptance checklist.
- Depends on: A1, A2.
- Done when:
  - Master OFF behavior is defined as legacy-equivalent path.

## Phase B: Data Model and Persistence

### B1. Migration 037: entry and secret atom metadata
- Task: Create migration adding atomic secret metadata and entry scoping fields.
- Suggested schema elements:
  - secret_atoms table: atom_id, parent_entry_id, label, payload_hidden, payload_foreshadow, secrecy_scope, reveal_state, reveal_constraints, provenance, created_at, updated_at
  - entry-level scoping fields as needed for mode visibility
- Output: src-tauri/migrations/037_epistemic_secret_atoms.sql
- Depends on: A1-A3.
- Done when:
  - Migration applies cleanly on existing DB.
  - Downstream queries can fetch atoms by parent entry and scope.

### B2. Migration 038: character knowledge edges
- Task: Create per-character knowledge graph table.
- Required fields:
  - atom_id, character_ref_type, character_ref_id, character_id (nullable canonical), knows, confidence, disclosure_intent, disclosure_policy, rationale_tags, learned_via, learned_at, updated_at
  - pressure_tags (JSON) containing built-in pressures and custom tags with strength ratings
  - pressure_tags default empty unless explicitly authored or inferred
- Output: src-tauri/migrations/038_character_knowledge_edges.sql
- Depends on: B1.
- Done when:
  - Unique constraint prevents duplicate edge rows for atom+character reference tuple.
  - Indexes support read by story, atom, canonical character, and typed character refs.
  - Scenario/imported NPCs and newly introduced runtime characters can be represented before canonical normalization.
  - Canonicalization can merge typed refs into a story-character ref without duplicate rows or dropped edge data.

### B3. Migration 039: assistant draft/proposal artifacts
- Task: Persist Director Assistant draft outputs and approval states.
- Required fields:
  - proposal_id, story_id, author_type, draft_payload, diff_payload, approval_state, approved_by, approved_at, created_at
- Output: src-tauri/migrations/039_director_assistant_artifacts.sql
- Depends on: B1.
- Done when:
  - Proposed changes can be loaded and approved/rejected deterministically.

### B4. Database service APIs
- Task: Add CRUD/query methods in database service for secret atoms, knowledge edges, and proposal artifacts.
- Output: New methods in src/lib/services/database.ts
- Depends on: B1-B3.
- Done when:
  - APIs support channel-aware context queries.
  - APIs support approval-safe write flow.

### B5. Type definitions
- Task: Add types/interfaces for secret atoms, knowledge edges, reveal checks, assistant proposals.
- Output: src/lib/types/index.ts updates.
- Depends on: B1-B4.
- Done when:
  - Type-safe payloads exist for all new services.

## Phase C: Retrieval, Prompting, and Gating

### C1. Retrieval compartment filters
- Task: Update retrieval to partition candidate data by audience channel.
- Files:
  - src/lib/services/ai/retrieval/EntryRetrievalService.ts
- Depends on: B4, B5.
- Done when:
  - director_only never enters actor_private/player_safe outputs.

### C2. Prompt injector channel enforcement
- Task: Update context composition to only inject channel-allowed facts for each stage.
- Files:
  - src/lib/services/ai/generation/EntryInjector.ts
- Depends on: C1.
- Done when:
  - Prompt snapshots show correct channel partitioning.

### C3. Narrative stage channel wiring
- Task: Wire channel-specific contexts into generation stages.
- Files:
  - src/lib/services/ai/generation/NarrativeService.ts
- Depends on: C2.
- Done when:
  - Adventure and Creative generation consume different context pipelines as designed.

### C4. Deterministic disclosure gatekeeper
- Task: Implement reveal validation before final prose output.
- Gate checks:
  - speaker knows fact
  - disclosure_intent plausibility
  - channel plausibility for scene
  - pressure tag plausibility (hybrid built-in + custom pressures)
- Depends on: C3.
- Done when:
  - Invalid reveals are rejected or rewritten before output commit.
  - Gate runs in both quality and fast modes whenever epistemic workflow master toggle is enabled.

### C5. Pipeline orchestration insertion
- Task: Add optional stages and ordering to generation pipeline.
- Files:
  - src/lib/services/generation/GenerationPipeline.ts
- Depends on: C3, C4.
- Done when:
  - Quality mode runs full staged flow.
  - Fast mode runs reduced flow.

## Phase D: Director Assistant and Panel UX

### D1. Assistant service: Director Outlining Assistant
- Task: Create assistant service using existing agent factory and streaming patterns.
- Files:
  - src/lib/services/ai/sdk/agents/factory.ts
  - new service file(s) under src/lib/services/ai/
- Depends on: C5.
- Done when:
  - Assistant can propose secret atoms, foreshadow hooks, and outline drafts.

### D2. Approval boundary enforcement
- Task: Ensure assistant-generated content is draft/pending only until user approval.
- Depends on: D1, B3.
- Done when:
  - No direct commit path exists from assistant response to persistent structural changes.

### D3. Director panel workbench UI
- Task: Add panel tabs for:
  - outline assistant chat
  - secret graph viewer/editor
  - proposal diff and approval queue
  - reveal simulation
- Depends on: D1, D2.
- Done when:
  - User can review, approve, reject, and trace assistant proposals.

### D4. Lorebook entry authoring enhancements
- Task: Add entry-level controls for secret atoms, foreshadow metadata, reveal constraints.
- Files:
  - src/lib/components/lorebook/LorebookEntryForm.svelte
  - src/lib/components/vault/VaultLorebookEditorContent.svelte
- Depends on: B5.
- Done when:
  - Manual authoring can fully create/maintain secret structures without assistant.

## Phase E: Settings, Profiles, and Cost Controls

### E1. Add settings model fields and persistence
- Task: Add settings keys and getters/setters.
- Required keys:
  - epistemic_workflow_enabled
  - epistemic_gate_adventure_enabled
  - epistemic_outline_creative_enabled
  - epistemic_disclosure_gate_enabled
  - director_outlining_assistant_enabled
  - epistemic_execution_mode
  - epistemic_cost_overlay_enabled
- Files:
  - src/lib/stores/settings.svelte.ts
- Depends on: A3.
- Done when:
  - Keys are loaded/saved/reset reliably.

### E2. Add settings UI controls
- Task: Add master and sub-toggle controls + quality/fast selector + cost warnings.
- Files:
  - src/lib/components/settings/tabs/generation.svelte
  - optionally src/lib/components/settings/MainNarrative.svelte
- Depends on: E1.
- Done when:
  - User can enable/disable entire workflow and subfeatures independently.

### E3. Add Agent Profile service IDs
- Task: Register and expose assignable services:
  - directorPlanner
  - perceptionGate
  - disclosureGate
  - leakChecker
  - directorOutliningAssistant
- Files:
  - src/lib/components/settings/AgentProfiles.svelte
  - src/lib/stores/settings.svelte.ts (default assignments)
- Depends on: E1.
- Done when:
  - New stages can use separate model presets.

### E4. Cost/latency telemetry and display
- Task: Capture per-turn stage timing and token usage by enabled sub-feature.
- Depends on: C5, E2.
- Done when:
  - Debug/metrics surfaces show p50/p95 latency and token overhead impact.

## Phase F: Quality Gates and Rollout

### F1. Unit tests: channel isolation
- Task: Add tests proving channel boundaries are preserved.
- Depends on: C1-C4.
- Done when:
  - No director_only leakage into actor/narrator contexts.

### F2. Unit tests: disclosure gate logic
- Task: Add tests for knows=false rejection and low-intent rejection behavior.
- Depends on: C4.
- Done when:
  - Deterministic pass/fail outcomes cover key edge cases.
  - Fast mode still executes disclosure gate checks.
  - Hybrid pressure tags (built-in + custom) affect plausibility scoring as expected.

### F3. Integration tests: mode behavior
- Adventure scenario:
  - Bartender cannot reveal hidden overlord plan without valid edge+intent+channel.
- Creative scenario:
  - Hidden outline continuity preserved, unrevealed facts absent from prose.
- Depends on: C5, D1-D3.
- Done when:
  - Both scenarios pass with stable output constraints.

### F4. Toggle OFF regression tests
- Task: Verify master OFF reproduces legacy prompt pipeline behavior.
- Depends on: E1-E3.
- Done when:
  - Representative fixture prompts match baseline snapshots.

### F5. Rollout controls
- Task: Launch behind flags, default OFF for existing users, staged enablement for new stories later.
- Depends on: F1-F4.
- Done when:
  - No uncontrolled behavior change for existing users.

## Suggested Implementation Order (Sprint-Friendly)

### Sprint 1 (Foundations)
- A1-A3
- B1-B3
- B5

### Sprint 2 (Core engine)
- B4
- C1-C5

### Sprint 3 (Assistant + UX)
- D1-D4
- E1-E3

### Sprint 4 (Hardening + rollout)
- E4
- F1-F5

## Definition of Done (Epic)
- Atomic secret facts and knowledge edges are fully functional.
- Director Assistant can propose draft structures and never auto-commit.
- Adventure and Creative mode flows enforce knowledge silos as specified.
- Settings master/sub-toggles and quality/fast modes work and persist.
- Legacy behavior remains intact when master toggle is OFF.
- Performance and token cost impact are measurable and visible.
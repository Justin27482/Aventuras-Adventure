## Plan: Epistemic Secrets + Director Assistant Rollout

Build an optional, cost-aware multi-agent epistemic workflow that uses atomic secret facts to preserve character knowledge boundaries. Keep legacy behavior untouched when disabled. Creative Writing gets a Director Outlining Assistant (draft-only with approval); Adventure gets strict perception/disclosure gating.

**Steps**
1. Phase A: Domain contracts (blocking). Finalize atomic fact model and authority matrix across Director, Perception, Character, Narrator, Commit, and Outlining Assistant.
2. Phase A: Lock audience channels. Define canonical context channels used everywhere: player_safe, actor_private, director_only, and creative_outline_planning.
3. Phase A: Publish feature toggle contract. Add master switch + sub-toggles + execution mode (quality or fast) with explicit legacy fallback semantics.

4. Phase B: Persistence foundations (depends on A). Add migration 037 for atomic secret metadata and entry scoping fields on story entries.
5. Phase B: Add migration 038 for character-knowledge edges keyed by secret atom and character, including disclosure intent fields.
6. Phase B: Add migration 039 for assistant artifacts: outline drafts, proposal batches, approval records, and reveal simulation snapshots.
7. Phase B: Add repository APIs in DB service for channel-aware retrieval and approval-safe writes.

8. Phase C: Retrieval and prompt compartmentation (depends on B). Update retrieval and injector services to partition context into audience channels and hard-block director_only leakage into actor/narrator payloads.
9. Phase C: Add deterministic disclosure gatekeeper stage. Validate candidate reveal lines against knowledge edge + disclosureIntent + scene channel plausibility.
10. Phase C: Add mode paths in generation pipeline.
Adventure path: strict player_safe narration, no hidden-outline exposure.
Creative path: optional outline-planning pass allowed to read director_only/creative_outline_planning, then narrator constrained to revealable prose.

11. Phase D: Director AI Outlining Assistant (depends on C). Build a new assistant service reusing existing streaming/tool patterns; scope to Creative mode only in v1.
12. Phase D: Enforce write boundaries. Assistant can create draft proposals and pending objects only; all structural writes require explicit user approval.
13. Phase D: Add Director Panel workbench surfaces for outline chat, secret graph editing, proposal diff review, and reveal simulation.

14. Phase E: Settings and service routing (depends on D). Add settings UI and persistence for master + sub-toggles + quality/fast mode.
15. Phase E: Add new service assignment IDs in Agent Profiles so users can route cheaper/faster models to new stages.
16. Phase E: Add cost transparency: per-turn estimated token/time overhead in settings/debug and post-turn metrics.

17. Phase F: Validation and rollout (depends on E). Ship behind feature flags, default OFF for existing users, add regression and scenario packs, and roll out with telemetry gates.

**Execution Detail**
1. Data model additions.
Secret atom fields: atom_id, parent_entry_id, label, payload_hidden, payload_foreshadow, secrecy_scope, reveal_state, reveal_constraints, provenance.
Knowledge edge fields: atom_id, character_id, knows, confidence, disclosure_intent, disclosure_policy, rationale_tags, learned_via, learned_at.
Assistant artifact fields: proposal_id, story_id, author_type, draft_payload, diff_payload, approval_state, approved_by, approved_at.
2. Settings keys.
epistemic_workflow_enabled (master)
epistemic_gate_adventure_enabled
epistemic_outline_creative_enabled
epistemic_disclosure_gate_enabled
director_outlining_assistant_enabled
epistemic_execution_mode (quality|fast)
epistemic_cost_overlay_enabled
3. Service assignment IDs.
directorPlanner
perceptionGate
disclosureGate
leakChecker
directorOutliningAssistant
4. Default behavior.
Existing users: master OFF.
When master OFF: pipeline bypasses all new stages and uses current retrieval/generation behavior unchanged.
When master ON and quality: full staged passes.
When master ON and fast: reduced passes, heuristic-first disclosure checks, optional skip of secondary leak rewrite.

**Relevant files**
- e:/source/Aventuras/src-tauri/migrations — add 037-039 migrations for secret atoms, knowledge edges, assistant artifacts.
- e:/source/Aventuras/src/lib/services/database.ts — CRUD/query APIs for atoms, edges, proposal approvals, and channel retrieval.
- e:/source/Aventuras/src/lib/types/index.ts — add new types for atomic facts, knowledge edges, reveal checks, assistant proposals.
- e:/source/Aventuras/src/lib/services/ai/retrieval/EntryRetrievalService.ts — audience-channel filtering and mode-aware retrieval gates.
- e:/source/Aventuras/src/lib/services/ai/generation/EntryInjector.ts — enforce channel-safe prompt composition.
- e:/source/Aventuras/src/lib/services/ai/generation/NarrativeService.ts — staged context assembly, creative outline pass, leak-check integration.
- e:/source/Aventuras/src/lib/services/generation/GenerationPipeline.ts — add optional director/perception/disclosure/leak stages with dependencies.
- e:/source/Aventuras/src/lib/services/ai/generation/ActionChoicesService.ts — ensure Adventure choices are generated from player_safe context only.
- e:/source/Aventuras/src/lib/services/ai/generation/SuggestionsService.ts — Creative suggestions can use planning context without prose leakage.
- e:/source/Aventuras/src/lib/services/ai/sdk/agents/factory.ts — instantiate Director Outlining Assistant via preset-driven tooling.
- e:/source/Aventuras/src/lib/components/vault/InteractiveVaultAssistant.svelte — reference streaming UX and approval pattern reuse.
- e:/source/Aventuras/src/lib/components/settings/tabs/generation.svelte — add master/sub-toggle controls and quality/fast selector.
- e:/source/Aventuras/src/lib/components/settings/AgentProfiles.svelte — register new service IDs for profile assignment.
- e:/source/Aventuras/src/lib/stores/settings.svelte.ts — persist toggle keys, defaults, and reset behavior.
- e:/source/Aventuras/src/lib/components/lorebook/LorebookEntryForm.svelte — authoring controls for secret atoms/foreshadow/reveal metadata.
- e:/source/Aventuras/src/lib/components/vault/VaultLorebookEditorContent.svelte — vault-level editing and pending-change display for new metadata.
- e:/source/Aventuras/plans/Design.md — epistemic and authority invariants.
- e:/source/Aventuras/plans/PIPELINE.md — step sequencing concepts.

**Verification**
1. Unit: channel filter never emits director_only data into actor/narrator prompts.
2. Unit: disclosure gate rejects reveals when knows=false.
3. Unit: disclosure gate rejects implausible reveal when intent is strongly negative and no coercive trigger exists.
4. Integration (Adventure): bartender cannot reveal overlord plan unless edge+intent+channel checks pass.
5. Integration (Creative): full hidden-outline continuity maintained while unrevealed atoms are absent from prose output.
6. Integration: Director Outlining Assistant creates drafts and pending proposals only; no direct commit path.
7. Settings regression: master OFF path is byte-for-byte equivalent in prompt assembly to legacy path for representative fixtures.
8. Performance: measure median p50/p95 turn latency and token overhead by toggle combination.

**Decisions**
- Atomic secret facts are the secrecy primitive.
- No rigid timed auto-reveal; disclosures are motive/channel-aware per scene.
- Director Outlining Assistant is Creative-first and draft-only with explicit approval.
- Settings include master + sub-toggles and default quality mode when enabled.
- Feature set launches opt-in for existing users.

**Further Considerations**
1. Recommendation: keep reveal simulation deterministic-first and use LLM adjudication only for ambiguous cases to contain cost.
2. Recommendation: include an in-panel Explain Why tool that shows which gate blocked/allowed a reveal for author debugging.
3. Recommendation: add migration-safe export format extensions so secret atoms and knowledge edges survive lorebook import/export.
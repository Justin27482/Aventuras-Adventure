# AI Players Mode — Engineering Tasks

Version: 1.0 (Task Tracking)
Date: 2026-08-31 (Reconciled against implementation)
Status: Phases A-D have their core services and supporting UI. The chat-first GM shell, campaign-type persistence, message types, roll detection, narration polishing, and manual encounter generation are implemented. Session Zero, proposal/roll/table-talk execution, pre-roll persistence, and launch validation remain incomplete because their services are not yet wired into the active GM campaign flow.

This file is the execution checklist for the AI Players mode. It tracks implementation tasks in the order they should be delivered and records work that covers the vision in [ai-players-enhancements.md](ai-players-enhancements.md).

Use this as the working task list for engineering progress. Update status as each item is started and completed.

Status markers:

- `[ ]` Planned (not started)
- `[~]` In progress or partially complete
- `[x]` Complete and validated

---

## 1. Workstreams overview

### Workstream A — Data model and schema foundation
- AI Player entity and persistent identity
- Global reusable AI Player library with CRUD and campaign assignment
- Campaign table roster plus optional Player Character bridge (AI Player → Character per campaign)
- Player-level secrets and hierarchical knowledge
- Session pre-rolls (encounters, loot)
- Database accessors and migrations

### Workstream B — Personality engine and context injection
- Structured personality data model
- PersonalityService (dynamic prompt rendering)
- Extended ContextBuilder for AI players
- Knowledge gating and per-player context
- Relationship rendering in prompts

### Workstream C — Multi-agent orchestration
- Parallel proposal generation (4 AI players)
- Rate-limited OOC consensus phase (1-2 sec delays)
- Full-table, selected-subset, and private 1:1 audience scoping during normal sessions
- Proposal review and acceptance flow
- ProposalReviewPanel UI
- GM interrupt/force-lock controls

### Workstream D — Narrative Helper and scene-aware rules
- NarrativeHelperService (GM summary → polish)
- Scene-selective ability loading
- Ability tagging and filtering
- Narrative input UI
- Polish flow with regenerate/edit/accept

### Workstream E — Session Zero group building
- SessionZeroOrchestrator (5-phase flow)
- Party-pending Human GM campaigns with no required protagonist, spotlight, party member, or character assignment
- Multiple persisted setup sessions per campaign, including private 1:1 character creation and group Session Zero/0.5 meetings
- Interactive multi-agent session-zero screen
- Personality introductions
- Character creation collaboration with GM-owned editable character sheets
- AI-proposed sheet changes that remain pending until explicit GM approval
- Immutable character-sheet revision history with GM restore/audit support
- Party bonding scene (rate-limited IC dialogue)
- Inter-player secret establishment
- Private and selected-subset GM-to-player interactions with gated context in session zero and normal sessions
- Relationship and secret persistence

### Workstream F — Pre-rolled encounters and loot
- Session pre-roll generation
- Encounter and loot menu UI
- GM selection flow
- Pre-roll storage and usage tracking
- Optional audited mid-turn reroll flow

### Workstream G — Turn loop integration
- TurnDirector modifications (detect AI player turns)
- Interaction audience selection for full table, player subsets, and private 1:1 scenes
- Context injection (player-specific knowledge gating)
- Proposal generation and consensus
- Narration + optional Narrative Helper
- Mechanics phase (existing, unchanged)

### Workstream H — Launch polish and validation
- Campaign mode selection (Human GM vs. AI GM)
- Settings and defaults for AI Players mode
- Database migration diagnostics log linked from Advanced Settings
- Safety audit (guardrails on AI proposals)
- Full integration testing
- Documentation and onboarding updates

---

## 2. Phase tracking

### Phase A — Data model and schema foundation

**Status: In progress; schema, migration registration, domain types, settings persistence, and initial global/assignment accessors are implemented. Remaining CRUD, relationship, secret, preroll, and invariant tests are pending.**

- [x] A.1 Define global AI Player library schema, Player Character bridge, and player-level secrets tables
- [x] A.2 Create migration: `058_ai_players_foundation.sql` (ai_players, player_characters, player_level_secrets, ai_player_interactions, session_prerolls tables)
- [x] A.3 Create types: AIPlayer, PlayerCharacter, AIPlayerPersonality, PlayerLevelSecret, AIPlayerInteraction, SessionPreroll
- [x] A.4 Add global AI Player library accessors (create, get, update, archive, list, delete, duplicate-for-edit)
- [x] A.5 Add database accessors for player character CRUD (getPlayerCharacter, upsertPlayerCharacter, getPlayerCharactersForCampaign)
- [x] A.6 Add database accessors for player-level secrets (getPlayerLevelSecrets, upsertPlayerLevelSecret)
- [x] A.7 Add database accessors for session pre-rolls (createSessionPreroll, getSessionPrerolls, markPrerollUsed)
- [x] A.8 Add campaign settings field for AI Players mode (enableAIPlayers: boolean; defaultAIPlayerCount: 4)
- [x] A.9 Add AI Player library, campaign-roster, and character-assignment invariants: global profiles have no campaign owner; one profile can serve many campaigns; `campaign_ai_players` persists table membership independently from optional `player_characters` narrative control links; guarded delete and routing coverage implemented
- [~] A.10 Add tests for schema integrity, FK constraints, reuse across campaigns, deletion protection, and data consistency (pure rules and migration smoke coverage pass; app-backed database integration coverage remains)

**Coverage**: Workstream A  
**Outcome**: Database layer supports AI player persistence, knowledge hierarchies, and session pre-rolls.  
**Blockers**: None  
**Est. time**: 1.5 weeks

---

### Phase B — Personality engine and context injection

**Status: In progress; personality rendering and AI-player context factory are implemented and tested. Character-knowledge resolution and tone modulation remain pending.**

- [x] B.1 Create AIPlayerPersonality type (core_motivation, playstyle, risk_tolerance, humor_style, decision_speed, combat_approach, social_priorities, red_lines, relationships)
- [x] B.2 Create PersonalityService.renderDynamicPrompt() — combine base personality + character context + scene + relationships + knowledge gates
- [x] B.3 Extend ContextBuilder.forAIPlayer(aiPlayer, character, campaign, sceneMode) — inject tailored context
- [x] B.4 Implement relationship rendering (other AI players + dynamic/history/friction)
- [x] B.5 Implement knowledge gating in ContextBuilder — filter secrets by visibility_scope, including campaign-wide secrets
- [x] B.6 Create ContextBuilder.resolveCharacterKnowledge() — IC knowledge gated by character's experience (implemented in the AI Player personality context boundary)
- [x] B.7 Add personality-based tone modulation (intensity slider affects personality expression while retaining consent/safety boundaries)
- [x] B.8 Create PersonalityService.generatePersonalityIntro() — 2-3 minute intro text from base personality
- [~] B.9 Add tests for context injection, relationship rendering, knowledge gating, tone modulation (focused renderer coverage passes; full ContextBuilder integration coverage pending)
- [x] B.10 Add tests proving base personality is stable across campaigns while campaign-specific roleplay and relationship overrides remain isolated
- [x] B.11 Add explicit knowledge-management contracts for character-gated knowledge, including player-local handling and no automatic cross-player disclosure

**Coverage**: Workstream B  
**Outcome**: Each AI player receives tailored, dynamically-rendered prompt reflecting personality, relationships, and gated knowledge.  
**Blockers**: A (must have schema)  
**Est. time**: 1 week

---

### Phase C — Multi-agent orchestration and consensus

**Status: Core orchestration and GM review flow are implemented and validated; remaining work is fuller orchestration coverage and polish.**

- [x] C.1 Create AIPlayerProposalService.generateProposals() — parallel calls to generate 4 AI proposals
- [x] C.2 Create AIPlayerConsensusService.run() — rate-limited OOC chat (1-2 sec delays, 30 sec timeout)
- [x] C.3 Implement OOC message queue with configurable delays (default 1 second)
- [x] C.4 Implement max 3 exchanges per proposal phase (prevent infinite loops)
- [x] C.5 Implement 30-second timeout (auto-lock if consensus stalls)
- [x] C.6 Implement GM interrupt signal (abort/force-lock consensus)
- [x] C.7 Create proposal data model (actor, action, reasoning, confidence, created_at)
- [x] C.8 Create ProposalReviewPanel.svelte (proposal display, edit, accept, decline, and explicit Send to Narrative controls implemented)
- [x] C.9 Add typing indicators and human-readable delays to UI
- [x] C.10 Create AIPlayerProposalService.applyProposalEdits() — GM edits before narration are persisted and applied through the review panel workflow
- [x] C.11 Add event system for proposal lifecycle (proposed, consensus_started, consensus_ended, accepted)
- [x] C.12 Add interaction audience model (full table, selected AI Player subset, private AI Player) and apply it before context injection
- [x] C.13 Persist scoped interaction transcripts and excluded-player disclosure state for normal sessions
- [x] C.15 Persist AI Player proposals and GM review state across panel reloads and app restarts
- [~] C.14 Add tests for parallel generation, rate-limiting, consensus timeout, GM interrupt, proposal editing, and audience isolation (comprehensive coverage with session-zero orchestrator integration)

**Coverage**: Workstream C  
**Outcome**: AI players generate simultaneous proposals; optional rate-limited OOC discussion; GM can edit/lock before narration.  
**Blockers**: B (needs context injection)  
**Est. time**: 1 week

---

### Phase D — Narrative Helper and scene-selective rules

**Status**: Complete for the core GM narration and scene-aware ability flow; ready for manual QA.

- [x] D.1 Create NarrativeHelperService.expandSummary() — GM summary + context → polished prose
- [x] D.2 Create NarrativeHelperService.regenerate() — regenerate same summary (multiple tries)
- [x] D.3 Add Narrative Helper prompt template (inject into pack system)
- [x] D.4 Add ability tagging: `sceneRelevance: ['combat', 'social', 'dungeon', 'exploration', 'travel', 'settlement', 'camp', 'downtime']` (migration 059; legacy untagged abilities remain available)
- [x] D.5 Add ruleset editor UI for ability sceneRelevance multi-select
- [x] D.6 Modify PersonalityService to filter abilities by sceneRelevance — only offer relevant abilities in prompt
- [x] D.7 Create GMNarrationPanel.svelte with tabs: "Raw" (direct input) | "Summary & Polish" (AI expansion)
- [x] D.8 Implement preview + edit/regenerate/accept controls
- [x] D.9 Add Narrative Helper logging (GM summary + LLM output both stored)
- [x] D.10 Add tests for summary expansion, regeneration, filtering, scene-selective ability loading (service-level expansion/regeneration tests pass; broader ruleset editor coverage is complete enough for current QA)
- [x] D.11 Derive current character outfit from owned equipped clothing for classifier and image context, while retaining baseline appearance descriptors and custom labels

**Coverage**: Workstream D  
**Outcome**: Scene-aware ability filtering; GM can write raw or get prose polish.  
**Blockers**: B (needs abilities tagged and context injection)  
**Est. time**: 1 week

---

### Phase E — Session Zero group building

**Status: Implementation complete for party-pending campaigns, multiple isolated setup sessions, private character creation/prologues, full character-sheet editing and AI proposal approval, Session 0.5 bonding, relationship/secret persistence, recap, history, and readiness gates. Automated validation passes; Workstream E is paused at E.3l for Tauri manual QA before broader normal-session disclosure polish.**

**Locked architecture for the next implementation block:**

- A setup session is not a normal campaign session. It has its own ID, participant scope, phase, status, chat history, and timestamps, and never consumes Session 1+ numbering.
- A campaign may have any number of setup sessions. Multiple private `private_character_creation` sessions may target the same AI Player; after that player's character is approved, `private_prologue` supports one or more 1:1 in-character play sessions before the full party is ready; later `group_session_zero` and `table_bonding` sessions may use the full roster or an explicit subset.
- “Session 0.5” is the default display label for `table_bonding`; it is not stored as numeric session `0.5` and does not alter normal session numbering.
- `party_pending` means the campaign may have zero characters, zero party members, zero spotlight, and zero AI Player character assignments. OOC setup remains available; normal sessions and IC bonding remain gated.
- Private setup chat is stored separately from campaign-wide Table Talk and normal-session chat. Audience exclusions apply before prompt/context construction and persist after reopening.
- Converting an existing Human GM campaign is destructive to the live cast/session layer but recoverable. A complete immutable backup is written first; world data, prompt-pack choice, campaign settings, global AI Player profiles, and campaign roster survive conversion.
- The campaign becomes `ready` only through validated character-approval outcomes. The infrastructure phase may block normal sessions while pending, but the pending-to-ready transition depends on E.4d approval tooling.

**Migration 068 data contracts:**

| Table | Required fields and constraints |
|---|---|
| `campaign_formation_state` | `campaign_id` PK/FK; `status` = `party_pending | ready`; `required_ai_player_ids` JSON; `source` = `created_pending | converted | established`; timestamps |
| `campaign_setup_sessions` | `id` PK; `campaign_id` FK; monotonically increasing `sequence`; editable `title`; `kind` = `private_character_creation | private_prologue | group_session_zero | table_bonding`; `phase` = `introductions | premises | character_creation | bonding | secrets | free_table`; `status` = `planned | active | completed | abandoned`; `audience_scope` = `full_table | player_subset | private_player`; timestamps; unique `(campaign_id, sequence)`; at most one active setup session per campaign enforced by service invariant |
| `campaign_setup_session_players` | `(setup_session_id, ai_player_id)` composite key; both FKs; private sessions require exactly one participant; subset/full-table snapshots remain stable if the campaign roster later changes |
| `campaign_setup_chat_messages` | `id` PK; `setup_session_id` FK with cascade; message type/audience/visibility/payload/timestamp equivalent to campaign chat; all reads require setup-session membership before payload hydration |
| `campaign_formation_backups` | `id` PK; `campaign_id` FK; complete JSON snapshot; checksum; created/restored timestamps; backups are immutable after creation except setting `restored_at` |

**Conversion reset contract:**

- Preserve: campaign row/settings, story metadata, world charter, selected prompt pack and variables, locations, items (ownership becomes null when an owner is removed), non-character lorebook entries, reusable global AI Players, and `campaign_ai_players` membership.
- Snapshot before removal: characters and appearance data, party/control rows, AI assignments, sheets/revisions, character-owned item links, campaign sessions/session-party rows, session chat, proposals/interactions, rolls/prerolls, and character-linked knowledge records.
- Remove from the live campaign only after the backup checksum is verified. Any failure rolls back the entire conversion.
- Keep narrative/story prose by default but display a warning that it may mention the removed cast; offer an explicit separate option to archive/clear story prose rather than silently deleting it.
- Restore is allowed only while the backup is untouched and no replacement live cast or normal session has been created; otherwise require a new backup and conflict review.

- [x] E.1 Create SessionZeroOrchestrator service
- [x] E.1a Create SessionZeroWizard screen for interactive multi-agent chat and phase navigation (single persisted lifecycle; phase progress and required/optional completion criteria are visible; transitions require readiness plus explicit confirmation; reopening resumes the active phase; a confirmed Stop/Reset action cancels generation, clears only the latest Session Zero attempt, and returns to `not_started` for regeneration)
- [x] E.2 Implement phase 1: AI Player Introductions (active table roster publishes prompt-pack-driven introductions into persistent Player Chat; normal roster-aware Table Talk provides follow-up interaction)
- [x] E.3 Implement phase 2: Campaign Premises Q&A (GM submits a premise, every rostered AI Player asks a persistent practical question, GM answers remain in campaign-wide Table Talk, and readiness is detected only from questions after the shared premise)
- [x] E.3a Add party-formation domain contracts in `src/lib/types/index.ts` and pure rules in `src/lib/services/campaign/`: `CampaignFormationStatus = 'party_pending' | 'ready'`; setup-session kinds `private_character_creation | private_prologue | group_session_zero | table_bonding`; setup phases `introductions | premises | character_creation | bonding | secrets | free_table`; explicit full-table/subset/private audiences; setup sessions never consume `campaign_sessions.session_number`
- [x] E.3b Add retry-safe migration 068 with `campaign_formation_state`, `campaign_setup_sessions`, `campaign_setup_session_players`, `campaign_setup_chat_messages`, and `campaign_formation_backups`; use only idempotent `CREATE ... IF NOT EXISTS` statements so generic lock-light startup/manual recovery applies; backfill existing Human GM + AI Player campaigns without changing normal-session history
- [x] E.3c Add database accessors and a setup-session store for create/list/load/start/complete/abandon setup sessions, participant membership, audience-scoped setup chat, active setup-session restoration, and ordered display labels; permit any number of private character-creation/prologue sessions for the same AI Player and any number of later group setup sessions
- [x] E.3d Modify `SetupWizard.svelte`, `wizard.svelte.ts`, and story/campaign creation so `human_gm_ai_players` is selected before character creation and may choose **Create party during Session Zero**; create a valid story/campaign scaffold with no `relationship = 'self'` character, no spotlight, no party rows, no character assignment, and `party_pending`; retain the existing protagonist requirement for Human Player and Human GM Solo modes
- [x] E.3e Add **Convert to Party Pending** to Campaign Settings for existing Human GM campaigns. Before mutation, display counts for characters, assignments, sheets/revisions, party/control rows, normal sessions, session chat, proposals, prerolls, and character-owned items; require typed campaign-title confirmation; write a complete `campaign_formation_backups` recovery snapshot; preserve campaign settings, world charter, prompt-pack assignment, locations, non-character lorebook/world data, reusable global AI Players, and campaign AI Player roster
- [x] E.3f Implement the conversion transaction in dependency order with deterministic checksum backup, rollback, constrained restore, item ownership restoration, and conflict prevention after replacement cast/setup/normal play
- [x] E.3g Replace the active lifecycle owner with `campaign_setup_sessions`; retain legacy columns for import and move marker-bounded legacy chat into isolated setup storage idempotently
- [x] E.3h Build the setup-session launcher/history and isolated center-pane chat: private character creation/prologue, group Session Zero, participant snapshots, active resume, complete/abandon, and read-only history
- [x] E.3i Implement **Session 0.5 / Table Bonding** as `table_bonding`, a first-class group setup-session kind whose presentation label does not consume normal session numbering
- [x] E.3j Complete readiness transitions: approved assignment + sheet + baseline revision reconciliation; private-prologue character gate; pending normal-session gate; automatic first approved spotlight when the required roster becomes ready
- [~] E.3k Add automated coverage in two passes (pure lifecycle, creation-mode, setup-store/history/import, backup checksum/restore eligibility, proposal non-mutation, validation, and pending session gates pass; app-backed conversion FK rollback and component interaction coverage remain in manual/integration QA)
- [~] E.3l **CURRENT PAUSE / MANUAL QA GATE.** Create a party-pending campaign; run and reopen two separate 1:1 setup sessions; confirm neither player sees the other's private chat; create/approve one character per player; run Session 0.5; confirm normal Session 1 remains unavailable until all required characters are approved; convert an existing Human GM campaign, inspect cleared live cast, then restore its backup
- [x] E.4 Implement phase 3: Character Creation through private setup sessions with prompt-pack-driven complete AI drafts, full GM review/editing, explicit approve/decline, and persistent character/assignment/sheet creation
- [x] E.4a Add `character_sheet_revisions` schema and database accessors for immutable snapshots, author (`gm` or `ai_player`), source, timestamp, and optional parent revision (migration 067; append/read/list accessors; update trigger; snapshot and author-invariant coverage)
- [x] E.4b Build GM direct full character/sheet editing: identity, description, traits, appearance JSON, ruleset stats/resources/conditions, level/XP; one atomic save records a `gm` revision
- [x] E.4c Build persistent prompt-pack-driven AI Player character-sheet proposals that cannot mutate live character/sheet rows before approval
- [x] E.4d Add GM review controls for approve, edit-and-approve, or decline; only approved changes atomically create/update character, assignment, party membership, sheet, and `ai_player` revision
- [x] E.4e Add sheet history UI and explicit restore that applies the old snapshot as a new GM-authored revision without deleting history
- [~] E.4f Add tests proving proposal decline/non-mutation, validation, snapshot isolation, author metadata, parent linkage, and atomic service delegation (app-backed transaction rollback/order remains manual QA)
- [x] E.5 Implement phase 4 / Session 0.5 Party Bonding with isolated group setup chat and persisted relationship outcome capture
- [x] E.6 Implement phase 5 Establish Secrets with participant selection, private/all-table visibility, persistence, and recap
- [x] E.6a Add private 1:1 setup-session flow; persist approved context as gated player-level secrets
- [~] E.6b Generalize private interaction flow to selected-player subsets and normal sessions (setup-session subsets and existing normal audience controls work; explicit normal-session secret disclosure UX remains)
- [~] E.7 Complete phase-specific Session Zero/setup-session UI (shared persisted shell, introductions, premises, readiness, confirmation, and reset are implemented; E.3h replaces the former single `SessionZeroWizard.svelte` concept with setup-session launcher/history; character creation, bonding, and secrets remain)
- [x] E.8 Implement relationship override persistence in `player_characters.interPlayerRelationshipOverrides`
- [x] E.9 Implement secret persistence in `player_level_secrets`
- [x] E.10 Add setup-session recap of participants, relationship outcomes, and secrets/hooks
- [~] E.11 Add tests for all 5 phases, relationship capture, secret persistence, recap generation (phase/store/service contracts pass; live Tauri component and persistence workflow is the current manual QA gate)
- [x] E.12 Add service tests proving private/subset audience isolation and character-gated knowledge is not automatically shared
- [x] E.13 Add normal-session service tests for full-table, subset, and 1:1 audience routing and disclosure boundaries

**Coverage**: Workstream E  
**Outcome**: New AI Players campaigns start with established group dynamics, inter-player relationships, and secrets.  
**Blockers**: A, B  
**Est. time**: 1 week

---

### Phase F — Pre-rolled encounters and loot

**Status: In progress. Generation services, persistence accessors, and a manual encounter panel exist. Session-start pre-rolling, stored menu retrieval, selection/usage tracking, loot UI, and audited rerolls remain.**

- [x] F.1 Create function: prerollEncountersForSession(campaign, sceneMode, count=15)
- [x] F.2 Create function: prerollLootForSession(campaign, expectedEnemyCount=5)
- [ ] F.3 Integrate pre-rolling into session start workflow
- [~] F.4 Create EncounterMenuPanel.svelte (manual `PrerollMenuPanel` exists; it generates three temporary options and selection is not applied or stored)
- [ ] F.5 Create LootMenuPanel.svelte (generation service exists; no active loot UI)
- [~] F.6 Track which pre-rolls have been used (database accessors exist; active panel does not use them)
- [~] F.7 Add "Refresh Pre-Rolls" button in GM Screen (manual generation button exists; generated options are not persisted)
- [ ] F.8 Add "Roll New" action for encounter/loot menus; persist result with explicit mid-turn source and audit metadata
- [ ] F.9 Add tests for pre-roll generation, menu display, usage tracking, and optional mid-turn rerolls

**Coverage**: Workstream F  
**Outcome**: Faster turn flow; GM picks from pre-rolled menu instead of generating mid-turn.  
**Blockers**: A  
**Est. time**: 1 week

---

### Phase G — Turn loop integration & GM Campaign UX

**Status: In progress. The GM Campaign Screen now mounts for `human_gm_ai_players`; its persisted chat timeline includes prior narration, proposals, rolls, GM table talk, and AI table talk. AI-turn proposal generation, ledger-backed chat rolls, audience confirmation, and explicit Story Log promotion are connected. Pre-roll selection and the remaining Session Zero/launch work are not yet connected to the chat turn loop.**

**ARCHITECTURE SHIFT**: Chat-first game running interface (not narrative-crafting). Player Chat pane is primary; Story Log is secondary output. Table talk is universal, not special.

- [x] G.1 Modify TurnDirector to detect when active actor is an AI Player (extended TurnDirector with isAIPlayerControlled flag; new TurnType 'ai_player_turn')
- [x] G.2 Add interaction audience selection at the start of each normal-session scene (created AIPlayerRoutingService with audience validation and audience-aware routing)
- [x] G.3 If AI player turn: inject scoped Context (Phase B) → generate Proposals (Phase C) → Consensus Phase (Phase C) → Narration (Phase D) (created AIPlayerTurnOrchestrator with proposal generation, consensus, and narration expansion)
- [x] G.9 Add campaign type field to schema; create campaign-type-service for detection
- [x] G.10 Build GMCampaignScreen.svelte: layout (left GM controls + center Player Chat + right Story Log), campaign type routing
- [x] G.4 Implement chat message types (Proposal, Roll, TableTalk, Narration, Consent) and rendering in PlayerChatPane (GM narration is explicitly promoted once into the persistent Story Log)
- [x] G.4a Wire AIPlayerTurnOrchestrator to generate proposal messages in chat (not panels) (explicit Generate AI Proposal action during an AI-controlled turn; persists pending proposal and adds it to Player Chat)
- [x] G.4b Persist Player Chat timeline (migration 063 persists GM narration, proposals, rolls, table talk, system events, and consent messages; prior story narration and proposals are reconstructed for existing campaigns)
- [x] G.4c Add continuity corrections for GM narration and accepted AI proposals (edit/delete updates the chat timeline and synchronized story/proposal records)
- [x] G.4d Add session chat boundaries (End Session requires confirmation, completed-session chat remains archived by session ID, and the active chat clears before a new session begins)
- [x] G.4e Separate session-bound Narrative from campaign-wide Table Talk (OOC messages use a sessionless timeline; tabs filter their channels and show unread activity until opened)
- [~] G.7 Implement roll request detection in GM narration; resolve roll using CharacterSheet skills; display result in chat (supports natural-language and abbreviated ability requests such as `Roll Dex to ...`; ledger-backed resolution and ChatRoll rendering are wired; character-sheet skill modifiers remain)
- [ ] G.7a Surface sheet-change proposals caused by mechanics or AI-player actions in Player Chat; route them into the GM approval workflow before applying any sheet mutation
- [~] G.7.1 🆕 Universal Table Talk: intensity slider (0-8) controls OOC reactions after rolls, proposals, failures; 1-2 sec delays, 2-3 exchanges max (GM Table Talk and Session Zero use the campaign table roster, including players without a current character; a lightweight structured routing call selects zero, one, or several responders and recognizes conversation-ending messages before richer response generation; automatic proposal/roll reactions remain bounded; failure and free-scene triggers remain)
- [x] G.5 Move audience selection to GM Controls panel (not a modal; simple radio + confirm) (loads the active campaign table roster, validates full-table/subset/private selection, and applies the confirmed scope before proposal context rendering; narrative proposals still require a character assignment)
- [ ] G.6 If human player turn: route to existing ActionInput flow (unchanged); can later unify into same UI
- [~] G.8 Pre-roll menu integration (F.3-F.4) in GM Controls sidebar (manual encounter panel is present; selection only logs to the console)
- [~] G.11 Add tests for: full chat-based turn flow, mixed party, rolls with table talk, audience scoping, mode detection (a four-assertion service-contract test exists; no end-to-end UI/turn integration test)

**Coverage**: Workstream G  
**Outcome**: Chat-first TTRPG interface for running games with AI players. Proposals, rolls, and table talk flow naturally through Player Chat pane. Story emerges as GM extracts prose. Universal table talk makes game feel alive and collaborative.  
**Blockers**: None (G.1-G.3 complete; can build UX in parallel with E/F)  
**Est. time**: 1.5 weeks (G.9-G.10 core, then G.4-G.8, then E.6, then E.2-E.5 phases)

---

### Phase H — Launch polish and validation

**Status**: Depends on G

- [x] H.1 Add global AI Player library UI (browse, create, edit, duplicate, archive/delete with assignment safeguards)
- [x] H.2 Add campaign creation step: "Assign AI Players" (select existing global profiles for the new campaign)
- [x] H.3 Add campaign table-roster and optional narrative-character assignment management UI; changing one campaign's membership or character control link must not mutate the global profile or another campaign
- [ ] H.4 Add campaign settings tab for AI Players mode (default AI player count, rate-limit settings, enable/disable Narrative Helper)
- [ ] H.5 Add GM Screen panel showing AI player personalities and relationships
- [ ] H.6 Add "View as [AI Player]" debugging UI (show what context that player receives)
- [ ] H.7 Safety audit: verify hard bans enforced on AI player proposals
- [ ] H.8 Safety audit: verify no AI player can override party safety settings
- [ ] H.9 Safety audit: verify relationship secrets cannot include coerced content
- [ ] H.10 Run end-to-end smoke test: campaign creation → session zero → 3 turns with 4 AI players
- [ ] H.11 Validate roll logging, proposal logging, OOC chat logging, and private interaction logging
- [ ] H.12 Validate knowledge gating (Character A doesn't see Character B's secrets)
- [ ] H.13 Update README.md with AI Players mode documentation
- [ ] H.14 Create tutorial/guide for session zero and first session
- [ ] H.15 Update onboarding to surface AI Players mode option
- [ ] H.16 Performance testing: 4 parallel proposal generations < 5 seconds
- [x] H.17 Add manual "Check for Missing Migrations" comparison against the bundled migration catalog
- [x] H.18 Add guarded one-at-a-time "Attempt Install Next Migration" with transactional rollback for legacy migrations, retry-safe incremental execution for version 67+, SQLite lock retries, marker-migration preservation, and explicit failure reasons
- [x] H.19 Repair comment-only migration markers and reconcile late schema migrations 57/58/59/60 through the serialized write queue without `BEGIN IMMEDIATE`, repeating only missing schema objects
- [x] H.19a Generalize lock-light migration recovery for version 67 and newer: startup and manual installation share an ordered, serialized, retry-safe path with schema-object verification; migration checks enforce idempotent SQL and LF line endings
- [x] H.23 Make GM proposal-panel assignment loading resilient when proposal/interactions migrations are not yet applied
- [x] H.24 Add Campaign Settings prompt-pack selection backed by the story's runtime pack assignment; complete missing templates before activating an older custom pack
- [x] H.25 Move active AI Player behavior prompts into campaign-selected prompt packs (decision/participation, proposal, Table Talk routing/replies, Session Zero introductions/questions, and consensus); keep personality, red lines, relationships, and gated knowledge as structured runtime inputs
- [x] H.26 Give assigned AI Players their full character definition in Table Talk and inject bounded current-branch public lorebook context selected by always-on rules or message/name/alias/keyword relevance; exclude hidden lorebook information
- [x] H.27 Add a prompt-pack-configurable AI Player voice contract across introductions, proposals, consensus, and assigned-player Table Talk; include authored voice profiles, full personality traits, peer voice summaries, and prior introductions to reduce mirrored phrasing
- [x] H.20 Persist and restore multiple Worldbuilding Assistant conversations, each with its complete form, charter, chat history, timestamp, and independently selected prompt pack; legacy `default` workspace remains compatible
- [x] H.20a Move Worldbuilding Assistant conversation and charter-expansion prompts into editable prompt packs so different world types can apply different interview and safety guidance
- [x] H.21 Add pasted World Charter import into structured Worldbuilding fields
- [x] H.22 Add AI portrait-description generation help to the new campaign wizard

**Coverage**: Workstream H  
**Outcome**: Production-ready AI Players mode; full safety validation; documented and launched.  
**Blockers**: G (must integrate first)  
**Est. time**: 1 week

---

## 3. Cross-cutting validation tasks

- [ ] **Schema audit**: Verify `ai_players` is global, `campaign_ai_players` persists campaign table membership, `player_characters` only links narrative control, and no campaign state is incorrectly stored on the global profile
- [ ] **Library audit**: Create one AI Player, assign it to multiple campaigns, and verify base personality reuse plus isolated campaign context
- [ ] **Safety audit**: Confirm no compelled sexual acts or consent override can be created through AI player proposals or abilities
- [ ] **Character sheet approval audit**: Confirm AI Players cannot mutate any character sheet directly; only explicit GM approval or direct GM edit may create an active-sheet revision
- [ ] **Character sheet history audit**: Confirm every applied sheet change has an immutable revision with author/source metadata and restoring a revision creates, rather than overwrites, history
- [ ] **Prompt audit**: Confirm all AI player context is injected through PersonalityService; no hardcoded narrative instruction
- [ ] **Knowledge gating audit**: Confirm character-level secrets are never visible to other players; player-level secrets only visible OOC
- [ ] **Private interaction audit**: Confirm 1:1 and selected-subset interactions remain excluded from other AI Players' prompt contexts in session zero and normal sessions
- [ ] **Setup-session privacy audit**: Confirm private setup-session chat is never returned by campaign-wide Table Talk, another setup session, an excluded AI Player context, or normal Session 1+ hydration
- [ ] **Setup-session numbering audit**: Confirm any number of private Session Zero and Session 0.5 records leave the first normal campaign session numbered 1 and subsequent normal sessions contiguous
- [ ] **Party-pending audit**: Confirm Human GM + AI Player campaigns can contain zero characters/party/spotlight while setup tools remain usable, and that Human Player/Human GM Solo creation still requires a protagonist
- [ ] **Conversion recovery audit**: Confirm Convert to Party Pending writes a complete backup before deleting live cast/session state, rolls back atomically on failure, preserves world/roster/pack settings, and can restore the exact pre-conversion state
- [ ] **Audience audit**: Confirm full-table, subset, and private interaction scopes are explicit, roster-limited, persisted, and only disclosed by a GM action; confirm roster-only players can join OOC Table Talk but not narrative turns
- [ ] **Rate-limit audit**: Confirm OOC messages are 1-2 sec apart; 30 sec timeout works; GM can interrupt
- [ ] **Persistence audit**: Confirm AI Player personalities survive across campaigns; relationships persist in player_characters
- [ ] **Backward compatibility audit**: Confirm existing campaigns and companion system unchanged; AI Players mode is opt-in
- [ ] **Performance audit**: Confirm 4 parallel proposals generate in < 5 seconds; context injection < 500ms per player
- [ ] **Full integration test**: Campaign creation → Session zero → 3 turns with 4 AI players → party coordination validated
- [ ] **Reroll audit**: Confirm GM can roll a new encounter or loot result mid-turn and that it is explicitly logged
- [ ] **Safety prompt test**: Confirm intensity slider affects Narrative Helper tone without weakening hard bans

---

## 4. Scope log

### Approved scope items

| Date | Item | Phase | Status |
|------|------|-------|--------|
| 2026-08-28 | Mode flip: Human GM arbitrates, AI players propose | G | Approved |
| 2026-08-28 | Narrative Helper: GM summary → optional polish | D | Approved |
| 2026-08-28 | Scene-selective rules loading (abilities tagged by relevance) | D | Approved |
| 2026-08-28 | Pre-rolled encounters/loot (speeds turn flow) | F | Approved |
| 2026-08-28 | Hierarchical secrets (player-level OOC + character-level IC) | A, B | Approved |
| 2026-08-28 | Session zero group building (5-phase wizard) | E | Approved |
| 2026-08-28 | Rate-limited OOC consensus (1-2 sec delays, 30 sec timeout) | C | Approved |
| 2026-08-28 | Persistent AI Player personalities (survive across campaigns) | A, B | Approved |
| 2026-08-28 | Global reusable AI Player library (local reuse across multiple campaigns) | A, H | Approved |
| 2026-08-28 | Interactive session-zero screen with private 1:1 GM-to-player interactions | E | Approved |
| 2026-08-28 | Scoped interactions during normal sessions (full table, player subset, or private 1:1) | C, G | Approved |
| 2026-08-28 | Character-gated knowledge management remains player-local unless explicitly shared | B, E | Approved |
| 2026-08-28 | GM may roll a new encounter or loot result mid-turn in addition to pre-rolled menus | F, G | Approved |
| 2026-08-29 | Built-in migration ledger and SQL diagnostics linked from Advanced Settings | H | Approved |
| 2026-08-29 | Persisted Worldbuilding drafts and assistant conversations across app restarts | H | Approved |
| 2026-08-29 | Pasted World Charter import into structured Worldbuilding fields | H | Approved |
| 2026-08-29 | AI portrait-description generation help in campaign wizard | H | Approved |
| 2026-09-01 | Human GM + AI Player campaigns may start in `party_pending` with no protagonist or characters | E | Approved |
| 2026-09-01 | Multiple private and group setup sessions per campaign, including repeated 1:1 character creation | E | Approved |
| 2026-09-01 | Private prologue setup sessions allow 1:1 in-character play after one player's character approval and before the full party is ready | E | Approved |
| 2026-09-01 | Session 0.5 is a group table-bonding setup session and does not consume normal session numbering | E | Approved |
| 2026-09-01 | Existing Human GM campaigns can convert to party-pending through a confirmed, backed-up, reversible live-cast reset | E | Approved |

### Deferred scope (future phases)

| Item | Reason | Future Phase |
|------|--------|--------------|
| GM approval override for AI decisions | Nice-to-have; GM can edit proposals in v1 | Phase I |
| Cross-user AI Player sharing or marketplace | Community feature; local global reuse is launch-critical | Phase J |
| NPC memory compression | Long-campaign optimization | Phase K |
| Behavioral drift detection | Research needed | Phase L |
| Text-marker parsing as alternative to tools | Keep function calls in v1; more auditable | Future consideration |

---

## 5. Implementation sequence

### Milestone 1: Foundation (Phases A–B)
- Database schema and global reusable AI player library
- Personality engine and context injection
- Enables starting work on all downstream phases

### Milestone 2: Orchestration (Phases C–D)
- Multi-agent proposal generation
- Rate-limited consensus
- Scene-selective rules
- Enables turn loop wiring

### Milestone 3: Group Building (Phase E)
- Session zero wizard
- Inter-player relationship establishment
- Enables first complete campaign flow

### Milestone 4: Encounters & Turns (Phases F–G)
- Pre-rolled tables
- Turn loop integration
- Full end-to-end flow works

### Milestone 5: Launch (Phase H)
- Campaign mode selection
- Safety validation
- Documentation
- Ready for production

---

## 6. Estimated timeline

| Phase | Duration | Cumulative |
|-------|----------|-----------|
| A (Foundation) | 1 week | 1 week |
| B (Personality) | 1 week | 2 weeks |
| C (Orchestration) | 1 week | 3 weeks |
| D (Narrative Helper) | 1 week | 4 weeks |
| E (Session Zero) | 1 week | 5 weeks |
| F (Pre-Rolls) | 1 week | 6 weeks |
| G (Turn Loop) | 1 week | 7 weeks |
| H (Launch Polish) | 1 week | 8 weeks |

**Total: 6–8 weeks** (depending on parallel work in phases C–D–F)

**Recommended parallel tracks:**
- Start C (Orchestration) and D (Narrative Helper) after B completes
- Start F (Pre-Rolls) independent of C–D (just needs A)
- Start E (Session Zero) independent of C–D (just needs B)
- Wire G (Turn Loop) after C, D, E, F all have something to integrate

---

## 7. Status tracking guidance

For each phase:
1. Mark task `[~]` when starting work
2. Mark task `[x]` immediately when complete (don't batch)
3. If blocked, note blocker and estimated unblock date
4. Update phase status line at the top with cumulative % complete

Example status line:
```
**Status: Phase A at 50% (3/6 tasks done); A.7 blocked on A.6 completion (ETA 2026-09-04)**
```

Recommended tools:
- GitHub Issues / GitHub Projects for task tracking
- This markdown file as source of truth for engineering plan
- Weekly sync to update status and discuss blockers

---

## 8. Verification checklist

Before each phase is marked complete:

- [ ] All tasks marked `[x]`
- [ ] Tests passing (run vitest for that phase)
- [ ] No TypeScript errors (`npx svelte-check`)
- [ ] Production build successful (`npm run build`)
- [ ] Changes reviewed and merged
- [ ] Blockers for next phase resolved

## 8a. Phase A manual QA (currently available UI)

This checklist is intentionally limited to behavior exposed by the current application. The global
AI Player library is now available; campaign assignment screens, interaction controls, and pre-roll
menus remain planned for later phases.

- [ ] Launch the Tauri application with a fresh database and confirm startup completes successfully
- [ ] Open an existing campaign created before migration 058 and confirm it loads without errors
- [ ] Open and close the Campaign Library, campaign settings, and an existing campaign without regressions
- [ ] Confirm the application remains usable after restart and no migration or database error appears
- [ ] Open AI Players from the Campaign Library and confirm the global profile list loads
- [ ] Create an AI Player with personality fields and confirm it appears in the list
- [ ] Edit the profile and confirm the updated values remain after closing and reopening the panel
- [ ] Duplicate the profile and confirm the copy has a distinct identity and editable values
- [ ] Archive the profile and confirm it leaves the active list; restore it and confirm it returns
- [ ] Delete an unassigned profile and confirm it is removed from the library
- [ ] Confirm profile management is global and does not require an active campaign
- [ ] Enable AI Players in a campaign with at least one assigned profile and open the GM Screen
- [ ] Confirm the AI Player Proposals panel appears and identifies assigned characters and profiles
- [ ] Click Generate Proposals and confirm each assigned AI Player produces one proposal
- [ ] Confirm each proposal shows action, OOC reasoning, confidence, and scene mode
- [ ] Edit a proposal, save the edit, and confirm the edited action remains pending
- [ ] Accept one proposal and decline another; confirm their review states update independently
- [ ] Confirm generating or reviewing proposals does not automatically narrate an outcome or mutate mechanics
- [ ] Select Full table and confirm all assigned AI Players are included in proposal and consensus context
- [ ] Select Selected AI Players, choose a subset, and confirm excluded players are not included
- [ ] Select Private 1:1, choose one AI Player, and confirm only that player is included
- [ ] Run Consensus and confirm messages arrive with a human-readable delay
- [ ] Click Stop Consensus while messages are generating and confirm it stops without applying mechanics
- [ ] Reopen the GM Screen and confirm the latest scoped transcript is restored
- [ ] Create a new campaign and confirm the "Assign AI Players" step appears before opening generation
- [ ] Assign one global profile to a character and confirm it is hidden from the other character dropdowns
- [ ] Leave a character unassigned and confirm the wizard can continue
- [ ] Complete campaign creation and confirm the selected AI Player assignments persist in Campaign Settings
- [ ] Cancel the wizard after assigning profiles and confirm no campaign assignments were created
- [ ] Open an existing campaign's Settings > Campaign tab and enable AI Players
- [ ] Assign a global AI Player to a character and confirm the assignment persists after reopening settings
- [ ] Assign a different AI Player to another character and confirm each character has its own assignment
- [ ] Attempt to assign the same AI Player to a second character in the same campaign and confirm the action is rejected
- [ ] Remove an assignment and confirm the character returns to "No AI Player assigned"
- [ ] Open Settings > Advanced > Database Migration Log and confirm the ledger loads
- [ ] Confirm migration rows show version, description, Applied/Failed status, execution time, and checksum
- [ ] Expand migration 058 and confirm affected objects are listed and migration SQL opens in a modal
- [ ] Confirm migration 059 is listed and its scene-relevance SQL is readable
- [ ] Reproduce an AI Player save failure, if present, and confirm the displayed error includes the underlying database message

Deferred until the owning UI/integration phases:

- Selecting reusable global AI Players during campaign creation
- Campaign assignment isolation and assignment management UI
- Full-table, subset, and private 1:1 interaction controls
- Session-zero and normal-session audience behavior
- Encounter/loot pre-roll menus and mid-turn reroll controls

---

## 9. Known unknowns / research items

**Before Phase G (Turn Loop Integration)**:
- [ ] Test 4 parallel LLM proposal calls; measure latency
- [ ] Confirm rate-limiting doesn't feel "unresponsive" to user
- [ ] Validate that personality rendering doesn't bloat context window

**Before Phase H (Launch)**:
- [ ] Safety audit: run multi-agent scenario with compelled consent; verify rejection
- [ ] Performance: measure full turn flow (context + proposals + consensus + narration) wall-clock time
- [ ] Long campaign: run 20+ turn session; verify personality coherence

---

## 10. Success criteria (Phase H gate)

AI Players mode is launch-ready when:

- [ ] Global AI Player library can create, edit, archive/delete safely, and reuse one profile across multiple campaigns
- [ ] Campaign can be created with 4 AI players selected from the global library (mode selector works)
- [ ] Session zero wizard runs all 5 phases (relationships, secrets captured)
- [ ] AI players generate proposals independently (parallel works)
- [ ] Consensus phase rate-limits correctly (1-2 sec delays, 30 sec timeout)
- [ ] Turn director routes correctly (AI player turns go to proposal flow)
- [ ] GM can write summary or get AI polish (Narrative Helper works)
- [ ] Knowledge gating prevents leaks (Character A doesn't see B's secrets)
- [ ] Private and selected-subset GM-to-player interactions remain correctly scoped in session zero and normal sessions
- [ ] Full-table, subset, and private interaction transcripts are only disclosed through an explicit GM action
- [ ] GM can choose a pre-rolled encounter/loot result or roll a new one mid-turn with audit metadata
- [ ] Hard safety bans enforced (no compelled consent in proposals)
- [ ] Existing campaigns unaffected (backward compat holds)
- [ ] Full e2e test passes (3-turn session with 4 AI players)
- [ ] Audit trail complete (proposals, decisions, OOC chat logged)
- [ ] Documentation complete and published

---

## 11. Summary

This task list breaks down the AI Players mode architecture into 8 phases, 100+ discrete tasks, with clear dependencies and time estimates. Implementation proceeds phase-by-phase, with safety and testing validation at every step.

The mode is fully additive to existing systems and launches as an opt-in campaign mode alongside the existing AI GM and human-only options.


# Adventure Mode Engineering Tasks — V2 (Greenfield Launch)

This file is the execution checklist for the V2 greenfield plan. It tracks implementation tasks in the order they should be delivered and records work that covers the original V1 plan.

Use this as the working task list for engineering progress. Update status as each item is started and completed.

Status markers:

- `[ ]` Planned
- `[~]` In progress or partially complete
- `[x]` Complete and validated

The original V1 coverage mappings remain fixed. Approved scope additions must be recorded in the scope log below and assigned a task ID before implementation begins.

---

## 1. Workstreams overview

### Workstream A — Product reset and campaign foundation
- Product branding and UI re-skin
- Campaign-first onboarding and app shell
- Legacy archive separation
- New campaign schema and settings
- Party roster and character models

### Workstream B — Core rules and dice engine
- Ruleset catalog and templates
- Dice notation parser and evaluator
- RNG and roll ledger
- Outcome rules and DC logic

### Workstream C — Mechanics and GM systems
- Ability/resource logic
- item ownership and inventory owners
- turn order and scenes
- mechanics tools and validation

### Workstream D — Prompting and narrative generation
- pack-driven prompt system
- scene templates and GM persona
- inline roll interception and continuation flow
- safety guardrails and intensity system

### Workstream E — UI and product polish
- party and dice UI
- character sheets and GM screens
- world charter and session recap
- authoring tools and final launch polish

---

## 2. Phase tracking

### Phase 0 — Greenfield product reset and branding

- [x] 0.1 Define product identity and visual direction
- [x] 0.2 Create brand/UX package: naming, colors, app shell, icons, splash screens
- [x] 0.3 Replace active copy: “story” → “campaign”, “cast” → “party”, etc.
- [x] 0.4 Build new onboarding flow for campaign creation
- [x] 0.5 Add visible legacy archive area and isolate old content
- [x] 0.6 Remove legacy story-first screens from main product navigation
- [x] 0.7 Validate app clearly reads as a distinct product from the old adventure app

Coverage: v1 phases 0, 5, 12, and 13 (reframed under greenfield product identity)

### Phase 1 — Campaign foundation and party model

**Status: Phase 1 runtime foundation is validated for the campaign/party layer; continue with the remaining runtime/UI wiring and then hold the full Phase 1 QA gate before any Phase 2 work.**

- [x] 1.1 Define campaign schema and default settings; preserve migration history while extending the foundation
- [x] 1.2 Add campaigns table and campaign settings model; preserve as additive foundation
- [x] 1.3 Add ally eligibility and actor category model
- [x] 1.4 Add party_members table and active/inactive membership tracking
- [x] 1.5 Add narrative and combat control policy profiles
- [x] 1.6 Add campaign session and session party snapshot tables
- [x] 1.7 Add per-session primary character and party order tracking
- [x] 1.8 Add spotlight/active actor tracking (`spotlight_character_id` or equivalent) — runtime setter and validation implemented; focused campaign QA passes
- [x] 1.9 Add per-character item ownership model (`owner_character_id`, `slot_key`, `container_item_id`) — migration, typed mapping, runtime validation, and inventory UI implemented; focused campaign QA passes
- [x] 1.10 Add shared stash semantics for unowned items — nullable owner, runtime assignment, and inventory UI implemented; focused campaign QA passes
- [x] 1.11 Add campaign-level party-size limit and default party size — defaults, runtime enforcement, and campaign settings UI implemented; focused campaign QA passes
- [x] 1.12 Add party roster service/store layer — campaign roster store and validation are in place; focused campaign QA passes
- [x] 1.13 Add party/session selection UI and explicit party-change boundaries — first-session setup and explicit end-session transition implemented; focused campaign QA passes
- [x] 1.14 Add party-first context builder variables for prompt generation
- [x] 1.15 Add companion agency context and decision ownership contracts
- [x] 1.16 Add tests for ally eligibility, session snapshots, control policies, and companion autonomy — focused campaign and proposal tests pass
- [x] 1.17 Wire companion decision proposals into the runtime proposal/acceptance flow and UI consumption path; guardrails and pending-vs-resolved tracking are implemented and validated

Coverage: v1 phases 0, 3, 3b, and 10

### Phase 2 — Ruleset schema and dice engine

**Status: Phase 1 QA passed; backend foundation for Phase 2 implemented (schema, seeded built-in rulesets, dice notation parser/evaluator, seeded RNG, roll ledger, check-rule outcome bands, karma/fudge bias) with unit test coverage. UI for ruleset selection/dice display is Phase 10 per the coverage note below.**

- [x] 2.1 Define ruleset schema and seed templates
- [x] 2.2 Add `rulesets`, `ruleset_stats`, `ruleset_skills`, `ruleset_check_rules`, `ruleset_conditions`, `ruleset_slots`, `ruleset_abilities`, `ruleset_levels`
- [x] 2.3 Add built-in ruleset templates: d20-Classic, Shadowdark, Narrative-2d6, Freeform-Lite, Savage Worlds, D&D 5th Ed
- [x] 2.4 Add ruleset store and accessors
- [x] 2.5 Build dice notation parser (`NdX`, modifiers, `kh`/`kl`, `adv`/`dis`, rerolls, exploding dice, clamps)
- [x] 2.6 Implement pure AST evaluation for dice expressions
- [x] 2.7 Add seeded RNG / reproducible dice behavior
- [x] 2.8 Add roll ledger table and `getRollStats` equivalent
- [x] 2.9 Implement `roll({ notation, dc, reason, actorId, visibility })` result contract
- [x] 2.10 Add check-rule outcome bands and DC interpretation
- [x] 2.11 Add karma/fudge bias support with explicit declaration and logging
- [x] 2.12 Add unit tests for notation parsing, roll behavior, and seeded reproducibility

Coverage: v1 phases 1, 2, 10, and 15

### Phase 3 — Mechanics, resources, abilities, and inventory

**Status: Backend/data-layer implemented (character sheets, resource formulas, resource/ability/inventory validation, mechanics service, mechanics tool definitions) with unit test coverage. Encumbrance is slot-count-based rather than a full weight system — see note on 3.7. No UI (Phase 10) or live tool-execution wiring (Phase 8) yet.**

- [x] 3.1 Add ruleset ability definitions and metadata model
- [x] 3.2 Add conditions and resource formulas
- [x] 3.3 Add character sheet data model and dynamic sheet storage
- [x] 3.4 Add resource clamp enforcement, negative-money prevention, and ability-use floor validation
- [x] 3.5 Add item ownership, equip, transfer, and stash logic
- [x] 3.6 Add clothing durability ownership and per-member application
- [~] 3.7 Add encumbrance and slot/carry validation — rulesets now support configurable slot- or weight-based modes, item weights, inventory capacity formulas, wearable versus carried slot types, and equipped-armor slot consumption; generic inventory ownership and weight edits are persisted, while wiring every inventory mutation through the validator remains follow-up work
- [x] 3.8 Add inventory grouping by owner and shared stash bucket
- [x] 3.9 Add mechanic tool definitions for resources and state mutation
- [x] 3.10 Add mechanics service and validation flow
- [x] 3.11 Add protection for all content hard bans in code paths
- [x] 3.12 Add enforcement comments and guardrail documentation near validation points

Coverage: v1 phases 0, 3, 8, 9, 15, and hard safety rules

### Phase 4 — Scene modes, turn logic, and active actors

**Status: Core turn-order runtime and scene/actor abstraction are in place; scene/turn persistence is now wired through campaign lifecycle load/session/party transitions, while turn-director logic and UI affordances remain pending.**

- [~] 4.1 Define scene modes and extensibility model
- [x] 4.2 Add scene-mode storage per campaign and per entry
- [~] 4.3 Add turn type metadata model and shared actor abstraction
- [~] 4.4 Implement free, spotlight, round-robin, initiative, and DM-directed turn order modes
- [x] 4.5 Add `TurnOrderService` API: getActiveActor, advance, setActiveActor, insertActor, removeActor, rebuild
- [x] 4.6 Add turn-order persistence and encounter order save/restore — campaign lifecycle wiring now hydrates, reconciles, and persists scene/turn state across load/session/party transitions
- [x] 4.7 Add `TurnDirector` behavior for forced resolution and narrative turn transitions
- [x] 4.8 Add scene transition narrative output on mode changes
- [x] 4.9 Add active actor attribution to rolls and action choices
- [x] 4.10 Add per-scene-mode default settings
- [x] 4.11 Add `TurnOrderStrip` and active actor display in app shell
- [x] 4.12 Add action input acting-as selector and end-turn affordance
- [x] 4.13 Add companion decision proposal flow with actor-owned rationale
- [x] 4.14 Add autonomous companion combat policy
- [x] 4.15 Add tactical delegation policy for optional player-issued companion intent
- [x] 4.16 Add explicit tactical player-control policy for optional companion combat control
- [x] 4.17 Prevent enemy and ordinary NPC actors from entering player-control paths
- [x] 4.18 Add tests proving companion narrative agency survives tactical control settings

Coverage: v1 phases 4, 5, 14, and 15

### Phase 5 — GM planning, world charter, and session management

**Status: Phase 5 complete and manually QA-validated; Phase 6 prompt-pack architecture, safety contracts, and runtime scene/turn context are implemented.**

- [x] 5.1 Add world charter model and campaign setup wizard — persistent world-charter editing, deterministic setup-wizard seeding, and context injection implemented
- [x] 5.2 Add worldbuilding assistant / world charter generation flow — deterministic draft-from-campaign and AI expansion actions added to Campaign Settings
- [x] 5.3 Add campaign threads model and tracking
- [x] 5.4 Add thread beats, clocks, and director-only visibility handling
- [x] 5.5 Add GM screen UI with hidden director-only planning panels
- [x] 5.6 Add session recap generation from chapters, rolls, and threads
- [x] 5.7 Add rules digest and GM persona templates
- [x] 5.8 Add quest and story tracking with player-safe summary modes
- [x] 5.9 Add optional downtime and montage workflows — GM screen prepares downtime/camp scene modes; narrative automation is intentionally owned by Phase 6

Coverage: v1 phases 12, 13, and 15

### Phase 6 — Prompt packs and narrative generation

**Status: Phase 6 complete and validated; prompt roles, scene/turn guidance, safety categories, active-actor identity, custom-pack compatibility, and safety variant tests are in place.**

- [x] 6.1 Define pack architecture and prompt variable conventions
- [x] 6.2 Move all hardcoded prompt text out of TypeScript into pack templates — campaign, GM, turn, media, safety, and narrative priming text is pack-backed
- [x] 6.3 Introduce a new prompt-pack category for safety content: `safety-core-rules`, `safety-guardrails`, `safety-content-intensity`, `safety-content-bans`, `safety-mechanics-constraints`
- [x] 6.4 Move all hardcoded safety instructions, consent boundaries, and dark-content policies into the new safety pack category
- [x] 6.5 Add role-specific templates: GM core, world charter, ruleset digest, party roster, turn order
- [x] 6.6 Add scene partials for overworld, dungeon, settlement, camp, combat, travel, and downtime — mode-aware scene template added and populated from runtime
- [x] 6.7 Add narrative turn templates for narration, NPC action, roll request, action resolution, QA, scene transition, montage — shared turn template added and receives runtime turnType
- [x] 6.8 Add context variables for `sceneMode`, `turnType`, `activeActorName`, `turnOrderMode`, `upcomingActors`, `partyRoster`, `primaryCharacterName`, `companionRoster`, `companionAgency`, `controlPolicy`, `pendingRoll`, `recentRolls`
- [x] 6.9 Add pack-template compatibility checks and repair flow for user-authored packs — non-destructive compatibility report and user-facing Pack Settings report added; missing templates remain auto-repaired without overwriting custom content
- [x] 6.10 Remove legacy protagonist references from default prompt context — narrative runtime instructions now use activeActorName; wizard and campaign identity contexts retain intentional protagonist references
- [x] 6.11 Add GM party roster partial and other reusable shared partials
- [x] 6.12 Add a prompt-pack test harness to compare safety variants without changing app code
- [x] 6.13 Add companion voice, motivation, red-line, and decision-ownership prompt partials
- [x] 6.14 Add separate companion social/autonomous and tactical-control prompt variants

Coverage: v1 phases 2, 6, 7, 9, 15, and relevant hardcoded prompt cleanup plus safety-pack migration

### Phase 7 — Inline roll tags and continuation flow

- [x] 7.1 Add inline roll parser and partial-tag detection
- [x] 7.2 Add `<roll/>`, `<turn/>`, `<scene/>`, and `<actor/>` tag handling
- [x] 7.3 Add stream interruption logic in narrative generation — safe incremental control-tag buffer and completion-boundary execution implemented
- [x] 7.4 Add local roll resolution and persistence for intercepted roll tags
- [x] 7.5 Emit `dice_rolled` event and update UI inline — typed event emitted; inline RollCard rendering in StoryEntry implemented
- [x] 7.6 Continue generation with a safety-preserved continuation state — roll outcome prompt pass appends continuation while preserving safety rules
- [x] 7.7 Add max continuation count per turn and abort logic — MAX_CONTINUATIONS_PER_TURN = 3 cap and abortSignal checks implemented
- [x] 7.8 Add event types for `dice_rolled`, `roll_requested`, `turn_type`, `scene_changed`, and `actor_changed`
- [x] 7.9 Add anti-tamper guardrail comments and enforcement at interception points

Coverage: v1 phase 7 and relevant mechanics flow

### Phase 8 — Mechanics tool execution and validation

- [x] 8.1 Build `mechanics.ts` tool definitions
- [x] 8.2 Implement `roll_dice`, `request_player_roll`, `adjust_resource`, `apply_condition`, `remove_condition`, `spend_ability_use`, `grant_xp`, `award_item`, `remove_item`, `equip_item`, `transfer_item`, `damage_clothing`, `adjust_money`, `advance_time`, `set_scene_mode`, `set_active_actor`, `advance_turn`, `update_quest_thread`, `roll_on_table`, `finish_mechanics`
- [x] 8.3 Add Mechanics service using base AI service pattern and terminal tool flow
- [x] 8.4 Add `MechanicsPhase` execution path parallel to classification — MechanicsPhase added to parallel pipeline execution
- [x] 8.5 Add validation for resource clamps, party size, owner integrity, negative money, and ability-use floors
- [x] 8.6 Add content safety validation at every mechanics boundary — assertNoCoercedConsentMutation enforced across all mechanics tools
- [x] 8.7 Add owner-scoped item and clothing updates to prevent cross-ownership mutation
- [x] 8.8 Add encumbrance enforcement and reasoned rejection flow — slot-based carry validation and slot limits enforced
- [x] 8.9 Add `RulesValidatorService` hooks for contradiction and rules-lawyer checks — RulesValidatorService and vitest suite implemented

Coverage: v1 phases 8, 15, and hard safety requirements

### Phase 9 — Content intensity and safety policy

- [x] 9.1 Add `nsfw_intensity` field and default handling — stored in campaign_settings (0-8, default 0; migration 053 expands the original constraint)
- [x] 9.2 Add intensity levels 0-8 and explanatory labels — Level 0 (Family Friendly/PG) through Level 8 (Maximum Mature), with graduated R-rated, romance, explicit-with-plot, smut, and maximum-content tiers
- [x] 9.3 Add UI slider with immutable safety note — Slider in Campaign Settings with explicit hard-ban reminder
- [x] 9.4 Make intensity drive narration tone and image prompting only through pack templates — per-level guidance is authored in the `safety-content-intensity` template; custom narrative prompts receive the rendered pack contract
- [x] 9.5 Add intensity influence on clothing damage, camp/settlement romance framing, and content tone
- [x] 9.6 Enforce hard bans at intensity 4 and all lower settings — assertNoCoercedConsentMutation and hard bans in system prompts apply across all levels
- [x] 9.7 Add tests for content rules at max intensity — safety.test.ts verifies Level 4 rendering and immutable hard bans

Coverage: v1 phase 9 and hard safety policy

### Phase 10 — UI for parties, dice, turn order, and sheets

- [x] 10.1 Build `RollCard.svelte` with actor, notation, DC, animated roll, manual override
- [x] 10.2 Build `DiceRollInline.svelte` for inline DM rolls
- [x] 10.3 Build `PartyPanel.svelte` showing ally pool, active party, primary character, agency, and spotlight indicators
- [x] 10.4 Build dynamic `CharacterSheet.svelte` driven by ruleset data
- [x] 10.5 Build `DiceLogPanel.svelte` with roll history and stats dashboard
- [x] 10.6 Add `TurnOrderStrip.svelte` to app shell and world panels
- [x] 10.7 Update `ActionInput.svelte` with primary-character context, companion requests, and scene indicator
- [x] 10.8 Add “Primary character: X” UI and free-text blocking when roll is outstanding — ActionInput shows the session primary character and blocks free-text entry until the requested player roll resolves
- [x] 10.9 Add per-party-member inventories and clothing display — character rows now expose owned items, equipped clothing, and an expandable ruleset-driven character sheet
- [x] 10.10 Add UI for campaign settings: ruleset, scene mode, dice enforcement, party size, NSFW intensity — Campaign settings tab covers party size, companion combat policy, NSFW intensity slider, GM persona, world charter, ruleset
- [x] 10.11 Add campaign/session controls for companion combat policy
- [x] 10.12 Add companion decision proposal and accept/modify/decline UI

Coverage: v1 phases 10 and 14

### Phase 11 — Ruleset authoring, worldbuilding, and content creation tools

- [x] 11.1 Implement `RulesetEditor.svelte` — added a global Library Rulesets panel, available without a campaign, with built-in browsing, custom ruleset creation, editable metadata, dice system/default check fields, protected built-ins with a complete Customize-to-edit flow, and guarded custom-ruleset deletion
- [x] 11.2 Add CRUD for stats, skills, conditions, slots, abilities, and levels — Ruleset Authoring also covers check rules, resources, reusable spells, and monster/creature stat blocks; built-in definitions can be cloned into editable custom rulesets
- [x] 11.3 Add `createRulesetTools` and `RulesetAssistantService` — added read/list tools plus approval-gated proposals for ruleset metadata and all definition categories, exported through the AI service factory with focused tests
- [x] 11.4 Add `WorldCharterPanel.svelte` and charter creation flow — added reusable charter editing, deterministic campaign drafting, AI expansion, persistence, and GM Screen integration
- [x] 11.5 Add interview-driven worldbuilding assistant and setup flow — added a Library-level pre-campaign interview for premise, genre, tone, power scale, magic/technology, factions, calendar, themes, and boundaries, plus conversational AI brainstorming, guided follow-up questions, structured draft-update proposals, and explicit Apply/Discard review before edits reach the charter
- [x] 11.6 Add `campaign_threads` and scene-planning support — campaign threads, beats, clocks, visibility, GM planning controls, player-safe display, and prompt context are implemented
- [x] 11.7 Add `entry.ability_id` linking and mechanical lorebook entries — lorebook entries can link to the active ruleset's abilities and persist the relationship
- [x] 11.8 Add import/export tooling for rulesets and campaigns — rulesets support JSON packages, and campaign exports now include settings, threads, beats, and scene-turn state with collision-safe import remapping

Coverage: v1 phases 11, 12, 13, and 15

### Phase 12 — Launch polish and final hardening

- [ ] 12.1 Run app-wide consistency pass to remove residual legacy story references
- [ ] 12.2 Remove or isolate legacy story-first navigation and screens
- [ ] 12.3 Validate brand and UI separation from the previous app
- [ ] 12.4 Run migration or schema bootstrapping tests for greenfield setup
- [ ] 12.5 Validate all pack templates, rulesets, and scenes render without legacy assumptions
- [ ] 12.6 Run end-to-end smoke test for campaign creation, party creation, ruleset attachment, roll flow, turn order, and contents safety
- [ ] 12.7 Finalize onboarding, tutorial, and launch docs

Coverage: cross-cutting v1 validation and v2 product separation

---

## 3. Cross-cutting validation tasks

- [ ] V1-coverage audit: confirm every v1 major feature is mapped into v2 plan and execution list
- [ ] Safety audit: confirm no compelled sexual acts or consent override can be created through any ruleset, ability, or tool
- [ ] Prompt audit: confirm all prompt text is in packs and no typed narrative instruction remains hardcoded
- [ ] Safety pack audit: confirm all hard safety and consent language lives in a prompt-pack safety category, not in app code
- [ ] Prompt variant test: confirm different safety prompt pack variants can be swapped without changing source code
- [~] Brand audit: confirm active product reads as a different product from legacy app
- [ ] Legacy cut audit: confirm no migration path is being incorrectly attempted for active product work
- [ ] Schema audit: confirm new data model is clean and not mixing legacy story architecture with campaign architecture
- [ ] Test plan review: confirm dice, turn order, party, mechanic, and safety tests match v1 verification expectations
- [ ] Agency audit: confirm autonomous companions retain narrative ownership and enemies/NPCs cannot enter player-control paths
- [ ] Session snapshot audit: confirm primary character, active party, party order, and combat policy are stable for a session
- [ ] Phase 1 completion gate: do not mark Phase 1 complete or close its full test suite until tasks 1.8-1.15 and their integration tests are complete

---

## 3b. Architecture decision: autonomous companions with optional tactical control

This decision supersedes the earlier assumption that the player directly controls the whole party.

### Default release behavior

- The player selects the active party from eligible allied characters.
- The player selects a primary character at session start.
- The primary character is player-led in narrative and social scenes.
- Active companions retain autonomous dialogue, priorities, motivations, and personal actions.
- Active companions are autonomous in combat by default.
- Enemies and ordinary NPCs are never player-controlled.

### Optional combat policies

- `autonomous`: the companion AI chooses and executes a sensible action.
- `tactical_delegate`: the player gives a tactical intent; the companion chooses the concrete action and may explain or adapt it.
- `tactical_player`: the player selects the companion's combat action explicitly.

These policies affect combat action selection only. They must not erase companion identity, social agency, relationships, or narrative ownership outside the tactical action.

### Required schema consequences

The initial migration 040 is a provisional additive foundation and must be revised before runtime party wiring. The final Phase 1 schema must represent:

- ally eligibility versus active membership
- actor category and agency profile
- narrative control versus combat control
- campaign session records
- session party snapshots
- primary character and party order
- explicit party-change boundaries

Do not implement `characters.is_player_character` as the sole control mechanism.

---

## 3a. Scope and progress log

### Completed during Phase 0 implementation

- Locked the active product identity as `Campaign Engine`, with a GM-first campaign/party/world direction.
- Added the `Campaign Ember` branded theme and made it the default UI theme.
- Created and wired a dedicated `campaign-engine-mark.svg` source asset for the favicon, app header, onboarding, and startup splash.
- Generated the branded web PNGs, opaque splash/background PNGs, Tauri desktop icons, Windows ICO, iOS icons, Android launcher assets, and platform tile variants with ImageMagick and `npx tauri icon`.
- Updated native Tauri product and window metadata, browser title, startup theme, and loading state.
- Updated the active shell, onboarding, library, browser title, and loading state to use campaign-engine language.
- Replaced high-visibility story-era labels in the library, sidebar, settings, assistant profiles, director assistant, and generation warning UI.
- Removed the redundant mode-selection screen from the Campaign wizard; Prompt Pack is now the first step because adventure mode is the only active mode.
- Updated all primary Campaign wizard step labels and guidance to use campaign, party, and lead-character language.
- Fixed wizard-created campaign hydration so persisted characters and the opening narration are loaded into the active store before the Campaign panel opens.
- Fixed empty-opening acceptance: the wizard now requires non-empty opening text, persistence rejects empty scenes, and creation verifies the opening entry by ID after saving.
- Confirmed the QA case for `The Hidden Heartroom`: the active database contains four main-branch characters but zero `story_entries`, proving the opening was never persisted rather than merely hidden by the story panel.
- Added an in-campaign recovery editor for empty campaigns: `Set Opening Scene` saves user text as a wizard-sourced narration entry through the standard story store path.
- Added an explicit `Active Campaigns` / `Legacy Archive` library boundary; only wizard-created campaigns appear in the active product view.
- Reframed active memory and checkpoint UI from Chapter to Session, including creation, summaries, narrative reading, resummarization, retrieval settings, and assistant labels.
- Updated Lorebook and retrieval assistant tools to expose `list_sessions` and `query_session`, with Session-oriented schemas, descriptions, result labels, and error messages; chapter-backed internal callbacks remain compatible.
- Updated API Debug Logs so request/response records are collapsed by default, pairings are easier to scan, and each expanded payload has its own scrollable viewport.
- Fixed the Vault/Lorebook Assistant session-history gap: it now receives the active campaign's sessions and entries and can load `list_sessions` / `read_session` tools before making vault updates.
- Phase 0 implementation validation passed: Svelte diagnostics reported zero errors and zero warnings, and the production Vite build completed successfully.
- Phase 0 closed after QA signoff: branding, campaign onboarding, session terminology, active/archive separation, recovery UI, assistant session access, and debug-log usability were accepted for progression to Phase 1.
- Added Phase 1 campaign foundation migration `040_campaign_foundation.sql` with additive `campaigns`, `campaign_settings`, and `party_members` tables plus default rules, scene, turn, party-size, and intensity settings.
- Added migration `041_campaign_agency_sessions.sql` with ally eligibility, actor categories, narrative/combat control modes, actor agency profiles, campaign sessions, and session party snapshots.
- Added `campaign.svelte.ts` store with campaign loading, eligible/active party management, primary-character validation, and session party snapshot creation for autonomous companions and optional tactical combat policies.
- Integrated the campaign store into wizard-generated story loading: active campaign overlays are ensured, eligible characters are seeded once using the existing `self` relationship for primary-character identity, and campaign state is reset when the story closes.
- Added the first-session setup UI with active-party toggles, primary-character selection, and autonomous/delegated/direct companion combat policy choices.
- Added campaign/session agency variables to `ContextBuilder.forStory`: campaign title, session number, primary character, party roster, companion roster, companion agency contract, and combat control policy.
- Added typed actor-control profile access and included per-member narrative/combat control modes plus available motivations in the campaign roster prompt context.
- Added validated spotlight persistence: `campaign.setSpotlightCharacter()` only accepts active eligible party members and updates the campaign spotlight reactively.
- Added campaign settings loading/default creation and active-party maximum enforcement in `campaign.svelte.ts`.
- Added migration 042 for nullable item ownership, slot keys, and nested containers; `campaign.setItemOwnership()` now validates campaign ownership, eligible owners, shared-stash null owners, and self-containment.
- Extracted pure campaign rules and added focused tests for active-party limits, spotlight eligibility, character ownership, shared stash, cross-story protection, and self-container rejection.
- Extracted deterministic session snapshot construction and tested primary-character ownership, party order, autonomous companions, tactical delegation, and direct tactical control.
- Added migration 043 and Campaign settings UI for persisted companion combat policy plus default/max party-size controls.
- Added explicit session lifecycle boundaries: campaigns cannot start a second active session, and the Campaign shell now exposes End Session before party changes.
- Added reusable `ItemOwnershipFields` controls to equipped, backpack, and world-item editors for character owner, shared stash, slot, and container assignment.
- Added first-class `agency` Prompt Pack templates for campaign context, agency core rules, companion voice/motivation, and companion combat policy; the Adventure prompt now renders these pack-controlled blocks.
- Added a non-mutating `CompanionDecisionService` and typed proposal contract for companion AI, player-request, tactical-delegation, and GM decision sources. Proposals are accepted or rejected before future turn/mechanics execution.
- Added typed `CompanionDecisionProposed` and `CompanionDecisionResolved` event-bus events with campaign, session, character, control-mode, and action attribution for future UI and turn integration.
- Added `CompanionDecisionPanel.svelte` to show active-campaign companion proposals and accepted/rejected resolution status without executing mechanics.
## 3a. Scope and progress log

### Completed during Phase 0 implementation
- Added focused `CompanionDecisionService` tests covering proposal ownership, session attribution, delegated control, resolution state, filtering, and unknown-proposal rejection.
- Added actor-category enforcement to companion decisions: non-GM proposals require `active_companion`, and NPC/enemy player-control paths are rejected; actor category is preserved in proposal/event attribution.
| 2026-08-16 | Companion agency regression tests | Verify proposal ownership, control modes, campaign/session filtering, resolution state, and invalid proposal handling | 1.16 | Implemented; broader party/session tests remain |
| 2026-08-16 | Agency actor-category guard | Prevent friendly NPCs and enemies from entering non-GM companion decision paths and preserve actor category in attribution | 1.15, 1.16, 4.17 | Implemented |
- Adopted the agency variables in the baseline Adventure narrative prompt so the GM preserves primary-character ownership, autonomous companion voices, and combat-policy boundaries.
- Added the first visual differentiation pass: warm ember primary accent, rose secondary accent, dark GM-cockpit surfaces, and branded header treatment.
- Tightened provider-layer safety settings and documented the hard bans against compelled sexual acts and consent override.
- Verified the Svelte application with `npx svelte-check --tsconfig ./tsconfig.json` with zero errors and zero warnings.
- Verified the production build with `npm run build`.

### Approved scope additions

| Date | Addition | Reason | Tracking task | Status |
| --- | --- | --- | --- | --- |
| 2026-08-14 | Strong visual rebrand alongside the product reset | Make the greenfield launch visibly distinct from the legacy app | 0.2, 0.7, Brand audit | In progress |
| 2026-08-14 | Active campaign language pass | Remove legacy story terminology from the high-visibility runtime shell without changing internal domain APIs yet | 0.3 | In progress |
| 2026-08-14 | Remove redundant campaign mode step | The greenfield product has one active mode, so the wizard should begin with campaign setup instead of exposing a no-op selector | 0.4 | In progress |
| 2026-08-14 | Campaign wizard copy completion | Align the active setup flow with the new campaign-first product language while leaving legacy import terminology isolated | 0.3, 0.4 | In progress |
| 2026-08-14 | Wizard creation hydration fix | Characters and the opening narration were persisted but not reliably visible immediately after Start Campaign; creation now explicitly hydrates the active main-branch state | 0.4 | In progress |
| 2026-08-14 | Empty opening persistence guard | A generated opening object could exist without usable scene text, allowing a campaign to be created with zero words and no initial narration | 0.4 | In progress |
| 2026-08-14 | Hidden Heartroom DB verification | Direct read-only inspection confirmed `ENTRY_COUNT=0` and `CHARACTER_COUNT=4` for the reported campaign | 0.4 | Confirmed defect |
| 2026-08-14 | Missing opening recovery UI | Provide a user-facing way to repair a campaign with no initial prompt while preserving the wizard narration format and word-count behavior | 0.4 | Implemented |
| 2026-08-14 | Active library and legacy archive boundary | Keep non-wizard legacy records out of active Campaign Engine flows while retaining them in a visible archive view | 0.5, 0.6 | Implemented |
| 2026-08-14 | Phase 0 validation pass | Confirm active shell, onboarding, archive boundary, missing-opening recovery, and branded assets compile and build together | 0.1-0.6 | Passed |
| 2026-08-14 | Chapter-to-Session terminology | Align active Campaign Engine language with tabletop RPG conventions while preserving internal chapter storage/API contracts during the transition | 0.3, 0.7, 5.6, 12.1 | Approved, in progress |
| 2026-08-14 | Session terminology UI pass | Replaced visible Chapter wording with Session across memory, checkpoint, retrieval, and assistant surfaces; internal types and persistence names remain unchanged | 0.3, 0.7 | Implemented |
| 2026-08-14 | Session terminology assistant tooling | Changed Lorebook/retrieval tool names and AI-facing descriptions from Chapter to Session without renaming internal storage contracts | 0.3, 0.7 | Implemented |
| 2026-08-14 | Collapsible API debug records | Improve debug-log scanning by collapsing request/response payloads by default while preserving independent payload scrolling | 0.7, 12.1 | Implemented |
| 2026-08-14 | Vault Assistant session access | Give the vault-focused Lorebook Assistant read-only access to active campaign session summaries and narrative entries | 0.3, 0.7 | Implemented |
| 2026-08-14 | Phase 0 closeout | QA signoff received; Phase 0 is closed and implementation proceeds to campaign foundation and party model work | 0.1-0.7 | Complete |
| 2026-08-14 | Campaign foundation schema | Added and registered migration 040 for campaign identity, campaign defaults, and party membership without mutating legacy story tables | 1.1, 1.2 | Implemented |
| 2026-08-15 | Agency/session schema revision | Registered migration 041 to extend party membership with agency controls and add campaign session snapshots without rewriting migration 040 | 1.1-1.7 | Implemented |
| 2026-08-15 | Campaign roster/session store | Add the first runtime domain layer for party membership and session snapshots without exposing database rows to UI consumers | 1.12, 1.13, 1.15 | In progress |
| 2026-08-15 | Campaign lifecycle integration | Load and reset campaign agency state with active wizard-generated campaigns while leaving legacy archive stories untouched | 1.12, 1.13, 1.15 | Implemented |
| 2026-08-15 | First-session selection UI | Let users choose eligible active allies, primary character, and companion combat policy before creating a session snapshot | 1.13, 1.15 | Implemented; transition workflows remain |
| 2026-08-15 | Agency prompt context | Expose campaign roster, session primary, companion agency, and combat policy to shared prompt rendering with legacy-safe fallback | 1.14, 1.15 | Implemented; prompt pack adoption remains |
| 2026-08-15 | Agency narrative prompt adoption | Add the primary-character and autonomous-companion contract to the baseline Adventure GM prompt | 1.14, 1.15, 6.8, 6.13 | Implemented |
| 2026-08-15 | Companion profile context | Expose actor-control profile data and per-member agency modes to shared prompt context for future companion decision tooling | 1.15 | In progress |
| 2026-08-15 | Spotlight runtime tracking | Add validated campaign spotlight persistence for active eligible party members | 1.8 | Implemented; integration tests remain |
| 2026-08-15 | Party-size runtime enforcement | Load/create campaign defaults and reject activation beyond `maxPartySize` | 1.11 | Implemented; settings UI/tests remain |
| 2026-08-16 | Item ownership and shared stash foundation | Add nullable owner, slot, and container persistence plus campaign-level ownership validation | 1.9, 1.10 | Implemented; UI/tests remain |
| 2026-08-16 | Phase 1 campaign rules tests | Verify spotlight, party-limit, ownership, stash, and invalid assignment rules independently of Svelte/database runtime | 1.8-1.11, 1.16 | Implemented; integration/UI tests remain |
| 2026-08-16 | Session snapshot rule tests | Verify session party ordering, primary-character control, autonomous companion control, and tactical policy variants | 1.6, 1.7, 1.13, 1.16 | Implemented; integration/UI tests remain |
| 2026-08-16 | Campaign settings controls | Expose party-size limits and default autonomous/delegated/direct companion combat policy in active Campaign settings | 1.11, 1.13, 1.15 | Implemented; integration tests remain |
| 2026-08-16 | Session boundary lifecycle | Persist session completion, block concurrent active sessions, and expose End Session in the active Campaign shell | 1.13 | Implemented; broader transition workflows remain |
| 2026-08-16 | Item ownership UI | Expose character ownership, shared stash, slot, and container assignment in all Inventory item editors | 1.9, 1.10 | Implemented; tests remain |
| 2026-08-15 | Modular agency Prompt Pack | Expose agency core, companion voice, campaign context, and combat-policy instructions as customizable `agency` templates | 6.13, 6.14 | Implemented |
| 2026-08-15 | Companion decision proposal boundary | Represent companion-owned and delegated tactical decisions without allowing narrative generation to mutate mechanics state | 1.15, 4.13-4.16 | Implemented; turn execution remains |
| 2026-08-15 | Companion decision event attribution | Surface proposal/resolution lifecycle events without executing mechanics, preserving a clear handoff to the future turn director | 1.15, 4.13 | Implemented |
| 2026-08-15 | Companion decision attribution UI | Show proposal actor, control mode, scene mode, action, and resolution status in the active Campaign shell | 1.15, 4.13, 10.12 | Implemented; mechanics handoff remains |
| 2026-08-15 | Companion agency regression tests | Verify proposal ownership, control modes, campaign/session filtering, resolution state, and invalid proposal handling | 1.16 | Implemented; broader party/session tests remain |
| 2026-08-15 | Party agency architecture revision | Replace full-party player control with autonomous companions, session primary character selection, ally-pool management, and optional tactical combat policies | 1.1-1.16, 4.13-4.18, 6.8, 6.13-6.14, 10.11-10.12 | Approved, implementation paused pending schema revision |

### Asset completion note for 0.2

- Native raster/icon generation is complete through the Tauri icon pipeline. The source of truth is `static/campaign-engine-mark.svg`; generated platform variants are checked into the existing Tauri icon locations.
- The web startup splash uses the SVG mark, while `static/campaign-engine-splash.png` provides an opaque Campaign Ember bitmap for packaging paths that require a raster launch asset.

New additions should be added here before their implementation task is marked complete. Do not remove original V1-mapped tasks when scope expands; add a new task or amend the relevant task while preserving its V1 coverage reference.

---

## 4. Suggested milestone ordering

### Milestone 1 — Product reset and foundation
- Phases 0 and 1
- Goal: new campaign product shell and data model exist

### Milestone 2 — Rules and dice loop
- Phase 2 plus 7
- Goal: create campaign, add party, roll dice, track results, continue narration

### Milestone 3 — Mechanics and turn flow
- Phases 3, 4, 8, 9
- Goal: active actor, scene mode, combat and non-combat turn logic, safe mechanics enforcement

### Milestone 4 — GM workflow and world systems
- Phases 5, 6, 11
- Goal: world charter, rules authoring, GM planning, prompt pack system

### Milestone 5 — Launch polish
- Phase 10 + 12
- Goal: complete UI, safety checks, final product separation, and launch readiness

---

## 5. Progress tracking guidance

Use a project board or issue tracker with fields:

- task id
- phase
- workstream
- owner
- status
- blockers
- test coverage
- v1 feature mapping
- launch milestone

Recommended project columns:

- Backlog
- Planned
- In Progress
- Review
- Blocked
- Done

For each task, add a reference to the relevant v1 feature mapping and v2 phase. This ensures we know which original feature is being covered and whether any major v1 concept is still unimplemented.

---

## 6. Completion criteria

The V2 implementation is complete when all tasks in this list are checked off and the following are true:

- a new campaign product exists with no legacy story assumptions in runtime behavior
- party management, rulesets, and scene flow work end-to-end
- dice and mechanics are deterministic, auditable, and validated
- GM planning and world charter tools are functional
- player-facing UI is distinct from the legacy app
- all major features from version 1 are represented in the v2 system and tracked in this file
- hard safety guardrails are enforced in code

---

## 7. Coverage validation reminder

This task list intentionally mirrors the v1 plan’s major areas and maps them into the v2 greenfield product architecture:

- old protagonist assumptions are intentionally removed, not preserved
- single-story assumptions are intentionally not migrated
- rulesets, party, mechanics, scenes, and worldbuilding are central
- all major v1 features are accounted for in a new product architecture

# Adventure Mode Engineering Tasks — V2 (Greenfield Launch)

This file is the execution checklist for the V2 greenfield plan. It tracks implementation tasks in the order they should be delivered and records work that covers the original V1 plan.

Use this as the working task list for engineering progress. Update status as each item is started and completed.

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

- [ ] 0.1 Define product identity and visual direction
- [ ] 0.2 Create brand/UX package: naming, colors, app shell, icons, splash screens
- [ ] 0.3 Replace active copy: “story” → “campaign”, “cast” → “party”, etc.
- [ ] 0.4 Build new onboarding flow for campaign creation
- [ ] 0.5 Add visible legacy archive area and isolate old content
- [ ] 0.6 Remove legacy story-first screens from main product navigation
- [ ] 0.7 Validate app clearly reads as a distinct product from the old adventure app

Coverage: v1 phases 0, 5, 12, and 13 (reframed under greenfield product identity)

### Phase 1 — Campaign foundation and party model

- [ ] 1.1 Define campaign schema and default settings
- [ ] 1.2 Add campaigns table and campaign settings model
- [ ] 1.3 Add party_members table and membership tracking
- [ ] 1.4 Add `characters.is_player_character` column and backfill rules for new campaigns
- [ ] 1.5 Add spotlight/active actor tracking (`spotlight_character_id` or equivalent)
- [ ] 1.6 Add per-character item ownership model (`owner_character_id`, `slot_key`, `container_item_id`)
- [ ] 1.7 Add shared stash semantics for unowned items
- [ ] 1.8 Add campaign-level party-size limit and default party size
- [ ] 1.9 Add party roster service/store layer
- [ ] 1.10 Add party-first context builder variables for prompt generation

Coverage: v1 phases 0, 3, 3b, and 10

### Phase 2 — Ruleset engine and dice system

- [ ] 2.1 Define ruleset schema and seed templates
- [ ] 2.2 Add `rulesets`, `ruleset_stats`, `ruleset_skills`, `ruleset_check_rules`, `ruleset_conditions`, `ruleset_slots`, `ruleset_abilities`, `ruleset_levels`
- [ ] 2.3 Add built-in ruleset templates: d20-Classic, Shadowdark-like, Narrative-2d6, Freeform-Lite
- [ ] 2.4 Add ruleset store and accessors
- [ ] 2.5 Build dice notation parser (`NdX`, modifiers, `kh`/`kl`, `adv`/`dis`, rerolls, exploding dice, clamps)
- [ ] 2.6 Implement pure AST evaluation for dice expressions
- [ ] 2.7 Add seeded RNG / reproducible dice behavior
- [ ] 2.8 Add roll ledger table and `getRollStats` equivalent
- [ ] 2.9 Implement `roll({ notation, dc, reason, actorId, visibility })` result contract
- [ ] 2.10 Add check-rule outcome bands and DC interpretation
- [ ] 2.11 Add karma/fudge bias support with explicit declaration and logging
- [ ] 2.12 Add unit tests for notation parsing, roll behavior, and seeded reproducibility

Coverage: v1 phases 1, 2, 10, and 15

### Phase 3 — Mechanics, resources, abilities, and inventory

- [ ] 3.1 Add ruleset ability definitions and metadata model
- [ ] 3.2 Add conditions and resource formulas
- [ ] 3.3 Add character sheet data model and dynamic sheet storage
- [ ] 3.4 Add resource clamp enforcement, negative-money prevention, and ability-use floor validation
- [ ] 3.5 Add item ownership, equip, transfer, and stash logic
- [ ] 3.6 Add clothing durability ownership and per-member application
- [ ] 3.7 Add encumbrance and slot/carry validation
- [ ] 3.8 Add inventory grouping by owner and shared stash bucket
- [ ] 3.9 Add mechanic tool definitions for resources and state mutation
- [ ] 3.10 Add mechanics service and validation flow
- [ ] 3.11 Add protection for all content hard bans in code paths
- [ ] 3.12 Add enforcement comments and guardrail documentation near validation points

Coverage: v1 phases 0, 3, 8, 9, 15, and hard safety rules

### Phase 4 — Scene modes, turn logic, and active actors

- [ ] 4.1 Define scene modes and extensibility model
- [ ] 4.2 Add scene-mode storage per campaign and per entry
- [ ] 4.3 Add turn type metadata model and shared actor abstraction
- [ ] 4.4 Implement free, spotlight, round-robin, initiative, and DM-directed turn order modes
- [ ] 4.5 Add `TurnOrderService` API: getActiveActor, advance, setActiveActor, insertActor, removeActor, rebuild
- [ ] 4.6 Add turn-order persistence and encounter order save/restore
- [ ] 4.7 Add `TurnDirector` behavior for forced resolution and narrative turn transitions
- [ ] 4.8 Add scene transition narrative output on mode changes
- [ ] 4.9 Add active actor attribution to rolls and action choices
- [ ] 4.10 Add per-scene-mode default settings
- [ ] 4.11 Add `TurnOrderStrip` and active actor display in app shell
- [ ] 4.12 Add action input acting-as selector and end-turn affordance

Coverage: v1 phases 4, 5, 14, and 15

### Phase 5 — GM planning, world charter, and session management

- [ ] 5.1 Add world charter model and campaign setup wizard
- [ ] 5.2 Add worldbuilding assistant / world charter generation flow
- [ ] 5.3 Add campaign threads model and tracking
- [ ] 5.4 Add thread beats, clocks, and director-only visibility handling
- [ ] 5.5 Add GM screen UI with hidden director-only planning panels
- [ ] 5.6 Add session recap generation from chapters, rolls, and threads
- [ ] 5.7 Add rules digest and GM persona templates
- [ ] 5.8 Add quest and story tracking with player-safe summary modes
- [ ] 5.9 Add optional downtime and montage workflows

Coverage: v1 phases 12, 13, and 15

### Phase 6 — Prompt packs and narrative generation

- [ ] 6.1 Define pack architecture and prompt variable conventions
- [ ] 6.2 Move all hardcoded prompt text out of TypeScript into pack templates
- [ ] 6.3 Add role-specific templates: GM core, world charter, ruleset digest, party roster, turn order
- [ ] 6.4 Add scene partials for overworld, dungeon, settlement, camp, combat, travel, and downtime
- [ ] 6.5 Add narrative turn templates for narration, NPC action, roll request, action resolution, QA, scene transition, montage
- [ ] 6.6 Add context variables for `sceneMode`, `turnType`, `activeActorName`, `turnOrderMode`, `upcomingActors`, `partyRoster`, `playerControlledNames`, `pendingRoll`, `recentRolls`
- [ ] 6.7 Add pack-template compatibility checks and repair flow for user-authored packs
- [ ] 6.8 Remove legacy protagonist references from default prompt context
- [ ] 6.9 Add GM party roster partial and other reusable shared partials

Coverage: v1 phases 2, 6, 7, 15, and relevant hardcoded prompt cleanup

### Phase 7 — Inline roll tags and continuation flow

- [ ] 7.1 Add inline roll parser and partial-tag detection
- [ ] 7.2 Add `<roll/>`, `<turn/>`, `<scene/>`, and `<actor/>` tag handling
- [ ] 7.3 Add stream interruption logic in narrative generation
- [ ] 7.4 Add local roll resolution and persistence for intercepted roll tags
- [ ] 7.5 Emit `dice_rolled` event and update UI inline
- [ ] 7.6 Continue generation with a safety-preserved continuation state
- [ ] 7.7 Add max continuation count per turn and abort logic
- [ ] 7.8 Add event types for `dice_rolled`, `roll_requested`, `turn_type`, `scene_changed`, and `actor_changed`
- [ ] 7.9 Add anti-tamper guardrail comments and enforcement at interception points

Coverage: v1 phase 7 and relevant mechanics flow

### Phase 8 — Mechanics tool execution and validation

- [ ] 8.1 Build `mechanics.ts` tool definitions
- [ ] 8.2 Implement `roll_dice`, `request_player_roll`, `adjust_resource`, `apply_condition`, `remove_condition`, `spend_ability_use`, `grant_xp`, `award_item`, `remove_item`, `equip_item`, `transfer_item`, `damage_clothing`, `adjust_money`, `advance_time`, `set_scene_mode`, `set_active_actor`, `advance_turn`, `update_quest_thread`, `roll_on_table`, `finish_mechanics`
- [ ] 8.3 Add Mechanics service using base AI service pattern and terminal tool flow
- [ ] 8.4 Add `MechanicsPhase` execution path parallel to classification
- [ ] 8.5 Add validation for resource clamps, party size, owner integrity, negative money, and ability-use floors
- [ ] 8.6 Add content safety validation at every mechanics boundary
- [ ] 8.7 Add owner-scoped item and clothing updates to prevent cross-ownership mutation
- [ ] 8.8 Add encumbrance enforcement and reasoned rejection flow
- [ ] 8.9 Add `RulesValidatorService` hooks for contradiction and rules-lawyer checks

Coverage: v1 phases 8, 15, and hard safety requirements

### Phase 9 — Content intensity and safety policy

- [ ] 9.1 Add `nsfw_intensity` field and default handling
- [ ] 9.2 Add intensity levels 0-4 and explanatory labels
- [ ] 9.3 Add UI slider with immutable safety note
- [ ] 9.4 Make intensity drive narration tone and image prompting only through pack templates
- [ ] 9.5 Add intensity influence on clothing damage, camp/settlement romance framing, and content tone
- [ ] 9.6 Enforce hard bans at intensity 4 and all lower settings
- [ ] 9.7 Add tests for content rules at max intensity

Coverage: v1 phase 9 and hard safety policy

### Phase 10 — UI for parties, dice, turn order, and sheets

- [ ] 10.1 Build `RollCard.svelte` with actor, notation, DC, animated roll, manual override
- [ ] 10.2 Build `DiceRollInline.svelte` for inline DM rolls
- [ ] 10.3 Build `PartyPanel.svelte` showing PC cards and spotlight/active indicators
- [ ] 10.4 Build dynamic `CharacterSheet.svelte` driven by ruleset data
- [ ] 10.5 Build `DiceLogPanel.svelte` with roll history and stats dashboard
- [ ] 10.6 Add `TurnOrderStrip.svelte` to app shell and world panels
- [ ] 10.7 Update `ActionInput.svelte` with acting-as selector and scene indicator
- [ ] 10.8 Add “Acting as: X” UI and free-text blocking when roll is outstanding
- [ ] 10.9 Add per-party-member inventories and clothing display
- [ ] 10.10 Add UI for campaign settings: ruleset, scene mode, dice enforcement, party size, NSFW intensity

Coverage: v1 phases 10 and 14

### Phase 11 — Ruleset authoring, worldbuilding, and content creation tools

- [ ] 11.1 Implement `RulesetEditor.svelte`
- [ ] 11.2 Add CRUD for stats, skills, conditions, slots, abilities, and levels
- [ ] 11.3 Add `createRulesetTools` and `RulesetAssistantService`
- [ ] 11.4 Add `WorldCharterPanel.svelte` and charter creation flow
- [ ] 11.5 Add interview-driven worldbuilding assistant and setup flow
- [ ] 11.6 Add `campaign_threads` and scene-planning support
- [ ] 11.7 Add `entry.ability_id` linking and mechanical lorebook entries
- [ ] 11.8 Add import/export tooling for rulesets and campaigns

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
- [ ] Brand audit: confirm active product reads as a different product from legacy app
- [ ] Legacy cut audit: confirm no migration path is being incorrectly attempted for active product work
- [ ] Schema audit: confirm new data model is clean and not mixing legacy story architecture with campaign architecture
- [ ] Test plan review: confirm dice, turn order, party, mechanic, and safety tests match v1 verification expectations

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

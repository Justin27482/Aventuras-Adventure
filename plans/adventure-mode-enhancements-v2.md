# Adventure Mode Enhancements — TTRPG Campaign Engine

Version: 2.0 (Greenfield Launch)
Date: 2026-08-15
Status: Active implementation; Phases 0-3 complete, Phase 4 in progress

This document is a revised product and engineering plan for the next-generation system. It intentionally supersedes the original strategy in [plans/adventure-mode-enhancements.md](adventure-mode-enhancements.md) while preserving that earlier plan for reference.

The core decision in this version is intentionally different: this is a clean-slate product launch, not a migration of the current story-first app. Existing Aventura stories are treated as legacy content and are not carried forward into the new campaign engine.

Current execution status is tracked in [plans/adventure-mode-engineering-tasks-v2.md](adventure-mode-engineering-tasks-v2.md). Phases 0-3 are implemented and validated. Phase 4 scene/turn persistence has started with migration 049 and turn-order snapshot/restore support; campaign lifecycle wiring, turn direction, and UI remain outstanding.

---

## 1. Product decision: greenfield launch

### 1.1 Executive summary

We are building a new product that is explicitly a TTRPG campaign engine, not a continuation of the current narrative text-adventure app.

This version intentionally removes legacy compatibility assumptions in favor of a cleaner architecture built around:

- campaigns, not stories
- party-first play, not a single protagonist
- ruleset-driven mechanics, not prose-only classification
- turn order and scene orchestration, not freeform narrative assumptions
- DM tooling and GM-facing planning, not just storytelling prompts
- explicit content guardrails and safety boundaries

This is the safer path because the current app is structurally coupled to a single-PC narrative model. Rather than layering compatibility shims over a deeply mismatched architecture, we launch a new product with the correct model from day one.

### 1.2 Strategic decision

| Topic | Decision |
| --- | --- |
| Product scope | New campaign-first product; no migration from legacy stories |
| Legacy app | Kept only as archived/legacy content, not active product behavior |
| Campaign data model | New schema and code path from the ground up |
| Player model | Party-based play with a player-selected primary character, autonomous companions, and optional tactical companion control |
| Core engine | Ruleset-driven, dice-aware, scene-aware, GM-supported |
| UX direction | Bold rebrand; intentionally different from old Aventura app |
| Compatibility | No legacy story compatibility work in the new product |
| App identity | Clearly distinct visual branding and app shell |

---

## 2. Product vision

We are building a GM-first, party-based, rules-aware campaign engine for interactive fiction and tabletop-style adventures.

The player experience should feel like a modern TTRPG interface with:

- a campaign ledger and session state
- a roster of player characters
- a ruleset-backed dice system
- active turn order and scene logic
- GM planning tools and world structure
- safe, governed narrative generation
- optional compendium, rules, and pack-driven prompting

The product narrative is not “continue writing your story.” It is “run a campaign.”

---

## 3. What this version does not do

The greenfield launch intentionally does not include:

- import or conversion of old adventure stories
- compatibility with old protagonist-based prompts, data, or UI assumptions
- migration of legacy content into the new campaign schema
- support for old single-character narrative semantics in the new runtime
- feature flags that preserve historic app behavior

This is a deliberate cut: the new product is clean and modern, while legacy data remains outside the new system.

---

## 4. Core product principles

### 4.1 Campaign-first design
Campaigns are the product’s primary unit of work.

Campaign data includes:

- campaign metadata and world charter
- ruleset binding
- party roster
- scene mode and turn order status
- pending rolls
- GM threads / campaign planning content
- content intensity settings
- world state and session logs

### 4.2 Party-first play
The new key abstraction is not a single “self” character. The campaign stores:

- an ally pool and eligible companion roster
- an active party selected from eligible allies
- a primary character selected per session
- autonomous companion agency outside direct tactical control
- spotlight/active character
- active turn order and scene focus
- per-member resources, conditions, and equipment

### 4.3 Character agency and control policy

The player manages the roster, but does not automatically possess every companion's voice or decisions.

Actor categories are explicit: `primary_player_character`, `active_companion`, `inactive_ally`, `friendly_npc`, `neutral_npc`, `enemy`, and `gm_actor`.

Control mode is separate from actor category:

- `player_narrative`: player leads the actor's narrative decisions
- `autonomous`: companion/NPC AI owns the actor's decisions
- `tactical_delegate`: player supplies tactical intent and the actor chooses a fitting action
- `tactical_player`: player selects the companion's combat action explicitly
- `gm_directed`: GM/director owns the actor's action

The first release defaults to a player-controlled primary character and autonomous active companions, both in social/narrative scenes and combat. An optional campaign/session policy may enable tactical delegation or direct tactical control for active companions during combat only. Enemies and ordinary NPCs are never player-controlled.

Companions retain persistent voices, priorities, motivations, relationships, fears, values, knowledge, secrets, and red lines. Player requests are requests, not guaranteed commands. The director may resolve consequences, but must not silently convert an autonomous companion into a player puppet.

At session start, the player selects a primary character, active party, party order, and optional companion combat policy. This selection is snapshotted for the session; party changes normally occur at camp, settlement, downtime, or another explicit transition.

### 4.3 Ruleset-driven simulation
The engine is not just prose generation. It is explicitly rules-aware.

A campaign binds to a ruleset that defines:

- stats and derived resources
- skills and check rules
- ability definitions
- conditions and status effects
- slots and body zones
- initiative and turn-order formulae
- resource and rest behavior

### 4.4 GM authority and deterministic mechanics
The app owns the dice and the state changes. The model does not invent the numbers.

This includes:

- explicit roll tags mid-stream
- local deterministic evaluation
- ledgered roll results
- auditable outcomes
- mechanics phase for state mutation

### 4.5 Safety by construction
Hard guardrails are enforced in code, not just in prompt wording.

This version hard-bans:

- compelled sexual acts
- consent override
- any ability or mechanic that bypasses these protections

These guardrails apply at every intensity level, including maximum intensity.

---

## 5. UX and branding direction

### 5.1 App identity
The new app should look and feel like a different product from the current Aventura experience.

Recommended UI changes:

- new product name and identity
- new iconography and splash branding
- distinct theme, palette, and typography
- alternate app shell and panel layout
- stronger “GM + party + world” framing
- elimination of story-specific labeling in the active experience

### 5.2 New user-facing language
Use campaign-centric rather than story-centric language across the app.

Examples:

- campaign instead of story
- party instead of cast
- scene instead of chapter/scene assumptions
- rules and abilities instead of lore-only framing
- world charter instead of setup story background
- GM screen instead of director assistant if the product is presented as GM-first

### 5.3 Legacy content separation
Legacy stories should not be mixed into active product flows. The UI should treat them as:

- archive area
- import/export only
- read-only legacy viewing if needed

They should not appear as standard active campaigns.

---

## 6. Product architecture

### 6.1 Data model direction
The new system should be built on a campaign-first schema with no legacy story assumptions.

Core entities:

- campaigns
- campaign_settings
- ally_pool / party eligibility
- party_members
- campaign_sessions
- session_party_members
- actor_control_profiles
- characters
- character_sheets
- rulesets
- ruleset_stats
- ruleset_skills
- ruleset_check_rules
- ruleset_abilities
- ruleset_conditions
- ruleset_slots
- items
- item_ownership
- scene_modes
- turn_order
- pending_rolls
- encounters
- campaign_threads
- campaign_clocks
- world_charters

### 6.2 Actor model
The core abstraction should be an actor abstraction that works for:

- player characters
- NPCs
- enemies
- GM-controlled actors

This enables unified turn order, active actor selection, and scene orchestration across combat and non-combat modes.

The actor model must carry agency ownership and control policy. `characters.is_player_character` alone is insufficient because it cannot represent inactive allies, autonomous companions, session primary selection, or combat-only tactical delegation.

### 6.3 State ownership
The app must separate:

- narrative generation state
- mechanics state
- GM planning state
- world state
- UI state

The mechanics system owns numeric outcomes; classification and narrative generation may describe world changes but must not silently impose game-state numbers.

---

## 7. Feature plan (v2)

### Phase 0 — Greenfield product reset and branding

1. Establish new product identity and branding package.
2. Replace active UI copy (“story” → “campaign”, “cast” → “party”, etc.).
3. Build a fresh onboarding flow for campaign creation.
4. Create a visible legacy archive area.
5. Remove old story-first screens from the active app shell.

Outcome: the app reads as a distinct product from the start.

### Phase 1 — Campaign foundation and party model

1. New campaign tables and settings structure.
2. Add ally eligibility, actor category, and agency/control profiles; do not use `is_player_character` as the sole control mechanism.
3. Add `stories`-equivalent domain renamed around campaigns, while preserving internal domain naming only if needed.
4. Add active party membership and per-session primary character selection.
5. Add session party snapshots, party order, and explicit party-change boundaries.
6. Add separate narrative-control and combat-control policies.
7. Add per-character item ownership and shared stash semantics.
8. Add campaign-level party limits and default party size.

Outcome: party-first state is the foundation while companion autonomy and optional tactical control preserve intraparty roleplay.

### Phase 2 — Ruleset engine and dice system

1. Add ruleset catalog and default built-in templates.
2. Build dice notation parser and evaluator (`NdX`, modifiers, advantage/disadvantage, rerolls, explosion, clamps).
3. Add seeded RNG and auditable roll ledger.
4. Implement `roll({ notation, dc, reason, actorId, visibility })` with result metadata.
5. Add check rules, outcome bands, and DC resolution.
6. Add optional karma/fudge bias with explicit declaration.

Outcome: the app can produce auditable rolls and bind them to a ruleset.

### Phase 3 — Mechanics, resources, and abilities

1. Add ruleset abilities, conditions, and resource logic.
2. Build resource clamps and negative-value prevention in code.
3. Add spend/use validation for ability usage and recharges.
4. Add party item transfer, equip, and encumbrance rules.
5. Add money validation and ownership-safe item changes.
6. Add mechanics tool set for DM/agent actions.

Outcome: numerical state is controlled by mechanics code rather than prompt suggestions.

### Phase 4 — Turn types, scenes, and active actors

1. Introduce turn types:
   - narration
   - npc_action
   - roll_request
   - action_resolution
   - qa
   - scene_transition
   - montage
2. Introduce scene modes:
   - overworld_exploration
   - dungeon_crawl
   - settlement
   - camp
   - combat
   - travel
   - downtime
3. Track `activeActor`, `sceneMode`, `turnType`, and `pendingRoll` in metadata or dedicated tables.
4. Add turn-order engine supporting free, spotlight, round robin, initiative, and DM-directed modes.
5. Add scene transitions with narrative output instead of silent mode changes.
6. Add companion decision proposals and tactical control policies without erasing companion narrative agency.

Outcome: the engine can support both dungeon play and social/travel scenes without combat-only assumptions.

### Phase 5 — GM planning and world charter

1. Add world charter model with tone, genre, setting assumptions, factions, and content boundaries.
2. Add campaign threads, beats, clocks, and secret planning structure.
3. Add GM screen and DM-only planning panels.
4. Add session recap and rules digest generation from active campaign state.
5. Support default campaign templates with prebuilt setup flows.

Outcome: the DM has a proper planning layer, not just a chat field.

### Phase 6 — Prompt pack expansion and prompt discipline

1. Move all prompt text into pack templates and partials.
2. Eliminate hardcoded narrative safety constraints from TypeScript.
3. Add pack-driven gm persona, world charter, party roster, turn-order, and scene templates.
4. Add support for DM-specific scene templates and per-mode narration behavior.
5. Add a pack compatibility scanner for future user-authored packs.

Outcome: the engine is pack-driven and not dependent on app code for core prompt policy.

### Phase 7 — Inline roll tags and local resolution

1. Add inline roll tag parsing in streaming output.
2. Intercept `<roll/>` tags mid-stream and resolve locally.
3. Persist the roll, emit a visible UI result, and continue generation with a continuation context.
4. Track a max continuation budget per turn.
5. Add explicit anti-tamper guardrail: model prose does not determine numeric outcomes.

Outcome: dice feel fair, deterministic, and visible while preserving streaming DM narration.

### Phase 8 — Mechanics tool phase

1. Build mechanics tools for:
   - roll_dice
   - request_player_roll
   - adjust_resource
   - apply_condition
   - remove_condition
   - spend_ability_use
   - grant_xp
   - award_item
   - remove_item
   - transfer_item
   - damage_clothing
   - adjust_money
   - advance_time
   - set_scene_mode
   - set_active_actor
   - advance_turn
   - finish_mechanics
2. Add a mechanics service that works like the existing agentic services.
3. Add guardrail enforcement at tool boundaries.
4. Add owner integrity and party size validation.

Outcome: numeric system changes are centralized and auditable.

### Phase 9 — Content intensity and safety layer

1. Add `nsfw_intensity` as a numeric 0-4 slider.
2. Support intensity-driven scene framing, clothing wear, and image prompting.
3. Enforce hard content bans at every intensity level.
4. Display immutable safety note in settings and UI.
5. Allow party and worldbuilding to remain expressive without crossing content bans.

Outcome: the app supports mature content without violating hard safety constraints.

### Phase 10 — UI layers for party, dice, and turn flow

1. Build party panel and party roster UI.
2. Build character sheet renderer driven by ruleset data.
3. Build roll card and manual-override input flow.
4. Build turn-order strip and active actor UI.
5. Build scene mode indicator and scene override controls.
6. Build dice history and statistics panel.

Outcome: the app exposes the full game loop clearly to the player.

### Phase 11 — Ruleset authoring and worldbuilding tools

1. Add ruleset editor for stats, skills, conditions, abilities, and slots.
2. Add GM interview-driven assistant tooling for ruleset authoring.
3. Add world charter creation flow and automated session-zero summary.
4. Add campaign setup wizard for first-time users.

Outcome: the app supports both GM creation and procedural content setup.

### Phase 12 — Final launch polish

1. Rebrand the app shell and product copy.
2. Remove all active legacy story-first screens and navigation.
3. Add archive-only access for legacy content.
4. Finalize onboarding, setup, and tutorial flow.
5. Validate hard safety rules, prompt-separation requirements, and ruleset integrity.

Outcome: the product launches as a new, clean campaign engine.

---

## 8. Migration and compatibility policy

### 8.1 Official stance
The new product does not migrate legacy Aventura stories.

### 8.2 Why this is the correct policy

- the old app is structurally based on a single-character model
- the new app is structurally based on a party-and-rules model
- the semantic mismatch is too large to safely bridge within the product time horizon
- preserving the old engine would slow architecture and increase risk

### 8.3 Legacy handling
Legacy story content may be kept in a separate archive area or exported for offline retention, but it is not part of the active product runtime.

---

## 9. Technical guardrails

### 9.1 Prompt discipline
All prompt text lives in packs and partials. No core app logic should rely on hardcoded narrative instructions.

### 9.2 Numeric integrity
All numeric mutation goes through a mechanics layer with validation. No prose classifier should be allowed to silently create game-state numbers.

### 9.3 Hard safety enforcement
The following are not negotiable:

- no compelled sexual acts
- no consent override
- no ability or mechanic may bypass these protections

These checks should be enforced in backend/service validation and by rollout guardrails in mechanics and DM tool execution.

### 9.4 Safety prompt packs (required)

The LLM safety policy must be converted out of hardcoded TypeScript text and into a dedicated prompt-pack category. The app should define new prompt-pack entries such as:

- `safety-core-rules`
- `safety-guardrails`
- `safety-content-intensity`
- `safety-content-bans`
- `safety-mechanics-constraints`

These pack entries carry the actual wording for:

- hard safety bans
- consent and coercion boundaries
- intensity-dependent content framing
- dark-content tone controls
- GM-facing safety guidance for social or erotic scenes

This keeps policy language editable and testable without code changes, while the enforcement layer still remains in code at the system boundary. In other words, the app may enforce the rule in validation code, but the wording and variant selection belong to the prompt pack.

### 9.5 Clear product separation
The app shell, branding, copy, and onboarding should make it obvious that this is a new product rather than a continuation of the old app.

---

## 10. Risks and mitigations

### Risk 1 — “feature creep” from trying to preserve old behavior
Mitigation: keep legacy app functionality out of the active product scope.

### Risk 2 — party and ruleset complexity
Mitigation: ship the minimal complete loop first: campaign creation → roster → ruleset → dice → turn order → scene flow.

### Risk 3 — prompt safety drift
Mitigation: all narrative safety logic lives in packs and centralized validation.

### Risk 4 — UI confusion between old and new product identity
Mitigation: rebrand aggressively and isolate legacy content visually.

### Risk 5 — rules/dice inconsistency
Mitigation: keep all numeric outcomes under a single mechanics system and ledger.

---

## 11. Recommended first milestone

The first milestone should be a minimal but functional greenfield campaign loop:

1. create campaign
2. create party
3. choose a ruleset
4. DM generates a scene
5. roll is made and logged
6. turn order advances
7. scene mode changes
8. mechanics apply resource changes
9. GM screen and campaign summary work

This creates a complete loop without requiring the broader worldbuilding, encounter, or long-term GM planning features to land first.

---

## 12. Verification and acceptance criteria

The product is acceptable when it can demonstrate:

- a new campaign can be created without any legacy story assumptions
- a party can be assembled and managed
- ruleset-based dice checks can be rolled and logged
- scene mode and active actor state move correctly
- mechanics enforce resource and safety constraints
- the app clearly presents itself as a distinct new product
- no old story/protagonist assumptions leak into the active UI or prompts

---

## 13. Summary

This version 2 plan intentionally changes the product strategy from “extend the current adventure engine” to “launch a new campaign-first TTRPG product.”

That is a stronger and cleaner engineering choice because it removes the old single-protagonist assumptions rather than trying to preserve them under the new system.

It also gives us a clearer product story: the new app is not an iteration of Aventura; it is a dedicated GM-driven campaign engine built for party play, rules, turn order, world structure, and scene-based storytelling.

---

## 14. Version 1 coverage and traceability

This v2 plan is designed to account for every major feature in the original v1 plan. The mapping below confirms that all critical v1 concepts have a place in the new greenfield architecture.

| V1 feature area | V1 phase(s) | V2 coverage | Notes |
| --- | --- | --- | --- |
| Legacy story-to-campaign wording cleanup | 0 | Phase 0, Phase 6, Phase 12 | UI rebranding and copy cleanup are explicit in v2 |
| Item ownership foundation | 0 | Phase 1, Phase 3, Phase 8 | New campaign schema includes per-character ownership and stash semantics |
| Dice engine and RNG | 1 | Phase 2, Phase 7 | Dice parser, RNG, roll ledger, and inline roll resolution are covered |
| Ruleset entity and abilities | 2 | Phase 2, Phase 3, Phase 11 | Ruleset catalogs, abilities, resources, authoring are included |
| Party, sheets, clothing | 3 | Phase 1, Phase 3, Phase 10 | Party roster, sheets, and owner-scoped clothing are included |
| Protagonist-to-party generalization | 3b | Phase 1, Phase 6, Phase 10 | Party-first design removes the old protagonist assumptions |
| Turn types and scene modes | 4 | Phase 4 | Explicit scene and turn-type design is core to v2 |
| Universal turn order and spotlight | 5 | Phase 4 | Turn-order engine and active actor model are in scope |
| Prompt pack expansion | 6 | Phase 6 | Prompt packs are a primary pillar of the greenfield design |
| Inline roll tags | 7 | Phase 7 | Inline `<roll/>` stream interception is included |
| Mechanics tool phase | 8 | Phase 8 | Mechanics service and numeric mutation boundaries are included |
| Content intensity slider | 9 | Phase 9 | Explicit intensity system and safety enforcement are included |
| Roll and party UI | 10 | Phase 10 | Roll UI, party panel, dice log, turn strip are included |
| Ruleset/ability authoring | 11 | Phase 11 | Authoring flows are included |
| World charter | 12 | Phase 5, Phase 11 | World charter and onboarding exist in v2 |
| Secret GM planning | 13 | Phase 5, Phase 11 | Campaign threads, GM screen, and planning system are included |
| Encounters | 14 | Phase 4, Phase 10 | Encounters reuse turn order and scene mode architecture |
| Progression, rest, tables, recap, validator | 15 | Phase 4, Phase 5, Phase 8, Phase 11 | Progression, rest, random tables, recap, and validation are covered under mechanics and GM planning |

### Coverage notes

The v1 plan includes a large set of design details and system concepts. The v2 plan intentionally re-expresses them under a clean-slate campaign-first architecture without preserving legacy story compatibility. Every v1 concept has an assigned home in the v2 product structure, and the engineering task list below tracks those workstreams into implementable tasks.

---

## 15. Engineering execution tracking

The project should use a task list that is checked in as part of the implementation process. Each task should be tracked at the phase level, and all tasks should be reflected in the project board or issue tracker.

Recommended status model:

- [ ] Not started
- [ ] In progress
- [ ] Done
- [ ] Blocked

The engineering task list is maintained in:

- [plans/adventure-mode-engineering-tasks-v2.md](adventure-mode-engineering-tasks-v2.md)

This file is the source of truth for execution progress. The v2 plan defines the design; the engineering task list defines the implementation thread and the rollout order.

---

## 16. Reference

Original plan retained for historical reference:

- [plans/adventure-mode-enhancements.md](adventure-mode-enhancements.md)

This version is intentionally distinct and should be treated as a greenfield product strategy document.

# Adventure Mode Enhancements — TTRPG Campaign Engine

Date: 2026-08-14
Status: Planned (not started)

Turns Aventuras-Adventure from a narrative text-adventure engine into a full LLM-powered TTRPG
simulator: a tamper-proof dice engine, a customizable ruleset system, a 1-8 character party with
real sheets, scene-aware DM response types, universal turn order, and GM-side campaign planning.

---

## 1. Locked Decisions

| Topic | Decision |
| --- | --- |
| Dice mechanism | **Hybrid** — inline `<roll/>` tags intercepted mid-stream (deterministic, local RNG) plus real tool-calling for state mutations in a post-narration Mechanics phase |
| Ruleset storage | **New first-class entity** with its own tables and vault (not the packs system, not per-campaign JSON) |
| Player roll UX | Roll card with an animated Roll button (app rolls) plus a manual-entry override |
| Party model | `characters.is_player_character` + `party_members`, layered on the existing `Character` |
| Abilities | Separate Abilities registry owned by the ruleset; lorebook entries link to it |
| Scene modes | First-class and extensible: dungeon crawl, settlement, camp, combat, overworld exploration, travel, downtime |
| Turn order | Universal spotlight/turn-order system across **all** scene modes; combat initiative is a specialization of it |
| Rollout | **No feature flag.** Applies to all existing campaigns; migrations backfill safe defaults |
| Terminology | User-facing "story" becomes **"campaign"** (UI copy only; DB/types stay `story*`) |
| NSFW | **Intensity slider 0-4**, not a boolean |
| Prompts | **No hardcoded prompt text** — expand the prompt pack system |
| Clothing | Extend the existing durability system; it must become per-party-member |
| POV default | Adventure prose defaults to **third person**; first/second person warn at campaign creation |
| `story.protagonist` | **Removed outright** — no deprecated alias; packs referencing it get a warning and a one-click fix |
| Party cap | Default **4**, adjustable in settings up to **8** |
| Deferred | Battle-map/grid tactics and licensed SRD ingestion — on the radar, not planned now |

---

## 2. Codebase Findings

### 2.1 General architecture

- No dice, stat, skill, or progression code exists anywhere. `Character` carries only
  name/description/traits/relationship/visualDescriptors/status/portrait.
- `streamNarrative` (`src/lib/services/ai/sdk/generate.ts`) is **plain-text only, no tool calling**.
  It wraps `streamText` with plain-text middleware and is consumed by `NarrativePhase` via
  `stream.fullStream`.
- `GenerationPipeline` phases: `pre → retrieval → narrative → [classification ∥ translation →
  image] ∥ background ∥ post` (`src/lib/services/generation/phases/`).
- `StoryEntry.type` = `'user_action' | 'narration' | 'system' | 'retry'`.
- The inline `<pic>` tag pattern (`src/lib/utils/inlineImageParser.ts` +
  `src/lib/services/ai/image/InlineImageTracker.ts`) is the model to copy for roll tags.
- Tool infrastructure is mature: `src/lib/services/ai/sdk/tools/*` factories,
  `sdk/agents/factory` (`createAgentFromPreset`, `createStreamingAgenticAssistant`),
  `stopOnTerminalTool` / `stopWhenDone`.
- Packs: `preset_packs` / `pack_templates` / `pack_variables` / `pack_runtime_variables`, loaded by
  `ContextBuilder.forStory()`, rendered with Liquid. Migration `020` is the precedent for seeding
  template rows via a SQL data migration.
- Epistemic system already exists: `epistemic_secret_atoms`,
  `epistemic_character_knowledge_edges`, `DisclosureGateService`, `EpistemicVisibilityScope`
  (`'director_only'`), `DirectorOutliningAssistantService`,
  `InteractiveDirectorAssistantService`, `DirectorAssistant.svelte`.
- `InteractiveVaultService` is the reference pattern for agentic assistants (dynamic `load_toolset`
  tool categories + pending-change approval via `vaultEditorStore`).
- Highest migration is **040**, registered in `src-tauri/src/lib.rs` via `include_str!`.
- `database.ts` is a single monolithic `DatabaseService` singleton; branch copy-on-write uses
  `overrides_id` plus `deleted` tombstones.
- Money, clothing durability, and the time tracker already exist and are driven by
  `ClassifierService`.

### 2.2 Critical finding A — items have no owner

`Item` = `{ id, storyId, name, description, quantity, equipped, location, metadata, branchId,
overridesId, deleted, translated* }`. There is **no `characterId`/`ownerId` anywhere**: not in the
type, not in the `items` table, not in the classifier schemas (`itemUpdateSchema`, `newItemSchema`),
and not in the store helpers (`addItem`, `updateItem`, `applyNarrativeClothingStateChange`,
`exposeClothingZone`, `repairClothingItem`).

`ClothingPanel.svelte` filters `location === 'inventory' && equipped` campaign-wide;
`InventoryPanel.svelte` has no per-character grouping at all. `DEFAULT_ZONES` = torso, chest, hips,
legs, arms, hands, feet.

> Per-character item ownership is therefore a **required foundation** for the party system, not an
> optional enhancement.

### 2.3 Critical finding B — the single protagonist is deeply baked in

- Marker: `Character.relationship === 'self'` (a free-form `string | null`, no union type).
- `src/lib/stores/story.svelte.ts`: `get protagonist()` (~line 288); `setProtagonist(newCharacterId,
  previousRelationshipLabel)` (~2526) enforces exactly one by relabeling the outgoing character;
  `addCharacter({ makeProtagonist })` (~1860) refuses a second.
- `src/lib/services/context/context-builder.ts` (~line 64) injects `protagonistName` and
  `protagonistDescription` into **every** prompt.
- `src/lib/services/prompts/templates/narrative.ts` is POV-conditional. Second person: "Use
  you/your for the protagonist"; third: "Refer to the protagonist as `{{ protagonistName }}` or
  they/them". Core guardrail is singular: *"Writing any actions, dialogue, thoughts, or decisions
  for the player, `{{ protagonistName }}`"*.
- `src/lib/services/prompts/templates/wizard.ts` has a `protagonist-generation` template, and the
  opening-scene template carries five rules all phrased *"NEVER write what
  `{{ protagonistName }}` does/says/thinks/perceives"*.
- `src/lib/services/prompts/templates/generation.ts` (action choices): *"The USER is playing as
  `{{ protagonistName }}` … it IS the user, not a separate NPC"*, and `{{ protagonistName }}'s
  Inventory`.
- `ActionChoicesService` (~50) builds its NPC list as
  `presentCharacters.filter(c => c.relationship !== 'self')`.
- `EntryInjector` (~245) Tier-1 filter is `status === 'active' && relationship !== 'self'`.
- `ImageAnalysisService` carries an `isProtagonist` flag and appends `" (Protagonist)"`.
- `src/lib/services/ai/index.ts` (~398): the classifier tags extracted characters with
  `isProtagonist: relationship === 'self'`.
- `wizard.svelte.ts` (~250) step 4 validation requires `character.protagonist !== null`;
  `characterStore.svelte.ts` has `generateProtagonist()`.
- `CharacterPanel.svelte` shows "Current protagonist: X", with a star action driving a destructive
  `setProtagonist` swap; the relationship field is locked to the "Protagonist" label.
- Related: `VaultScenario.primaryCharacterName`, `VaultScenarioNpc.relationship` (defined relative
  to the protagonist), `PersistentCharacterSnapshot.relationship`, and `ScenarioService`'s
  `povInstruction` ("The reader will be this character…").

> Second-person POV structurally assumes exactly one PC. This must be generalized before a party can
> work, or the DM will be free to puppet the PCs it doesn't consider "the protagonist".

### 2.4 Critical finding C — no turn order exists

Searches for `initiative`, `turn order`, `activeCharacter`, `currentActor`, `spotlight`, and
`whoseTurn` return nothing. There is no notion of whose turn it is, in combat or out.

### 2.5 Rename scope

Roughly 25-30 user-facing "Story" strings, concentrated in `LibraryView.svelte`, `Header.svelte`,
`SettingsModal.svelte`, the wizard steps (`SetupWizard`, `StepImportStyle`, `Step8Opening`,
`StepImportReview`), `NovelImportModal`, `ChapterSourceImportModal`, and the settings tabs
(images / interface / story-settings). Database tables, columns, types, and code identifiers stay
`story*`.

---

## 3. Implementation Plan

### Phase 0 — Terminology and item ownership foundation

1. Rename user-facing copy "story" → "campaign" at the ~25-30 label sites above. Leave the
   `stories` table, `StoryEntry`, `storyId`, and `story.svelte.ts` untouched; record the
   intentional mismatch in repo memory.
2. Migration `041_item_ownership.sql` — add `items.owner_character_id` (FK to `characters`),
   `items.slot_key`, `items.container_item_id`. A NULL owner means the shared party stash, which
   preserves legacy behavior exactly.
3. Extend the `Item` type and `database.ts` accessors, branch/COW-aware via `overrides_id`.
4. `story.svelte.ts` item and clothing helpers gain an owner parameter; the unowned path keeps
   working.
5. Classifier `itemUpdateSchema` / `newItemSchema` gain an `owner` field (character name resolved
   to an id).

### Phase 1 — Dice engine (*parallel with Phase 2*)

6. `src/lib/services/dice/notation.ts` — parser and evaluator for `NdX`, modifiers, `kh`/`kl`,
   `adv`/`dis`, `r<n>` reroll, `!` exploding, and clamps. Pure functions producing an AST plus
   `evaluate(ast, rng)`.
7. `src/lib/services/dice/rng.ts` — crypto-backed RNG plus a seeded xorshift for reproducible,
   auditable campaigns.
8. `src/lib/services/dice/DiceService.ts` —
   `roll({ notation, dc, reason, actorId, visibility })` → `RollResult { id, notation, rolls[],
   total, dc, outcome, margin }`. Outcome bands come from the ruleset's check rules.
9. `src/lib/services/dice/karma.ts` — optional transparent luck bias (fudge dial), off by default,
   applied as a declared modifier and always recorded — never a silent reroll.
10. Migration `042_dice_rolls.sql` — the roll ledger (story_id, branch_id, entry_id, actor_id,
    notation, seed, raw_rolls, total, dc, outcome, margin, reason, roller `dm`/`player`,
    karma_applied, visibility, created_at) plus `getRollStats(storyId)`.
11. Vitest coverage in `src/lib/services/dice/notation.test.ts`.

### Phase 2 — Ruleset entity and abilities (*parallel with Phase 1*)

12. Migration `043_rulesets.sql` — `rulesets`, `ruleset_stats` (attribute/derived/resource),
    `ruleset_skills`, `ruleset_check_rules` (formula, crit bands, DC bands), `ruleset_conditions`,
    `ruleset_slots` (equipment/carry, body_zone), `ruleset_abilities` (kind skill/spell/power/feat,
    cost_resource_key, uses_max, recharge, roll_formula, save_stat_key, dc_formula, range,
    duration, effects, tags, requirements), `ruleset_levels`, and `stories.ruleset_id`.
13. Seed four built-in templates: **d20-Classic**, **Shadowdark-like**, **Narrative-2d6**
    (PbtA-like), and **Freeform-Lite** (a single fortune check, no stats). Existing campaigns
    backfill to Freeform-Lite so nothing changes until the player opts in.
14. Types, branch-aware accessors, and `src/lib/stores/ruleset.svelte.ts`.
15. Migration `044_ruleset_vault.sql` mirroring `character_vault`/`scenario_vault` (including
    tags), plus `rulesetVault.svelte.ts` and JSON import/export for sharing.

### Phase 3 — Party, sheets, and clothing rework (*depends on 0, 2*)

16. Migration `045_party_sheets.sql` — `characters.is_player_character`; `party_members`
    (slot 0-7, active, joined_at); `character_sheets` (ruleset_id, level, xp, stat/skill/resource
    values, conditions, ability_ids, notes); `character_ability_uses`;
    `stories.spotlight_character_id`; `stories.party_size_limit INTEGER DEFAULT 4`.
17. `src/lib/stores/party.svelte.ts` plus branch/COW-aware sheet and party accessors.
18. **Clothing rework** (unblocked by Phase 0):
    - `ClothingPanel.svelte` becomes per-party-member (member selector or stacked cards), with zone
      coverage and durability computed per character.
    - `InventoryPanel.svelte` groups by owner, with a shared "party stash" bucket.
    - `clothingZones` / `clothingMaxDurability` / `clothingRepairAmount` remain campaign defaults,
      with an optional per-ruleset override via `ruleset_slots.body_zone`.
    - Damage and repair helpers resolve the owner and never cross-apply between characters.

### Phase 3b — Protagonist → party generalization (*depends on 3*)

19. **Data model.** `is_player_character` becomes the authoritative marker. Migration backfill sets
    `is_player_character = 1` where `relationship = 'self'`, and that character becomes
    `party_members` slot 0 plus `stories.spotlight_character_id`. `relationship` is retained for
    narrative flavor only and stops meaning "protagonist". Existing solo campaigns become
    one-member parties with zero visible change.
20. **Store — hard removal.** Delete `get protagonist()` entirely (no deprecated alias) and update
    every call site in one pass. Add `get partyMembers()`, `get spotlightCharacter()`,
    `setSpotlight(characterId)`, `addToParty(characterId, slot)`, and
    `removeFromParty(characterId)`. Delete `setProtagonist()`; the `CharacterPanel` star action now
    calls `addToParty`/`setSpotlight`. Drop the "exactly one" enforcement in
    `addCharacter({ makeProtagonist })` in favor of the configurable party cap.
21. **Prompt variables.** `context-builder.ts` stops emitting `protagonistName` and
    `protagonistDescription`, and emits instead: `partyRoster` (name plus a one-line sheet digest
    per member), `partySize`, `spotlightCharacterName`, `playerControlledNames` (comma list), and
    `activeActorName`.
22. **Pack compatibility check** (required by the hard removal). A `PackCompatibilityService` scans
    every pack template for the removed variables and for `relationship == 'self'` Liquid
    conditions. On app start and on pack selection it surfaces a non-blocking warning listing the
    affected templates, with a one-click "apply suggested fix" that rewrites
    `{{ protagonistName }}` → `{{ spotlightCharacterName }}` and singular prohibition blocks →
    `{{ playerControlledNames }}`. Default-pack templates are repaired by the seeding migration, so
    only user-authored packs can warn.
23. **Narrative POV generalization.** New per-campaign setting `partyNarrationMode`:
    - `third_person_named` — every PC referred to by name (**the default**).
    - `spotlight_second` — "you" is the currently spotlit PC (the pre-existing behavior).
    - `collective_second` — "you" is the party as a group.

    Adventure prose now defaults to **third person**, and the wizard warns if first or second
    person is chosen, explaining that those modes address a single character and read poorly with a
    party. Existing campaigns keep whatever POV they already had; the new default applies to new
    campaigns only.
24. **Prompt rewrites** (all in pack templates, none hardcoded). The narrative PROHIBITIONS block
    changes from the singular `{{ protagonistName }}` to iterating `{{ playerControlledNames }}` —
    never write actions, dialogue, thoughts, or decisions for **any** player-controlled character.
    The same generalization applies to the wizard opening-scene rules and the action-choices
    template ("The USER controls: …"). Add a `gm-party-roster` partial.
25. **Service updates.** The `ActionChoicesService` NPC filter and the `EntryInjector` Tier-1 filter
    change from `relationship !== 'self'` to `!isPlayerCharacter`.
    `ImageAnalysisService.isProtagonist` becomes `isPlayerCharacter` + `isSpotlight`. The
    classifier's `isProtagonist` tagging maps to `is_player_character`. Action choices are generated
    **for the active actor**.
26. **Wizard.** Step 4 becomes "Build your party" — 1 to `partySizeLimit` PCs, still requiring at
    least one. `generateProtagonist()` is renamed `generatePartyMember()` and a "generate
    additional member" action is added. Scenario import maps `primaryCharacterName` to party slot 0.
    The POV step defaults to third person and warns on first/second.
27. **UI.** The `CharacterPanel.svelte` star action becomes "Add to party" / "Set spotlight" rather
    than a destructive protagonist swap, and the "Current protagonist: X" line becomes a party
    summary. The forced relabeling of the outgoing protagonist is removed.

### Phase 4 — Turn types and scene modes (*depends on 2, 3*)

28. Two orthogonal, pack-defined, extensible dimensions:
    - **Turn type** — `narration | npc_action | roll_request | action_resolution | qa |
      scene_transition | montage`.
    - **Scene mode** — `overworld_exploration | dungeon_crawl | settlement | camp | combat |
      travel | downtime`, plus user-defined modes.
29. `src/lib/services/turn/TurnDirector.ts` — deterministic forcing: `action_resolution` after a
    pending roll resolves; generation blocked while a roll is outstanding; `npc_action` when the
    turn-order system says a non-PC actor is up. Otherwise the DM self-declares with a leading
    `<turn type="..." scene="..."/>` tag — no extra LLM call, no fixed ordering, and free Q&A or
    exploration between beats.
30. `SceneModeService` — tracks the active mode on the campaign and per entry. The DM changes it via
    a `<scene mode="..."/>` tag or the `set_scene_mode` tool; changes emit a `scene_transition` turn
    so mode shifts are narrated rather than silent.
31. Store `turnType`, `sceneMode`, `activeActor`, and `pendingRoll` in `EntryMetadata` rather than
    widening the `story_entries.type` union — this avoids migrating existing rows.
32. Migration `046_pending_rolls_scene.sql` — the `pending_rolls` table, `stories.scene_mode`, and
    `stories.dice_seed`.

### Phase 5 — Universal turn order and spotlight (*depends on 3b, 4*)

33. One system decides whose turn it is in **every** scene mode; combat initiative is one of its
    modes rather than a separate mechanism.
34. Migration `047_turn_order.sql` — `turn_order` (id, story_id, branch_id, scope
    `campaign`/`encounter`, mode, round, current_index, order JSON of `ActorRef`, created_at) and
    `turn_order_settings` mapping each scene mode key to a default mode plus options.
35. `ActorRef = { kind: 'pc' | 'npc' | 'enemy', id, name }` — one actor abstraction shared by party,
    NPCs, and enemies, so in-combat and out-of-combat use identical plumbing.
36. `src/lib/services/turn/TurnOrderService.ts` — modes:
    - `free` — no enforced order; the player acts as whoever they name (**default; today's
      behavior**).
    - `spotlight` — soft narrative focus; the DM is told who the scene centers on, but the player
      may still act as anyone.
    - `round_robin` — party members rotate in slot order.
    - `initiative` — rolled order using the ruleset's initiative formula, including enemies.
    - `dm_directed` — the DM picks the next actor via tool.

    API: `getActiveActor()`, `advance()`, `setActiveActor()`, `insertActor()`, `removeActor()`,
    `rebuild(mode)`, `beginEncounterOrder()`, `restorePreviousOrder()`.
37. Per-scene-mode defaults, all user-overridable in settings: combat → `initiative`; dungeon crawl
    → `round_robin`; travel and overworld → `spotlight`; settlement, camp, and downtime → `free`. A
    campaign-wide `turnOrderMode` provides the fallback, and `free` everywhere reproduces the
    current app exactly.
38. Prompt integration — `activeActorName`, `turnOrderMode`, and `upcomingActors` are added to
    `ContextBuilder`, and a `gm-turn-order` pack partial instructs the DM to address the active
    actor and to stop after that actor's beat when the mode is enforced.
39. Tools added to `mechanics.ts`: `set_active_actor`, `advance_turn`, `set_turn_order_mode`,
    `insert_actor`, `remove_actor`.
40. UI — `TurnOrderStrip.svelte` (portrait row, active actor highlighted, round counter, drag to
    reorder; works in and out of combat); `ActionInput.svelte` shows "Acting as: X" with a picker
    (disabled when the mode enforces order) and an "end turn" affordance.
41. Roll requests, mechanics tool calls, and action choices are all attributed to the active actor,
    so a roll card knows which PC's sheet to use.

### Phase 6 — Prompt pack expansion (no hardcoded prompts)

42. Migration `048_gm_pack_templates.sql` — a data migration in the style of `020`, seeding a
    layered, composable template set:
    - `gm-core-persona` — the always-on expert DM and storyteller identity plus the dice contract
      (never invent a number; emit `<roll/>` and wait).
    - `gm-world-charter`, `gm-ruleset-digest` (auto-generated mechanical summary),
      `gm-content-intensity`, `gm-party-roster`, `gm-turn-order`.
    - Turn templates: `gm-turn-narration`, `-npc-action`, `-roll-request`, `-action-resolution`,
      `-qa`, `-scene-transition`, `-montage`.
    - Scene partials, each with its own pacing, length, and detail guidance:
      `gm-scene-overworld-exploration` (travel time, encounter checks, landmark discovery),
      `gm-scene-dungeon-crawl` (room by room, light and resource tracking, traps, hazard checks),
      `gm-scene-settlement` (dialogue-forward, low dice, shops, rumors, factions),
      `gm-scene-camp` (downtime roleplay, rest, bonding, watch order),
      `gm-scene-combat` (short beats, one action at a time, roll-heavy),
      `gm-scene-travel`, `gm-scene-downtime`.
    - Support: `gm-rules-validator`, `gm-session-recap`, `gm-npc-morale`.
43. New `ContextBuilder` variables: `sceneMode`, `turnType`, `activeActorName`, `turnOrderMode`,
    `upcomingActors`, `rulesetDigest`, `partyRoster`, `partySize`, `playerControlledNames`,
    `spotlightCharacterName`, `pendingRoll`, `recentRolls`, `worldCharter`, `nsfwIntensity`,
    `activeThreads`.
44. A new `pack_scene_modes` table lets users add their own scene modes and partials with no code
    change; the pack editor gains a per-template "reset to default".
45. Migrate the hardcoded `INLINE_IMAGE_INSTRUCTIONS` and `VISUAL_PROSE_INSTRUCTIONS` constants out
    of `NarrativeService.ts` into pack templates.

### Phase 7 — Inline roll tags mid-stream (*depends on 1, 4, 6*)

46. `src/lib/utils/inlineRollParser.ts` — mirrors `inlineImageParser.ts`; handles `<roll/>`,
    `<turn/>`, `<scene/>`, and `<actor/>`, including partial-tag detection during streaming.
47. `NarrativePhase.ts` — replace the single-pass consume loop with a **stream-interrupt loop**: on
    a complete `<roll/>`, abort the stream, resolve locally via `DiceService`, persist, emit
    `dice_rolled` so the UI can animate it inline, then re-issue generation as a **continuation**
    (same system prompt, prior assistant text prefilled, plus a `<roll_result>` block). Capped per
    turn by `maxRollContinuationsPerTurn`.
48. The `GenerationEvent` union gains `dice_rolled`, `roll_requested`, `turn_type`,
    `scene_changed`, and `actor_changed`.
49. Anti-tamper guardrail: numbers are **never** parsed from model prose — the tag only *requests* a
    roll, and the app is the sole source of the result. This requires an explicit guardrail comment
    at the interception point.

### Phase 8 — Mechanics tool phase (*parallel with 7*)

50. `src/lib/services/ai/sdk/tools/mechanics.ts` — `roll_dice`, `request_player_roll`,
    `adjust_resource`, `apply_condition`, `remove_condition`, `spend_ability_use`, `grant_xp`,
    `award_item` (with owner), `remove_item`, `equip_item`, `transfer_item`, `damage_clothing`
    (owner-scoped), `adjust_money`, `advance_time`, `set_scene_mode`, `set_active_actor`,
    `advance_turn`, `update_quest_thread`, `roll_on_table`, `finish_mechanics` (terminal).
51. `MechanicsService` — a `BaseAIService` subclass using `createAgentFromPreset` plus
    `stopOnTerminalTool`, mirroring `LoreManagementService`.
52. `MechanicsPhase.ts` — runs parallel to classification. Mechanics owns *numbers*; the classifier
    keeps owning soft world state. Numeric classifier fields are disabled when a non-Freeform
    ruleset is bound, to avoid double writes.
53. `src/lib/services/rules/encumbrance.ts` — per-character slot and carry enforcement consulted by
    `award_item`, `equip_item`, and `transfer_item`; rejections are returned as reasons the DM must
    narrate around.
54. Invariants enforced in code rather than prompt: resource clamps, no negative money, ability-use
    floor, slot capacity, owner integrity, and party size within `partySizeLimit` (max 8). Plus the
    standing hard content bans (no compelled sexual acts, no consent override) enforced **at every
    intensity level including maximum**, each with an explicit guardrail comment. Ruleset and
    ability authoring must not be able to create an ability that bypasses them.

### Phase 9 — Content intensity slider

55. Migration `049_content_intensity.sql` — `stories.nsfw_intensity INTEGER DEFAULT 0` plus a global
    default in settings, backfilled from any existing NSFW-ish toggles.
56. Levels 0-4: **Off**, **Fade-to-black**, **Suggestive**, **Explicit**, **Adult-focused** (at 4,
    adult content drives scene framing rather than being incidental).
57. Rendered into the prompt exclusively via the `gm-content-intensity` pack template. The level
    also modulates clothing-damage frequency, whether camp and settlement scenes lean romantic, and
    image-generation prompt tone.
58. UI: a slider in campaign settings with a plain-language description per level, plus an immutable
    note listing the hard bans that apply at every level.

### Phase 10 — Roll and party UI (*depends on 3b, 5, 7*)

59. `RollCard.svelte` — actor (from turn order), notation, DC (or hidden per `showDcToPlayer`),
    governing skill or ability, an animated Roll button, and a manual-entry override.
60. `DiceRollInline.svelte` — DM rolls rendered in place of the tag, like inline images.
61. `PartyPanel.svelte` — PC cards up to `partySizeLimit` (scrolling or wrapping beyond 4): portrait,
    resource bars, conditions, quick stat block, spotlight/active indicator.
62. `CharacterSheet.svelte` — a ruleset-driven dynamic renderer with zero hardcoded fields.
63. `DiceLogPanel.svelte` — roll history plus a statistics dashboard (d20 distribution, crit counts,
    per-character success rate) so fairness is provable to the player.
64. `TurnOrderStrip.svelte` wired into `AppShell.svelte` alongside the existing world panels.
65. `ActionInput.svelte` — block free-text submission while a roll is awaiting, and add a scene-mode
    indicator with override plus the "Acting as" actor picker.

### Phase 11 — Ruleset and abilities authoring

66. `RulesetEditor.svelte` — CRUD for stats, skills, check rules, conditions, slots, abilities, and
    levels, plus the initiative formula used by turn order.
67. `createRulesetTools` and `RulesetAssistantService` — an interview-driven agentic assistant using
    the `InteractiveVaultService` `load_toolset` pattern and the `vaultEditorStore` approval
    workflow.
68. Migration `050_entry_ability_link.sql` — `entries.ability_id`. An injected ability-linked
    lorebook entry carries its mechanical block verbatim, so the DM follows codified rules.

### Phase 12 — World charter (pre-campaign worldbuilding)

69. Migration `051_world_charters.sql` — tone, genre, content boundaries, magic/tech level, power
    scale, factions summary, calendar, deities, themes, hard limits, `ruleset_id` plus rationale,
    default scene mode, and default party size.
70. `WorldbuildingAssistantService` and `createWorldbuildingTools` — an interview-driven assistant
    producing the charter, seed lorebook entries (factions, regions, pantheon), a starting ruleset,
    and a session-zero summary. It can pull from the existing Fandom tools.
71. `WorldCharterPanel.svelte` plus a wizard step so a charter exists before the first adventure.
    Existing campaigns get an optional "generate charter from existing lore" action.

### Phase 13 — Secret GM planning

72. Migration `052_campaign_threads.sql` — `campaign_threads` (title, kind main/side/personal/
    faction, status, visibility_scope, summary_player_safe, summary_director_only), `thread_beats`
    (order_index, title, trigger_condition, director_notes, visibility_scope, status,
    resolved_entry_id), and `campaign_clocks` (progress clocks / fronts).
73. Reuse `EpistemicVisibilityScope` and `DisclosureGateService`; extend `gateNarrative` inputs with
    director-only beats so planned twists cannot leak early.
74. `GMScreen.svelte` — a director-only panel (threads, beats, clocks, secret notes, encounter
    drafts) behind a GM-view toggle, excluded from exports by default.
75. Extend `InteractiveDirectorAssistantService` with thread, beat, and clock tools.
    `QuestPanel.svelte` shows only `player_safe` scope.

### Phase 14 — Encounters (built on Phase 5, not a parallel system)

76. Migration `053_encounters.sql` — `encounters` (status, round, turn_order_id) and `combatants`
    (character_id or NPC name, initiative, hp, max_hp, conditions, side, morale). Leave room for
    optional position fields so grid tactics can be added later without a rewrite.
77. Encounters **reuse `TurnOrderService`** in `initiative` mode with `scope='encounter'`; ending an
    encounter calls `restorePreviousOrder()`.
78. `src/lib/services/rules/initiative.ts` — initiative formula evaluation from the ruleset, plus
    defeat detection.
79. Tools: `start_encounter`, `roll_initiative`, `end_encounter`, `damage_combatant`, `roll_morale`,
    `roll_reaction`. Turn advancement reuses `advance_turn`.
80. `EncounterTracker.svelte` — HP bars, condition chips, and sides; turn order comes from
    `TurnOrderStrip`.
81. Starting an encounter auto-switches the scene mode to `combat` and restores the prior mode on
    end.

### Phase 15 — Progression, rest, tables, recap, validator

82. Level-up: `grant_xp` and `level_up` tools honoring `ruleset_levels`, plus a level-up review UI
    where the player approves choices.
83. Rest and recovery: `short_rest` and `long_rest` tools honoring `ruleset_abilities.recharge` and
    resource-regain formulas, integrated with the existing time tracker and the `camp` scene mode,
    applied to every party member.
84. Migration `054_random_tables.sql` — `random_tables` and `random_table_entries`, a `roll_on_table`
    tool, and an editor UI. Powers loot, wandering encounters, rumors, weather, and the DM's
    random-chance needs. Scene modes can declare a default encounter table.
85. **Rules-lawyer validator** — `RulesValidatorService` runs a cheap model over the narration
    against the ruleset digest and the turn's roll ledger, flagging contradictions such as narrating
    a success on a failed roll. It hooks in at the same pre-display point as the disclosure gate and
    is configurable to warn-only or auto-regenerate.
86. **Session recap** — `RecapService` renders `gm-session-recap` from chapter summaries, resolved
    thread beats, and notable rolls; shown on campaign resume.
87. **Downtime / montage turn** — compress long spans using `gm-turn-montage` plus table rolls.

---

## 4. Cross-Cutting Concerns

- **No feature flag.** Safety comes from backfilled defaults: the Freeform-Lite ruleset,
  `nsfw_intensity = 0`, `dice_enforcement = 'dm_only'`, `turn_order_mode = 'free'`, legacy items
  unowned in the shared stash, and the old protagonist as a one-member party. Existing campaigns
  must play identically until the player opts in.
- **Per-campaign settings** (`StorySettings`): `rulesetId`, `sceneMode`, `diceEnforcementMode`
  (`off`/`dm_only`/`full`), `allowManualRollEntry`, `showDcToPlayer`,
  `maxRollContinuationsPerTurn`, `encumbranceEnabled`, `turnOrderMode`, `turnOrderBySceneMode`,
  `partyNarrationMode`, `partySizeLimit` (default 4, max 8), `karmaBias`, `rulesValidatorMode`,
  `nsfwIntensity`, `gmViewUnlocked`, `diceSeed`.
- **Party size**: the default cap is 4; raising it up to 8 in settings shows a context-cost warning,
  since every additional PC adds a sheet digest to every prompt.
- **Prompt discipline**: all prompt text lives in pack templates, never in a `.ts` constant.
- **Branching**: every new campaign-scoped table needs `branch_id` and copy-on-write handling
  consistent with `getCharactersForBranch` (`overrides_id`, `deleted` tombstones).
- **Checkpoints**: extend snapshots to include sheets, party, spotlight, turn order, item ownership,
  pending rolls, encounters, threads, clocks, and scene mode (migrations 009 and 013 show how
  snapshot columns were added previously).
- **Migration safety**: run `scripts/check_migrations.js`; every migration needs a working `down`.

---

## 5. On the Radar (not planned now)

- **Battle maps / grid tactical movement** — the Phase 14 encounter and combatant schema leaves
  room for optional position fields so this can be added without a rewrite.
- **Licensed SRD ingestion** — the Phase 2 ruleset import/export JSON format should be designed as a
  plausible SRD import target (stable keys, no app-internal ids required).

---

## 6. Verification

1. `npx svelte-check --tsconfig ./tsconfig.json` stays error-free (only pre-existing a11y warnings);
   `npm run build` passes.
2. `npx vitest run src/lib/services/dice` — `2d6+3`, `4d6kh3`, `1d20adv`, `1d20dis`, `2d6!`, bounds
   and error cases, plus seeded reproducibility.
3. Unit tests: `TurnDirector` transitions (forced resolution, forced combat turn);
   `TurnOrderService` across all five modes, including actor insert/remove mid-round and encounter
   order save/restore; scene-mode transitions; encumbrance rejection; owner integrity on transfer;
   mechanics guardrails (resource clamp, negative money, ability-use floor); content hard bans at
   intensity 4.
4. `node scripts/check_migrations.js`, then apply migrations 041-054 to a **copy of a real existing
   database** and confirm the backfills (Freeform-Lite, protagonist → party slot 0 plus spotlight,
   unowned items, `free` turn order) leave the campaign playable and unchanged.
5. **Play test A** (legacy solo campaign): confirm no visible change — one-member party,
   second-person POV intact, no turn-order UI pressure — then bind d20-Classic and confirm dice come
   online.
6. **Play test B** (new campaign): charter → ruleset → 3-PC party → dungeon crawl with round-robin
   order → inline DM roll → roll request routed to the correct PC's sheet → combat auto-switch to
   initiative including enemies → encounter ends and the previous order is restored → settlement
   (free order) → camp and long rest for all members.
7. Party prompt test: confirm the DM never writes actions for **any** player-controlled character,
   and that a new campaign defaults to third person while an existing second-person campaign is
   untouched.
8. Pack-compatibility test: author a custom pack still using `{{ protagonistName }}`, confirm the
   warning fires, and confirm the one-click fix rewrites it correctly. Also confirm via `grep` that
   zero references to `story.protagonist` or `setProtagonist` remain.
9. Party-cap test: raise `partySizeLimit` to 8, add 8 PCs, confirm the mechanics guard rejects a
   ninth, and confirm `PartyPanel` and `TurnOrderStrip` render sanely at 8.
10. Clothing test: two party members each with their own equipped clothing; damage one and confirm
    the other's items and zone coverage are untouched and displayed separately.
11. Disclosure-gate test: director-only thread beats never surface in player panels or narration.
12. Validator test: force a narration that contradicts a failed roll and confirm it is flagged.

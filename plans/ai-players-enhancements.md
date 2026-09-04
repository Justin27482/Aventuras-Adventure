# AI Players Mode — Multi-Agent Campaign Extension

Version: 1.0 (Architecture & Vision)
Date: 2026-08-28
Status: Design locked; global AI Player library, campaign wizard assignment, and proposal review UI implemented; current-UI manual QA pending

Database migration observability is part of the implementation foundation. Advanced Settings exposes
an applied-migration log with status, execution metadata, affected objects, checksums, and the full
bundled SQL text for each migration, making schema drift and failed upgrades diagnosable in-app.
The log also provides a manual comparison that reports migration source files missing from the
database's applied ledger.

The pre-campaign Worldbuilding Assistant also persists its structured draft, charter text, and
assistant conversation so worldbuilding work can be resumed after an app restart or reviewed later.
Pasted World Charters can populate the structured fields, and the campaign wizard can generate a
portrait-ready character description from the current character and setting context.
When a gap is found, it offers a guarded one-at-a-time installation attempt for only the next
migration in sequence. The attempt is transactional and explains prerequisite, schema, SQL, ledger,
or checksum failures without silently installing later migrations out of order. Comment-only marker
migrations are recorded without rerunning SQL, and transient SQLite locks are retried before a
failure is reported. Marker repair uses the normal serialized database write queue and avoids an
unnecessary `BEGIN IMMEDIATE`, which is important when the migration plugin has another connection
open while the schema changes have already been materialized by the application initializer.

This document describes a new campaign mode for the Campaign Engine: **Human GM with AI-controlled players**. The system extends the existing architecture with persistent AI Player entities, multi-agent orchestration, hierarchical knowledge separation, and a critical session-zero group-building phase.

This is a **new mode**, not a replacement. Existing campaign and companion systems are unaffected.

AI Players are global reusable entities. They are created and maintained in a library outside any
campaign, then assigned to one or more campaigns through campaign-bound Player Character records.
The same AI Player may participate in multiple campaigns with different Characters and campaign
specific relationship or roleplay context.

---

## 1. Product decision: AI Players mode

### 1.1 Executive summary

We are adding a new campaign mode where:
- **Human runs as GM**: Makes final story arbitration decisions
- **4-5 AI agents run as players**: Each controls one character with persistent personality across campaigns
- **Multi-agent coordination**: AI players discuss actions before committing (rate-limited, GM-interruptible)
- **Hierarchical secrets**: Player-level (OOC) and character-level (IC) knowledge are separate
- **Session zero**: Critical group-building phase establishes inter-player relationships before play

The mode flip is fundamental: **GM arbitrates outcomes** (not AI GM generating prose), with optional narrative helper for quality polish.

### 1.2 Strategic decision

| Topic | Decision |
| --- | --- |
| Mode scope | New opt-in AI Players mode for campaigns; existing campaigns unchanged |
| Player entity | Global reusable AI Player library; one AI Player may be assigned to multiple campaigns through campaign-bound Player Characters |
| Personality | Structured data (traits, motivation, playstyle) + dynamic prompt rendering |
| Control model | Fully autonomous AI players; optional GM override (future feature) |
| Interaction | Full multi-agent pre-narration consensus (rate-limited, GM-interruptible OOC chat) |
| Knowledge | Hierarchical (player-level OOC + character-level IC); secrets gated per player |
| Session zero | Critical; builds inter-player relationships, group dynamics, party chemistry upfront |
| Narrative | GM writes summary → optional LLM polish (not auto-generation) |
| Scene-aware | Abilities tagged by relevance; only scene-appropriate options offered to AI players |
| Pre-rolled | Encounters and loot pre-rolled at session start; GM picks from menu |

---

## 2. Product vision

We are building a **dedicated AI player table simulator** where a human GM runs campaigns against 4-5 AI agents who behave like human TTRPG players: they have distinct personalities, negotiate with each other, keep secrets, pursue personal goals, and roleplay characters within a shared party.

The player (now GM) experience should feel like:
- Running a TTRPG session with a party of distinct, opinionated AI agents
- Having each AI player propose actions independently, then negotiate before committing
- Making final arbitration decisions (rolls, narration outcomes)
- Optionally polishing narration without writing everything from scratch
- Building inter-player relationships and group chemistry before play starts
- Managing secrets at both player and character levels

This is **not** an AI GM mode with autonomous companions. It's a **Human GM vs. AI Players** table simulation.

---

## 3. What this mode does

The AI Players mode introduces:

- **AI Player entity**: Persistent personality across campaigns; owns motivations, playstyle, voice, relationships to other AI players
- **Global AI Player library**: Create, edit, inspect, select, and reuse AI Players across campaigns from the start
- **Player Character**: Campaign-bound; links one AI Player to one Character in a specific campaign
- **Multi-agent proposal generation**: 4 AI players independently propose actions; optionally discuss before narration
- **Rate-limited OOC chat**: 1-2 seconds between messages; max 30 seconds total; GM can interrupt anytime
- **Narrative Helper**: GM writes summary → LLM expands into prose (optional; GM can write raw)
- **Scene-selective rules**: Abilities tagged by relevance; only offered in appropriate scenes
- **Pre-rolled encounters/loot**: Generated at session start; GM picks from menu instead of rolling mid-turn, GM can opt to roll a new encounter or loot item mid-turn if they don't like the menu options
- **Hierarchical secrets**: Player-level (OOC, visible in player chats) + character-level (IC, gated by character knowledge, players will manage how they handle character gated knowledge)
- **Session zero screen**: 5-phase group-building interactive multi agent chat flow (introductions, campaign premises, character creation, party bonding, establish secrets)
- **Scoped interactions in every session**: Human GM can initiate a full-table, selected-player subset, or private 1:1 interaction during session zero or normal play; excluded players receive neither the exchange nor its private context

---

## 4. What this mode does NOT do (v1 scope)

The initial release intentionally excludes:

- Migration of existing campaigns to AI Players mode (new campaigns only)
- GM override/approval of AI player decisions (future feature)
- Cross-user marketplace or network sharing of AI Players (future feature; local global reuse is launch scope)
- Behavioral consistency enforcement over 50+ session arcs (future; mitigation = personality re-encoding)
- Text-marker parsing as alternative to mechanics tools (keep function calls; more auditable)
- Behavioral drift detection or personality refresh (future research)

---

## 5. Core architecture principles

### 5.1 Player ≠ Character

An **AI Player** is a persistent entity:
- Name, personality traits (motivation, playstyle, risk tolerance, humor, decision speed)
- Reusable system prompt profile
- Relationships to other AI players (dynamic, history, friction level)
- Survives across multiple campaigns
- Not bound to a specific ruleset or world

A **Player Character** is campaign-specific:
- Owned by one AI Player for one campaign
- Can differ per campaign (same AI player might be a rogue in one campaign, a wizard in another)
- Stores campaign-specific roleplay notes, secrets, relationship tweaks

A **Character** is the existing entity:
- Stats, inventory, relationships to NPCs (unchanged)
- Links to `player_characters` table when AI-controlled

### 5.2 Global AI Player library

AI Players are global, reusable profiles and must not be stored as campaign-owned records. The
library is available before campaign creation and supports:

- creating a new AI Player profile
- editing personality, voice, motivations, relationships, and red lines
- browsing and selecting existing profiles during campaign setup
- assigning one profile to different campaigns without copying or mutating its base identity
- using different Characters, roleplay notes, and campaign-specific relationship overrides per assignment
- preserving the base profile when a campaign ends or an assignment is removed

Campaign-specific changes belong on the Player Character assignment or campaign relationship
records. They must not silently rewrite the global profile. Cross-user sharing, publishing, and
marketplace discovery are outside the initial release; reuse by the local user across campaigns is
required from the start.

### 5.3 Hierarchical Knowledge

| Level | Visibility | Ownership | Examples |
|-------|------------|-----------|----------|
| **Player-Level (OOC)** | Visible to both AI players in that relationship | AI Player | "Player 2 is the campaign villain"; inter-player history; party meta-coordination |
| **Character-Level (IC)** | Visible to character's IC knowledge; gated by experience | Character | Quest objectives, NPC dispositions, item locations, personal backstory |

**Gating mechanism**: Extend `DisclosureGateService` to support `visibility_scope = 'specific_ai_player' | 'all_ai_players'`.

### 5.4 Rate-Limited Agency

AI players operate **independently but not at machine speed**:
- Each OOC message has a 1-2 second delay (human-readable pace)
- Max 3 exchanges per proposal-review phase
- 30-second total timeout per phase (auto-lock if stalled)
- GM can interrupt/force-lock anytime

### 5.5 GM Arbitration, Not AI Generation

The fundamental mode flip:
```
AI Player: "I cast fireball at the goblin"
  ↓
GM: "Roll vs. DC 12. [Roll happens: success, 15 damage]"
  ↓
GM writes summary: "Goblin engulfed, reeling back, bleeding"
  ↓
[OPTIONAL] Narrative Helper expands: "The creature staggers as flames sear its hide..."
  ↓
StoryEntry (GM-authoritative, optionally polished)
```

GM stays in control. Helper is optional quality-of-life.

### 5.6 Reusable Personality

AI Player personality is:
- Authored once in structured data (`basePersonality` JSON)
- Rendered dynamically per turn (base + character context + relationships + knowledge + scene + goal)
- Persistent but malleable (campaign tweaks in `player_characters.interPlayerRelationshipOverrides`)
- Never "learned" from gameplay (no drift without explicit re-encoding)

---

## 6. Data model

### Layer 1: AI Player (Persistent Cross-Campaign)

```
ai_players
  id: UUID
  name: string (e.g., "The Tactical Mage")
  basePersonality: JSON
    core_motivation: string
    primary_playstyle: 'tactical' | 'roleplay' | 'social' | 'hybrid'
    risk_tolerance: 0-10
    humor_style: string
    decision_speed: 'cautious' | 'balanced' | 'impulsive'
    combat_approach: string
    social_priorities: [string]
    red_lines: [string]
    relationships: { aiPlayerId: { dynamic, history, friction } }
  basePromptProfile: string
  createdAt: timestamp
  updatedAt: timestamp
```

`ai_players` is global and has no `campaignId`. Reuse is represented by multiple
`player_characters` assignments. Deleting or ending one assignment must not delete or reset the
global AI Player profile.

### Layer 2: Player Character (Campaign-Bound)

```
player_characters
  id: UUID
  campaignId: FK campaigns.id
  aiPlayerId: FK ai_players.id
  characterId: FK characters.id
  roleplayNotes: string (IC personality quirks, accent, catch-phrases)
  characterSecrets: JSON array
    - { secretType, visibility_scope, content, knownByAIPlayers: [] }
  interPlayerRelationshipOverrides: JSON
    - { targetAIPlayerId, dynamic_note, tension_level }
  joinedAt: timestamp
  leftAt: timestamp | null
```

### Layer 3: Character (Existing, Enhanced)

No schema changes. Characters already have stats, inventory, descriptions. Just link via `player_characters` to mark as AI-controlled.

### Related Tables (New)

```
ai_player_relationships
  id: UUID
  aiPlayerId1: FK ai_players.id
  aiPlayerId2: FK ai_players.id
  dynamic: string (e.g., "frienemy", "trusted ally")
  history: string
  friction: 0-10
  createdAt: timestamp
  updatedAt: timestamp

player_level_secrets
  id: UUID
  campaignId: FK campaigns.id
  targetAIPlayerId: FK ai_players.id
  secretContent: string
  revealedToAIPlayerIds: [UUID]
  visibility_scope: 'specific_ai_player' | 'all_ai_players'
  createdAt: timestamp
  updatedAt: timestamp

session_prerolls
  id: UUID
  sessionId: FK campaign_sessions.id
  prerollType: 'encounter' | 'loot'
  prerolledData: JSON
  usedAt: timestamp | null
  createdAt: timestamp
```

```
ai_player_interactions
  id: UUID
  campaignId: FK campaigns.id
  sessionId: FK campaign_sessions.id
  audienceScope: JSON (`full_table` | `player_subset` | `private_player`)
  interactionType: 'ooc' | 'ic' | 'gm_private'
  transcript: JSON
  disclosedAt: timestamp | null
  createdAt: timestamp
```

Normal sessions may contain scenes that involve the entire table, only a subset of AI Players, or
one AI Player privately with the GM. Every interaction has an explicit audience scope:

```typescript
type InteractionAudience =
  | { kind: 'full_table' }
  | { kind: 'player_subset'; aiPlayerIds: string[] }
  | { kind: 'private_player'; aiPlayerId: string }
```

The audience scope is applied before prompt construction. Only included AI Players receive the
interaction transcript, private GM instructions, or context derived from the exchange. Public
scene consequences may be narrated later to the full table by the GM, but private source context
is never backfilled into another player's prompt unless the GM explicitly shares it through a
disclosure action. The same scope rules apply to OOC coordination, IC side scenes, secret
objectives, and normal-session 1:1 conversations.

---

## 7. Turn flow: Decision → Consensus → Narration

```
1. GM narrates scene
   ↓
2. GM selects interaction audience (full table, player subset, or private 1:1)
  ↓
3. Context Injection (parallel):
   Each AI player receives:
   - Public scene context (what everyone sees)
  - Only the scoped interaction transcript and player-level secrets permitted for that player
   - Character-level secrets (IC, gated by character's experience)
   - Recent rolls/actions
   ↓
4. Proposal Generation (parallel for included players):
   Each AI player independently generates:
   - IC action/dialogue proposal
   - OOC reasoning (why they chose this)
   - Confidence (1-10)
   ↓
5. Pre-Narration Consensus (rate-limited within the selected audience):
   AI players can question/coordinate:
   - 1-3 exchanges max
   - 1-2 seconds between messages
   - 30 seconds total timeout
   - GM can interrupt/force-lock anytime
   ↓
6. Narration (GM-Authoritative):
   GM reviews/edits proposals, writes summary
   [Optional] Narrative Helper expands summary into prose
   GM accepts and commits
   ↓
7. Mechanics Phase:
   Existing: resolve rolls, apply state changes, update ledger
```

---

## 8. Narrative Helper Service

**Purpose**: GM writes summary → optional LLM polish (not auto-generation).

```typescript
interface NarrativeHelperRequest {
  gmSummary: string              // "Goblin hit hard, falls back to column"
  sceneMode: SceneMode           // combat | dungeon | social | etc.
  recentActions: StoryEntry[]    // context
  characters: Character[]        // involved actors
  tone: 'dramatic' | 'gritty' | 'comedic'
  nsfwIntensity?: number
  maxTokens?: number
}

interface NarrativeHelperResult {
  polishedNarration: string
  confidence: 0-1
}
```

**UI Pattern**:
- Two tabs: "Raw" (GM types directly) | "Summary & Polish" (GM summary → AI expands)
- Preview with edit/regenerate/accept controls
- All text logged with attribution (GM summary + LLM output)

---

## 9. Scene-Selective Rule Loading

**Problem**: AI players in a tavern scene see "Fireball, Sword Attack, Healing Spell" — too much noise.

**Solution**: Tag each ruleset ability with `sceneRelevance: ['combat', 'social', 'dungeon', ...]`. Only offer relevant abilities in AI player's prompt.

```typescript
// PersonalityService.generateProposal():
const sceneRelevantAbilities = ruleset.abilities
  .filter(ability => ability.sceneRelevance.includes(sceneMode))

// Prompt includes: "In this social scene, consider: Persuasion, Deception, Insight..."
// Excludes: "Fireball, Sword Attack, Healing Spell"
```

**Benefit**: Proposals stay contextually grounded; reduces "random combat spell in negotiation" problem.

---

## 10. Pre-Rolled Encounters & Loot

**Session Start**:
```
Pre-roll 15 encounters for this scene mode
Pre-roll 5-10 loot drops (expected enemy count)
Store in campaign.session.prerolledEncounters / prerolledLoot
```

**During Turn**:
- Instead of: "Generate an encounter"
- Show: "Pick from: [1. Goblin bandits, 2. Lost merchant, 3. Bridge troll, ...]"
- Instead of rolling loot on-the-fly, GM picks from pre-rolled menu
- GM may choose "Roll new" during the turn when the menu is unsuitable; the new result is persisted
  with the same audit and usage metadata as a pre-rolled result

**Benefit**: Speeds turn flow; eliminates mid-turn LLM latency.

---

## 11. Session Zero: Inter-Player Group Building

**Purpose**: Establish inter-player relationships, group dynamics, party chemistry **before** first in-game turn.

**5 Phases**:

1. **AI Player Introductions**
   - GM reads each AI Player's base personality
   - Each player generates a 2-3 minute intro monologue
   - Brief GM + AI players OOC chat to establish tone

2. **Campaign Premises & Constraints**
   - GM describes world, tone, ruleset, intensity level
   - AI players ask clarifying questions (power scale, party dynamic, campaign length)

3. **Character Creation (Collaborative)**
   - Each AI player proposes a character concept
   - GM approves or suggests tweaks
   - Characters built with ruleset stats/equipment

4. **Party Bonding Scene (Rate-Limited IC Dialogue)**
   - GM describes a "campfire scene" — players meet for first time
   - Each AI player generates brief IC introduction
   - 2-3 exchanges of dialogue (1-2 sec delays)
   - GM captures relationship notes

5. **Establish Inter-Player Secrets and Private Context**
   - For each AI player pair, GM optionally injects a player-level secret:
     - "You two met in another life"
     - "You're secretly rivals for the same person's affection"
     - "You suspect one is a spy"
   - Secrets stored as `player_level_secrets`; visible in OOC chats
   - GM may initiate a private 1:1 or selected-player subset interaction with any AI Players
   - Private interaction context remains gated from excluded AI Players and is stored as
     player-level secret context for the included AI Players
   - AI Players may manage how they use character-gated knowledge; receiving IC knowledge does not
     automatically reveal it to other players or force disclosure

**Outcome**: Relationships recorded in `player_characters.interPlayerRelationshipOverrides` and `player_level_secrets`. Party starts with established group dynamics. The same scoped interaction system remains available after session zero for side scenes and private GM conversations.

---

## 12. Feature comparison: Aventuras vs. AiChatTrpg

| Feature | Priority | Aventuras | AiChatTrpg | Adoption |
|---------|----------|-----------|-----------|----------|
| **Scene-Selective Rules** | HIGH | ❌ Missing | ✓ Has it | Tag abilities; filter in proposals |
| **Pre-Rolled Encounters** | HIGH | ⚠️ Partial | ✓ Has it | Pre-roll at session start; GM picks menu or rolls new mid-turn |
| **Pre-Rolled Loot** | MEDIUM | ⚠️ Partial | ✓ Has it | Pre-roll 5-10 drops; GM picks |
| **NPC Memory Compression** | MEDIUM | N/A | ✓ Has it | Future: compress old interactions → summaries |
| **Scene-Aware Context** | MEDIUM | ✓ Partial | ✓ Has it | Extend per-scene-mode filtering |
| **Text-Marker Parsing** | LOW | ✓ Skip | ✓ Has it | Keep tools; more auditable |
| **Dual Memory** | LOW | ✓ Partial | ✓ Has it | Already manage via entries + metadata |
| **Reusable AI Player Library** | HIGH | ❌ Missing | Partial | Global local library required at launch; sharing marketplace deferred |

---

## 13. Hard safety guardrails

The AI Players mode inherits all existing safety constraints:

- **Content intensity slider** (0-8, affects narration/image tone, not mechanics)
- **Hard bans apply everywhere** (including AI player proposals)
- **All guardrails explicit** (comments at enforcement points)

New guardrails for AI players:
- AI player proposals cannot override party safety settings
- Relationship secrets cannot include coerced content
- Narrative Helper respects intensity slider
- No AI player can be forced to act against red lines
- Private 1:1 GM interactions remain gated from other AI Players
- Character-gated knowledge is never automatically promoted to player-level shared knowledge

---

## 14. Implementation phases (A–H)

| Phase | What | Key Tasks | Depends | Est. Time |
|-------|------|-----------|---------|-----------|
| **A** | Data Model | Global AI Player library, player_characters, player_level_secrets tables; migrations; types; CRUD | None | 1.5 weeks |
| **B** | Personality Engine | PersonalityService, dynamic prompt rendering, extend ContextBuilder | A | 1 week |
| **C** | Scene-Selective Rules | Tag abilities with sceneRelevance; filter in proposals | A, B | 3 days |
| **D** | Multi-Agent Orchestration | AIPlayerProposalService, rate-limited consensus | B, C | 1 week |
| **E** | Narrative Helper | NarrativeHelperService; GM summary → polish flow | D | 1 week |
| **F** | Pre-Rolled Tables | Encounters/loot pre-roll + menu UI | A | 1 week |
| **G** | Session Zero | SessionZeroOrchestrator, 5-phase interactive multi-agent screen, private 1:1 GM interactions | A, B | 1 week |
| **H** | Turn Loop Integration | Wire all phases; modify TurnDirector; mixed AI+human play; reusable library assignment | D, E, F, G | 1 week |

**Total estimate**: 6–8 weeks.

---

## 15. Verification and acceptance criteria

### Functional Tests
- [ ] AI players load; personalities render correctly per turn
- [ ] A global AI Player can be assigned to multiple campaigns without base-profile duplication or mutation
- [ ] Proposals generated in parallel; consensus phase rate-limited (1-2 sec delays)
- [ ] Session zero wizard captures inter-player secrets
- [ ] Session-zero screen supports interactive multi-agent chat and private GM-to-player interactions
- [ ] Turn director routes to AI player when appropriate
- [ ] Knowledge gating prevents secret leaks
- [ ] Character-gated knowledge remains player-local unless explicitly shared by an allowed flow
- [ ] Existing human campaigns unaffected
- [ ] GM can choose a pre-rolled encounter or loot result, or roll a new result mid-turn

### Non-Functional Tests
- [ ] 4 proposals generated in < 5 seconds
- [ ] Hard safety guardrails enforced on AI proposals
- [ ] Full audit trail logged (proposals, decisions, OOC chat)
- [ ] Extensible schema (new personality traits = no code change)

### Integration Tests
- [ ] Full session with 1 human GM + 4 AI players (session zero + 3 turns)
- [ ] Party coordination, secret-keeping, turn flow validated
- [ ] GM can edit/override proposals before narration
- [ ] Narrative Helper produces quality prose

---

## 16. Risks and mitigations

| Risk | Mitigation |
|------|-----------|
| Personality drift over 50+ sessions | Periodic re-encoding; personality refresh mechanism (future) |
| AI players disagree during consensus | GM lock button forces narration; voting/character-driven arbitration (future) |
| Context window bloat in long campaigns | NPC memory compression (Phase 8, future) |
| Orchestration breaks with 10+ players | Designed for 4-5; may need indexing for scale (future research) |
| Safety guardrails bypassed | Code-level validation at every mechanics boundary + explicit comments |

---

## 17. Known unknowns

1. **Behavioral coherence**: Will AI players maintain consistent personality over 10+ session arcs? (Research needed; mitigation = personality re-encoding)
2. **Conflict resolution**: When AI players strongly disagree during consensus, how to arbitrate? (Current = GM lock; future = voting or character-driven reasoning)
3. **Scale**: Max AI players before orchestration fails? (Designed for 4-5; unknown for 10+)
4. **Cross-campaign context**: How much from previous campaign should inform current? (Current design = personality only; knowledge fresh per campaign)
5. **Behavioral learning**: Should AI players evolve based on party feedback? (Current = no; future research)

---

## 18. Recommended first milestone

The first complete loop should be:

1. Create AI Player (personality authored)
2. Create campaign with 4 AI players (session zero)
3. Establish inter-player relationships and secrets
4. Run first session (scene mode → AI proposals → consensus → narration)
5. GM arbitrates rolls and outcomes
6. Campaign ends; rolls logged; relationships persisted

This validates the core flow without requiring broader worldbuilding, encounter management, or long-arc coherence features.

---

## 19. Summary

The AI Players mode adds a new **Human GM vs. AI Players** table simulation to the Campaign Engine. It introduces:

✓ Persistent AI Player entities with structured personality  
✓ Rate-limited multi-agent consensus (GM-interruptible)  
✓ Hierarchical secrets (player-level OOC + character-level IC)  
✓ GM arbitration + optional narrative polish (not auto-generation)  
✓ Scene-selective rules loading (no noise)  
✓ Pre-rolled encounters/loot (faster turns)  
✓ Session zero group-building (establish dynamics upfront)  
✓ Full audit trail (all decisions logged)  
✓ Hard safety guardrails (apply everywhere)  

The system is **fully additive**—existing campaigns, companions, and mechanics unchanged. AI Players mode is opt-in via campaign creation.

---

## 20. Next steps

Implementation proceeds to Phase A (data model). Detailed task tracking in [ai-players-engineering-tasks.md](ai-players-engineering-tasks.md).


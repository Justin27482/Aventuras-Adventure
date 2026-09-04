# GM Campaign UX Specification

**Version**: 1.0  
**Date**: 2026-08-30  
**Purpose**: Define the unified TTRPG-style GM interface for running campaigns with AI players

---

## 1. Campaign Types & Initialization

### Campaign Types
```
'human_gm_ai_players'    // User is GM, AI controls some/all players
'human_gm_solo'          // User is GM, human-controlled party only
'human_player'           // User is a player (not GM) - out of scope for this phase
'ai_gm'                  // AI GM, human player (existing mode) - separate flow
```

### Initialization Flow (Campaign Type = `human_gm_ai_players`)

1. **Campaign Creation** (existing wizard, modified)
   - Campaign type selector → choose "I'm the GM with AI Players"
   - Campaign name, setting, tone
   - Proceed to Session Zero

2. **Session Zero**
   - *Not* a separate wizard screen
   - Special campaign state: `sessionZeroPhase: 'introductions' | 'premises' | 'character_creation' | 'bonding' | 'secrets' | 'complete' | null`
   - All 5 phases run in the **main GM Campaign UI** with orchestrator steps embedded
   - Character sheet modal handles character creation and adjustments
   - At end, close session zero, set state back to `null`, start normal campaign

3. **Normal Campaign Sessions**
   - Load campaign → detect type → show GM Campaign UI
   - Session starts with turn-order scene (combat/social/free/etc.)
   - AI player turns dispatch through proposal → consensus → narration flow

---

## 2. Main GM Campaign UI Layout

### Overall Structure

**Key Shift**: Player chat is the *primary* interface. Story log is secondary output.

```
┌────────────────────────────────────────────────────────────┐
│                                                             │
│  ┌──────────────┐  ┌──────────────────┐ ┌──────────────┐  │
│  │  GM Controls │  │  Player Chat /   │ │ Story Log    │  │
│  │  (Left Dock) │  │  Table Talk      │ │ (Right Pane) │  │
│  │              │  │  (Primary UI)    │ │ (Secondary)  │  │
│  │ • Turn Info  │  │                  │ │              │  │
│  │ • Audience   │  │ [Proposals]      │ │ Prose that   │  │
│  │   Selector   │  │ [Rolls+Results]  │ │ GM extracts  │  │
│  │ • Pre-Rolls  │  │ [Table Talk/OOC] │ │ from chat    │  │
│  │ • World      │  │ [GM Narration]   │ │              │  │
│  │   Charter    │  │ [Consent Checks] │ │ Can export   │  │
│  │ • Session    │  │                  │ │ as story     │  │
│  │   Recap      │  │ [Input: Write]   │ │              │  │
│  │              │  │ [Button: Add to  │ │              │  │
│  │              │  │  Story Log]      │ │              │  │
│  └──────────────┘  └──────────────────┘ └──────────────┘  │
│                                                             │
│  [+ Character Sheet Modal - overlays entire UI]           │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

### GM Panel (Collapsible, Left Sidebar)

Control tools for running the game. All AI chat happens in the center Player Chat pane.

#### **Panel 1: Turn State** (always visible)
```
Current Turn:
  Mara (AI Player)
  Scene: Social
  Turn Type: ai_player_turn
  
Next in Order: Rowan, Enemy Shade, Kyra
```

#### **Panel 2: Audience Selection** (appears when AI player turn begins)
```
Select audience for this interaction:
  ◉ Full Table (all players see/hear)
  ○ Private Subset (select players)
  ○ Private 1:1 (single AI player)
  
  Table Talk Intensity: [====   ] Low-Medium
  
[Confirm] [Cancel]
```
- Only appears at start of AI player turn
- Table talk intensity affects how much OOC chat AI players have
- 0 = silent (no commentary), 8 = full banter around rolls/decisions

#### **Panel 3: Pre-Roll Menus** (when combat/encounter)
```
┌─ Encounter Menu ──────────────────┐
│ Pre-rolled options for this scene: │
│                                    │
│ □ Bandits (3 minions, moderate)   │
│ □ Wolf pack (5 wolves, hard)      │
│ □ Rogue mage (1 boss, deadly)     │
│                                    │
│ [Roll Custom] [Refresh Pre-Rolls]  │
└────────────────────────────────────┘
```

#### **Panel 4: Existing Panels** (World Charter, Session Recap, etc.)
- Persist as secondary tools
- Can be toggled/minimized

---

### Player Chat Pane (Center, Primary)

This is the main interface for running the game. All game events flow through as chat messages:

#### **Chat Message Types**

**[AI Player Proposal]**
```
🎭 Mara proposes:
   "Approach the tavern keeper and ask about rumors 
    of the missing expedition."
   Reasoning: Gather intel
   Confidence: 8/10
   
[Approve] [Edit] [More Options]
```
- AI proposes action
- GM can approve, edit, or show options (include roll request, etc.)

**[Roll Request & Resolution]**
```
→ Mara rolls Persuade (skill: 7)
  [d20 roll: 14]
  Total: 21 (Strong Success! +2 bonuses apply)

[Await Table Talk...] (if enabled)
```
- System detects roll request
- Rolls automatically, shows skill + modifier breakdown
- If table talk enabled, waits 2-3 seconds for AI reactions

**[Table Talk / OOC]** (if table talk intensity > 0)
```
💬 Mara (OOC): "Nice roll! That should work."
💬 Rowan (OOC): "Go get 'em!"
💬 Ilyra (OOC): "Good call on Persuade."
```
- Rate-limited OOC reactions to rolls
- 1-2 sec delays between messages
- Max 2-3 exchanges

**[GM Narration]**
```
📖 GM writes:
   "The tavern keeper leans in and whispers 
    about bandits terrorizing the roads..."
    
[Add to Story Log] [Edit] [Polish with AI]
```
- GM writes prose narration
- Can polish with AI before adding to log
- Button to "Add to Story Log" (promotes chat message to story)

**[Consent / Safety Check]** (if applicable)
```
⚠️ System: Mara's proposal involves a morally 
   questionable choice. OK to proceed?
   
[Allow] [Modify] [Block]
```
- Hard bans + content intensity checks
- GM has final word on every action

#### **Chat Input Area**
```
[Propose Action] [Ask Question] [Write Narration] [Roll Dice]

(text input)
_________________________________________________

[Send] [Polish with AI] [Clear]
```

---

### Story Log Pane (Right, Secondary)

Accumulates prose narrative that emerges from play.

```
┌─ Story Log ──────────────────────────┐
│                                      │
│ Mara approaches the tavern keeper... │
│ (added 3 minutes ago)               │
│                                      │
│ The innkeeper leans in and whispers  │
│ about bandits on the roads.          │
│ (added 2 minutes ago)                │
│                                      │
│ Rowan offers to help track them down │
│ (added 1 minute ago)                 │
│                                      │
│ [Export as Story] [Copy All]         │
│ [View Full Session] [Clear Log]      │
└──────────────────────────────────────┘
```

**How entries get here:**
1. GM writes narration in chat
2. Clicks "[Add to Story Log]"
3. Entry moves to right pane
4. Chat stays for reference, story log builds the narrative

**Export options:**
- Download as markdown/text
- Copy formatted prose
- Send to creative writing assistant for polish

---

---

## 3. Turn-by-Turn Flow (AI Player Turn)

### Chat-First Game Flow

The entire turn happens in the Player Chat pane. Story prose is extracted as GM writes it.

```
1. advanceTurn() called
   ↓
2. getCurrentTurnType() → 'ai_player_turn'
   ↓
3. GM Panel shows "Turn State" + "Audience Selection"
   ↓
4. GM selects audience + table talk intensity
   ↓
5. AIPlayerTurnOrchestrator.generateProposal() called
   ↓
6. [Chat Message] Mara proposes: "..."
   ↓
7. GM clicks [Approve] in chat
   ↓
8. [Chat Message] "→ Mara rolls Persuade (skill: 7)"
   ↓
9. If table talk enabled:
   [Chat Message] Mara (OOC): "Nice roll!"
   [Chat Message] Rowan (OOC): "That works!"
   ↓
10. GM writes in chat input:
    "The innkeeper leans in and whispers..."
    ↓
11. [Chat Message] GM writes: "[prose narration...]"
    ↓
12. GM clicks [Add to Story Log]
    ↓
13. Message moves to Story Log pane
    [Chat pane clears for next turn]
    ↓
14. turn advances, next actor's turn begins
```

### Key Differences from Traditional Narration-First UI

**Old Model (Narration-First):**
- GM provides prose
- System generates game state from prose
- Story is primary output

**New Model (Chat-First):**
- Game actions happen in chat (proposals, rolls, decisions)
- Story prose emerges naturally as GM writes/narrates
- Story log is secondary artifact
- Focus is on *running the game*, not crafting prose

### Roll Handling in Chat

When GM writes a roll request in the Narration input:

```
GM writes: "You need to Persuade them. Make the check."
```

System:
1. Parses "Persuade" from chat
2. Looks up Mara's Persuade skill (7)
3. Rolls d20
4. Shows in chat: "→ Mara rolls Persuade (skill: 7) [d20: 14] = 21 (Strong Success)"
5. If table talk > 0: Waits for 2-3 OOC reactions before GM continues
6. GM continues writing narration

### Consent & Safety Checks in Chat

If proposal involves sensitive content (violence, mind control, romance, etc.):

```
[Chat Message] ⚠️ System: Mara proposes [action]. 
Content intensity check needed.
[Allow] [Modify] [Block]
```

GM approves or blocks right in the chat flow. If blocked, AI generates alternative proposal.

### Audience Scoping in Chat

Private audience messages only show in chat for intended recipients:

```
[Chat Message] 🔒 Mara (to GM, private): "I'm actually working for the rival faction..."
[Chat Message visible only to: GM + Mara]

[Chat Message] Rowan (full table): "Let's head back to camp."
[Chat Message visible to: All]
```

---

## 3.5 Universal Table Talk (New Design Principle)

**Table Talk Intensity Slider** controls how much OOC banter happens across the entire game:

```
Table Talk Intensity: [●───────] 0 (Silent)
                      [──●─────] 3 (Moderate)
                      [────●───] 6 (Lively)
                      [───────●] 8 (Maximum)
```

### By Intensity Level

**0 (Silent)**
- No OOC reactions to rolls
- No commentary on proposals
- Only system messages + story

**1-3 (Low-Moderate)**
- Brief reactions to critical/fumbled rolls
- Occasional "nice roll" type comments
- Keeps focus on story

**4-6 (Moderate-Lively)**
- Regular OOC banter around rolls
- Light table talk after decisions
- Feels like actual TTRPG table

**7-8 (Maximum)**
- Constant OOC chatter
- Jokes, commentary, in-character asides
- Feels like chaotic fun table

### Implementation

Table talk appears **anywhere** game action happens:

1. **After Rolls**
   - GM requests: "Roll Persuade"
   - System rolls and shows result
   - If intensity > 0: AI players react (1-2 sec delay, 2-3 messages)

2. **After Proposals**
   - AI proposes action
   - If intensity > 1: Other AI players comment before GM approves

3. **After Obstacles/Failures**
   - If roll failed or action blocked
   - AI players commiserate or strategize (OOC)

4. **Between Turns (Free Scenes)**
   - During non-combat, low-stakes scenes
   - AI players naturally banter about what's happening

### Core Benefit

Table talk makes the game feel *alive*. Removes the "sterile" feeling of "AI makes proposal → GM writes prose." Instead, it's interactive:

```
Mara: "I want to convince the guard."
Rowan: "Good call, they might know something."
→ Mara rolls Persuade = 18
Ilyra: "Oh that's solid!"
GM: "The guard leans in..."
```

Much better than:

```
Mara proposes: Convince the guard
→ Roll result: 18
[Enter narration in text box]
```

---

## 4. Character Sheet Adjustment Flow

### Modal Design
```
┌─ Character Sheet: Mara ──────────────────┐
│                                           │
│ [Suggested by AI] [GM Controls]          │
│                                           │
│ ┌─ Health ──────────────────────────┐   │
│ │ Current: 15 / 20                  │   │
│ │ Proposed: 12 / 20                 │   │
│ │ [Approve] [Edit to: __] [Deny]    │   │
│ └───────────────────────────────────┘   │
│                                           │
│ ┌─ Energy ──────────────────────────┐   │
│ │ Current: 5 / 8                    │   │
│ │ Proposed: 3 / 8                   │   │
│ │ [Approve] [Edit to: __] [Deny]    │   │
│ └───────────────────────────────────┘   │
│                                           │
│ ┌─ Status: Fatigued ────────────────┐   │
│ │ Add: Wounded                      │   │
│ │ [Approve] [Edit/Remove] [Deny]    │   │
│ └───────────────────────────────────┘   │
│                                           │
│ [Close] [Approve All] [Deny All]        │
│                                           │
└───────────────────────────────────────────┘
```

### Dual-Mode Operation
**During Session Zero (Character Creation)**
- AI proposes initial stat distributions
- GM approves, edits, or specifies values
- After approval, character sheet is locked for starting session

**During Normal Campaign**
- AI proposes adjustments after mechanics (damage, level up, etc.)
- GM can approve immediate adjustments or queue for review
- Asynchronous workflow (doesn't block turn flow)

### Implementation
- Single reusable `CharacterSheetAdjustmentModal` component
- Context determines mode (session-zero vs. normal)
- Plugs into both SessionZeroOrchestrator and mechanics pipeline

---

## 5. Session Zero Integration

### Session Zero Flow (All in Main Campaign UI + Character Sheet Modal)

Session zero runs as a **special campaign phase** (`sessionZeroPhase: 'introductions' | 'premises' | 'character_creation' | 'bonding' | 'secrets' | 'complete'`).

All phases use the **same Player Chat interface** as normal campaign play. The flow is:

#### Phase 1: Introductions
- **Player Chat pane**: GM reads AI personality introductions (as system messages)
- AI players introduce themselves (in chat)
- **Table Talk**: Light banter as players meet (intensity ~4-6)
- GM can capture vibes in Story Log if desired

#### Phase 2: Campaign Premises Q&A
- **Player Chat pane**: GM describes world/setting (writes in chat)
- AI players ask clarifying questions (1-2 per player, in chat)
- **Table Talk**: Reactions to premise, excitement (intensity ~4-6)
- GM captures answers in Story Log

#### Phase 3: Character Creation
- **Player Chat pane**: System announces "Character Creation Phase"
- **Character Sheet Modal opens** (special mode: AI proposes full sheet)
  - Each AI player gets: [Stats] [Skills] [Equipment] [Background]
  - GM approves, edits, or specifies values
  - Accept → character locked for session
- **Back to chat**: Brief intro "Mara, you are..."
- Players can react to their characters in chat

#### Phase 4: Party Bonding
- **Player Chat pane**: Turn-based IC dialogue (rate-limited, like normal turns)
- AI characters interact in character
- **Table Talk** enabled for OOC reactions (intensity ~4-6)
- GM captures relationship notes/edits in Story Log
- Relationship overrides stored automatically

#### Phase 5: Establish Secrets
- **Player Chat pane**: GM describes available secrets (system message)
- AI players suggest which secrets apply to them (in chat)
- **Character Sheet Modal**: GM edits "Secrets" tab for each character
  - Shows which secrets are known/hidden per player
  - AI can suggest, GM has final say
- Accept → secrets locked, session zero complete

#### Post-Session-Zero
- Set `sessionZeroPhase: null`
- Player Chat clears, Story Log preserved
- Start normal campaign at turn 1, scene 1
- Party composition is locked; character sheets adjustable only via mechanics

---

## 6. Campaign Type Detection & UX Routing

### In Campaign Entry Point
```typescript
async loadForStory(storyId: string) {
  const campaign = await database.getCampaignByStoryId(storyId)
  const campaignType = campaign?.campaignType ?? 'human_gm_solo'
  
  if (campaignType === 'human_gm_ai_players') {
    // Show GM Campaign UI with AI player controls
    showGMCampaignScreen()
  } else if (campaignType === 'human_gm_solo') {
    // Show existing ActionInput UI (or simpler GM solo version)
    showExistingCampaignUI()
  } else if (campaignType === 'ai_gm') {
    // Existing AI GM flow (unchanged)
    showAIGMFlow()
  }
}
```

---

## 7. Phases & Responsible Components

### Phase E: Session Zero Orchestration & Character Sheets
- **E.1** ✅ SessionZeroOrchestrator service (already done)
- **E.2-E.5** Session Zero phase handlers (run in main Player Chat UI)
- **E.6** Character Sheet Adjustment Modal (NEW SINGLE COMPONENT - also used for mechanics)
- **E.7-E.9** Session zero persistence (relationships, secrets)

### Phase F: Pre-Rolled Menus
- **F.1-F.2** ✅ Pre-roll services (already done)
- **F.3-F.4** Pre-roll menu panels (integrated in GM Controls sidebar)
- **F.5-F.9** Pre-roll selection/usage tracking/refresh

### Phase G: Turn Loop Integration & GM Campaign UX
- **G.1-G.3** ✅ Turn routing foundation (already done)
- **G.4-G.6** Chat Message Types (Proposal, Roll, Table Talk messages in Player Chat)
- **G.7** Roll Detection & Resolution in Chat (parse roll requests, roll mechanics, display results)
- **G.7.1** 🆕 Universal Table Talk (intensity slider + OOC reactions everywhere)
- **G.8** Pre-roll integration (Panel in GM Controls)
- **G.9** Campaign type detection & routing
- **G.10** Campaign creation flow (add type selector)
- **G.11** Full integration tests

### Phase H: Polish & Launch
- GM Campaign UI styling and layout refinement
- Edge case handling (network delays, turn timeouts, etc.)
- Full end-to-end testing (Session Zero → Normal Play → Mechanics → End Session)

---

## 8. Key Design Principles

1. **Chat-First Game Running (not Narrative Crafting)**
   - Player Chat is where the *game* happens (proposals, rolls, decisions, table talk)
   - Story Log is where *prose* emerges (secondary artifact)
   - Focus is on running the game, not writing the story
   - Story emerges naturally from play, GM extracts prose as desired

2. **Universal Table Talk**
   - Table talk is not special; it's everywhere (after rolls, proposals, failures, etc.)
   - Intensity slider makes it easy to dial up/down
   - Makes game feel alive and collaborative, not sterile

3. **Unified Character Management**
   - Single Character Sheet Modal handles both Session Zero creation and mechanics adjustments
   - GM always has full control (approve, edit, deny)
   - Two-mode design (creation vs. adjustment) keeps it simple

4. **Minimalist GM Controls**
   - Left sidebar has only essential controls (turn info, audience, pre-rolls, world charter)
   - No separate panels for proposals/consensus — they're chat messages
   - Story Log is passive (GM promotes messages from chat as desired)
   - Reduces UI complexity, keeps focus on gameplay

5. **Seamless Mixed Parties**
   - Turn routing handles AI, human, and NPC seamlessly
   - Same UI works for 1 AI player or 4
   - No special case paths or complex branching

6. **GM Agency**
   - GM can always edit, approve, or deny AI decisions
   - Consent checks happen inline in chat
   - Audience scoping (private/subset/full) is visual in chat
   - Roll results are transparent and auditable

---

## 9. Next Steps

### Priority 1: Campaign Type & GM Campaign Screen (G.9-G.10)
1. Add `campaignType` field to Campaign schema + migration
2. Create `GMCampaignScreen.svelte` layout
   - Left sidebar (collapsible)
   - Center Player Chat pane
   - Right Story Log sidebar
   - Campaign type detection & routing

### Priority 2: Player Chat Message System (G.4-G.7.1)
1. Implement chat message types & rendering
   - Proposal messages
   - Roll request & result messages
   - Table talk messages (OOC, rate-limited)
   - Consent/safety check messages
   - GM narration messages
2. Wire proposal generation into chat
3. Implement roll detection & resolution in chat
4. Add Table Talk Intensity slider to campaign settings

### Priority 3: Character Sheet Modal (E.6)
1. Build single `CharacterSheetAdjustmentModal.svelte`
   - Dual-mode (session-zero vs. normal)
   - Show old value vs. proposed
   - Approve/Edit/Deny controls
   - Support for all sheet fields

### Priority 4: Session Zero Flow (E.2-E.5)
1. Register phase handlers in SessionZeroOrchestrator
2. Wire into Player Chat (phase-appropriate messages)
3. Integrate Character Sheet Modal for character creation
4. Test all 5 phases end-to-end

### Priority 5: Pre-Roll Integration (F.3-F.4)
1. Build Pre-Roll Menu panels for GM sidebar
2. Hook into turn flow (show when needed)
3. GM selection flow

### Priority 6: Integration Tests (G.11)
1. Full campaign flow: creation → session zero → normal play
2. Mixed party tests (human + AI)
3. Roll flow with table talk
4. Audience scoping (private/subset)

---

## 10. File Structure (Target)

```
src/lib/components/
  campaign/
    GMCampaignScreen.svelte                (NEW - main container, chat-first)
    
    panels/
      GMControlPanel.svelte                (LEFT: collapsible sidebar)
        TurnStatePanel.svelte              (show current turn)
        AudienceSelectionPanel.svelte      (G.2: select audience + table talk intensity)
        PrerollMenuPanel.svelte            (F.3: encounter/loot menus)
        (existing: WorldCharterPanel, GMNarrationPanel, SessionRecapPanel)
    
    chat/
      PlayerChatPane.svelte                (CENTER: main game interface)
      ChatMessage.svelte                   (individual message component)
      chat-message-types.ts                (Proposal, Roll, TableTalk, Narration types)
      RollDetectionService.ts              (parse GM text for roll requests)
      RollResolutionService.ts             (look up skills, roll, display results)
      TableTalkOrchestrator.ts             (intensity-controlled OOC reactions)
    
    sidebar/
      StoryLogPane.svelte                  (RIGHT: prose narrative log)
    
    modals/
      CharacterSheetAdjustmentModal.svelte (E.6: new sheet creation + adjustments)

src/lib/services/
  campaign/
    campaign-type-service.ts               (NEW: detect & route by type)
  
  ai-player/
    (already have: turn-orchestrator, routing-service, etc.)
    
    roll-table-talk/
      RollTableTalkOrchestrator.ts        (NEW: intensity-based OOC reactions)
```

---

## 11. Revised Engineering Task Sequencing

Given the chat-first architecture, update ai-players-engineering-tasks.md with:

1. **Phase G Priority Shift**
   - G.9-G.10 (Campaign Type + GMCampaignScreen) → do first
   - G.4-G.7.1 (Chat system + rolls + table talk) → do second
   - G.8 (Pre-roll integration) → do third

2. **New Sub-Feature: G.7.1 (Universal Table Talk)**
   - Add to engineering tasks as distinct from G.7
   - Tables talk is everywhere, not just in narration helper

3. **Phase E Priority Shift**
   - E.6 (Character Sheet Modal) → do before E.2-E.5
   - E.2-E.5 (Phase handlers) → depend on E.6 + GMCampaignScreen

4. **Phase F unchanged** but integrated into GMCampaignScreen sidebar


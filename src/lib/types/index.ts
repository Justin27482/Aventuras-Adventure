// Core entity types for Aventura
// Adventure split: this app only supports adventure mode; creative-writing was removed.
export type StoryMode = 'adventure'
export type POV = 'first' | 'second' | 'third'
export type Tense = 'past' | 'present'

// Visual descriptors for character appearance (used for image generation)
export interface VisualDescriptors {
  [key: string]: string | undefined
  face?: string // Skin tone, facial features, expression, age indicators
  hair?: string // Color, length, style, texture
  eyes?: string // Color, shape, notable features
  build?: string // Height, body type, posture
  clothing?: string // Full outfit description
  accessories?: string // Jewelry, weapons, bags, distinctive items
  distinguishing?: string // Scars, tattoos, birthmarks
}

export interface VisualDescriptorLabel {
  key: string
  label: string
  minNsfwIntensity: number
  hint?: string
}

// Time tracking for story progression
export interface TimeTracker {
  years: number
  days: number
  hours: number
  minutes: number
}

export interface Story {
  id: string
  title: string
  description: string | null
  genre: string | null
  folderId?: string | null
  templateId: string | null
  mode: StoryMode
  createdAt: number
  updatedAt: number
  settings: StorySettings | null
  memoryConfig: MemoryConfig | null
  retryState: PersistentRetryState | null
  styleReviewState: PersistentStyleReviewState | null
  timeTracker: TimeTracker | null
  currentBranchId: string | null // Active branch (null = main branch for legacy stories)
  currentBgImage: string | null
  packId?: string | null
  customVariableValues?: Record<string, string> | null
}

export interface StoryFolder {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

export type CampaignActorCategory =
  | 'primary_player_character'
  | 'active_companion'
  | 'inactive_ally'
  | 'friendly_npc'
  | 'neutral_npc'
  | 'enemy'
  | 'gm_actor'

export type CampaignControlMode =
  | 'player_narrative'
  | 'autonomous'
  | 'tactical_delegate'
  | 'tactical_player'
  | 'gm_directed'

export type CampaignType =
  | 'human_gm_ai_players' // GM running AI-controlled party
  | 'human_gm_solo' // GM with human-only party
  | 'ai_gm' // AI GM, human player (existing mode)
  | 'human_player' // Player joining someone else's campaign

export interface Campaign {
  id: string
  storyId: string | null
  title: string
  description: string | null
  rulesetId: string | null
  spotlightCharacterId: string | null
  status: 'active' | 'paused' | 'completed' | 'archived'
  campaignType?: CampaignType
  settings?: CampaignSettings | null
  createdAt: number
  updatedAt: number
}

export interface CampaignSettings {
  campaignId: string
  defaultPartySize: number
  maxPartySize: number
  sceneMode: string
  turnOrderMode: string
  diceEnforcement: string
  nsfwIntensity: number
  worldCharter: string | null
  gmPersona: string | null
  companionCombatPolicy: 'companions_autonomous' | 'tactical_delegate' | 'tactical_player'
  aiPlayersEnabled: boolean
  defaultAIPlayerCount: number
  tableTalkIntensity?: number // 0-8 slider for OOC banter
  sessionZeroPhase?:
    | 'introductions'
    | 'premises'
    | 'character_creation'
    | 'bonding'
    | 'secrets'
    | null
  sessionZeroStatus?: 'not_started' | 'in_progress' | 'completed'
  createdAt: number
  updatedAt: number
}

export interface AIPlayerPersonality {
  coreMotivation?: string
  primaryPlaystyle: 'tactical' | 'roleplay' | 'social' | 'hybrid'
  riskTolerance?: number
  immersion?: number
  arousal?: number
  humorStyle?: string
  decisionSpeed?: 'cautious' | 'balanced' | 'impulsive'
  combatApproach?: string
  socialPriorities?: string[]
  redLines?: string[]
}

export interface CharacterStats {
  id: string
  name: string
  background?: string
  personality?: string
  role?: string
  notes?: string
  stats?: Record<string, number | string>
  health?: { current: number; max: number }
  energy?: { current: number; max: number }
  [key: string]: unknown
}

export interface AIPlayer {
  id: string
  name: string
  basePersonality: AIPlayerPersonality
  basePromptProfile: string | null
  archivedAt: number | null
  createdAt: number
  updatedAt: number
}

export interface AIPlayerRelationship {
  id: string
  aiPlayerIdA: string
  aiPlayerIdB: string
  dynamic: string
  history: string
  friction: number
  createdAt: number
  updatedAt: number
}

export interface PlayerCharacter {
  id: string
  campaignId: string
  aiPlayerId: string
  characterId: string
  roleplayNotes: string | null
  characterSecrets: Record<string, unknown>[]
  interPlayerRelationshipOverrides: Record<string, unknown>
  joinedAt: number
  leftAt: number | null
}

/** Persistent campaign table membership, independent of any character assignment. */
export interface CampaignAIPlayer {
  id: string
  campaignId: string
  aiPlayerId: string
  joinedAt: number
  leftAt: number | null
}

export type AIPlayerMemorySource =
  | 'private_prologue'
  | 'setup_session'
  | 'session'
  | 'gm_authored'
  | 'imported'

/** `campaign` recall stays in its origin campaign; `cross_campaign` may inform other games. */
export type AIPlayerMemoryScope = 'campaign' | 'cross_campaign' | 'never'

export type AIPlayerMemoryInjectionMode = 'always' | 'keyword' | 'never'

/**
 * An AI Player's own remembered experience, owned by the global profile so it can
 * persist across campaigns. Distinct from GM-authored secrets.
 */
export interface AIPlayerMemory {
  id: string
  aiPlayerId: string
  originCampaignId: string | null
  originCampaignTitle: string | null
  originSetupSessionId: string | null
  originSessionId: string | null
  characterId: string | null
  characterName: string | null
  source: AIPlayerMemorySource
  title: string
  content: string
  keywords: string[]
  scope: AIPlayerMemoryScope
  injectionMode: AIPlayerMemoryInjectionMode
  priority: number
  pinned: boolean
  createdAt: number
  updatedAt: number
}

export type CampaignFormationStatus = 'party_pending' | 'ready'
export type CampaignFormationSource = 'created_pending' | 'converted' | 'established'

export interface CampaignFormationState {
  campaignId: string
  status: CampaignFormationStatus
  requiredAIPlayerIds: string[]
  source: CampaignFormationSource
  createdAt: number
  updatedAt: number
}

export type CampaignSetupSessionKind =
  | 'private_character_creation'
  | 'private_prologue'
  | 'group_session_zero'
  | 'table_bonding'

export type CampaignSetupPhase =
  | 'introductions'
  | 'premises'
  | 'character_creation'
  | 'bonding'
  | 'secrets'
  | 'free_table'

export type CampaignSetupSessionStatus = 'planned' | 'active' | 'completed' | 'abandoned'

export interface CampaignSetupSession {
  id: string
  campaignId: string
  sequence: number
  title: string
  kind: CampaignSetupSessionKind
  phase: CampaignSetupPhase
  status: CampaignSetupSessionStatus
  audience: InteractionAudience
  createdAt: number
  startedAt: number | null
  completedAt: number | null
  updatedAt: number
}

export interface CampaignSetupSessionPlayer {
  setupSessionId: string
  aiPlayerId: string
  joinedAt: number
}

export interface CampaignFormationBackup {
  id: string
  campaignId: string
  snapshot: Record<string, unknown>
  checksum: string
  createdAt: number
  restoredAt: number | null
}

export interface PartyPendingConversionPreview {
  characters: number
  characterLoreEntries: number
  assignments: number
  sheets: number
  sheetRevisions: number
  partyMembers: number
  controlProfiles: number
  normalSessions: number
  sessionChatMessages: number
  proposals: number
  interactions: number
  rolls: number
  prerolls: number
  characterOwnedItems: number
}

export interface CampaignFormationSnapshot {
  version: 1
  campaignId: string
  storyId: string
  tables: Record<string, Record<string, unknown>[]>
  itemOwnership: Array<{
    id: string
    owner_character_id: string | null
    slot_key: string | null
    container_item_id: string | null
  }>
}

export type InteractionAudience =
  | { kind: 'full_table' }
  | { kind: 'player_subset'; aiPlayerIds: string[] }
  | { kind: 'private_player'; aiPlayerId: string }

export interface PlayerLevelSecret {
  id: string
  campaignId: string
  sessionId: string | null
  targetAIPlayerId: string
  secretContent: string
  revealedToAIPlayerIds: string[]
  visibilityScope: 'specific_ai_player' | 'all_ai_players'
  createdAt: number
  updatedAt: number
}

export interface AIPlayerInteraction {
  id: string
  campaignId: string
  sessionId: string | null
  audience: InteractionAudience
  transcript: Record<string, unknown>[]
  disclosedToAudience: boolean
  createdAt: number
  updatedAt: number
}

export interface SessionPreroll {
  id: string
  sessionId: string
  prerollType: 'encounter' | 'loot'
  prerolledData: Record<string, unknown>
  source: 'session_start' | 'mid_turn'
  usedAt: number | null
  createdAt: number
}

export interface MigrationStatus {
  version: number
  description: string
  installedOn: string | null
  executionTimeMs: number | null
  success: boolean
  checksum: string | null
}

export interface WorldbuildingWorkspace {
  id: string
  title: string
  promptPackId: string
  draft: Record<string, string>
  charter: string
  conversation: Array<{ role: 'user' | 'assistant'; content: string }>
  updatedAt: number
}

export interface AIPlayerProposal {
  id: string
  aiPlayerId: string
  characterId: string
  campaignId: string
  sceneId?: string | null
  sceneMode?: string
  action: string
  reasoning: string
  confidence: number
  reviewStatus: 'pending' | 'accepted' | 'declined'
  createdAt: number
  updatedAt: number
}

export interface InstallMigrationRequest {
  version: number
  description: string
  sql: string
  checksum: number[]
  previousVersions: number[]
}

export interface CampaignPartyMember {
  id: string
  campaignId: string
  characterId: string
  eligibilityStatus: 'eligible' | 'unavailable' | 'dismissed' | 'deceased'
  actorCategory: CampaignActorCategory
  active: boolean
  narrativeControlMode: CampaignControlMode
  combatControlMode: CampaignControlMode
  displayOrder: number
  joinedAt: number
  leftAt: number | null
}

export interface ActorControlProfile {
  id: string
  campaignId: string
  characterId: string
  actorCategory: CampaignActorCategory
  narrativeControlMode: CampaignControlMode
  combatControlMode: CampaignControlMode
  priorities: string | null
  motivations: string | null
  fears: string | null
  valuePriorities: string | null
  redLines: string | null
  tacticalPreferences: string | null
  createdAt: number
  updatedAt: number
}

export interface CampaignSession {
  id: string
  campaignId: string
  sessionNumber: number
  title: string | null
  primaryCharacterId: string
  narrativeControlPolicy: 'primary_player_companions_autonomous'
  combatControlPolicy: 'companions_autonomous' | 'tactical_delegate' | 'tactical_player'
  status: 'active' | 'completed' | 'abandoned'
  startedAt: number
  endedAt: number | null
}

export interface SceneTurnState {
  id: string
  campaignId: string
  entryId: string | null
  sceneMode: string
  turnOrderMode: string
  activeActorId: string | null
  actorOrder: string[]
  turnNumber: number
  createdAt: number
  updatedAt: number
}

export interface SessionPartyMember {
  id: string
  sessionId: string
  characterId: string
  partyOrder: number
  actorCategory: 'primary_player_character' | 'active_companion'
  narrativeControlMode: CampaignControlMode
  combatControlMode: CampaignControlMode
  joinedAt: number
  leftAt: number | null
}

export type CompanionDecisionSource = 'companion_ai' | 'player_request' | 'tactical_delegate' | 'gm'

export interface CompanionDecisionProposal {
  id: string
  campaignId: string
  sessionId: string | null
  characterId: string
  actorCategory: CampaignActorCategory
  source: CompanionDecisionSource
  controlMode: CampaignControlMode
  sceneMode: string
  intent: string
  proposedAction: string
  rationale: string
  accepted: boolean | null
  createdAt: number
}

export type CampaignThreadType =
  | 'plot'
  | 'quest'
  | 'faction'
  | 'mystery'
  | 'character'
  | 'threat'
  | 'custom'

export type CampaignThreadStatus = 'active' | 'dormant' | 'resolved' | 'abandoned'

export type CampaignThreadVisibility = 'player_safe' | 'director_only'

export interface CampaignThread {
  id: string
  campaignId: string
  title: string
  summary: string | null
  threadType: CampaignThreadType
  status: CampaignThreadStatus
  visibility: CampaignThreadVisibility
  priority: number
  clockValue: number
  clockMax: number | null
  stakes: string | null
  createdAt: number
  updatedAt: number
}

export type CampaignThreadBeatType =
  | 'milestone'
  | 'clue'
  | 'complication'
  | 'clock_tick'
  | 'resolution'
  | 'note'

export interface CampaignThreadBeat {
  id: string
  campaignId: string
  threadId: string
  title: string
  summary: string | null
  beatType: CampaignThreadBeatType
  visibility: CampaignThreadVisibility
  sortOrder: number
  occurredAt: number | null
  createdAt: number
  updatedAt: number
}

// ===== Ruleset Types (Phase 2) =====

export interface Ruleset {
  id: string
  name: string
  description: string | null
  isBuiltin: boolean
  diceSystem: string
  defaultCheckRuleKey: string | null
  encumbranceMode: 'slot' | 'weight'
  encumbranceCapacityFormula: string
  inventorySlotCapacityFormula: string
  createdAt: number
  updatedAt: number
}

export interface RulesetStat {
  id: string
  rulesetId: string
  key: string
  label: string
  defaultValue: number
  minValue: number | null
  maxValue: number | null
  sortOrder: number
}

export interface RulesetSkill {
  id: string
  rulesetId: string
  key: string
  label: string
  governingStatKey: string | null
  sortOrder: number
}

/** A named margin-of-success band, e.g. "critical success" when margin >= 10. */
export interface OutcomeBand {
  label: string
  minMargin: number | null
  maxMargin: number | null
}

export interface RulesetCheckRule {
  id: string
  rulesetId: string
  key: string
  label: string
  notation: string
  criticalSuccessThreshold: number | null
  criticalFailureThreshold: number | null
  outcomeBands: OutcomeBand[]
  sortOrder: number
}

export interface RulesetCondition {
  id: string
  rulesetId: string
  key: string
  label: string
  description: string | null
  sortOrder: number
}

export interface RulesetSlot {
  id: string
  rulesetId: string
  key: string
  label: string
  slotType: 'wearable' | 'inventory'
  sortOrder: number
}

export interface RulesetAbility {
  id: string
  rulesetId: string
  key: string
  label: string
  description: string | null
  resourceKey: string | null
  resourceCost: number
  sceneRelevance?: string[]
  sortOrder: number
}

export interface RulesetSpell {
  id: string
  rulesetId: string
  key: string
  label: string
  description: string | null
  level: number
  notation: string | null
  resourceCost: number
  sortOrder: number
}

export interface RulesetCreature {
  id: string
  rulesetId: string
  key: string
  label: string
  description: string | null
  creatureType: string | null
  statBlock: Record<string, unknown>
  sortOrder: number
}

export interface RulesetLevel {
  id: string
  rulesetId: string
  level: number
  label: string | null
  xpThreshold: number | null
  statBonuses: Record<string, number> | null
}

/**
 * A derived resource (health, mana, stamina, etc). `maxFormula` is a small
 * arithmetic expression referencing stat keys and `level`, evaluated by
 * `src/lib/services/mechanics/resource-formulas.ts` (no code execution).
 */
export interface RulesetResource {
  id: string
  rulesetId: string
  key: string
  label: string
  maxFormula: string
  minValue: number
  sortOrder: number
}

export interface FullRuleset {
  ruleset: Ruleset
  stats: RulesetStat[]
  skills: RulesetSkill[]
  checkRules: RulesetCheckRule[]
  conditions: RulesetCondition[]
  slots: RulesetSlot[]
  abilities: RulesetAbility[]
  spells: RulesetSpell[]
  creatures: RulesetCreature[]
  levels: RulesetLevel[]
  resources: RulesetResource[]
}

// ===== Dice Roll Types (Phase 2) =====

export type RollVisibility = 'player_safe' | 'director_only'

/**
 * Outcome label for a resolved roll. Not a closed union: rulesets define their
 * own outcome-band labels (e.g. narrative 2d6's "partial success"), so this is
 * validated against a ruleset's `RulesetCheckRule.outcomeBands` at runtime instead.
 */
export type RollOutcome = string | null

/** Common outcome labels used by built-in d20-style rulesets. */
export const STANDARD_ROLL_OUTCOMES = {
  criticalSuccess: 'critical_success',
  success: 'success',
  failure: 'failure',
  criticalFailure: 'critical_failure',
} as const

/** Explicit GM bias applied to a roll; never silent, always logged in the ledger. */
export interface RollBias {
  type: 'karma' | 'fudge'
  amount: number
  note: string
}

export interface RollLedgerEntry {
  id: string
  campaignId: string
  sessionId: string | null
  actorId: string | null
  notation: string
  seed: string
  rolls: number[]
  modifier: number
  total: number
  dc: number | null
  outcome: RollOutcome
  reason: string | null
  visibility: RollVisibility
  biasApplied: RollBias | null
  createdAt: number
}

export interface RollStats {
  count: number
  average: number
  min: number
  max: number
  criticalSuccesses: number
  criticalFailures: number
}

// Persistent retry state - lightweight version saved to database
export type ActionInputType = 'do' | 'say' | 'think' | 'story' | 'free'

export interface PersistentRetryState {
  timestamp: number
  // The next entry position before user action was added (max position + 1)
  // On retry, delete entries from this position onward
  entryCountBeforeAction: number
  // The user's input data
  userActionContent: string
  rawInput: string
  actionType: ActionInputType
  wasRawActionChoice: boolean
  // Entity IDs that existed before the action - on restore, delete any not in these lists
  characterIds: string[]
  locationIds: string[]
  itemIds: string[]
  storyBeatIds: string[]
  embeddedImageIds?: string[] // Added in v1.4.0 for image generation
  characterSnapshots?: PersistentCharacterSnapshot[] // Added in v1.4.1 for retry state restoration
  // Story time snapshot captured before the user action (optional for backwards compatibility)
  timeTracker?: TimeTracker | null
  // Lorebook activation data for stickiness preservation (optional for backwards compatibility)
  activationData?: Record<string, number>
  storyPosition?: number
}

export interface PersistentCharacterSnapshot {
  id: string
  traits: string[]
  status: 'active' | 'inactive' | 'deceased'
  relationship: string | null
  visualDescriptors: VisualDescriptors
  portrait: string | null // Data URL (data:image/...) or legacy base64
}

// Persistent style review state - saved per-story for style analysis tracking
export interface PersistentPhraseAnalysis {
  phrase: string
  frequency: number
  severity: 'low' | 'medium' | 'high'
  alternatives: string[]
  contexts: string[]
}

export interface PersistentStyleReviewResult {
  phrases: PersistentPhraseAnalysis[]
  overallAssessment: string
  reviewedEntryCount: number
  timestamp: number
}

export interface PersistentStyleReviewState {
  messagesSinceLastReview: number
  lastReview: PersistentStyleReviewResult | null
}

export interface MemoryConfig {
  tokenThreshold: number // Token count before triggering summarization (default: 16000)
  chapterBuffer: number // Recent messages protected from chapter end (default: 10)
  autoSummarize: boolean // Enable auto-summarization
  enableRetrieval: boolean // Enable memory retrieval
  maxChaptersPerRetrieval: number // Max chapters to retrieve per query
}

export interface StorySettings {
  model?: string
  temperature?: number
  maxTokens?: number
  pov?: POV
  tense?: Tense
  tone?: string
  themes?: string[]
  visualProseMode?: boolean // Enable HTML/CSS visual output mode
  imageGenerationMode?: 'none' | 'agentic' | 'inline' // Image generation strategy
  backgroundImagesEnabled?: boolean
  referenceMode?: boolean
  editingPassBeforeDisplayEnabled?: boolean // Run a hidden second-pass editor rewrite before showing narration
  customSystemPrompt?: string // Per-story Liquid template override; bypasses pack template when set
  clothingSystemEnabled?: boolean // Enable clothing/armor slot + durability system
  clothingZones?: string[] // Configurable body zones used for clothing coverage/exposure
  clothingMaxDurability?: number // Default max durability for clothing items
  clothingRepairAmount?: number // Durability restored per repair action
  characterClassificationEnabled?: boolean // Enable classifier extraction for character updates/new entities
  locationClassificationEnabled?: boolean // Enable classifier extraction for location updates/new entities
  storyBeatClassificationEnabled?: boolean // Enable classifier extraction for story beat updates/new beats
  sceneClassificationEnabled?: boolean // Enable scene extraction (current location + present characters)
  timeClassificationEnabled?: boolean // Enable classifier time progression extraction
  moneySystemEnabled?: boolean // Enable dedicated story money tracking
  inventoryClassificationEnabled?: boolean // Enable classifier extraction for item/inventory world-state changes
  moneyClassificationEnabled?: boolean // Enable classifier extraction for money deltas when money system is enabled
  runtimeVarClassificationEnabled?: boolean // Enable inline runtime variable extraction in classifier pass
  itemAcquisitionFallbackEnabled?: boolean // Enable heuristic item acquisition fallback when classifier misses item changes
  clothingStateFallbackEnabled?: boolean // Enable heuristic clothing-state fallback when classifier misses clothing damage/repair
  moneyFallbackEnabled?: boolean // Enable heuristic money fallback when classifier misses money updates
  moneyRecoveryEnabled?: boolean // Enable secondary LLM money recovery pass when primary classifier misses money updates
  moneyName?: string // Name of the story currency (e.g., gold, credits, dollars)
  moneyAmount?: number // Current money amount for this story
}

export interface StoryEntry {
  id: string
  storyId: string
  type: 'user_action' | 'narration' | 'system' | 'retry'
  content: string
  parentId: string | null
  position: number
  createdAt: number
  metadata: EntryMetadata | null
  branchId: string | null // Branch this entry belongs to (null = main branch for legacy)
  reasoning?: string // In-memory only reasoning (chain of thought)
  // Translation fields
  translatedContent?: string | null // Translated text for display
  translationLanguage?: string | null // Language code of translation
  originalInput?: string | null // Original user input before translation (for user_action type)
  // Phase 1: World state delta tracking
  worldStateDelta?: WorldStateDelta | null // World state changes caused by this entry's classification
  // Persisted action suggestions/choices for time-travel restore
  suggestedActions?: string | null // JSON blob: ActionChoice[] or Suggestion[] depending on story mode
}

export interface EntryMetadata {
  tokenCount?: number
  model?: string
  generationTime?: number
  source?: string
  chapterSourceId?: string
  chapterSourceTitle?: string
  chapterNumber?: number | null
  sourceFilename?: string | null
  chatMessageId?: string
  chatMessageType?: string
  // Story time tracking - captures in-story time at entry creation and after classification
  timeStart?: TimeTracker // Story time when this entry began
  timeEnd?: TimeTracker // Story time after classification applied time progression
  // Translation fields (for backwards compatibility, also stored in columns)
  originalInput?: string // For translateInput: original user text before translation to English
  // Phase 7: Roll ledger entries associated with this story entry
  rollIds?: string[]
}

export interface Character {
  id: string
  storyId: string
  name: string
  description: string | null
  relationship: string | null
  traits: string[]
  visualDescriptors: VisualDescriptors // Visual appearance details for image generation
  portrait: string | null // Data URL (data:image/...) for reference in image generation
  status: 'active' | 'inactive' | 'deceased'
  metadata: Record<string, unknown> | null
  branchId: string | null // Branch this character belongs to (null = main/inherited)
  overridesId?: string | null // COW: ID of the parent entity this row overrides (null = original)
  deleted?: boolean // COD: tombstone — entity is deleted on this branch (COW only)
  // Translation fields
  translatedName?: string | null
  translatedDescription?: string | null
  translatedRelationship?: string | null
  translatedTraits?: string[] | null
  translatedVisualDescriptors?: VisualDescriptors | null
  translationLanguage?: string | null
}

export type ChatMessage = import('$lib/services/campaign/chat-types').ChatMessage

// ===== Character Sheet Types (Phase 3) =====

export interface ResourceValue {
  current: number
  max: number
}

export interface ConditionState {
  active: boolean
  note: string | null
}

/** A character's dynamic ruleset state: stat scores, resources, conditions, level/xp. */
export interface CharacterSheet {
  characterId: string
  rulesetId: string
  statValues: Record<string, number>
  resourceValues: Record<string, ResourceValue>
  conditionStates: Record<string, ConditionState>
  level: number
  xp: number
  createdAt: number
  updatedAt: number
}

export interface CharacterSheetRevision {
  id: string
  characterId: string
  parentRevisionId: string | null
  authorType: 'gm' | 'ai_player'
  authorAIPlayerId: string | null
  source: string
  snapshot: CharacterSheet
  createdAt: number
}

export interface CharacterSheetDraft {
  name: string
  description: string
  traits: string[]
  visualDescriptors: VisualDescriptors
  sheet: Omit<CharacterSheet, 'characterId' | 'createdAt' | 'updatedAt'>
}

export interface CharacterSheetProposal {
  id: string
  campaignId: string
  setupSessionId: string | null
  aiPlayerId: string
  characterId: string | null
  proposalType: 'create' | 'update'
  payload: CharacterSheetDraft
  status: 'pending' | 'approved' | 'declined'
  reviewNotes: string | null
  createdAt: number
  reviewedAt: number | null
}

// ===== Character Vault Types =====

export type VaultCharacterSource = 'manual' | 'import' | 'story'

/**
 * A reusable character template stored in the global vault.
 * Characters are copied to stories, not linked.
 */
export interface VaultCharacter {
  id: string
  name: string
  description: string | null

  // Common fields (same as Character)
  traits: string[]
  visualDescriptors: VisualDescriptors
  portrait: string | null // Data URL

  // Organization
  tags: string[]
  favorite: boolean

  // Provenance
  source: VaultCharacterSource
  originalStoryId: string | null // If saved from a story
  metadata: Record<string, unknown> | null

  createdAt: number
  updatedAt: number
}

// ===== Lorebook Vault Types =====

export type VaultLorebookSource = 'import' | 'story' | 'manual'

export interface VaultLorebookMetadata {
  format: 'aventura' | 'sillytavern' | 'unknown'
  totalEntries: number
  entryBreakdown: Record<EntryType, number>
  [key: string]: unknown
}

/**
 * A reusable lorebook stored in the global vault.
 * Contains processed ImportedEntry[] that can be copied to stories.
 */
export interface VaultLorebook {
  id: string
  name: string
  description: string | null

  // Processed entries (from LorebookImportResult)
  entries: VaultLorebookEntry[]

  // Organization
  tags: string[]
  favorite: boolean

  // Provenance
  source: VaultLorebookSource
  originalFilename: string | null
  originalStoryId: string | null

  // Metadata
  metadata: VaultLorebookMetadata | null

  createdAt: number
  updatedAt: number
}

/**
 * A lorebook entry stored in the vault.
 * Similar to ImportedEntry but without originalData for cleaner storage.
 */
export interface VaultLorebookEntry {
  name: string
  type: EntryType
  description: string
  keywords: string[]
  aliases: string[]
  injectionMode: EntryInjectionMode
  priority: number
}

// ===== Scenario Vault Types =====

export type VaultScenarioSource = 'import' | 'wizard' | 'manual'

export interface VaultScenarioNpc {
  id?: string
  name: string
  role: string
  description: string
  relationship: string
  traits: string[]
}

export interface VaultScenarioMetadata {
  cardVersion?: string
  sourceUrl?: string
  importing?: boolean
  hasFirstMessage?: boolean
  alternateGreetingsCount?: number
  npcCount?: number
  linkedLorebookId?: string // ID of auto-imported lorebook from embedded character_book
  [key: string]: unknown
}

/**
 * A reusable scenario stored in the global vault.
 * Contains setting, NPCs, and opening scene data extracted from character cards.
 */
export interface VaultScenario {
  id: string
  name: string
  description: string | null // Summary/preview of the scenario

  // Core content (from CardImportResult)
  settingSeed: string
  npcs: VaultScenarioNpc[]
  primaryCharacterName: string

  // Opening scene data
  firstMessage: string | null
  alternateGreetings: string[]

  // Organization
  tags: string[]
  favorite: boolean

  // Provenance
  source: VaultScenarioSource
  originalFilename: string | null

  // Metadata
  metadata: VaultScenarioMetadata | null

  createdAt: number
  updatedAt: number
}

export interface Location {
  id: string
  storyId: string
  name: string
  description: string | null
  visited: boolean
  current: boolean
  connections: string[]
  metadata: Record<string, unknown> | null
  branchId: string | null // Branch this location belongs to (null = main/inherited)
  overridesId?: string | null // COW: ID of the parent entity this row overrides (null = original)
  deleted?: boolean // COD: tombstone — entity is deleted on this branch (COW only)
  // Translation fields
  translatedName?: string | null
  translatedDescription?: string | null
  translationLanguage?: string | null
}

export interface Item {
  id: string
  storyId: string
  name: string
  description: string | null
  quantity: number
  weight?: number
  equipped: boolean
  location: string
  ownerCharacterId?: string | null
  slotKey?: string | null
  containerItemId?: string | null
  metadata: Record<string, unknown> | null
  branchId: string | null // Branch this item belongs to (null = main/inherited)
  overridesId?: string | null // COW: ID of the parent entity this row overrides (null = original)
  deleted?: boolean // COD: tombstone — entity is deleted on this branch (COW only)
  // Translation fields
  translatedName?: string | null
  translatedDescription?: string | null
  translationLanguage?: string | null
}

export interface StoryBeat {
  id: string
  storyId: string
  title: string
  description: string | null
  type: 'milestone' | 'quest' | 'revelation' | 'event' | 'plot_point'
  status: 'pending' | 'active' | 'completed' | 'failed'
  triggeredAt: number | null
  resolvedAt?: number | null
  metadata: Record<string, unknown> | null
  branchId: string | null // Branch this beat belongs to (null = main/inherited)
  overridesId?: string | null // COW: ID of the parent entity this row overrides (null = original)
  deleted?: boolean // COD: tombstone — entity is deleted on this branch (COW only)
  // Translation fields
  translatedTitle?: string | null
  translatedDescription?: string | null
  translationLanguage?: string | null
}

export interface TemplateInitialState {
  protagonist?: Partial<Character>
  startingLocation?: Partial<Location>
}

// Chapter for memory system
export interface Chapter {
  id: string
  storyId: string
  number: number
  title: string | null

  // Boundaries
  startEntryId: string
  endEntryId: string
  entryCount: number

  // Content
  summary: string

  // Story time span covered by this chapter
  startTime: TimeTracker | null
  endTime: TimeTracker | null

  // Retrieval optimization metadata
  keywords: string[]
  characters: string[] // Character names mentioned
  locations: string[] // Location names mentioned
  plotThreads: string[]
  emotionalTone: string | null

  branchId: string | null // Branch this chapter belongs to (null = main branch for legacy)

  createdAt: number
}

export interface ChapterSource {
  id: string
  storyId: string
  branchId: string | null
  title: string
  sourceFilename: string | null
  chapterNumber: number | null
  rawText: string
  summary: string | null
  keywords: string[]
  characters: string[]
  locations: string[]
  plotThreads: string[]
  emotionalTone: string | null
  sourceType: 'import'
  createdAt: number
  updatedAt: number
}

export interface ChapterImportArtifactDelta {
  characters: string[]
  locations: string[]
  items: string[]
  storyBeats: string[]
  lorebookEntries: string[]
}

export interface ChapterLorebookChangeSummary {
  created: number
  updated: number
  deleted: number
  merged: number
  eventsCreated: number
  eventsUpdated: number
  createdEntries: string[]
  updatedEntries: string[]
}

export interface ChapterSourceImportChapterResult {
  filename: string
  title: string
  chapterNumber: number | null
  summary: string | null
  keywords: string[]
  characters: string[]
  locations: string[]
  events: string[]
  plotThreads: string[]
  emotionalTone: string | null
  created: ChapterImportArtifactDelta
  lorebookChanges: ChapterLorebookChangeSummary
  errors: string[]
}

export interface ChapterSourceImportReport {
  importedCount: number
  parseIntoStoryState: boolean
  failedChapterCount: number
  createdTotals: {
    characters: number
    locations: number
    items: number
    storyBeats: number
    lorebookEntries: number
  }
  lorebookTotals: {
    created: number
    updated: number
    deleted: number
    merged: number
    eventsCreated: number
    eventsUpdated: number
  }
  chapters: ChapterSourceImportChapterResult[]
}

export type ChapterImportProgressPhase =
  | 'chapter-start'
  | 'entry-created'
  | 'summarize-start'
  | 'summarize-complete'
  | 'classify-start'
  | 'classify-complete'
  | 'lore-start'
  | 'lore-complete'
  | 'chapter-record-start'
  | 'chapter-record-complete'
  | 'source-save'
  | 'chapter-complete'
  | 'chapter-error'

export interface ChapterImportProgressEvent {
  chapterIndex: number
  totalChapters: number
  filename: string
  title: string
  phase: ChapterImportProgressPhase
  message: string
}

// Checkpoint for save/restore functionality
export interface Checkpoint {
  id: string
  storyId: string
  name: string

  // Snapshot boundaries
  lastEntryId: string
  lastEntryPreview: string | null
  entryCount: number

  // Deep copy of state
  entriesSnapshot: StoryEntry[]
  charactersSnapshot: Character[]
  locationsSnapshot: Location[]
  itemsSnapshot: Item[]
  storyBeatsSnapshot: StoryBeat[]
  chaptersSnapshot: Chapter[]
  // Optional: undefined means "preserve current time" on restore (for backward compatibility)
  timeTrackerSnapshot?: TimeTracker | null
  // Optional: undefined means "preserve current lorebook" on restore (for backward compatibility)
  lorebookEntriesSnapshot?: Entry[]

  createdAt: number
}

// Branch for story branching/alternate timeline support
export interface Branch {
  id: string
  storyId: string
  name: string
  parentBranchId: string | null // NULL for main branch
  forkEntryId: string // Entry where this branch diverges from parent
  checkpointId: string | null // Checkpoint for world state restoration
  createdAt: number
  snapshotComplete?: boolean // When true, branch has its own complete entity set (no lineage resolution needed)
}

// ===== Entry/Lorebook System (per design doc section 3.2) =====

export type EntryType = 'character' | 'location' | 'item' | 'faction' | 'concept' | 'event'
export type EntryInjectionMode = 'always' | 'keyword' | 'never'
export type EntryCreator = 'user' | 'ai' | 'import'

/**
 * Entry - Unified lorebook and tracker system.
 * Combines static descriptions with dynamic state tracking.
 * Per design doc section 3.2.1
 */
export interface Entry {
  id: string
  storyId: string
  name: string
  type: EntryType
  abilityId?: string | null

  // Static content
  description: string
  hiddenInfo: string | null // Info protagonist doesn't know yet
  aliases: string[]

  // Dynamic state (type-specific)
  state: EntryState

  // Mode-specific state (optional)
  adventureState: AdventureEntryState | null

  // Injection rules
  injection: EntryInjection

  // Metadata
  firstMentioned: string | null // Entry ID where first mentioned
  lastMentioned: string | null // Entry ID where last mentioned
  mentionCount: number
  createdBy: EntryCreator
  createdAt: number
  updatedAt: number

  // Lore management settings
  loreManagementBlacklisted: boolean // If true, hidden from AI lore management

  // Epistemic visibility settings
  visibilityScope?: EpistemicVisibilityScope
  secrecyScope?: EpistemicSecrecyScope
  revealState?: EpistemicRevealState

  // Branch support
  branchId: string | null // Branch this entry belongs to (null = main/inherited)
  overridesId?: string | null // COW: ID of the parent entity this row overrides (null = original)
  deleted?: boolean // COD: tombstone — entity is deleted on this branch (COW only)
}

export interface EntryInjection {
  mode: EntryInjectionMode
  keywords: string[]
  priority: number // Higher = inject first
}

// Base entry state (common fields)
export interface BaseEntryState {
  type: EntryType
}

// Character-specific state (per design doc section 3.2.2)
export interface CharacterEntryState extends BaseEntryState {
  type: 'character'
  isPresent: boolean
  lastSeenLocation: string | null
  currentDisposition: string | null
  relationship: {
    level: number // -100 to 100
    status: string
    history: RelationshipChange[]
  }
  knownFacts: string[]
  revealedSecrets: string[]
}

export interface RelationshipChange {
  description: string
  entryId: string
  timestamp: number
}

// Location-specific state
export interface LocationEntryState extends BaseEntryState {
  type: 'location'
  isCurrentLocation: boolean
  visitCount: number
  changes: { description: string; entryId: string }[]
  presentCharacters: string[] // Entry IDs
  presentItems: string[] // Entry IDs
}

// Item-specific state
export interface ItemEntryState extends BaseEntryState {
  type: 'item'
  inInventory: boolean
  currentLocation: string | null // Entry ID or 'inventory'
  condition: string | null
  uses: { action: string; result: string; entryId: string }[]
}

// Faction-specific state
export interface FactionEntryState extends BaseEntryState {
  type: 'faction'
  playerStanding: number // -100 to 100
  status: 'allied' | 'neutral' | 'hostile' | 'unknown'
  knownMembers: string[] // Entry IDs of known members
}

// Concept-specific state (lore concepts, magic systems, etc.)
export interface ConceptEntryState extends BaseEntryState {
  type: 'concept'
  revealed: boolean
  comprehensionLevel: 'unknown' | 'basic' | 'intermediate' | 'advanced'
  relatedEntries: string[] // Entry IDs
}

// Event-specific state
export interface EventEntryState extends BaseEntryState {
  type: 'event'
  occurred: boolean
  occurredAt: number | null
  witnesses: string[] // Entry IDs
  consequences: string[]
}

export type EntryState =
  | CharacterEntryState
  | LocationEntryState
  | ItemEntryState
  | FactionEntryState
  | ConceptEntryState
  | EventEntryState

// Adventure mode specific state
export interface AdventureEntryState {
  discovered: boolean
  interactedWith: boolean
  notes: string[] // Player notes
}

// Entry preview for listings (lighter than full Entry)
export interface EntryPreview {
  id: string
  name: string
  type: EntryType
  description: string
  aliases: string[]
}

// ===== Lore Management System (per design doc section 3.4) =====

export type LoreChangeType = 'create' | 'update' | 'merge' | 'delete' | 'complete'

export interface LoreChange {
  type: LoreChangeType
  entry?: Entry
  previous?: Partial<Entry>
  mergedFrom?: string[]
  summary?: string
}

export interface LoreManagementResult {
  changes: LoreChange[]
  summary: string
  sessionId: string
}

// ===== Epistemic Secret System =====

export type EpistemicSecrecyScope = 'public' | 'character_scoped' | 'director_only'
export type EpistemicRevealState = 'hidden' | 'foreshadowed' | 'revealed'
export type EpistemicVisibilityScope = 'adventure' | 'creative-writing' | 'both'

// Built-in pressure types for easy reuse; custom tags can be added via `custom`.
export type BuiltInPressureType =
  | 'fear'
  | 'loyalty'
  | 'greed'
  | 'coercion'
  | 'ideology'
  | 'panic'
  | 'duty'

export interface EpistemicPressureTag {
  type: BuiltInPressureType | 'custom'
  tag: string
  // Suggested range is -10 to +10; keep as number for flexibility.
  strength: number
}

export interface EpistemicSecretAtom {
  id: string
  storyId: string
  parentEntryId: string | null
  label: string
  payloadHidden: string
  payloadForeshadow: string | null
  secrecyScope: EpistemicSecrecyScope
  revealState: EpistemicRevealState
  revealConstraints: Record<string, unknown> | null
  provenance: Record<string, unknown> | null
  visibilityScope: EpistemicVisibilityScope
  createdAt: number
  updatedAt: number
}

// Supports canonical characters, scenario/imported identities, and runtime-introduced IDs.
export type EpistemicCharacterRefType =
  | 'story_character'
  | 'scenario_npc'
  | 'imported_npc'
  | 'runtime_character'

export interface EpistemicIdentityRef {
  refType: EpistemicCharacterRefType
  refId: string
}

export type EpistemicDisclosurePolicy = 'guarded' | 'selective' | 'candid' | 'manipulative'

export interface EpistemicCharacterKnowledgeEdge {
  id: string
  storyId: string
  atomId: string
  characterRefType: EpistemicCharacterRefType
  characterRefId: string
  // Canonical story character row (nullable for scenario/imported/runtime identities).
  characterId: string | null
  knows: boolean
  confidence: number
  disclosureIntent: number
  disclosurePolicy: EpistemicDisclosurePolicy
  rationaleTags: string[]
  pressureTags: EpistemicPressureTag[]
  learnedVia: string | null
  learnedAt: number | null
  metadata: Record<string, unknown> | null
  updatedAt: number
}

export type DirectorProposalApprovalState = 'pending' | 'approved' | 'rejected'

export interface DirectorProposalArtifact {
  id: string
  storyId: string
  authorType: 'assistant' | 'user'
  proposalType: string
  title: string | null
  draftPayload: Record<string, unknown>
  diffPayload: Record<string, unknown> | null
  approvalState: DirectorProposalApprovalState
  approvedBy: string | null
  approvedAt: number | null
  createdAt: number
  updatedAt: number
}

// ===== Agentic Session Tracking =====

export interface AgenticSession {
  id: string
  type: 'lore-management' | 'agentic-retrieval' | 'timeline-fill'
  storyId: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  startedAt: number
  completedAt: number | null
  messageCount: number
  // Session is stored separately, not persisted to DB
}

// UI State types
export type ActivePanel =
  | 'story'
  | 'library'
  | 'settings'
  | 'templates'
  | 'lorebook'
  | 'memory'
  | 'vault'
  | 'gallery'
  | 'gm'
  | 'rulesets'
  | 'worldbuilding'
  | 'ai-players'
export type SidebarTab =
  | 'characters'
  | 'locations'
  | 'inventory'
  | 'quests'
  | 'time'
  | 'branches'
  | 'gm'

export interface UIState {
  activePanel: ActivePanel
  sidebarTab: SidebarTab
  sidebarOpen: boolean
  settingsModalOpen: boolean
}

// Provider types matching Vercel AI SDK providers
export type ProviderType =
  | 'openrouter' // @openrouter/ai-sdk-provider
  | 'nanogpt' // @ai-sdk/openai-compatible at nano-gpt.com
  | 'chutes' // @chutes-ai/ai-sdk-provider
  | 'pollinations' // ai-sdk-pollinations
  | 'ollama' // @ai-sdk/openai-compatible (local)
  | 'lmstudio' // @ai-sdk/openai (local, default localhost:1234)
  | 'llamacpp' // @ai-sdk/openai (local, default localhost:8080)
  | 'nvidia-nim' // @ai-sdk/openai (NVIDIA NIM)
  | 'openai-compatible' // @ai-sdk/openai-compatible (requires custom baseUrl)
  | 'openai' // @ai-sdk/openai
  | 'anthropic' // @ai-sdk/anthropic
  | 'google' // @ai-sdk/google
  | 'xai' // @ai-sdk/xai (Grok)
  | 'groq' // @ai-sdk/groq
  | 'zhipu' // @ai-sdk/openai-compatible cuz the proper provider package SUCKS (Z.AI/GLM)
  | 'deepseek' // @ai-sdk/deepseek
  | 'mistral' // @ai-sdk/mistral

/** Result from fetching models, including which ones support reasoning */
export interface TextModel {
  id: string
  reasoning?: boolean
  /** Whether the model uses a token budget for reasoning (Gemini 2.x, Anthropic) instead of effort levels */
  isBudgetReasoning?: boolean
  structuredOutput?: boolean
}

// API Profile for saving OpenAI-compatible endpoint configurations
export interface APIProfile {
  id: string // UUID
  name: string // User-friendly name (e.g., "Local LLM", "OpenRouter")
  providerType: ProviderType // Explicit provider selection (determines SDK provider)
  baseUrl?: string // Optional custom base URL (works for all providers)
  apiKey: string // API key for this endpoint
  customModels: string[] // Manually added models
  fetchedModels: TextModel[] // Auto-fetched from /models endpoint
  hiddenModels: string[] // Models hidden from selection lists
  favoriteModels: string[] // Models shown at the top of selection lists
  pingEnabled?: boolean // Opt-in: enable pings to show model availability status (OR free / NIM only)
  createdAt: number // Timestamp
}

// API Settings
export interface APISettings {
  // Legacy fields - kept for backwards compatibility during migration
  openaiApiURL: string
  openaiApiKey: string | null
  // Saved profiles
  profiles: APIProfile[]
  activeProfileId: string | null // ID of profile being edited in API tab (UI state only)
  // Main narrative generation settings
  mainNarrativeProfileId: string // Profile used for main story generation
  defaultProfileId?: string // Global default profile used as fallback
  defaultModel: string
  temperature: number
  maxTokens: number
  reasoningEffort: ReasoningEffort // Reasoning effort for the main narrative model
  manualBody: string // Manual request body JSON for the main narrative model
  enableThinking: boolean // Legacy toggle for reasoning (backward compatibility)
  openRouterContextCompressionEnabled: boolean // Enable OpenRouter context-compression plugin
  llmTimeoutMs: number // Request timeout in milliseconds (default: 360000 = 6 minutes)
}

export type ReasoningEffort = 'off' | 'low' | 'medium' | 'high'

import type { ThemeId as ThemeIdImport } from '../../themes/themes'
export type ThemeId = ThemeIdImport

export type FontSource = 'default' | 'system' | 'google'

export interface ReadingWindowFormattingSettings {
  mainText: string
  italicsText: string
  doubleAsteriskText: string
  quoteText: string
  angleBracketText: string
}

export interface UISettings {
  theme: ThemeId
  fontSize: number
  fontFamily: string
  fontSource: FontSource
  showWordCount: boolean
  autoSave: boolean
  spellcheckEnabled: boolean
  debugMode: boolean
  gmMode: boolean
  disableSuggestions: boolean
  disableActionPrefixes: boolean
  showReasoning: boolean
  sidebarWidth: number
  autoScroll: boolean
  showScrollToTop: boolean
  showScrollToBottom: boolean
  storyMaxWidth: '2xl' | '3xl' | '4xl' | '5xl' | '7xl' | '9xl'
  vaultLorebookEditorWidth: 'compact' | 'comfortable' | 'wide'
  vaultLorebookEditorTextBaseRem: number
  readingWindowFormatting: ReadingWindowFormattingSettings
}

export interface UpdateSettings {
  autoCheck: boolean // Check for updates on startup
  autoDownload: boolean // Automatically download updates
  checkInterval: number // Hours between update checks (0 = only on startup)
  lastChecked: number | null // Timestamp of last check
}

// ===== Image Provider & Profile System =====

export type ImageProviderType =
  | 'nanogpt'
  | 'openai'
  | 'openrouter'
  | 'chutes'
  | 'pollinations'
  | 'google'
  | 'zhipu'
  | 'comfyui'
  | 'a1111'

export interface ImageProfile {
  id: string
  name: string
  providerType: ImageProviderType
  apiKey: string
  baseUrl?: string
  model: string
  providerOptions: Record<string, unknown>
  createdAt: number
}

// ===== Image Generation System =====

export type EmbeddedImageStatus = 'pending' | 'generating' | 'complete' | 'failed'

export interface EmbeddedImage {
  id: string
  storyId: string
  entryId: string
  sourceText: string // Text matched in narrative (case-insensitive)
  prompt: string // Full generation prompt
  styleId: string // Image style template used
  model: string // Image model used
  imageData: string // Base64 encoded image
  width?: number
  height?: number
  status: EmbeddedImageStatus
  errorMessage?: string
  createdAt: number
  generationMode?: 'analyzed' | 'inline' // How image was triggered (analyzed = LLM scene analysis, inline = <pic> tag)
}

// ===== Inline Image Generation System =====

/**
 * Parsed <pic> tag from narrative content.
 * Used for inline image generation mode where AI embeds image tags directly in narrative.
 */
export interface InlineImageTag {
  /** Full original tag text (e.g., '<pic prompt="..." characters="..."></pic>') */
  originalTag: string
  /** Start position in content */
  startIndex: number
  /** End position in content */
  endIndex: number
  /** Image generation prompt */
  prompt: string
  /** Character names for portrait reference */
  characters: string[]
  /** Generated image ID (assigned during processing) */
  imageId?: string
  /** Processing status */
  status: 'pending' | 'generating' | 'complete' | 'failed'
}

export type ImageSize = '512x512' | '1024x1024' | '1536x1536' | '2048x2048'

export interface ImageGenerationSettings {
  enabled: boolean // Toggle for image generation (default: false)
  profileId: string | null // API profile to use for image generation
  model: string // Image model (default: 'z-image-turbo')
  styleId: string // Selected image style template
  portraitStyleId?: string // Character portrait style template
  size: ImageSize // Regular image size
  referenceSize?: ImageSize // Reference image size
  portraitSize?: ImageSize // Portrait image size
  maxImagesPerMessage: number // Max images to generate per narrative (default: 2)

  // Prompt analysis model settings (for identifying imageable scenes)
  promptProfileId: string | null // API profile for prompt analysis
  promptModel: string
  promptTemperature: number
  promptMaxTokens: number
  reasoningEffort: ReasoningEffort
  manualBody: string
}

export interface GenerationPreset {
  id: string
  name: string
  description: string | null
  profileId: string | null // API profile to use (null = use main narrative profile)
  model: string
  temperature: number
  maxTokens: number
  reasoningEffort: ReasoningEffort
  manualBody: string
  /** Override structured output capability detection. 'auto' = use provider default, 'on' = force enable, 'off' = force disable */
  structuredOutputOverride?: 'auto' | 'on' | 'off'
  /** Inject a prompt nudge to encourage the model to use thinking tags properly */
  thinkingNudgePrompt?: boolean
}

// ===== Translation System Types =====

/**
 * Translation settings for multi-language support.
 * English prompts for LLM quality, translated display for user experience.
 */
export interface TranslationSettings {
  enabled: boolean
  sourceLanguage: string // 'auto' or ISO code (user's language)
  targetLanguage: string // ISO code (display language)
  translateNarration: boolean // Translate AI responses after generation
  translateUserInput: boolean // Translate user input to English for prompts
  translateWorldState: boolean // Translate world state UI elements
}

// ===== Experimental Features =====

export interface ExperimentalFeatures {
  /** Phase 1: Record world state deltas on story entries after classification */
  stateTracking: boolean
  /** Phase 2: Undo world state changes when deleting entries (cascade rollback) */
  rollbackOnDelete: boolean
  /** Phase 3: Copy-on-write branches instead of full entity duplication */
  lightweightBranches: boolean
  /** Number of entries between automatic world state snapshots (for fast rollback) */
  autoSnapshotInterval: number
  /** Android: Keep generation alive when app is backgrounded or screen is locked */
  backgroundGeneration: boolean
  /** Android: Send OS notification when generation completes while app is backgrounded */
  generationNotifications: boolean
  /** Android: Include preview of generated text in the completion notification */
  notificationPreview: boolean
  /** Allow automatic LoRA selection for image generation from catalog rules */
  smartLoraRouting: boolean
  /** Master toggle for epistemic secrets + director assistant workflow */
  epistemicWorkflowEnabled: boolean
  /** Enable Adventure-mode epistemic gating stages */
  epistemicGateAdventureEnabled: boolean
  /** Enable deterministic disclosure gatekeeper */
  epistemicDisclosureGateEnabled: boolean
  /** Enable Director Outlining Assistant in Creative mode */
  directorOutliningAssistantEnabled: boolean
  /** Execution mode for epistemic workflow: full quality or faster reduced passes */
  epistemicExecutionMode: 'quality' | 'fast'
  /** Show cost/latency impact overlay for epistemic stages */
  epistemicCostOverlayEnabled: boolean
}

export interface SmartLoraCatalogEntry {
  id: string
  /** Optional image profile scope (null = can apply to any ComfyUI profile) */
  profileId: string | null
  /** Exact LoRA model filename/id as returned by provider (e.g. foo.safetensors) */
  loraName: string
  /** Human-readable purpose and usage notes */
  description: string
  /** Optional tag hints used for matching against prompt/character text */
  tags: string[]
  /** Optional age gating (inclusive bounds). If either bound is set and age is unknown, entry is skipped. */
  minAge: number | null
  maxAge: number | null
  /** Default strengths applied when selected */
  strengthModel: number
  strengthClip: number
  /** Priority boost (higher values are preferred when multiple entries match) */
  priority: number
  enabled: boolean
}

// ===== World State Delta Tracking (Phase 1) =====

/** Snapshot of a character's mutable fields before a classification update */
export interface CharacterBeforeState {
  id: string
  name: string
  status: string
  relationship: string | null
  traits: string[]
  visualDescriptors: VisualDescriptors
  /** Metadata snapshot for rollback (includes runtimeVars from pack runtime variables) */
  metadata?: Record<string, unknown> | null
}

/** Snapshot of a location's mutable fields before a classification update */
export interface LocationBeforeState {
  id: string
  name: string
  visited: boolean
  current: boolean
  description: string | null
  /** Metadata snapshot for rollback (includes runtimeVars from pack runtime variables) */
  metadata?: Record<string, unknown> | null
}

/** Snapshot of an item's mutable fields before a classification update */
export interface ItemBeforeState {
  id: string
  name: string
  quantity: number
  equipped: boolean
  location: string
  /** Metadata snapshot for rollback (includes runtimeVars from pack runtime variables) */
  metadata?: Record<string, unknown> | null
}

/** Snapshot of a story beat's mutable fields before a classification update */
export interface StoryBeatBeforeState {
  id: string
  title: string
  status: string
  description: string | null
  resolvedAt: number | null
  /** Metadata snapshot for rollback (includes runtimeVars from pack runtime variables) */
  metadata?: Record<string, unknown> | null
}

/**
 * Records the complete world state change caused by a single classification.
 * Stored as JSON on the story_entries.world_state_delta column.
 * Contains enough information to fully undo the classification's effects.
 */
export interface WorldStateDelta {
  /** The raw classification result that was applied (stored as-is for debugging/audit) */
  classificationResult: Record<string, unknown>

  /** Before-state of each entity that was UPDATED (for undo) */
  previousState: {
    characters: CharacterBeforeState[]
    locations: LocationBeforeState[]
    items: ItemBeforeState[]
    storyBeats: StoryBeatBeforeState[]
    /** ID of the location that was 'current' before this classification */
    currentLocationId: string | null
    /** Time tracker state before time progression was applied */
    timeTracker: TimeTracker | null
    /** Money amount before this classification was applied (null if money system disabled) */
    moneyAmount: number | null
  }

  /** IDs of entities CREATED by this classification (undo = delete these) */
  createdEntities: {
    characterIds: string[]
    locationIds: string[]
    itemIds: string[]
    storyBeatIds: string[]
  }
}

/**
 * Periodic full snapshot of world state for fast rollback reconstruction.
 * Instead of replaying all deltas from the start, rollback can start from the
 * nearest snapshot and only replay/undo deltas from there.
 */
export interface WorldStateSnapshot {
  id: string
  storyId: string
  branchId: string | null
  entryId: string
  entryPosition: number
  charactersSnapshot: Character[]
  locationsSnapshot: Location[]
  itemsSnapshot: Item[]
  storyBeatsSnapshot: StoryBeat[]
  lorebookEntriesSnapshot?: Entry[]
  timeTrackerSnapshot: TimeTracker | null
  createdAt: number
}

export type VaultType = 'character' | 'lorebook' | 'scenario'

export interface VaultTag {
  id: string
  name: string
  type: VaultType
  color: string
  createdAt: number
}

export interface VaultConversation {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messages: string // JSON blob — AI SDK ModelMessage[]
  chatMessages: string // JSON blob — ChatMessage[] (UI display state with diff cards, images, reasoning)
  pendingChanges: string // JSON blob — VaultPendingChange[] (full list including status)
  entryVersions?: string // JSON blob — [lorebookId, version][] for change detection across sessions
}

export interface EditorConversation {
  id: string
  storyId: string
  title: string
  createdAt: string
  updatedAt: string
  messages: string // JSON blob — AI SDK ModelMessage[]
  chatMessages: string // JSON blob — EditorChatMessage[]
  pendingEdits: string // JSON blob — EditorProposedEdit[]
  uiState?: string // JSON blob — misc UI state (selected target entry, etc.)
}

/**
 * Variable Registry
 *
 * Manages variable definitions across three categories:
 * - system: Auto-filled by the application
 * - runtime: Injected by services at render time
 * - custom: User-defined variables in preset packs
 */

import type { VariableDefinition, VariableCategory } from './types'

/**
 * System variables - auto-filled by the application
 * These variables are always available in templates and are populated from story context.
 */
export const SYSTEM_VARIABLES: VariableDefinition[] = [
  {
    name: 'protagonistName',
    type: 'text',
    category: 'system',
    description: 'Name of the main character',
    required: true,
  },
  {
    name: 'currentLocation',
    type: 'text',
    category: 'system',
    description: 'Current story location',
    required: false,
  },
  {
    name: 'storyTime',
    type: 'text',
    category: 'system',
    description: 'Current in-story time',
    required: false,
  },
  {
    name: 'genre',
    type: 'text',
    category: 'system',
    description: 'Story genre',
    required: false,
  },
  {
    name: 'tone',
    type: 'text',
    category: 'system',
    description: 'Story tone/mood',
    required: false,
  },
  {
    name: 'settingDescription',
    type: 'text',
    category: 'system',
    description: 'World/setting description',
    required: false,
  },
  {
    name: 'themes',
    type: 'text',
    category: 'system',
    description: 'Story themes as comma-separated list',
    required: false,
  },
  {
    name: 'mode',
    type: 'enum',
    category: 'system',
    description: 'Story mode',
    required: true,
    enumValues: ['adventure', 'creative-writing'],
  },
  {
    name: 'pov',
    type: 'enum',
    category: 'system',
    description: 'Point of view',
    required: true,
    enumValues: ['first', 'second', 'third'],
  },
  {
    name: 'tense',
    type: 'enum',
    category: 'system',
    description: 'Narrative tense',
    required: true,
    enumValues: ['past', 'present'],
  },
  {
    name: 'campaignTitle',
    type: 'text',
    category: 'system',
    description: 'Active campaign title',
    required: false,
  },
  {
    name: 'campaignSessionNumber',
    type: 'number',
    category: 'system',
    description: 'Active campaign session number',
    required: false,
  },
  {
    name: 'nsfwIntensity',
    type: 'number',
    category: 'system',
    description: 'Campaign NSFW content intensity level (0-8)',
    required: false,
  },
  {
    name: 'nsfwIntensityLabel',
    type: 'text',
    category: 'system',
    description: 'Explanatory label for content intensity level',
    required: false,
  },
  {
    name: 'sceneMode',
    type: 'text',
    category: 'system',
    description: 'Current scene mode',
    required: false,
  },
  {
    name: 'turnType',
    type: 'text',
    category: 'system',
    description: 'Current narrative turn type',
    required: false,
  },
  {
    name: 'activeActorName',
    type: 'text',
    category: 'system',
    description: 'Name of the actor currently taking a turn',
    required: false,
  },
  {
    name: 'turnOrderMode',
    type: 'text',
    category: 'system',
    description: 'Current turn-order mode',
    required: false,
  },
  {
    name: 'primaryCharacterName',
    type: 'text',
    category: 'system',
    description: 'Campaign primary character name',
    required: false,
  },
  {
    name: 'primaryCharacterDescription',
    type: 'text',
    category: 'system',
    description: 'Campaign primary character context or description',
    required: false,
  },
  {
    name: 'companionRoster',
    type: 'text',
    category: 'system',
    description: 'Names of active companions',
    required: false,
  },
  {
    name: 'controlPolicy',
    type: 'text',
    category: 'system',
    description: 'Active companion control policy',
    required: false,
  },
  {
    name: 'combatControlPolicy',
    type: 'text',
    category: 'system',
    description: 'Companion combat control policy',
    required: false,
  },
  {
    name: 'upcomingActors',
    type: 'text',
    category: 'system',
    description: 'Names of actors approaching their turns',
    required: false,
  },
  {
    name: 'currentMoney',
    type: 'text',
    category: 'system',
    description: 'Current money balance',
    required: false,
  },
  {
    name: 'moneyName',
    type: 'text',
    category: 'system',
    description: 'Name of the currency (e.g. gold, credits)',
    required: false,
  },
  {
    name: 'moneySystemEnabled',
    type: 'boolean',
    category: 'system',
    description: 'Whether money tracking is enabled',
    required: false,
  },
  {
    name: 'guidedRegenerationNudge',
    type: 'text',
    category: 'system',
    description: 'Guidance directive for narrative regeneration',
    required: false,
  },
  {
    name: 'inventoryClassificationEnabled',
    type: 'boolean',
    category: 'system',
    description: 'Whether inventory extraction is enabled for classifier',
    required: false,
  },
  {
    name: 'moneyClassificationEnabled',
    type: 'boolean',
    category: 'system',
    description: 'Whether money extraction is enabled for classifier',
    required: false,
  },
  {
    name: 'characterClassificationEnabled',
    type: 'boolean',
    category: 'system',
    description: 'Whether character extraction is enabled for classifier',
    required: false,
  },
  {
    name: 'locationClassificationEnabled',
    type: 'boolean',
    category: 'system',
    description: 'Whether location extraction is enabled for classifier',
    required: false,
  },
  {
    name: 'storyBeatClassificationEnabled',
    type: 'boolean',
    category: 'system',
    description: 'Whether story beat extraction is enabled for classifier',
    required: false,
  },
  {
    name: 'sceneClassificationEnabled',
    type: 'boolean',
    category: 'system',
    description: 'Whether scene extraction is enabled for classifier',
    required: false,
  },
  {
    name: 'timeClassificationEnabled',
    type: 'boolean',
    category: 'system',
    description: 'Whether time extraction is enabled for classifier',
    required: false,
  },
  {
    name: 'clothingSystemInstructions',
    type: 'text',
    category: 'system',
    description: 'Instructions for clothing tracking in classifier',
    required: false,
  },
  {
    name: 'moneySystemInstructions',
    type: 'text',
    category: 'system',
    description: 'Instructions for money tracking in classifier',
    required: false,
  },
  {
    name: 'char',
    type: 'text',
    category: 'system',
    description: 'Character object or context for card import',
    required: false,
  },
  {
    name: 'user',
    type: 'text',
    category: 'system',
    description: 'User persona object or context for card import',
    required: false,
  },
  {
    name: 'entityType',
    type: 'text',
    category: 'system',
    description: 'Lorebook entity type name',
    required: false,
  },
  {
    name: 'entryType',
    type: 'text',
    category: 'system',
    description: 'Lorebook entry type for generation or refinement',
    required: false,
  },
  {
    name: 'entityName',
    type: 'text',
    category: 'system',
    description: 'Lorebook entity name',
    required: false,
  },
  {
    name: 'storyContextSection',
    type: 'text',
    category: 'system',
    description: 'Story context section for lorebook generation',
    required: false,
  },
  {
    name: 'storyContext',
    type: 'text',
    category: 'system',
    description: 'Story context supplied to lorebook generation',
    required: false,
  },
  {
    name: 'entryName',
    type: 'text',
    category: 'system',
    description: 'Existing lorebook entry name for generation or refinement',
    required: false,
  },
  {
    name: 'existingDescription',
    type: 'text',
    category: 'system',
    description: 'Existing lorebook entry description for refinement',
    required: false,
  },
  {
    name: 'typeLabel',
    type: 'text',
    category: 'system',
    description: 'Type label for lorebook generation',
    required: false,
  },
  {
    name: 'nameSection',
    type: 'text',
    category: 'system',
    description: 'Name section for lorebook generation',
    required: false,
  },
  {
    name: 'descriptionSection',
    type: 'text',
    category: 'system',
    description: 'Description section for lorebook generation',
    required: false,
  },
  {
    name: 'sceneContext',
    type: 'text',
    category: 'runtime',
    description: 'Rendered guidance for the current scene mode',
    required: false,
  },
  {
    name: 'narrativeTurnContext',
    type: 'text',
    category: 'runtime',
    description: 'Rendered guidance for the current narrative turn type',
    required: false,
  },
  {
    name: 'agencyContext',
    type: 'text',
    category: 'runtime',
    description: 'Rendered companion and campaign agency context',
    required: false,
  },
  {
    name: 'agencyCore',
    type: 'text',
    category: 'runtime',
    description: 'Rendered core companion agency instructions',
    required: false,
  },
  {
    name: 'agencyCompanionVoice',
    type: 'text',
    category: 'runtime',
    description: 'Rendered companion voice autonomy rules',
    required: false,
  },
  {
    name: 'agencyCompanionCombat',
    type: 'text',
    category: 'runtime',
    description: 'Rendered companion combat autonomy rules',
    required: false,
  },
  {
    name: 'gmCore',
    type: 'text',
    category: 'runtime',
    description: 'Rendered GM director rules',
    required: false,
  },
  {
    name: 'turnOrderContext',
    type: 'text',
    category: 'runtime',
    description: 'Rendered turn-order guidance',
    required: false,
  },
  {
    name: 'worldCharterContext',
    type: 'text',
    category: 'runtime',
    description: 'Rendered world charter block',
    required: false,
  },
  {
    name: 'rulesDigestContext',
    type: 'text',
    category: 'runtime',
    description: 'Rendered rules digest block',
    required: false,
  },
  {
    name: 'partyRosterContext',
    type: 'text',
    category: 'runtime',
    description: 'Rendered party roster block',
    required: false,
  },
  {
    name: 'narrativePriming',
    type: 'text',
    category: 'runtime',
    description: 'Rendered narrative priming instructions',
    required: false,
  },
  {
    name: 'recentRolls',
    type: 'text',
    category: 'runtime',
    description: 'Recent campaign roll outcomes',
    required: false,
  },
  {
    name: 'pendingRoll',
    type: 'text',
    category: 'runtime',
    description: 'Current unresolved roll request',
    required: false,
  },
  {
    name: 'safetyCoreRules',
    type: 'text',
    category: 'runtime',
    description: 'Rendered safety core rules',
    required: false,
  },
  {
    name: 'safetyGuardrails',
    type: 'text',
    category: 'runtime',
    description: 'Rendered safety redirection guidance',
    required: false,
  },
  {
    name: 'safetyContentIntensity',
    type: 'text',
    category: 'runtime',
    description: 'Rendered intensity boundary guidance',
    required: false,
  },
  {
    name: 'safetyContentBans',
    type: 'text',
    category: 'runtime',
    description: 'Rendered prohibited content boundaries',
    required: false,
  },
  {
    name: 'safetyMechanicsConstraints',
    type: 'text',
    category: 'runtime',
    description: 'Rendered mechanics safety constraints',
    required: false,
  },
]

/**
 * Variable Registry class
 * Manages variable definitions with lookup and categorization capabilities.
 */
class VariableRegistry {
  private variables: Map<string, VariableDefinition>

  constructor() {
    this.variables = new Map()
    // Pre-populate with system variables
    this.registerMany(SYSTEM_VARIABLES)
  }

  /**
   * Register a single variable definition
   *
   * @param definition - Variable definition to register
   * @throws Error if variable name already registered (prevents duplicates)
   */
  register(definition: VariableDefinition): void {
    if (this.variables.has(definition.name)) {
      throw new Error(`Variable '${definition.name}' is already registered`)
    }
    this.variables.set(definition.name, definition)
  }

  /**
   * Register multiple variable definitions
   *
   * @param definitions - Array of variable definitions to register
   */
  registerMany(definitions: VariableDefinition[]): void {
    for (const definition of definitions) {
      this.register(definition)
    }
  }

  /**
   * Get a variable definition by name
   *
   * @param name - Variable name
   * @returns Variable definition or undefined if not found
   */
  get(name: string): VariableDefinition | undefined {
    return this.variables.get(name)
  }

  /**
   * Check if a variable is registered
   *
   * @param name - Variable name
   * @returns True if variable exists
   */
  has(name: string): boolean {
    return this.variables.has(name)
  }

  /**
   * Get all variables in a specific category
   *
   * @param category - Variable category (system, runtime, or custom)
   * @returns Array of variable definitions in that category
   */
  getByCategory(category: VariableCategory): VariableDefinition[] {
    return Array.from(this.variables.values()).filter((v) => v.category === category)
  }

  /**
   * Get all registered variable names
   *
   * @returns Array of all variable names
   */
  getAllNames(): string[] {
    return Array.from(this.variables.keys())
  }

  /**
   * Get all registered variable definitions
   *
   * @returns Array of all variable definitions
   */
  getAll(): VariableDefinition[] {
    return Array.from(this.variables.values())
  }

  /**
   * Clear all variable definitions
   * Useful for reinitialization.
   */
  clear(): void {
    this.variables.clear()
  }

  /**
   * Remove a single variable definition
   *
   * @param name - Variable name to remove
   */
  remove(name: string): void {
    this.variables.delete(name)
  }
}

/**
 * Runtime variables - injected by services at render time
 * These variables are populated by various AI services when building prompts.
 * Registered for autocomplete and validation in the template editor.
 */
export const RUNTIME_VARIABLES: VariableDefinition[] = [
  // === Narrative Service ===
  {
    name: 'recentContent',
    type: 'text',
    category: 'runtime',
    description: 'Recent story content for context',
    required: false,
  },
  {
    name: 'tieredContextBlock',
    type: 'text',
    category: 'runtime',
    description: 'Lorebook entries injected by tiered retrieval',
    required: false,
  },
  {
    name: 'chapterSummaries',
    type: 'text',
    category: 'runtime',
    description: 'Formatted chapter summaries block',
    required: false,
  },
  {
    name: 'styleGuidance',
    type: 'text',
    category: 'runtime',
    description: 'Style guidance from repetition analysis',
    required: false,
  },
  {
    name: 'retrievedChapterContext',
    type: 'text',
    category: 'runtime',
    description: 'Retrieved chapter context from memory',
    required: false,
  },
  {
    name: 'inlineImageInstructions',
    type: 'text',
    category: 'runtime',
    description: 'Instructions for inline image generation',
    required: false,
  },
  {
    name: 'visualProseInstructions',
    type: 'text',
    category: 'runtime',
    description: 'Instructions for visual prose mode',
    required: false,
  },
  {
    name: 'visualProseMode',
    type: 'boolean',
    category: 'runtime',
    description: 'Whether visual prose mode is enabled',
    required: false,
  },
  {
    name: 'inlineImageMode',
    type: 'boolean',
    category: 'runtime',
    description: 'Whether inline image mode is enabled',
    required: false,
  },
  {
    name: 'partyRoster',
    type: 'text',
    category: 'runtime',
    description: 'Formatted active party roster and control modes',
    required: false,
  },
  {
    name: 'companionAgencyContext',
    type: 'text',
    category: 'runtime',
    description: 'Companion motivations, priorities, and boundaries',
    required: false,
  },
  {
    name: 'companionAgency',
    type: 'text',
    category: 'runtime',
    description: 'Companion decision-ownership contract',
    required: false,
  },
  {
    name: 'worldCharter',
    type: 'text',
    category: 'runtime',
    description: 'Campaign world charter',
    required: false,
  },
  {
    name: 'gmPersona',
    type: 'text',
    category: 'runtime',
    description: 'Campaign GM voice and table style',
    required: false,
  },
  {
    name: 'rulesetDigest',
    type: 'text',
    category: 'runtime',
    description: 'Compact active ruleset summary',
    required: false,
  },
  {
    name: 'activeCampaignThreads',
    type: 'text',
    category: 'runtime',
    description: 'Player-safe active campaign threads',
    required: false,
  },
  {
    name: 'directorOnlyCampaignThreads',
    type: 'text',
    category: 'runtime',
    description: 'Director-only campaign threads',
    required: false,
  },

  // === Classifier Service ===
  {
    name: 'entityCounts',
    type: 'text',
    category: 'runtime',
    description: 'Count of existing entities (characters, locations, items)',
    required: false,
  },
  {
    name: 'currentTimeInfo',
    type: 'text',
    category: 'runtime',
    description: 'Current in-story time information',
    required: false,
  },
  {
    name: 'chatHistoryBlock',
    type: 'text',
    category: 'runtime',
    description: 'Formatted chat history block',
    required: false,
  },
  {
    name: 'inputLabel',
    type: 'text',
    category: 'runtime',
    description: 'Label for user input (Player Action or Author Direction)',
    required: false,
  },
  {
    name: 'userAction',
    type: 'text',
    category: 'runtime',
    description: 'The user action or direction text',
    required: false,
  },
  {
    name: 'narrativeResponse',
    type: 'text',
    category: 'runtime',
    description: 'The narrative response text',
    required: false,
  },
  {
    name: 'existingCharacters',
    type: 'text',
    category: 'runtime',
    description: 'Known character list for classification',
    required: false,
  },
  {
    name: 'existingLocations',
    type: 'text',
    category: 'runtime',
    description: 'Known location list for classification',
    required: false,
  },
  {
    name: 'existingItems',
    type: 'text',
    category: 'runtime',
    description: 'Known item list for classification',
    required: false,
  },
  {
    name: 'existingBeats',
    type: 'text',
    category: 'runtime',
    description: 'Known story beat list for classification',
    required: false,
  },
  {
    name: 'storyBeatTypes',
    type: 'text',
    category: 'runtime',
    description: 'Available story beat type values',
    required: false,
  },
  {
    name: 'itemLocationOptions',
    type: 'text',
    category: 'runtime',
    description: 'Valid item location options',
    required: false,
  },
  {
    name: 'defaultItemLocation',
    type: 'text',
    category: 'runtime',
    description: 'Default item location',
    required: false,
  },

  // === Memory Service ===
  {
    name: 'chapterContent',
    type: 'text',
    category: 'runtime',
    description: 'Chapter entries to summarize',
    required: false,
  },
  {
    name: 'previousContext',
    type: 'text',
    category: 'runtime',
    description: 'Previous chapter summaries for context',
    required: false,
  },
  {
    name: 'messagesInRange',
    type: 'text',
    category: 'runtime',
    description: 'Messages in range for chapter analysis',
    required: false,
  },
  {
    name: 'firstValidId',
    type: 'text',
    category: 'runtime',
    description: 'First valid entry ID in range',
    required: false,
  },
  {
    name: 'lastValidId',
    type: 'text',
    category: 'runtime',
    description: 'Last valid entry ID in range',
    required: false,
  },
  {
    name: 'recentContext',
    type: 'text',
    category: 'runtime',
    description: 'Recent narrative context for retrieval',
    required: false,
  },
  {
    name: 'maxChaptersPerRetrieval',
    type: 'text',
    category: 'runtime',
    description: 'Maximum chapters per retrieval decision',
    required: false,
  },

  // === Suggestions Service ===
  {
    name: 'activeThreads',
    type: 'text',
    category: 'runtime',
    description: 'Active plot threads for suggestions',
    required: false,
  },

  // === Action Choices Service ===
  {
    name: 'npcsPresent',
    type: 'text',
    category: 'runtime',
    description: 'NPCs present in the current scene',
    required: false,
  },
  {
    name: 'inventory',
    type: 'text',
    category: 'runtime',
    description: 'Current inventory contents',
    required: false,
  },
  {
    name: 'activeQuests',
    type: 'text',
    category: 'runtime',
    description: 'Active quests and objectives',
    required: false,
  },
  {
    name: 'lorebookContext',
    type: 'text',
    category: 'runtime',
    description: 'Injected lorebook entries',
    required: false,
  },
  {
    name: 'protagonistDescription',
    type: 'text',
    category: 'runtime',
    description: 'Description of the protagonist',
    required: false,
  },
  {
    name: 'povInstruction',
    type: 'text',
    category: 'runtime',
    description: 'Point of view instruction text',
    required: false,
  },
  {
    name: 'lengthInstruction',
    type: 'text',
    category: 'runtime',
    description: 'Response length instruction',
    required: false,
  },

  // === Shared / Common ===
  {
    name: 'userInput',
    type: 'text',
    category: 'runtime',
    description: 'User input or action text',
    required: false,
  },

  // === Style Reviewer Service ===
  {
    name: 'passageCount',
    type: 'text',
    category: 'runtime',
    description: 'Number of passages being reviewed',
    required: false,
  },
  {
    name: 'passages',
    type: 'text',
    category: 'runtime',
    description: 'Formatted passages for style review',
    required: false,
  },

  // === Lore Management Service ===
  {
    name: 'entrySummary',
    type: 'text',
    category: 'runtime',
    description: 'Summary of lorebook entries',
    required: false,
  },
  {
    name: 'recentStorySection',
    type: 'text',
    category: 'runtime',
    description: 'Recent story content for lore analysis',
    required: false,
  },
  {
    name: 'chapterSummary',
    type: 'text',
    category: 'runtime',
    description: 'Chapter summary for lore context',
    required: false,
  },

  // === Agentic Retrieval Service ===
  {
    name: 'chaptersCount',
    type: 'text',
    category: 'runtime',
    description: 'Number of available chapters',
    required: false,
  },
  {
    name: 'chapterList',
    type: 'text',
    category: 'runtime',
    description: 'Formatted chapter list for retrieval',
    required: false,
  },
  {
    name: 'entriesCount',
    type: 'text',
    category: 'runtime',
    description: 'Number of available lorebook entries',
    required: false,
  },
  {
    name: 'entryList',
    type: 'text',
    category: 'runtime',
    description: 'Formatted lorebook entry list',
    required: false,
  },

  // === Entry Retrieval Service (Tier 3) ===
  {
    name: 'entrySummaries',
    type: 'text',
    category: 'runtime',
    description: 'Formatted entry summaries for LLM selection',
    required: false,
  },

  // === Timeline Fill Service ===
  {
    name: 'chapterHistory',
    type: 'text',
    category: 'runtime',
    description: 'Chapter history for timeline fill',
    required: false,
  },
  {
    name: 'timeline',
    type: 'text',
    category: 'runtime',
    description: 'Timeline data for gap filling',
    required: false,
  },
  {
    name: 'query',
    type: 'text',
    category: 'runtime',
    description: 'Query for timeline fill answer',
    required: false,
  },

  // === Translation Service ===
  {
    name: 'targetLanguage',
    type: 'text',
    category: 'runtime',
    description: 'Target language for translation',
    required: false,
  },
  {
    name: 'sourceLanguage',
    type: 'text',
    category: 'runtime',
    description: 'Source language for translation',
    required: false,
  },
  {
    name: 'content',
    type: 'text',
    category: 'runtime',
    description: 'Content to translate or process',
    required: false,
  },
  {
    name: 'elementsJson',
    type: 'text',
    category: 'runtime',
    description: 'JSON of UI elements for translation',
    required: false,
  },
  {
    name: 'suggestionsJson',
    type: 'text',
    category: 'runtime',
    description: 'JSON of suggestions for translation',
    required: false,
  },
  {
    name: 'choicesJson',
    type: 'text',
    category: 'runtime',
    description: 'JSON of action choices for translation',
    required: false,
  },

  // === Image Services ===
  {
    name: 'imageStylePrompt',
    type: 'text',
    category: 'runtime',
    description: 'Style prompt for image generation',
    required: false,
  },
  {
    name: 'characterDescriptors',
    type: 'text',
    category: 'runtime',
    description: 'Character visual descriptors for images',
    required: false,
  },
  {
    name: 'charactersWithPortraits',
    type: 'text',
    category: 'runtime',
    description: 'Characters that have portrait images',
    required: false,
  },
  {
    name: 'charactersWithoutPortraits',
    type: 'text',
    category: 'runtime',
    description: 'Characters without portrait images',
    required: false,
  },
  {
    name: 'maxImages',
    type: 'text',
    category: 'runtime',
    description: 'Maximum number of images to generate',
    required: false,
  },
  {
    name: 'chatHistory',
    type: 'text',
    category: 'runtime',
    description: 'Chat history for image context',
    required: false,
  },
  {
    name: 'translatedNarrativeBlock',
    type: 'text',
    category: 'runtime',
    description: 'Translated narrative for image analysis',
    required: false,
  },
  {
    name: 'previousResponse',
    type: 'text',
    category: 'runtime',
    description: 'Previous narrative response for background images',
    required: false,
  },
  {
    name: 'currentResponse',
    type: 'text',
    category: 'runtime',
    description: 'Current narrative response for background images',
    required: false,
  },
  {
    name: 'visualDescriptors',
    type: 'text',
    category: 'runtime',
    description: 'Visual descriptors for portrait generation',
    required: false,
  },

  // === Wizard Service ===
  {
    name: 'genreLabel',
    type: 'text',
    category: 'runtime',
    description: 'Genre label for wizard generation',
    required: false,
  },
  {
    name: 'seed',
    type: 'text',
    category: 'runtime',
    description: 'Seed text for setting expansion',
    required: false,
  },
  {
    name: 'customInstruction',
    type: 'text',
    category: 'runtime',
    description: 'Custom user instructions for generation',
    required: false,
  },
  {
    name: 'currentSetting',
    type: 'text',
    category: 'runtime',
    description: 'Current setting data for refinement',
    required: false,
  },
  {
    name: 'toneInstruction',
    type: 'text',
    category: 'runtime',
    description: 'Tone instruction for wizard generation',
    required: false,
  },
  {
    name: 'settingInstruction',
    type: 'text',
    category: 'runtime',
    description: 'Setting instruction for wizard generation',
    required: false,
  },
  {
    name: 'characterName',
    type: 'text',
    category: 'runtime',
    description: 'Character name for wizard generation',
    required: false,
  },
  {
    name: 'characterDescription',
    type: 'text',
    category: 'runtime',
    description: 'Character description for wizard',
    required: false,
  },
  {
    name: 'characterBackground',
    type: 'text',
    category: 'runtime',
    description: 'Character background for wizard',
    required: false,
  },
  {
    name: 'settingContext',
    type: 'text',
    category: 'runtime',
    description: 'Setting context for character wizard',
    required: false,
  },
  {
    name: 'currentCharacter',
    type: 'text',
    category: 'runtime',
    description: 'Current character data for refinement',
    required: false,
  },
  {
    name: 'settingName',
    type: 'text',
    category: 'runtime',
    description: 'Setting name for wizard generation',
    required: false,
  },
  {
    name: 'count',
    type: 'text',
    category: 'runtime',
    description: 'Count of supporting characters to generate',
    required: false,
  },
  {
    name: 'outputFormat',
    type: 'text',
    category: 'runtime',
    description: 'Output format instruction for wizard',
    required: false,
  },
  {
    name: 'title',
    type: 'text',
    category: 'runtime',
    description: 'Story title for opening generation',
    required: false,
  },
  {
    name: 'atmosphereSection',
    type: 'text',
    category: 'runtime',
    description: 'Atmosphere section for opening generation',
    required: false,
  },
  {
    name: 'supportingCharactersSection',
    type: 'text',
    category: 'runtime',
    description: 'Supporting characters section for opening',
    required: false,
  },
  {
    name: 'tenseInstruction',
    type: 'text',
    category: 'runtime',
    description: 'Tense instruction for wizard',
    required: false,
  },
  {
    name: 'povPerspective',
    type: 'text',
    category: 'runtime',
    description: 'POV perspective description',
    required: false,
  },
  {
    name: 'povPerspectiveInstructions',
    type: 'text',
    category: 'runtime',
    description: 'POV perspective instructions',
    required: false,
  },
  {
    name: 'currentOpening',
    type: 'text',
    category: 'runtime',
    description: 'Current opening text for refinement',
    required: false,
  },
  {
    name: 'openingInstruction',
    type: 'text',
    category: 'runtime',
    description: 'Opening generation instruction',
    required: false,
  },
  {
    name: 'guidanceSection',
    type: 'text',
    category: 'runtime',
    description: 'Guidance section for opening refinement',
    required: false,
  },
  {
    name: 'cardContent',
    type: 'text',
    category: 'runtime',
    description: 'Character card content for import',
    required: false,
  },
  {
    name: 'lorebookName',
    type: 'text',
    category: 'runtime',
    description: 'Lorebook name for vault import',
    required: false,
  },
  {
    name: 'entriesJson',
    type: 'text',
    category: 'runtime',
    description: 'Lorebook entries JSON for vault import',
    required: false,
  },
  {
    name: 'entryCount',
    type: 'text',
    category: 'runtime',
    description: 'Number of lorebook entries in vault import',
    required: false,
  },
  {
    name: 'messagesSample',
    type: 'text',
    category: 'runtime',
    description: 'Sampled imported ST chat messages for style detection',
    required: false,
  },
  {
    name: 'messagesJson',
    type: 'text',
    category: 'runtime',
    description: 'JSON batch of imported ST chat messages for rewrite/cleanup',
    required: false,
  },
  {
    name: 'targetPOV',
    type: 'enum',
    category: 'runtime',
    description: 'Target POV for ST import rewrite pass',
    required: false,
    enumValues: ['first', 'second', 'third'],
  },
  {
    name: 'targetTense',
    type: 'enum',
    category: 'runtime',
    description: 'Target tense for ST import rewrite pass',
    required: false,
    enumValues: ['past', 'present'],
  },
  {
    name: 'toneGuidance',
    type: 'text',
    category: 'runtime',
    description: 'Tone guidance for ST import rewrite pass',
    required: false,
  },

  // === Interactive Vault (external template) ===
  {
    name: 'characterCount',
    type: 'text',
    category: 'runtime',
    description: 'Number of characters in the vault',
    required: false,
  },
  {
    name: 'lorebookCount',
    type: 'text',
    category: 'runtime',
    description: 'Number of lorebooks in the vault',
    required: false,
  },
  {
    name: 'totalEntryCount',
    type: 'text',
    category: 'runtime',
    description: 'Total number of lorebook entries in the vault',
    required: false,
  },
  {
    name: 'scenarioCount',
    type: 'text',
    category: 'runtime',
    description: 'Number of scenarios in the vault',
    required: false,
  },

  // === Runtime Variable Context ===
  {
    name: 'runtimeVars_characters',
    type: 'text',
    category: 'runtime',
    description: 'Runtime variable values for all characters (formatted text block)',
    required: false,
  },
  {
    name: 'runtimeVars_locations',
    type: 'text',
    category: 'runtime',
    description: 'Runtime variable values for all locations (formatted text block)',
    required: false,
  },
  {
    name: 'runtimeVars_items',
    type: 'text',
    category: 'runtime',
    description: 'Runtime variable values for all items (formatted text block)',
    required: false,
  },
  {
    name: 'runtimeVars_storyBeats',
    type: 'text',
    category: 'runtime',
    description: 'Runtime variable values for all story beats (formatted text block)',
    required: false,
  },
  {
    name: 'runtimeVars_protagonist',
    type: 'text',
    category: 'runtime',
    description: 'Runtime variable values for the protagonist only',
    required: false,
  },
  {
    name: 'customVariableInstructions',
    type: 'text',
    category: 'runtime',
    description:
      'Custom variable extraction instructions for the classifier (auto-generated from runtime variable definitions)',
    required: false,
  },
]

/**
 * Singleton variable registry instance
 * Pre-loaded with system and runtime variables. Use this throughout the application.
 */
export const variableRegistry = new VariableRegistry()

// Register runtime variables at module load time
variableRegistry.registerMany(RUNTIME_VARIABLES)

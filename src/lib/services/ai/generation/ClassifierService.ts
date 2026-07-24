import { generateStructured } from '../sdk/generate'
import { z } from 'zod'
/**
 * Classifier Service
 *
 * Extracts world state from narrative responses (characters, locations, items, story beats).
 * Uses the Vercel AI SDK for structured output with Zod schema validation.
 *
 * NOTE: For classifier output types (CharacterUpdate, NewCharacter, etc.),
 * import directly from '$lib/services/ai/sdk/schemas/classifier'.
 *
 * Prompt generation flows through ContextBuilder + Liquid templates.
 */

import type {
  Story,
  StoryEntry,
  Character,
  Location,
  Item,
  StoryBeat,
  TimeTracker,
} from '$lib/types'
import { BaseAIService } from '../BaseAIService'
import { ContextBuilder } from '$lib/services/context'
import { database } from '$lib/services/database'
import { templateEngine } from '$lib/services/templates/engine'
import { createLogger } from '$lib/log'
import { stripPicTags } from '$lib/utils/inlineImageParser'
import {
  buildClassificationResultSchema,
  clampNumber,
  type ClassificationResult,
} from '../sdk/schemas/classifier'
import { buildExtendedClassificationSchema } from '../sdk/schemas/runtime-variables'
import type { RuntimeVariable, RuntimeEntityType } from '$lib/services/packs/types'

const log = createLogger('Classifier')

type ClothingMetadata = {
  isClothing?: boolean
  coveredZones?: string[]
  exposedZones?: string[]
  durability?: number
  maxDurability?: number
  unusable?: boolean
}

type InferredClothingState = {
  name: string
  clothingState: {
    damageSeverity?: 'minor' | 'moderate' | 'major' | 'destroyed'
    newlyExposedZones?: string[]
    restoredZones?: string[]
    repaired?: boolean
  }
}

type InferredMoneyUpdate = {
  delta: number
  transactionType?:
    | 'purchase'
    | 'sale'
    | 'reward'
    | 'loot'
    | 'wage'
    | 'fee'
    | 'bribe'
    | 'theft'
    | 'gamble'
    | 'other'
  reason?: string
  deniedPurchase?: boolean
  attemptedCost?: number
}

const llmMoneyUpdateSchema = z.object({
  delta: z.number(),
  transactionType: z
    .enum(['purchase', 'sale', 'reward', 'loot', 'wage', 'fee', 'bribe', 'theft', 'gamble', 'other'])
    .optional(),
  reason: z.string().optional(),
  deniedPurchase: z.boolean().optional(),
  attemptedCost: z.number().optional(),
})

const llmMoneyExtractionSchema = z.object({
  moneyUpdate: llmMoneyUpdateSchema.nullable().optional(),
})

/**
 * Context for classification.
 */
export interface ClassificationContext {
  storyId: string
  story: Story
  narrativeResponse: string
  userAction: string
  existingCharacters: Character[]
  existingLocations: Location[]
  existingItems: Item[]
  existingStoryBeats: StoryBeat[]
}

/**
 * Service that classifies narrative responses to extract world state changes.
 */
export class ClassifierService extends BaseAIService {
  private chatHistoryTruncation: number

  constructor(serviceId: string, chatHistoryTruncation: number = 100) {
    super(serviceId)
    this.chatHistoryTruncation = chatHistoryTruncation
  }

  private getToggle(story: Story, key: keyof NonNullable<Story['settings']>, defaultValue: boolean): boolean {
    const value = story.settings?.[key]
    return typeof value === 'boolean' ? value : defaultValue
  }

  /**
   * Classify a narrative response to extract world state changes.
   * When the story's pack defines runtime variables, the schema is dynamically
   * extended to include inline runtime variable extraction in the same LLM pass.
   */
  async classify(
    context: ClassificationContext,
    visibleEntries?: StoryEntry[],
    currentStoryTime?: TimeTracker | null,
  ): Promise<ClassificationResult> {
    log('classify', {
      narrativeLength: context.narrativeResponse.length,
      existingCharacters: context.existingCharacters.length,
      existingLocations: context.existingLocations.length,
      existingItems: context.existingItems.length,
      existingStoryBeats: context.existingStoryBeats.length,
    })

    const mode = context.story.mode ?? 'adventure'
    const isCreativeWriting = mode === 'creative-writing'
    const characterClassificationEnabled = this.getToggle(
      context.story,
      'characterClassificationEnabled',
      true,
    )
    const locationClassificationEnabled = this.getToggle(
      context.story,
      'locationClassificationEnabled',
      true,
    )
    const inventoryClassificationEnabled = this.getToggle(
      context.story,
      'inventoryClassificationEnabled',
      !isCreativeWriting,
    )
    const storyBeatClassificationEnabled = this.getToggle(
      context.story,
      'storyBeatClassificationEnabled',
      true,
    )
    const sceneClassificationEnabled = this.getToggle(
      context.story,
      'sceneClassificationEnabled',
      true,
    )
    const timeClassificationEnabled = this.getToggle(
      context.story,
      'timeClassificationEnabled',
      true,
    )
    const runtimeVarClassificationEnabled = this.getToggle(
      context.story,
      'runtimeVarClassificationEnabled',
      true,
    )
    const moneyClassificationEnabled =
      !!context.story.settings?.moneySystemEnabled &&
      this.getToggle(context.story, 'moneyClassificationEnabled', !isCreativeWriting)

    const itemAcquisitionFallbackEnabled =
      inventoryClassificationEnabled && this.getToggle(context.story, 'itemAcquisitionFallbackEnabled', true)
    const clothingStateFallbackEnabled =
      inventoryClassificationEnabled && this.getToggle(context.story, 'clothingStateFallbackEnabled', true)
    const moneyFallbackEnabled =
      moneyClassificationEnabled && this.getToggle(context.story, 'moneyFallbackEnabled', true)
    const moneyRecoveryEnabled =
      moneyClassificationEnabled && this.getToggle(context.story, 'moneyRecoveryEnabled', true)

    // Load runtime variable definitions for the story's pack (if any)
    let runtimeVars: RuntimeVariable[] = []
    let runtimeVarsByType: Record<string, RuntimeVariable[]> = {}
    if (runtimeVarClassificationEnabled) {
      const packId = await database.getStoryPackId(context.storyId)
      if (packId) {
        runtimeVars = await database.getRuntimeVariables(packId)
        runtimeVarsByType = this.groupByEntityType(runtimeVars)
      }
    }

    const baseSchema = buildClassificationResultSchema({
      characterClassificationEnabled,
      locationClassificationEnabled,
      inventoryClassificationEnabled,
      storyBeatClassificationEnabled,
      sceneClassificationEnabled,
      timeClassificationEnabled,
      moneyClassificationEnabled,
    })

    // Build the schema: extended with inline vars if runtime variables exist, else base
    const schema =
      runtimeVars.length > 0
        ? buildExtendedClassificationSchema(runtimeVarsByType, baseSchema)
        : baseSchema

    // Format existing entities for the prompt
    const existingCharacters = characterClassificationEnabled
      ? this.formatExistingCharacters(context.existingCharacters)
      : '(character classification disabled for this story)'
    const existingLocations = locationClassificationEnabled
      ? context.existingLocations.map((l) => l.name).join(', ') || '(none)'
      : '(location classification disabled for this story)'
    const existingItems = inventoryClassificationEnabled
      ? this.formatExistingItems(context.existingItems)
      : '(item classification disabled for this story)'
    const existingBeats = storyBeatClassificationEnabled
      ? this.formatExistingBeats(context.existingStoryBeats)
      : '(story beat classification disabled for this story)'

    // Build chat history block if entries provided
    const chatHistoryBlock = visibleEntries
      ? this.buildChatHistoryBlock(visibleEntries, currentStoryTime)
      : ''

    // Build time info
    const currentTimeInfo = currentStoryTime
      ? `Current story time: Year ${currentStoryTime.years}, Day ${currentStoryTime.days}, ${String(currentStoryTime.hours).padStart(2, '0')}:${String(currentStoryTime.minutes).padStart(2, '0')}`
      : ''

    // Build custom variable instructions for the prompt
    const customVariableInstructions =
      runtimeVars.length > 0 ? this.buildCustomVarInstructions(runtimeVarsByType) : ''

    // Create ContextBuilder from story -- auto-populates mode, pov, tense, genre, etc.
    const ctx = await ContextBuilder.forStory(context.storyId)

    // Add all runtime variables explicitly via ctx.add()
    ctx.add({
      genre: context.story.genre ? `Genre: ${context.story.genre}` : '',
      mode,
      entityCounts: `${context.existingCharacters.length} characters, ${context.existingLocations.length} locations, ${context.existingItems.length} items`,
      currentTimeInfo,
      chatHistoryBlock,
      inputLabel: mode === 'creative-writing' ? 'Author Direction' : 'Player Action',
      userAction: stripPicTags(context.userAction),
      narrativeResponse: stripPicTags(context.narrativeResponse),
      existingCharacters,
      existingLocations,
      existingItems,
      existingBeats,
      storyBeatTypes: storyBeatClassificationEnabled
        ? 'milestone, quest, revelation, event, plot_point'
        : '(story beat classification disabled)',
      itemLocationOptions: 'inventory, worn, ground, or specific location name',
      defaultItemLocation: 'inventory',
      sceneLocationDesc: sceneClassificationEnabled
        ? 'Name of current location if identifiable, null otherwise'
        : '(scene classification disabled)',
      clothingSystemInstructions:
        inventoryClassificationEnabled && context.story.settings?.clothingSystemEnabled
        ? '## Clothing System Active\nKnown clothing items may include durability and covered/exposed zones. When narration damages, tears, ruins, removes, repairs, or re-covers an existing clothing item, update that item via itemUpdates.changes.clothingState rather than creating a new item.'
        : '',
      moneySystemInstructions: moneyClassificationEnabled
        ? `## Money System Active\nCurrency name: ${(context.story.settings?.moneyName ?? 'gold').trim() || 'gold'}\nCurrent money: ${Math.max(0, Math.floor(context.story.settings?.moneyAmount ?? 0))}\nCRITICAL: If this passage includes a transaction cue (buy/sell/pay/spend/cost/reward/loot/wage) and any explicit amount/currency, you MUST output scene.moneyUpdate.\nUse delta as net money change (negative spend, positive gain).\nFor unaffordable purchases, set deniedPurchase=true and delta=0.`
        : '',
      customVariableInstructions,
      characterClassificationEnabled,
      locationClassificationEnabled,
      inventoryClassificationEnabled,
      storyBeatClassificationEnabled,
      sceneClassificationEnabled,
      timeClassificationEnabled,
      moneyClassificationEnabled,
    })

    // Render through the classifier template
    const { system, user: prompt } = await ctx.render('classifier')

    try {
      const result = (await generateStructured(
        {
          presetId: this.presetId,
          schema,
          system,
          prompt,
        },
        'classifier',
      )) as ClassificationResult

      if (!characterClassificationEnabled) {
        result.entryUpdates.characterUpdates = []
        result.entryUpdates.newCharacters = []
      }

      if (!locationClassificationEnabled) {
        result.entryUpdates.locationUpdates = []
        result.entryUpdates.newLocations = []
      }

      if (!inventoryClassificationEnabled) {
        result.entryUpdates.itemUpdates = []
        result.entryUpdates.newItems = []
      }

      if (!storyBeatClassificationEnabled) {
        result.entryUpdates.storyBeatUpdates = []
        result.entryUpdates.newStoryBeats = []
      }

      if (!sceneClassificationEnabled) {
        result.scene.currentLocationName = null
        result.scene.presentCharacterNames = []
      }

      if (!timeClassificationEnabled) {
        result.scene.timeProgression = 'none'
      }

      if (!moneyClassificationEnabled) {
        delete result.scene.moneyUpdate
      } else {
        if (moneyRecoveryEnabled) {
          this.markMoneyExtractionMiss(result, context)
          await this.tryLlmMoneyRecovery(result, context)
        }
      }

      if (itemAcquisitionFallbackEnabled) {
        this.applyItemAcquisitionFallback(result, context)
      }
      if (clothingStateFallbackEnabled) {
        this.applyClothingStateFallback(result, context)
      }
      if (moneyFallbackEnabled) {
        this.applyMoneyFallback(result, context)
      }

      // Post-process: clamp number values to min/max constraints
      if (runtimeVars.length > 0) {
        this.clampRuntimeVarNumbers(result, runtimeVarsByType)
      }

      // Attach runtime variable definitions for use by applyClassificationResult
      if (runtimeVars.length > 0) {
        result._runtimeVarDefs = runtimeVars
      }

      log('classify complete', {
        characterUpdates: result.entryUpdates.characterUpdates.length,
        newCharacters: result.entryUpdates.newCharacters.length,
        locationUpdates: result.entryUpdates.locationUpdates.length,
        newLocations: result.entryUpdates.newLocations.length,
        itemUpdates: result.entryUpdates.itemUpdates.length,
        newItems: result.entryUpdates.newItems.length,
        storyBeatUpdates: result.entryUpdates.storyBeatUpdates.length,
        newStoryBeats: result.entryUpdates.newStoryBeats.length,
        timeProgression: result.scene.timeProgression,
        hasRuntimeVars: runtimeVars.length > 0,
      })

      return result
    } catch (error) {
      log('classify failed', error)
      const fallbackResult: ClassificationResult = {
        entryUpdates: {
          characterUpdates: [],
          locationUpdates: [],
          itemUpdates: [],
          storyBeatUpdates: [],
          newCharacters: [],
          newLocations: [],
          newItems: [],
          newStoryBeats: [],
        },
        scene: {
          currentLocationName: null,
          presentCharacterNames: [],
          timeProgression: 'none',
        },
        _classifierFallbackUsed: true,
        _classifierError: error instanceof Error ? error.message : String(error),
      }
      if (itemAcquisitionFallbackEnabled) {
        this.applyItemAcquisitionFallback(fallbackResult, context)
      }
      if (clothingStateFallbackEnabled) {
        this.applyClothingStateFallback(fallbackResult, context)
      }
      if (moneyFallbackEnabled) {
        this.applyMoneyFallback(fallbackResult, context)
      }
      if (moneyRecoveryEnabled) {
        this.markMoneyExtractionMiss(fallbackResult, context)
      }
      // Return empty result on failure
      return fallbackResult
    }
  }

  private markMoneyExtractionMiss(result: ClassificationResult, context: ClassificationContext): void {
    if (!context.story.settings?.moneySystemEnabled) return
    if (result.scene.moneyUpdate) return

    const text = `${context.userAction}\n${context.narrativeResponse}`.toLowerCase()
    const transactionCue =
      /\b(buy|bought|purchase|purchased|pay|paid|spend|spent|cost|fee|fees|rent|bribe|sell|sold|earn|earned|gain|gained|reward|wage|loot|found|profit|payment)\b/i
    const amountCue = /\b\d+(?:\.\d+)?\b/
    const currencyName = (context.story.settings.moneyName ?? 'gold').trim().toLowerCase() || 'gold'
    const currencyCue = new RegExp(
      `\\b(${currencyName.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}|gold|coin|coins|credits?|cash|dollars?|bucks?|crowns?|gp)\\b`,
      'i',
    )

    const likelyMoneyEvent =
      transactionCue.test(text) && (amountCue.test(text) || currencyCue.test(text))

    if (!likelyMoneyEvent) return

    result._moneyExtractionMissed = true
    result._moneyExtractionMissReason =
      'Classifier omitted scene.moneyUpdate despite transaction cues and amount/currency cues in passage.'

    log('Classifier money extraction miss detected', {
      storyId: context.storyId,
      currencyName,
    })
  }

  private async tryLlmMoneyRecovery(
    result: ClassificationResult,
    context: ClassificationContext,
  ): Promise<void> {
    if (!result._moneyExtractionMissed) return
    if (result.scene.moneyUpdate) return

    const currencyName = (context.story.settings?.moneyName ?? 'gold').trim() || 'gold'
    const currentMoney = Math.max(0, Math.floor(context.story.settings?.moneyAmount ?? 0))

    const system = await this.buildMoneyRecoverySystemPrompt(context)

    const prompt = [
      'Money extraction context:',
      `- Currency name: ${currencyName}`,
      `- Current money: ${currentMoney}`,
      '- Rules:',
      '  - If buy/pay/spend/cost/fee/bribe indicates money loss, delta must be negative.',
      '  - If sell/reward/loot/wage/earn indicates gain, delta must be positive.',
      '  - If purchase fails due to insufficient funds, set deniedPurchase=true and delta=0.',
      '',
      'User action:',
      context.userAction,
      '',
      'Narrative response:',
      context.narrativeResponse,
    ].join('\n')

    try {
      const recovered = await generateStructured(
        {
          presetId: this.presetId,
          schema: llmMoneyExtractionSchema,
          system,
          prompt,
        },
        'classifier',
      )

      const recoveredMoney = recovered?.moneyUpdate
      if (recoveredMoney) {
        result.scene.moneyUpdate = {
          delta: recoveredMoney.delta,
          transactionType: recoveredMoney.transactionType,
          reason: recoveredMoney.reason,
          deniedPurchase: recoveredMoney.deniedPurchase,
          attemptedCost: recoveredMoney.attemptedCost,
        }
        result._moneyExtractionMissed = false
        result._moneyExtractionMissReason = undefined

        log('Recovered moneyUpdate via secondary LLM pass', {
          delta: recoveredMoney.delta,
          transactionType: recoveredMoney.transactionType,
          deniedPurchase: recoveredMoney.deniedPurchase ?? false,
        })
      }
    } catch (error) {
      log('Secondary LLM money recovery failed', error)
    }
  }

  private async buildMoneyRecoverySystemPrompt(context: ClassificationContext): Promise<string> {
    const packId = (await database.getStoryPackId(context.storyId)) ?? 'default-pack'
    const template =
      (await database.getPackTemplate(packId, 'classifier-money-recovery')) ??
      (packId !== 'default-pack'
        ? await database.getPackTemplate('default-pack', 'classifier-money-recovery')
        : null)

    if (!template?.content?.trim()) {
      return 'Extract only money changes from the passage. Return JSON only. If no clear money change occurred, return {"moneyUpdate": null}. Use negative delta for spending and positive delta for earnings.'
    }

    const templateVars: Record<string, string> = {
      storyTitle: String(context.story.title ?? ''),
      storyMode: String(context.story.mode ?? 'adventure'),
      moneyName: String(context.story.settings?.moneyName ?? 'gold'),
    }

    return templateEngine.render(template.content, templateVars) ?? ''
  }

  /**
   * Fallback: infer acquired items from narration when classifier output misses them.
   * This is intentionally conservative and only runs when no item changes were extracted.
   */
  private applyItemAcquisitionFallback(
    result: ClassificationResult,
    context: ClassificationContext,
  ): void {
    if (result.entryUpdates.newItems.length > 0 || result.entryUpdates.itemUpdates.length > 0) {
      return
    }

    const inferred = this.inferAcquiredItemsFromNarrative(
      context.narrativeResponse,
      context.userAction,
      context.existingItems,
    )

    if (inferred.length === 0) return

    result.entryUpdates.newItems.push(...inferred)

    log('Applied item acquisition fallback', {
      inferredCount: inferred.length,
      inferredItems: inferred.map((i) => i.name),
    })
  }

  private inferAcquiredItemsFromNarrative(
    narrative: string,
    userAction: string,
    existingItems: Item[],
  ): Array<{ name: string; description?: string; quantity?: number; location?: string; equipped?: boolean }> {
    const text = `${userAction}\n${narrative}`
    const lower = text.toLowerCase()

    const acquisitionCue =
      /\b(given|hands over|handed|receives?|accepted|takes?|took|caught|opens?|opened|drawstring|peers inside|inside the|satchel|pack|pouch|chest|backpack|inventory)\b/i

    if (!acquisitionCue.test(lower)) {
      return []
    }

    const existingNames = new Set(existingItems.map((i) => i.name.trim().toLowerCase()))
    const inferred: Array<{ name: string; description?: string; quantity?: number; location?: string; equipped?: boolean }> = []
    const inferredNames = new Set<string>()

    const parseCountWord = (raw: string): number | null => {
      const value = raw.toLowerCase().trim()
      if (/^\d+$/.test(value)) return Number(value)
      const lookup: Record<string, number> = {
        a: 1,
        an: 1,
        one: 1,
        two: 2,
        three: 3,
        four: 4,
        five: 5,
        six: 6,
        seven: 7,
        eight: 8,
        nine: 9,
        ten: 10,
      }
      return lookup[value] ?? null
    }

    const singularize = (name: string): string => {
      if (name.length > 4 && /ies$/i.test(name)) return name.replace(/ies$/i, 'y')
      if (name.length > 3 && /s$/i.test(name)) return name.replace(/s$/i, '')
      return name
    }

    const addCandidate = (raw: string, quantity = 1) => {
      const name = raw
        .replace(/^[\s,.;:]+|[\s,.;:]+$/g, '')
        .replace(/^and\s+/i, '')
        .replace(/\s{2,}/g, ' ')
        .trim()

      if (name.length < 3 || name.length > 80) return

      const normalized = singularize(name).toLowerCase()
      if (existingNames.has(normalized) || inferredNames.has(normalized)) return

      inferred.push({
        name: singularize(name),
        quantity: Math.max(1, Math.floor(quantity)),
        location: 'inventory',
        equipped: false,
      })
      inferredNames.add(normalized)
    }

    // Pattern A: list-like item introductions (A/An ... rests/lies/nestled/is ...)
    const listPattern =
      /(?:^|[.!?]\s+)(?:and\s+)?(?:a|an)\s+([^.,;\n—]+?)(?:\s+(?:rests|lies|nestled|sits|is|in|with|at)\b|[.,;\n—])/gim

    for (const match of narrative.matchAll(listPattern)) {
      addCandidate(match[1])
      if (inferred.length >= 8) break
    }

    // Pattern B: explanatory references after acquisition ("The rope is...", "The dagger...")
    if (inferred.length < 8) {
      const explPattern = /\bthe\s+([a-z][a-z0-9' -]{2,60}?)\s+(?:is|are|was|were|catches|rests)\b/gim
      for (const match of narrative.matchAll(explPattern)) {
        addCandidate(match[1])
        if (inferred.length >= 8) break
      }
    }

    // Pattern C: quantity-first acquisitions in inventory/container phrasing
    // e.g., "Two sewing kits join the satchel's growing contents."
    if (inferred.length < 8) {
      const qtyJoinPattern =
        /\b(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+([a-z][a-z0-9' -]{2,60}?)\s+(?:join|joins|joined|added to|go(?:es)? into|into|in)\s+(?:the\s+)?(?:satchel|pack|pouch|backpack|inventory|bag|drawer|contents?)\b/gim
      for (const match of narrative.matchAll(qtyJoinPattern)) {
        const quantity = parseCountWord(match[1]) ?? 1
        addCandidate(match[2], quantity)
        if (inferred.length >= 8) break
      }
    }

    // Only keep candidates that look like concrete items, not abstract phrases.
    const badEndings = ['scene', 'corridors', 'display', 'shelf', 'stockings', 'tail']
    return inferred.filter((item) => {
      const n = item.name.toLowerCase()
      return !badEndings.some((bad) => n.endsWith(bad))
    })
  }

  /**
   * Fallback: infer clothing damage/repair state from narration when classifier misses it.
   * Runs only when clothing system is enabled and no clothingState updates are present.
   */
  private applyClothingStateFallback(
    result: ClassificationResult,
    context: ClassificationContext,
  ): void {
    if (!context.story.settings?.clothingSystemEnabled) return

    const hasClassifierClothingState = result.entryUpdates.itemUpdates.some(
      (u) => !!(u.changes as Record<string, unknown>)?.clothingState,
    )
    if (hasClassifierClothingState) return

    const inferred = this.inferClothingStateFromNarrative(
      context.narrativeResponse,
      context.userAction,
      context.existingItems,
    )
    if (inferred.length === 0) return

    for (const inf of inferred) {
      const existing = result.entryUpdates.itemUpdates.find(
        (u) => u.name.toLowerCase() === inf.name.toLowerCase(),
      )
      if (existing) {
        ;(existing.changes as Record<string, unknown>).clothingState = inf.clothingState
      } else {
        result.entryUpdates.itemUpdates.push({
          name: inf.name,
          changes: {
            clothingState: inf.clothingState,
          },
        } as ClassificationResult['entryUpdates']['itemUpdates'][number])
      }
    }

    log('Applied clothing state fallback', {
      inferredCount: inferred.length,
      items: inferred.map((i) => i.name),
    })
  }

  private inferClothingStateFromNarrative(
    narrative: string,
    userAction: string,
    existingItems: Item[],
  ): InferredClothingState[] {
    const text = `${userAction}\n${narrative}`.toLowerCase()

    const damageCue =
      /\b(torn|ripped|shredded|frayed|split|damaged|ruined|destroyed|snapped|slashed|cut open|falls away|torn off|ripped off|stripped)\b/i
    const repairCue = /\b(repair|repaired|mend|mended|sew|sewn|stitch|stitched|patch|patched|fixed)\b/i

    if (!damageCue.test(text) && !repairCue.test(text)) {
      return []
    }

    const clothingItems = existingItems.filter((item) => {
      const metadata = (item.metadata ?? {}) as Record<string, unknown>
      const clothing = metadata.clothing as ClothingMetadata | undefined
      return item.equipped && !!clothing?.isClothing
    })

    if (clothingItems.length === 0) return []

    const inferSeverity = (): InferredClothingState['clothingState']['damageSeverity'] | undefined => {
      if (/\b(destroyed|ruined|torn off|ripped off|falls away|shredded to|in tatters)\b/i.test(text)) {
        return 'destroyed'
      }
      if (/\b(shredded|ripped open|torn open|slashed through|split wide)\b/i.test(text)) {
        return 'major'
      }
      if (/\b(torn|ripped|split|frayed|damaged|snapped)\b/i.test(text)) {
        return 'moderate'
      }
      if (/\b(scuffed|strained|worn|snagged|stretched)\b/i.test(text)) {
        return 'minor'
      }
      return undefined
    }

    const zoneMap: Array<{ zone: string; pattern: RegExp }> = [
      { zone: 'chest', pattern: /\b(chest|breasts?|cleavage|bust)\b/i },
      { zone: 'hips', pattern: /\b(hips?|pelvis|crotch|pussy|groin)\b/i },
      { zone: 'legs', pattern: /\b(legs?|thighs?|calves?)\b/i },
      { zone: 'torso', pattern: /\b(torso|stomach|belly|abdomen|back)\b/i },
      { zone: 'arms', pattern: /\b(arms?)\b/i },
      { zone: 'hands', pattern: /\b(hands?)\b/i },
      { zone: 'feet', pattern: /\b(feet|foot|ankles?)\b/i },
    ]

    const mentionedZones = zoneMap.filter((z) => z.pattern.test(text)).map((z) => z.zone)

    const results: InferredClothingState[] = []
    for (const item of clothingItems) {
      const name = item.name.toLowerCase()
      const nameTokens = name.split(/[^a-z0-9]+/).filter((t) => t.length > 2)
      const explicitNameMention = text.includes(name)
      const partialNameMention = nameTokens.some((token) => text.includes(token))

      const clothingMeta = ((item.metadata ?? {}) as Record<string, unknown>).clothing as
        | ClothingMetadata
        | undefined
      const coveredZones = Array.isArray(clothingMeta?.coveredZones)
        ? clothingMeta.coveredZones
        : []

      const relevantZones = mentionedZones.filter((zone) => coveredZones.includes(zone))

      // Conservative guard: require explicit item mention, or a single equipped clothing item.
      if (!explicitNameMention && !(partialNameMention && clothingItems.length === 1)) {
        continue
      }

      const severity = inferSeverity()
      const repaired = repairCue.test(text)

      const clothingState: InferredClothingState['clothingState'] = {}
      if (severity) clothingState.damageSeverity = severity
      if (repaired) clothingState.repaired = true

      if (repairCue.test(text)) {
        if (relevantZones.length > 0) clothingState.restoredZones = relevantZones
      } else if (damageCue.test(text)) {
        if (relevantZones.length > 0) clothingState.newlyExposedZones = relevantZones
      }

      if (
        !clothingState.damageSeverity &&
        !clothingState.repaired &&
        (!clothingState.newlyExposedZones || clothingState.newlyExposedZones.length === 0) &&
        (!clothingState.restoredZones || clothingState.restoredZones.length === 0)
      ) {
        continue
      }

      results.push({
        name: item.name,
        clothingState,
      })
    }

    return results
  }

  /**
   * Fallback: infer money change from narration when classifier misses it.
   * Runs only when money system is enabled and scene.moneyUpdate is absent.
   */
  private applyMoneyFallback(result: ClassificationResult, context: ClassificationContext): void {
    if (!context.story.settings?.moneySystemEnabled) return

    // Only trust classifier-provided money updates when they carry a meaningful event.
    // Some models return a default/no-op moneyUpdate object (delta=0), which would
    // otherwise suppress heuristic extraction.
    const existing = result.scene.moneyUpdate
    const hasMeaningfulClassifierMoneyUpdate =
      !!existing &&
      ((Number.isFinite(existing.delta) && Math.abs(existing.delta) > 0) || !!existing.deniedPurchase)
    if (hasMeaningfulClassifierMoneyUpdate) return

    const currencyName = (context.story.settings.moneyName ?? 'gold').trim() || 'gold'
    const currentMoney = Math.max(0, Math.floor(context.story.settings.moneyAmount ?? 0))

    const inferred = this.inferMoneyUpdateFromNarrative(
      context.narrativeResponse,
      context.userAction,
      currencyName,
      currentMoney,
    )

    if (!inferred) return

    result.scene.moneyUpdate = inferred

    log('Applied money fallback', {
      delta: inferred.delta,
      type: inferred.transactionType,
      deniedPurchase: inferred.deniedPurchase ?? false,
      attemptedCost: inferred.attemptedCost,
    })
  }

  private inferMoneyUpdateFromNarrative(
    narrative: string,
    userAction: string,
    currencyName: string,
    currentMoney: number,
  ): InferredMoneyUpdate | null {
    const text = `${userAction}\n${narrative}`
    const lower = text.toLowerCase()

    const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    const parseNumberWords = (raw: string): number | null => {
      const units: Record<string, number> = {
        zero: 0,
        one: 1,
        two: 2,
        three: 3,
        four: 4,
        five: 5,
        six: 6,
        seven: 7,
        eight: 8,
        nine: 9,
        ten: 10,
        eleven: 11,
        twelve: 12,
        thirteen: 13,
        fourteen: 14,
        fifteen: 15,
        sixteen: 16,
        seventeen: 17,
        eighteen: 18,
        nineteen: 19,
      }
      const tens: Record<string, number> = {
        twenty: 20,
        thirty: 30,
        forty: 40,
        fifty: 50,
        sixty: 60,
        seventy: 70,
        eighty: 80,
        ninety: 90,
      }

      const tokens = raw
        .toLowerCase()
        .replace(/-/g, ' ')
        .split(/\s+/)
        .filter(Boolean)

      if (tokens.length === 0) return null

      let total = 0
      let current = 0
      let sawNumberToken = false

      for (const token of tokens) {
        if (token === 'and') continue
        if (token in units) {
          current += units[token]
          sawNumberToken = true
          continue
        }
        if (token in tens) {
          current += tens[token]
          sawNumberToken = true
          continue
        }
        if (token === 'hundred') {
          current = (current || 1) * 100
          sawNumberToken = true
          continue
        }
        if (token === 'thousand') {
          total += (current || 1) * 1000
          current = 0
          sawNumberToken = true
          continue
        }
        return null
      }

      if (!sawNumberToken) return null
      const value = total + current
      return value >= 0 ? value : null
    }

    const parseAmountToken = (raw: string): number | null => {
      const trimmed = raw.trim().toLowerCase()
      const numeric = Number(trimmed)
      if (Number.isFinite(numeric)) return numeric
      return parseNumberWords(trimmed)
    }

    const deniedPurchasePattern =
      /\b(can'?t afford|cannot afford|could not afford|too expensive|insufficient funds|not enough (?:money|gold|credits|cash|coins))\b/i
    const spendCuePattern =
      /\b(buy|bought|purchase|purchased|pay|paid|spend|spent|cost|fee|fees|bribe|tip|rent)\b/i
    const earnCuePattern =
      /\b(sell|sold|earn|earned|gain|gained|find|found|loot|reward|wage|profit|payment)\b/i

    const amountMatches = Array.from(text.matchAll(/\b(\d+(?:\.\d+)?)\b/g)).map((m) => ({
      amount: Number(m[1]),
      index: m.index ?? -1,
    }))

    const currencyNameEscaped = escapeRegex(currencyName.trim())
    const currencyWordPattern =
      '(?:gold|coins?|credits?|cash|dollars?|bucks?|crowns?|gp' +
      (currencyNameEscaped ? `|${currencyNameEscaped}` : '') +
      ')'
    const numberWordsPattern =
      '(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|and|-)+'

    const wordAmountMatches = Array.from(
      lower.matchAll(new RegExp(`\\b(${numberWordsPattern})\\s+${currencyWordPattern}\\b`, 'gi')),
    )
      .map((m) => {
        const parsed = parseNumberWords(m[1])
        return {
          amount: parsed,
          index: m.index ?? -1,
        }
      })
      .filter((m): m is { amount: number; index: number } => typeof m.amount === 'number')

    amountMatches.push(...wordAmountMatches)

    const currencyLower = currencyName.toLowerCase()
    const currencyTokens = currencyLower.split(/\s+/).filter((t) => t.length > 1)
    const nearCurrency = (idx: number): boolean => {
      if (idx < 0) return false
      const start = Math.max(0, idx - 24)
      const end = Math.min(lower.length, idx + 24)
      const window = lower.slice(start, end)
      if (window.includes(currencyLower)) return true
      return currencyTokens.some((token) => window.includes(token))
    }

    const currencyAmounts = amountMatches.filter((m) => nearCurrency(m.index))
    const candidateAmounts = currencyAmounts.length > 0 ? currencyAmounts : amountMatches

    if (deniedPurchasePattern.test(lower)) {
      const attemptedRaw = candidateAmounts.find((m) => m.amount > 0)?.amount
      const attemptedCost =
        typeof attemptedRaw === 'number' && attemptedRaw > currentMoney ? attemptedRaw : undefined
      return {
        delta: 0,
        transactionType: 'purchase',
        deniedPurchase: true,
        attemptedCost,
        reason: 'Purchase denied due to insufficient funds',
      }
    }

    let spent = 0
    let earned = 0

    for (const match of candidateAmounts) {
      if (!(match.amount > 0) || match.index < 0) continue
      const start = Math.max(0, match.index - 36)
      const end = Math.min(lower.length, match.index + 36)
      const window = lower.slice(start, end)

      const spendHit = spendCuePattern.test(window)
      const earnHit = earnCuePattern.test(window)

      if (spendHit && !earnHit) {
        spent += match.amount
      } else if (earnHit && !spendHit) {
        earned += match.amount
      }
    }

    // Fallback to phrase-level patterns when amount-window matching failed.
    if (spent === 0) {
      for (const m of lower.matchAll(/\b(?:pay|paid|spent|cost(?:s)?|buy|bought|purchase(?:d)?)\s+(?:for\s+)?(\d+(?:\.\d+)?)\b/g)) {
        spent += Number(m[1])
      }

      // Word-number variant: "paid fifty", "spent twenty".
      for (const m of lower.matchAll(/\b(?:pay|paid|spent|cost(?:s)?|buy|bought|purchase(?:d)?)\s+(?:for\s+)?((?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|and|-|\s)+)\b/g)) {
        const parsed = parseAmountToken(m[1])
        if (parsed && parsed > 0) spent += parsed
      }

      // Handles phrasing like "purchased two sewing kits for 50 gold".
      for (const m of lower.matchAll(/\b(?:buy|bought|purchase(?:d)?|ordered?|acquire(?:d)?)\b[\s\S]{0,80}?\bfor\s+(\d+(?:\.\d+)?)\b/g)) {
        spent += Number(m[1])
      }

      // Word-number variant: "purchased ... for fifty gold".
      for (const m of lower.matchAll(/\b(?:buy|bought|purchase(?:d)?|ordered?|acquire(?:d)?)\b[\s\S]{0,80}?\bfor\s+((?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|and|-|\s)+)\b/g)) {
        const parsed = parseAmountToken(m[1])
        if (parsed && parsed > 0) spent += parsed
      }

      // Handles phrasing like "it cost 50 gold" / "price was 50".
      for (const m of lower.matchAll(/\b(?:cost(?:s|ing)?|price(?:d)?\s+(?:at|was)|total(?:ed)?)\s+(\d+(?:\.\d+)?)\b/g)) {
        spent += Number(m[1])
      }

      // Word-number variant: "it cost fifty gold" / "price was fifty".
      for (const m of lower.matchAll(/\b(?:cost(?:s|ing)?|price(?:d)?\s+(?:at|was)|total(?:ed)?)\s+((?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|and|-|\s)+)\b/g)) {
        const parsed = parseAmountToken(m[1])
        if (parsed && parsed > 0) spent += parsed
      }
    }
    if (earned === 0) {
      for (const m of lower.matchAll(/\b(?:sell|sold|earned|gain(?:ed)?|found|loot(?:ed)?|reward(?:ed)?|paid\s+you)\s+(\d+(?:\.\d+)?)\b/g)) {
        earned += Number(m[1])
      }

      // Word-number variant: "earned fifty", "rewarded forty".
      for (const m of lower.matchAll(/\b(?:sell|sold|earned|gain(?:ed)?|found|loot(?:ed)?|reward(?:ed)?|paid\s+you)\s+((?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|and|-|\s)+)\b/g)) {
        const parsed = parseAmountToken(m[1])
        if (parsed && parsed > 0) earned += parsed
      }
    }

    // Conservative final fallback: single currency amount + clear spend/earn cue in passage.
    if (spent === 0 && earned === 0 && candidateAmounts.length === 1) {
      const amount = candidateAmounts[0].amount
      if (amount > 0) {
        const spendPassage = spendCuePattern.test(lower)
        const earnPassage = earnCuePattern.test(lower)
        if (spendPassage && !earnPassage) {
          spent = amount
        } else if (earnPassage && !spendPassage) {
          earned = amount
        }
      }
    }

    const roundedDelta = Math.round((earned - spent) * 100) / 100
    if (roundedDelta === 0) return null

    let transactionType: InferredMoneyUpdate['transactionType'] = 'other'
    if (roundedDelta < 0) {
      if (/\b(bribe|tip)\b/i.test(lower)) transactionType = 'bribe'
      else if (/\b(fee|toll|rent)\b/i.test(lower)) transactionType = 'fee'
      else if (/\b(gamble|bet)\b/i.test(lower)) transactionType = 'gamble'
      else transactionType = 'purchase'
    } else if (roundedDelta > 0) {
      if (/\b(sell|sold)\b/i.test(lower)) transactionType = 'sale'
      else if (/\b(loot|found|treasure)\b/i.test(lower)) transactionType = 'loot'
      else if (/\b(wage|salary|paid\s+you)\b/i.test(lower)) transactionType = 'wage'
      else if (/\b(reward|bounty)\b/i.test(lower)) transactionType = 'reward'
      else transactionType = 'other'
    }

    return {
      delta: roundedDelta,
      transactionType,
      reason: roundedDelta < 0 ? 'Narrative spending detected' : 'Narrative earnings detected',
    }
  }

  /**
   * Group runtime variables by entity type.
   */
  private groupByEntityType(vars: RuntimeVariable[]): Record<string, RuntimeVariable[]> {
    return vars.reduce(
      (acc, v) => {
        if (!acc[v.entityType]) acc[v.entityType] = []
        acc[v.entityType].push(v)
        return acc
      },
      {} as Record<string, RuntimeVariable[]>,
    )
  }

  /**
   * Build the prompt instruction block describing custom variables to track.
   * Grouped by entity type for clarity.
   */
  private buildCustomVarInstructions(varsByType: Record<string, RuntimeVariable[]>): string {
    const ENTITY_TYPE_LABELS: Record<RuntimeEntityType, { updates: string; new: string }> = {
      character: { updates: 'character updates', new: 'new characters' },
      location: { updates: 'location updates', new: 'new locations' },
      item: { updates: 'item updates', new: 'new items' },
      story_beat: { updates: 'story beat updates', new: 'new story beats' },
    }

    const sections: string[] = []

    for (const [entityType, vars] of Object.entries(varsByType)) {
      if (vars.length === 0) continue
      const labels = ENTITY_TYPE_LABELS[entityType as RuntimeEntityType]
      if (!labels) continue

      const varLines = vars.map((v) => {
        let line = `- ${v.variableName}`
        const parts: string[] = []

        // Type description
        if (v.variableType === 'number') {
          let numDesc = 'number'
          if (v.minValue !== undefined && v.maxValue !== undefined) {
            numDesc = `number ${v.minValue}-${v.maxValue}`
          } else if (v.minValue !== undefined) {
            numDesc = `number >= ${v.minValue}`
          } else if (v.maxValue !== undefined) {
            numDesc = `number <= ${v.maxValue}`
          }
          parts.push(numDesc)
        } else if (v.variableType === 'enum' && v.enumOptions?.length) {
          parts.push(`enum: ${v.enumOptions.map((o) => o.value).join('|')}`)
        } else {
          parts.push('text')
        }

        // Required vs optional
        parts.push(
          v.defaultValue !== undefined && v.defaultValue !== null ? 'optional' : 'required',
        )

        // Default value
        if (v.defaultValue !== undefined && v.defaultValue !== null) {
          parts.push(`default: ${v.defaultValue}`)
        }

        line += ` (${parts.join(', ')})`
        if (v.description) line += `: ${v.description}`
        return line
      })

      sections.push(
        `For ${labels.updates}/${labels.new}, include these as direct fields alongside standard fields:\n${varLines.join('\n')}`,
      )
    }

    if (sections.length === 0) return ''

    return `## Custom Variables to Track\n${sections.join('\n\n')}`
  }

  /**
   * Post-process: clamp number-type runtime variable values to min/max constraints.
   * Walks through all entity updates/new entities and clamps inline number values.
   */
  private clampRuntimeVarNumbers(
    result: ClassificationResult,
    varsByType: Record<string, RuntimeVariable[]>,
  ): void {
    const numberDefs = new Map<string, RuntimeVariable>()
    for (const vars of Object.values(varsByType)) {
      for (const v of vars) {
        if (v.variableType === 'number' && (v.minValue !== undefined || v.maxValue !== undefined)) {
          numberDefs.set(v.variableName, v)
        }
      }
    }

    if (numberDefs.size === 0) return

    // Clamp inline number values on an object
    const clampInlineVars = (obj: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(obj)) {
        const def = numberDefs.get(key)
        if (def && typeof value === 'number') {
          obj[key] = clampNumber(value, def.minValue, def.maxValue)
        }
      }
    }

    // Walk all entity types — vars are inline on changes/entity objects
    for (const update of result.entryUpdates.characterUpdates) {
      clampInlineVars(update.changes as unknown as Record<string, unknown>)
    }
    for (const entity of result.entryUpdates.newCharacters) {
      clampInlineVars(entity as unknown as Record<string, unknown>)
    }
    for (const update of result.entryUpdates.locationUpdates) {
      clampInlineVars(update.changes as unknown as Record<string, unknown>)
    }
    for (const entity of result.entryUpdates.newLocations) {
      clampInlineVars(entity as unknown as Record<string, unknown>)
    }
    for (const update of result.entryUpdates.itemUpdates) {
      clampInlineVars(update.changes as unknown as Record<string, unknown>)
    }
    for (const entity of result.entryUpdates.newItems) {
      clampInlineVars(entity as unknown as Record<string, unknown>)
    }
    for (const update of result.entryUpdates.storyBeatUpdates) {
      clampInlineVars(update.changes as unknown as Record<string, unknown>)
    }
    for (const entity of result.entryUpdates.newStoryBeats) {
      clampInlineVars(entity as unknown as Record<string, unknown>)
    }
  }

  /**
   * Format existing characters for the prompt.
   */
  private formatExistingCharacters(characters: Character[]): string {
    if (characters.length === 0) return '(none)'

    return characters
      .map((c) => {
        let entry = `- ${c.name}`
        if (c.relationship) entry += ` (${c.relationship})`
        if (c.status && c.status !== 'active') entry += ` [${c.status}]`
        if (c.visualDescriptors && Object.keys(c.visualDescriptors).length > 0) {
          entry += `\n  Appearance: ${this.formatVisualDescriptors(c.visualDescriptors)}`
        }
        return entry
      })
      .join('\n')
  }

  /**
   * Format visual descriptors object into a readable string.
   */
  private formatVisualDescriptors(descriptors: Character['visualDescriptors']): string {
    if (!descriptors) return ''

    const parts: string[] = []
    if (descriptors.face) parts.push(`Face: ${descriptors.face}`)
    if (descriptors.hair) parts.push(`Hair: ${descriptors.hair}`)
    if (descriptors.eyes) parts.push(`Eyes: ${descriptors.eyes}`)
    if (descriptors.build) parts.push(`Build: ${descriptors.build}`)
    if (descriptors.clothing) parts.push(`Clothing: ${descriptors.clothing}`)
    if (descriptors.accessories) parts.push(`Accessories: ${descriptors.accessories}`)
    if (descriptors.distinguishing) parts.push(`Distinguishing: ${descriptors.distinguishing}`)

    return parts.join(', ')
  }

  /**
   * Format existing story beats for the prompt.
   */
  private formatExistingBeats(beats: StoryBeat[]): string {
    const activeBeats = beats.filter((b) => b.status === 'active' || b.status === 'pending')
    if (activeBeats.length === 0) return '(none)'

    return activeBeats
      .map((b) => {
        let entry = `- "${b.title}" [${b.status}]`
        if (b.description) entry += `: ${b.description}`
        return entry
      })
      .join('\n')
  }

  private formatExistingItems(items: Item[]): string {
    if (items.length === 0) return '(none)'

    return items
      .map((item) => {
        let entry = `- ${item.name}`
        if (item.quantity > 1) entry += ` (x${item.quantity})`
        if (item.equipped) entry += ' [equipped]'

        const clothing = this.getClothingMetadata(item)
        if (clothing?.isClothing) {
          const coveredZones = Array.isArray(clothing.coveredZones) ? clothing.coveredZones : []
          const exposedZones = Array.isArray(clothing.exposedZones) ? clothing.exposedZones : []
          const effectiveCoveredZones = coveredZones.filter((zone) => !exposedZones.includes(zone))
          const parts: string[] = []
          if (
            typeof clothing.durability === 'number' &&
            typeof clothing.maxDurability === 'number'
          ) {
            parts.push(`durability ${clothing.durability}/${clothing.maxDurability}`)
          }
          if (effectiveCoveredZones.length > 0) {
            parts.push(`covered ${effectiveCoveredZones.join(', ')}`)
          }
          if (exposedZones.length > 0) {
            parts.push(`exposed ${exposedZones.join(', ')}`)
          }
          if (clothing.unusable) {
            parts.push('unusable')
          }
          if (parts.length > 0) {
            entry += ` {Clothing: ${parts.join('; ')}}`
          }
        }

        return entry
      })
      .join('\n')
  }

  private getClothingMetadata(item: Item): ClothingMetadata | null {
    const metadata = (item.metadata ?? {}) as Record<string, unknown>
    const clothing = metadata.clothing
    if (!clothing || typeof clothing !== 'object') return null
    return clothing as ClothingMetadata
  }

  /**
   * Build chat history block for context.
   */
  private buildChatHistoryBlock(entries: StoryEntry[], _currentTime?: TimeTracker | null): string {
    if (entries.length === 0) return ''

    const recentEntries = entries.slice(-this.chatHistoryTruncation)

    const formatted = recentEntries
      .map((e) => {
        const prefix = e.type === 'user_action' ? '[ACTION]' : '[NARRATIVE]'
        let timeInfo = ''
        if (e.metadata?.timeStart) {
          const t = e.metadata.timeStart
          timeInfo = ` (at Y${t.years}D${t.days} ${String(t.hours).padStart(2, '0')}:${String(t.minutes).padStart(2, '0')})`
        }
        // Always strip pic tags for classification to avoid confusion
        const cleanContent = stripPicTags(e.content)
        return `${prefix}${timeInfo} ${cleanContent.slice(0, 500)}${cleanContent.length > 500 ? '...' : ''}`
      })
      .join('\n\n')

    return `## Recent Chat History\n${formatted}\n`
  }
}

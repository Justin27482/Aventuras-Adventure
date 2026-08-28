/**
 * ContextBuilder
 *
 * Flat variable store + template renderer. Services add variables
 * via .add(), then render templates via .render(). Variables accumulate
 * across services -- all templates can access all variables.
 *
 * External templates (image styles, lorebook tools) don't use ContextBuilder.
 * Services fetch those directly from the pack and inject data programmatically.
 */

import { database } from '$lib/services/database'
import { templateEngine } from '$lib/services/templates/engine'
import { createLogger } from '$lib/log'
import { getContentIntensityLevel } from '$lib/services/content-intensity'
import type { RenderResult } from './types'
import type { Character, Location, Item, StoryBeat } from '$lib/types'
import type { RuntimeVariable, RuntimeVarsMap } from '$lib/services/packs/types'
import { TurnDirector } from '$lib/services/campaign/turn-director'

const log = createLogger('ContextBuilder')

export class ContextBuilder {
  private context: Record<string, any> = {}
  private packId: string = 'default-pack'

  constructor(packId?: string) {
    if (packId) this.packId = packId
  }

  /**
   * Convenience factory: create a ContextBuilder pre-populated from a story.
   * Loads story settings, protagonist, location, time, and pack custom variables.
   */
  static async forStory(storyId: string, packIdOverride?: string): Promise<ContextBuilder> {
    const story = await database.getStory(storyId)
    if (!story) {
      log('forStory: story not found', { storyId })
      return new ContextBuilder()
    }

    const packId = packIdOverride || (await database.getStoryPackId(storyId)) || 'default-pack'
    const builder = new ContextBuilder(packId)

    // Load story data into context
    const moneySystemEnabled = story.settings?.moneySystemEnabled ?? false
    const moneyName = (story.settings?.moneyName ?? 'gold').trim() || 'gold'
    const currentMoney = Math.max(0, Math.floor(story.settings?.moneyAmount ?? 0))

    builder.add({
      mode: story.mode || 'adventure',
      pov: story.settings?.pov || 'second',
      tense: story.settings?.tense || 'present',
      genre: story.genre || '',
      tone: story.settings?.tone || '',
      themes: story.settings?.themes?.join(', ') || '',
      settingDescription: story.description || '',
      visualProseMode: story.settings?.visualProseMode || false,
      inlineImageMode: story.settings?.imageGenerationMode === 'inline',
      moneySystemEnabled,
      moneyName,
      currentMoney,
      moneyState: moneySystemEnabled ? `${currentMoney} ${moneyName}` : '',
    })

    if (story.settings?.imageGenerationMode === 'inline') {
      const template = await database.getPackTemplate(packId, 'narrative-inline-images')
      builder.add({
        inlineImageInstructions: template?.content
          ? templateEngine.render(template.content, builder.context) ?? ''
          : '',
      })
    }
    if (story.settings?.visualProseMode) {
      const template = await database.getPackTemplate(packId, 'narrative-visual-prose')
      builder.add({
        visualProseInstructions: template?.content
          ? templateEngine.render(template.content, builder.context) ?? ''
          : '',
      })
    }

    // Protagonist
    const characters = await database.getCharacters(storyId)
    const protagonist = characters.find((c) => c.relationship === 'self')
    builder.add({
      protagonistName: protagonist?.name || 'the protagonist',
      protagonistDescription: protagonist?.description || '',
      activeActorName: protagonist?.name || 'the protagonist',
    })

    // Campaign agency context is additive. Legacy/archive stories have no campaign
    // overlay and retain the existing protagonist-only variables above.
    try {
      const campaign = await database.getCampaignByStoryId(storyId)
      if (campaign) {
        const campaignSettings = await database.getCampaignSettings(campaign.id)
        const sceneTurnState = await database.getSceneTurnState(campaign.id, null)
        const ruleset = campaign.rulesetId ? await database.getRuleset(campaign.rulesetId) : null
        const checkRules = campaign.rulesetId
          ? await database.getRulesetCheckRules(campaign.rulesetId)
          : []
        const recentRollEntries = await database.getRollLedger(campaign.id, { limit: 5 })
        const partyMembers = await database.getCampaignPartyMembers(campaign.id)
        const actorProfiles = await database.getActorControlProfiles(campaign.id)
        const campaignThreads = await database.getCampaignThreads(campaign.id)
        const campaignThreadBeats = await database.getCampaignThreadBeats(campaign.id)
        const sessions = await database.getCampaignSessions(campaign.id)
        const activeSession = sessions.find((session) => session.status === 'active') ?? null
        const sessionParty = activeSession
          ? await database.getSessionPartyMembers(activeSession.id)
          : []
        const characterById = new Map(characters.map((character) => [character.id, character]))
        const profileByCharacterId = new Map(
          actorProfiles.map((profile) => [profile.characterId, profile]),
        )
        const rosterMembers = (activeSession ? sessionParty : partyMembers)
          .map((member) => {
            const character = characterById.get(member.characterId)
            if (!character) return null
            return { member, character }
          })
          .filter((value): value is NonNullable<typeof value> => value !== null)

        const primaryCharacter = activeSession
          ? characterById.get(activeSession.primaryCharacterId)
          : protagonist
        const companions = rosterMembers.filter(
          ({ member }) => member.characterId !== primaryCharacter?.id,
        )
        const companionAgencyContext = companions
          .map(({ member, character }) => {
            const profile = profileByCharacterId.get(character.id)
            const details = [
              profile?.motivations && `motivations: ${profile.motivations}`,
              profile?.priorities && `priorities: ${profile.priorities}`,
              profile?.fears && `fears: ${profile.fears}`,
              profile?.valuePriorities && `values: ${profile.valuePriorities}`,
              profile?.redLines && `red lines: ${profile.redLines}`,
              profile?.tacticalPreferences && `tactics: ${profile.tacticalPreferences}`,
            ].filter(Boolean)
            return `${character.name}: narrative=${member.narrativeControlMode}, combat=${member.combatControlMode}${details.length > 0 ? `; ${details.join('; ')}` : ''}`
          })
          .join('\n')
        const beatsByThreadId = new Map<string, typeof campaignThreadBeats>()
        for (const beat of campaignThreadBeats) {
          const current = beatsByThreadId.get(beat.threadId) ?? []
          current.push(beat)
          beatsByThreadId.set(beat.threadId, current)
        }
        const formatThread = (thread: (typeof campaignThreads)[number]) => {
          const clock =
            thread.clockMax !== null
              ? `, clock ${thread.clockValue}/${thread.clockMax}`
              : thread.clockValue > 0
                ? `, clock ${thread.clockValue}`
                : ''
          const stakes = thread.stakes ? ` Stakes: ${thread.stakes}` : ''
          const summary = thread.summary ? `: ${thread.summary}` : ''
          const beats = (beatsByThreadId.get(thread.id) ?? [])
            .filter((beat) => beat.visibility === thread.visibility)
            .slice(-3)
            .map((beat) => `${beat.title}${beat.summary ? ` (${beat.summary})` : ''}`)
          const beatText = beats.length > 0 ? ` Recent beats: ${beats.join('; ')}.` : ''
          return `- [${thread.threadType}, ${thread.status}${clock}] ${thread.title}${summary}.${stakes}${beatText}`
        }
        const activeCampaignThreads = campaignThreads
          .filter((thread) => thread.status === 'active' || thread.status === 'dormant')
          .filter((thread) => thread.visibility === 'player_safe')
          .map(formatThread)
          .join('\n')
        const activeMember = rosterMembers.find(
          ({ member }) => member.characterId === sceneTurnState?.activeActorId,
        )
        const turnType = new TurnDirector().getNextTurnType({
          sceneMode: (sceneTurnState?.sceneMode ?? 'free') as import('$lib/services/campaign/turn-order-service').SceneMode,
          activeActor: sceneTurnState?.activeActorId
            ? {
                id: sceneTurnState.activeActorId,
                name: characterById.get(sceneTurnState.activeActorId)?.name ?? sceneTurnState.activeActorId,
                category: activeMember?.member.actorCategory === 'primary_player_character' ? 'player' : 'ally',
              }
            : null,
        })
        const directorOnlyCampaignThreads = campaignThreads
          .filter((thread) => thread.status === 'active' || thread.status === 'dormant')
          .filter((thread) => thread.visibility === 'director_only')
          .map(formatThread)
          .join('\n')
        const rulesetDigest = ruleset
          ? [
              `Ruleset: ${ruleset.name}`,
              ruleset.diceSystem ? `Dice system: ${ruleset.diceSystem}` : '',
              checkRules.length > 0
                ? `Checks: ${checkRules.map((rule) => `${rule.label} (${rule.notation})`).join(', ')}`
                : '',
            ]
              .filter(Boolean)
              .join('\n')
          : ''
        const recentRolls = recentRollEntries
          .map((roll) => `${roll.notation} = ${roll.total}${roll.dc === null ? '' : ` vs DC ${roll.dc}`} (${roll.outcome ?? 'unresolved'})`)
          .join('\n')

        const nsfwIntensity = campaignSettings?.nsfwIntensity ?? 0
        const nsfwIntensityLabel = getContentIntensityLevel(nsfwIntensity).label

        builder.add({
          campaignTitle: campaign.title,
          worldCharter: campaignSettings?.worldCharter ?? '',
          gmPersona: campaignSettings?.gmPersona ?? '',
          nsfwIntensity,
          nsfwIntensityLabel,
          rulesetDigest,
          recentRolls,
          pendingRoll: '',
          turnType,
          sceneMode: sceneTurnState?.sceneMode ?? '',
          turnOrderMode: sceneTurnState?.turnOrderMode ?? '',
          activeActorName:
            sceneTurnState?.activeActorId
              ? characterById.get(sceneTurnState.activeActorId)?.name ?? sceneTurnState.activeActorId
              : '',
          upcomingActors: sceneTurnState?.actorOrder
            .filter((actorId) => actorId !== sceneTurnState.activeActorId)
            .slice(0, 4)
            .map((actorId) => characterById.get(actorId)?.name ?? actorId)
            .join(', ') ?? '',
          activeCampaignThreads,
          directorOnlyCampaignThreads,
          campaignSessionNumber: activeSession?.sessionNumber ?? '',
          primaryCharacterName: primaryCharacter?.name || protagonist?.name || '',
          primaryCharacterDescription: primaryCharacter?.description || '',
          partyRoster: rosterMembers
            .map(({ member, character }) => {
              const profile = profileByCharacterId.get(character.id)
              const agency = profile?.motivations
                ? ` motivations: ${profile.motivations}`
                : ''
              return `${character.name} (${member.actorCategory}, narrative: ${member.narrativeControlMode}, combat: ${member.combatControlMode})${agency}`
            })
            .join('\n'),
          companionRoster: companions.map(({ character }) => character.name).join(', '),
          companionAgencyContext,
          companionAgency:
            'Active companions retain their own voices, motivations, priorities, and personal decisions. Player requests are not guaranteed commands.',
          combatControlPolicy: activeSession?.combatControlPolicy ?? 'companions_autonomous',
        })
      }
    } catch (error) {
      // Campaign context is optional while older databases finish applying migrations.
      log('Campaign agency context unavailable; using legacy story context', { storyId, error })
    }

    // Current location
    const locations = await database.getLocations(storyId)
    const currentLocation = locations.find((l) => l.current)
    builder.add({ currentLocation: currentLocation?.name || '' })

    // Story time
    if (story.timeTracker) {
      const t = story.timeTracker
      builder.add({
        storyTime: `Year ${t.years + 1}, Day ${t.days + 1}, ${t.hours} hours ${t.minutes} minutes`,
      })
    }

    // Pack custom variable defaults
    await builder.loadCustomVariables()

    // Override pack variable defaults with story-specific values
    const storyVarValues = await database.getStoryCustomVariables(story.id)
    if (storyVarValues) {
      builder.add(storyVarValues)
    }

    // Runtime variable values from entities
    const items = await database.getItems(storyId)
    const storyBeats = await database.getStoryBeats(storyId)
    await builder.loadRuntimeVariableContext(characters, locations, items, storyBeats, protagonist)
    await builder.loadAgencyPromptContext()

    log('forStory complete', {
      storyId,
      packId,
      contextKeys: Object.keys(builder.context).length,
      storyVarOverrides: storyVarValues ? Object.keys(storyVarValues).length : 0,
    })
    return builder
  }

  /**
   * Merge variables into context. Returns this for chaining.
   */
  add(data: Record<string, any>): this {
    Object.assign(this.context, data)
    return this
  }

  /**
   * Render a template from the active pack through LiquidJS.
   */
  async render(templateId: string): Promise<RenderResult> {
    log('render', { templateId, packId: this.packId })

    const systemTemplate = await database.getPackTemplate(this.packId, templateId)
    if (!systemTemplate) {
      log('WARNING: system template not found', { templateId, packId: this.packId })
    }
    const userTemplate = await database.getPackTemplate(this.packId, `${templateId}-user`)
    if (!userTemplate) {
      log('WARNING: user template not found', {
        templateId: `${templateId}-user`,
        packId: this.packId,
      })
    }

    const systemResult = systemTemplate?.content
      ? templateEngine.render(systemTemplate.content, this.context)
      : ''
    if (systemResult === null) {
      log('ERROR: system template render failed, using raw content', { templateId })
    }
    const userResult = userTemplate?.content
      ? templateEngine.render(userTemplate.content, this.context)
      : ''
    if (userResult === null) {
      log('ERROR: user template render failed, using raw content', { templateId })
    }

    return {
      system: systemResult ?? systemTemplate?.content ?? '',
      user: userResult ?? userTemplate?.content ?? '',
    }
  }

  /**
   * Get a copy of the current context. Useful for debugging.
   */
  getContext(): Record<string, any> {
    return { ...this.context }
  }

  /**
   * Get the active pack ID.
   */
  getPackId(): string {
    return this.packId
  }

  /**
   * Load custom variable defaults from the active pack.
   * Only sets variables not already in context.
   */
  private async loadCustomVariables(): Promise<void> {
    try {
      const variables = await database.getPackVariables(this.packId)
      for (const v of variables) {
        if (!(v.variableName in this.context)) {
          this.context[v.variableName] = v.defaultValue ?? ''
        }
      }
    } catch (error) {
      log('loadCustomVariables failed', { packId: this.packId, error })
    }
  }

  private async loadAgencyPromptContext(): Promise<void> {
    const templateIds = [
      ['agencyCore', 'agency-core'],
      ['agencyCompanionVoice', 'agency-companion-voice'],
      ['agencyCompanionCombat', 'agency-companion-combat'],
      ['gmCore', 'gm-core'],
      ['turnOrderContext', 'turn-order-context'],
      ['sceneContext', 'scene-context'],
      ['narrativeTurnContext', 'narrative-turn'],
      ['worldCharterContext', 'world-charter-context'],
      ['rulesDigestContext', 'rules-digest-context'],
      ['partyRosterContext', 'party-roster-context'],
      ['narrativePriming', 'narrative-priming'],
      ['safetyCoreRules', 'safety-core-rules'],
      ['safetyGuardrails', 'safety-guardrails'],
      ['safetyContentIntensity', 'safety-content-intensity'],
      ['safetyContentBans', 'safety-content-bans'],
      ['safetyMechanicsConstraints', 'safety-mechanics-constraints'],
      ['agencyContext', 'agency-context'],
    ] as const

    for (const [contextKey, templateId] of templateIds) {
      try {
        const template = await database.getPackTemplate(this.packId, templateId)
        this.context[contextKey] = template?.content
          ? (templateEngine.render(template.content, this.context) ?? '')
          : ''
      } catch (error) {
        this.context[contextKey] = ''
        log('loadAgencyPromptContext failed', { packId: this.packId, templateId, error })
      }
    }
  }

  /**
   * Load runtime variable values from story entities and add formatted text blocks
   * to the context. Each entity type gets a separate variable:
   *   runtimeVars_characters, runtimeVars_locations, runtimeVars_items,
   *   runtimeVars_storyBeats, runtimeVars_protagonist
   *
   * Format per entity: "EntityName: VarLabel = value, VarLabel = value"
   * Empty string when no runtime variables are defined or no values exist.
   */
  private async loadRuntimeVariableContext(
    characters: Character[],
    locations: Location[],
    items: Item[],
    storyBeats: StoryBeat[],
    protagonist: Character | undefined,
  ): Promise<void> {
    try {
      const defs = await database.getRuntimeVariables(this.packId)
      if (defs.length === 0) {
        this.add({
          runtimeVars_characters: '',
          runtimeVars_locations: '',
          runtimeVars_items: '',
          runtimeVars_storyBeats: '',
          runtimeVars_protagonist: '',
        })
        return
      }

      // Group definitions by entity type for fast lookup
      const defsByType: Record<string, RuntimeVariable[]> = {}
      for (const d of defs) {
        if (!defsByType[d.entityType]) defsByType[d.entityType] = []
        defsByType[d.entityType].push(d)
      }

      const formatEntities = (
        entities: Array<{ name: string; metadata: Record<string, unknown> | null }>,
        entityType: string,
      ): string => {
        const typeDefs = defsByType[entityType]
        if (!typeDefs || typeDefs.length === 0) return ''

        const lines: string[] = []
        for (const entity of entities) {
          const runtimeVars = (entity.metadata as Record<string, unknown> | null)?.runtimeVars as
            | RuntimeVarsMap
            | undefined
          if (!runtimeVars) continue

          const pairs: string[] = []
          for (const def of typeDefs) {
            const entry = runtimeVars[def.id]
            if (entry && entry.v != null && entry.v !== '') {
              pairs.push(`${def.displayName} = ${entry.v}`)
            }
          }
          if (pairs.length > 0) {
            lines.push(`${entity.name}: ${pairs.join(', ')}`)
          }
        }
        return lines.join('\n')
      }

      // Format entity name helper for story beats (uses title instead of name)
      const beatsWithName = storyBeats.map((b) => ({
        name: b.title,
        metadata: b.metadata,
      }))

      const runtimeVarsCharacters = formatEntities(characters, 'character')
      const runtimeVarsLocations = formatEntities(locations, 'location')
      const runtimeVarsItems = formatEntities(items, 'item')
      const runtimeVarsStoryBeats = formatEntities(beatsWithName, 'story_beat')

      // Protagonist-specific: filter to just the protagonist
      let runtimeVarsProtagonist = ''
      if (protagonist) {
        runtimeVarsProtagonist = formatEntities([protagonist], 'character')
      }

      this.add({
        runtimeVars_characters: runtimeVarsCharacters,
        runtimeVars_locations: runtimeVarsLocations,
        runtimeVars_items: runtimeVarsItems,
        runtimeVars_storyBeats: runtimeVarsStoryBeats,
        runtimeVars_protagonist: runtimeVarsProtagonist,
      })

      log('loadRuntimeVariableContext', {
        packId: this.packId,
        defCount: defs.length,
        hasCharVars: runtimeVarsCharacters.length > 0,
        hasLocVars: runtimeVarsLocations.length > 0,
        hasItemVars: runtimeVarsItems.length > 0,
        hasBeatVars: runtimeVarsStoryBeats.length > 0,
        hasProtagonistVars: runtimeVarsProtagonist.length > 0,
      })
    } catch (error) {
      log('loadRuntimeVariableContext failed', { packId: this.packId, error })
      this.add({
        runtimeVars_characters: '',
        runtimeVars_locations: '',
        runtimeVars_items: '',
        runtimeVars_storyBeats: '',
        runtimeVars_protagonist: '',
      })
    }
  }
}

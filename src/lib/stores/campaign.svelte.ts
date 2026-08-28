import { database } from '$lib/services/database'
import { MAX_CONTENT_INTENSITY } from '$lib/services/content-intensity'
import type {
  Campaign,
  CampaignSettings,
  CampaignActorCategory,
  CampaignControlMode,
  CampaignPartyMember,
  CampaignSession,
  Character,
  Item,
  SceneTurnState,
  SessionPartyMember,
} from '$lib/types'
import {
  canActivatePartyMember,
  countActiveEligibleMembers,
  validateItemOwnership,
  validateSpotlightCharacter,
  buildSessionPartySnapshot,
} from '$lib/services/campaign/campaign-rules'
import {
  TurnOrderService,
  type SceneMode,
  type TurnOrderActor,
  type TurnOrderMode,
} from '$lib/services/campaign/turn-order-service'
import { TurnDirector, type TurnType } from '$lib/services/campaign/turn-director'

const DEFAULT_NARRATIVE_CONTROL: CampaignControlMode = 'autonomous'
const DEFAULT_COMBAT_CONTROL: CampaignControlMode = 'autonomous'
// Fallback ruleset for campaigns created (or backfilled) before a GM chooses one explicitly.
const DEFAULT_RULESET_ID = 'd20-classic'

const SCENE_MODE_DEFAULT_TURN_ORDER: Record<SceneMode, TurnOrderMode> = {
  free: 'free',
  exploration: 'free',
  travel: 'round_robin',
  camp: 'spotlight',
  settlement: 'spotlight',
  combat: 'initiative',
  social: 'spotlight',
  downtime: 'gm_directed',
}

class CampaignStore {
  current = $state<Campaign | null>(null)
  settings = $state<CampaignSettings | null>(null)
  partyMembers = $state<CampaignPartyMember[]>([])
  sessions = $state<CampaignSession[]>([])
  activeSession = $state<CampaignSession | null>(null)
  sessionParty = $state<SessionPartyMember[]>([])
  sceneTurnState = $state<SceneTurnState | null>(null)
  previousSceneMode = $state<SceneMode | null>(null)
  lastSceneTransition = $state<string | null>(null)
  loading = $state(false)
  private turnDirector = new TurnDirector()

  activeParty = $derived(
    this.partyMembers
      .filter((member) => member.active && member.eligibilityStatus === 'eligible')
      .sort((a, b) => a.displayOrder - b.displayOrder),
  )

  spotlightCharacterId = $derived(this.current?.spotlightCharacterId ?? null)

  reset(): void {
    this.current = null
    this.settings = null
    this.partyMembers = []
    this.sessions = []
    this.activeSession = null
    this.sessionParty = []
    this.sceneTurnState = null
    this.previousSceneMode = null
    this.lastSceneTransition = null
    this.loading = false
  }

  async loadForStory(storyId: string): Promise<void> {
    this.loading = true
    try {
      const campaign = await database.getCampaignByStoryId(storyId)
      this.current = campaign
      if (!campaign) {
        this.settings = null
        this.partyMembers = []
        this.sessions = []
        this.activeSession = null
        this.sessionParty = []
        return
      }

      this.settings = await database.getCampaignSettings(campaign.id)

      this.partyMembers = await database.getCampaignPartyMembers(campaign.id)
      this.sessions = await database.getCampaignSessions(campaign.id)
      this.activeSession = this.sessions.find((session) => session.status === 'active') ?? null
      this.sessionParty = this.activeSession
        ? await database.getSessionPartyMembers(this.activeSession.id)
        : []
      await this.loadSceneTurnState(null)
    } finally {
      this.loading = false
    }
  }

  private buildTurnOrderActors(actorIds: string[]): TurnOrderActor[] {
    return actorIds.map((actorId) => ({ id: actorId, name: actorId, category: 'ally' }))
  }

  private normalizeSceneMode(mode: string | null | undefined): SceneMode {
    if (!mode) return 'free'
    if (mode in SCENE_MODE_DEFAULT_TURN_ORDER) {
      return mode as SceneMode
    }
    return 'free'
  }

  private normalizeTurnOrderMode(mode: string | null | undefined): TurnOrderMode {
    if (
      mode === 'free' ||
      mode === 'round_robin' ||
      mode === 'initiative' ||
      mode === 'spotlight' ||
      mode === 'gm_directed'
    ) {
      return mode
    }
    return 'free'
  }

  getDefaultTurnOrderModeForScene(sceneMode: SceneMode): TurnOrderMode {
    return SCENE_MODE_DEFAULT_TURN_ORDER[sceneMode]
  }

  private getCurrentTurnActorIds(): string[] {
    if (this.activeSession && this.sessionParty.length > 0) {
      return this.sessionParty
        .filter((member) => member.leftAt === null)
        .sort((a, b) => a.partyOrder - b.partyOrder)
        .map((member) => member.characterId)
    }

    return this.activeParty.map((member) => member.characterId)
  }

  private buildDefaultSceneTurnState(entryId: string | null): SceneTurnState {
    if (!this.current) throw new Error('No campaign loaded')
    const now = Date.now()
    const actorOrder = this.getCurrentTurnActorIds()
    const activeActorId =
      this.current.spotlightCharacterId && actorOrder.includes(this.current.spotlightCharacterId)
        ? this.current.spotlightCharacterId
        : (actorOrder[0] ?? null)

    return {
      id: crypto.randomUUID(),
      campaignId: this.current.id,
      entryId,
      sceneMode: this.normalizeSceneMode(this.settings?.sceneMode),
      turnOrderMode: this.normalizeTurnOrderMode(this.settings?.turnOrderMode),
      activeActorId,
      actorOrder,
      turnNumber: 0,
      createdAt: now,
      updatedAt: now,
    }
  }

  async loadSceneTurnState(entryId: string | null = null): Promise<SceneTurnState> {
    if (!this.current) throw new Error('No campaign loaded')

    const stored = await database.getSceneTurnState(this.current.id, entryId)
    if (stored) {
      this.sceneTurnState = stored
      this.previousSceneMode = this.normalizeSceneMode(stored.sceneMode)
      await this.reconcileSceneTurnStateWithParty()
      return this.sceneTurnState!
    }

    const created = this.buildDefaultSceneTurnState(entryId)
    await database.upsertSceneTurnState(created)
    this.sceneTurnState = created
    this.previousSceneMode = this.normalizeSceneMode(created.sceneMode)
    return created
  }

  private async persistSceneTurnState(next: SceneTurnState): Promise<void> {
    await database.upsertSceneTurnState(next)
    this.sceneTurnState = next
  }

  private async reconcileSceneTurnStateWithParty(): Promise<void> {
    if (!this.sceneTurnState) return

    const actorIds = this.getCurrentTurnActorIds()
    const known = this.sceneTurnState.actorOrder.filter((actorId) => actorIds.includes(actorId))
    const missing = actorIds.filter((actorId) => !known.includes(actorId))
    const actorOrder = [...known, ...missing]
    const activeActorId =
      this.sceneTurnState.activeActorId && actorOrder.includes(this.sceneTurnState.activeActorId)
        ? this.sceneTurnState.activeActorId
        : (actorOrder[0] ?? null)

    if (
      activeActorId === this.sceneTurnState.activeActorId &&
      actorOrder.length === this.sceneTurnState.actorOrder.length &&
      actorOrder.every((actorId, index) => actorId === this.sceneTurnState!.actorOrder[index])
    ) {
      return
    }

    await this.persistSceneTurnState({
      ...this.sceneTurnState,
      actorOrder,
      activeActorId,
      updatedAt: Date.now(),
    })
  }

  getCurrentTurnActor(): TurnOrderActor | null {
    const activeActorId = this.sceneTurnState?.activeActorId ?? null
    if (!activeActorId) return null

    const member = this.partyMembers.find((candidate) => candidate.characterId === activeActorId)
    const actorCategory = member?.actorCategory

    const category: TurnOrderActor['category'] =
      actorCategory === 'primary_player_character'
        ? 'player'
        : actorCategory === 'active_companion'
          ? 'ally'
          : actorCategory === 'enemy'
            ? 'enemy'
            : actorCategory === 'friendly_npc' || actorCategory === 'neutral_npc'
              ? 'npc'
              : 'ally'

    return {
      id: activeActorId,
      name: member?.characterId ?? activeActorId,
      category,
    }
  }

  getCurrentTurnType(): TurnType {
    const currentSceneMode = this.normalizeSceneMode(this.sceneTurnState?.sceneMode)
    const previousSceneMode = this.previousSceneMode ?? currentSceneMode
    const activeActor = this.getCurrentTurnActor()

    return this.turnDirector.getNextTurnType({
      sceneMode: currentSceneMode,
      previousSceneMode,
      activeActor,
      pendingRoll: null,
    })
  }

  async setSceneMode(
    sceneMode: SceneMode,
    options?: { applyDefaultTurnOrder?: boolean },
  ): Promise<void> {
    const current = await this.loadSceneTurnState(null)
    const previousSceneMode = this.previousSceneMode ?? this.normalizeSceneMode(current.sceneMode)
    const applyDefaultTurnOrder = options?.applyDefaultTurnOrder ?? true
    const nextTurnOrderMode = applyDefaultTurnOrder
      ? this.getDefaultTurnOrderModeForScene(sceneMode)
      : this.normalizeTurnOrderMode(current.turnOrderMode)
    const now = Date.now()

    this.previousSceneMode = previousSceneMode
    this.lastSceneTransition =
      previousSceneMode !== sceneMode
        ? this.turnDirector.describeSceneTransition(previousSceneMode, sceneMode)
        : null

    await this.persistSceneTurnState({
      ...current,
      sceneMode,
      turnOrderMode: nextTurnOrderMode,
      updatedAt: now,
    })

    if (this.settings) {
      const nextSettings: CampaignSettings = {
        ...this.settings,
        sceneMode,
        turnOrderMode: nextTurnOrderMode,
        updatedAt: now,
      }
      await database.upsertCampaignSettings(nextSettings)
      this.settings = nextSettings
    }
  }

  async setTurnOrderMode(turnOrderMode: TurnOrderMode): Promise<void> {
    const current = await this.loadSceneTurnState(null)
    const now = Date.now()
    await this.persistSceneTurnState({ ...current, turnOrderMode, updatedAt: now })

    if (this.settings) {
      const nextSettings: CampaignSettings = {
        ...this.settings,
        turnOrderMode,
        updatedAt: now,
      }
      await database.upsertCampaignSettings(nextSettings)
      this.settings = nextSettings
    }
  }

  async setActiveActor(characterId: string | null): Promise<void> {
    const current = await this.loadSceneTurnState(null)
    const service = new TurnOrderService({
      sceneMode: this.normalizeSceneMode(current.sceneMode),
      turnOrderMode: this.normalizeTurnOrderMode(current.turnOrderMode),
      actors: this.buildTurnOrderActors(current.actorOrder),
      activeActorId: current.activeActorId,
    })
    service.setActiveActor(characterId)
    const snapshot = service.snapshot()
    await this.persistSceneTurnState({
      ...current,
      actorOrder: snapshot.actorIds,
      activeActorId: snapshot.activeActorId,
      updatedAt: Date.now(),
    })
  }

  async advanceTurn(): Promise<void> {
    const current = await this.loadSceneTurnState(null)
    const service = new TurnOrderService({
      sceneMode: this.normalizeSceneMode(current.sceneMode),
      turnOrderMode: this.normalizeTurnOrderMode(current.turnOrderMode),
      actors: this.buildTurnOrderActors(current.actorOrder),
      activeActorId: current.activeActorId,
    })
    service.advance()
    const snapshot = service.snapshot()
    await this.persistSceneTurnState({
      ...current,
      actorOrder: snapshot.actorIds,
      activeActorId: snapshot.activeActorId,
      turnNumber: current.turnNumber + 1,
      updatedAt: Date.now(),
    })
  }

  async ensureForStory(story: {
    id: string
    title: string
    description: string | null
    createdAt: number
    updatedAt: number
    characters: Character[]
  }): Promise<Campaign> {
    const existing = await database.getCampaignByStoryId(story.id)
    if (existing) {
      // Legacy campaigns created before rulesets existed (or before this campaign
      // engine existed at all) may be missing a ruleset assignment; backfill it.
      let resolved = existing
      if (!resolved.rulesetId) {
        resolved = { ...resolved, rulesetId: DEFAULT_RULESET_ID, updatedAt: Date.now() }
        await database.upsertCampaign(resolved)
      }
      this.current = resolved
      const existingSettings = await database.getCampaignSettings(existing.id)
      if (existingSettings) {
        this.settings = existingSettings
      } else {
        const now = Date.now()
        const fallbackSettings: CampaignSettings = {
          campaignId: existing.id,
          defaultPartySize: 4,
          maxPartySize: 6,
          sceneMode: 'free',
          turnOrderMode: 'free',
          diceEnforcement: 'guided',
          nsfwIntensity: 0,
          worldCharter: null,
          gmPersona: null,
          companionCombatPolicy: 'companions_autonomous',
          createdAt: now,
          updatedAt: now,
        }
        await database.upsertCampaignSettings(fallbackSettings)
        this.settings = fallbackSettings
      }
      return resolved
    }

    const campaign: Campaign = {
      id: crypto.randomUUID(),
      storyId: story.id,
      title: story.title,
      description: story.description,
      rulesetId: DEFAULT_RULESET_ID,
      spotlightCharacterId: null,
      status: 'active',
      createdAt: story.createdAt,
      updatedAt: story.updatedAt,
    }
    await database.upsertCampaign(campaign)
    const now = Date.now()
    const defaultSettings: CampaignSettings = {
      campaignId: campaign.id,
      defaultPartySize: 4,
      maxPartySize: 6,
      sceneMode: 'free',
      turnOrderMode: 'free',
      diceEnforcement: 'guided',
      nsfwIntensity: 0,
      worldCharter: null,
      gmPersona: null,
      companionCombatPolicy: 'companions_autonomous',
      createdAt: now,
      updatedAt: now,
    }
    await database.upsertCampaignSettings(defaultSettings)
    this.settings = defaultSettings
    this.current = campaign
    return campaign
  }

  async seedPartyFromCharacters(characters: Character[]): Promise<void> {
    if (!this.current) throw new Error('No campaign loaded')

    const primaryCharacterId = characters.find((character) => character.relationship === 'self')?.id
    const maxPartySize = this.settings?.maxPartySize ?? 6
    // Seed the player character first so it always fits within the party limit.
    const ordered = [...characters.entries()].sort(
      ([, a], [, b]) => Number(b.id === primaryCharacterId) - Number(a.id === primaryCharacterId),
    )

    for (const [index, character] of ordered) {
      if (character.status === 'deceased') continue
      const existing = this.partyMembers.find((member) => member.characterId === character.id)
      if (existing) continue
      // Stories can hold more characters than the party allows; skip the overflow
      // instead of throwing, otherwise opening the campaign fails outright.
      if (countActiveEligibleMembers(this.partyMembers) >= maxPartySize) continue
      await this.setPartyMember(character, {
        actorCategory:
          character.id === primaryCharacterId ? 'primary_player_character' : 'active_companion',
        displayOrder: index,
      })
    }

    // Legacy adventures never had a spotlight set explicitly; default it to the
    // protagonist once the party roster exists so downstream features (turn
    // order, agency context) always have an active actor to work from.
    if (this.current && !this.current.spotlightCharacterId && primaryCharacterId) {
      const isEligible = this.partyMembers.some(
        (member) =>
          member.characterId === primaryCharacterId &&
          member.active &&
          member.eligibilityStatus === 'eligible',
      )
      if (isEligible) {
        await this.setSpotlightCharacter(primaryCharacterId)
      }
    }
  }

  async setPartyMember(
    character: Character,
    options?: {
      active?: boolean
      actorCategory?: CampaignActorCategory
      narrativeControlMode?: CampaignControlMode
      combatControlMode?: CampaignControlMode
      displayOrder?: number
    },
  ): Promise<void> {
    if (!this.current) throw new Error('No campaign loaded')

    const existing = this.partyMembers.find((member) => member.characterId === character.id)
    if (!existing && options?.active !== false && this.settings) {
      const candidate: CampaignPartyMember = {
        id: '',
        campaignId: this.current.id,
        characterId: character.id,
        eligibilityStatus: 'eligible',
        actorCategory: 'active_companion',
        active: true,
        narrativeControlMode: DEFAULT_NARRATIVE_CONTROL,
        combatControlMode: DEFAULT_COMBAT_CONTROL,
        displayOrder: 0,
        joinedAt: 0,
        leftAt: null,
      }
      if (!canActivatePartyMember(this.partyMembers, candidate, this.settings.maxPartySize)) {
        throw new Error(`Party limit reached (${this.settings.maxPartySize} active members)`)
      }
    }
    const now = Date.now()
    const member: CampaignPartyMember = {
      id: existing?.id ?? crypto.randomUUID(),
      campaignId: this.current.id,
      characterId: character.id,
      eligibilityStatus: character.status === 'deceased' ? 'deceased' : 'eligible',
      actorCategory: options?.actorCategory ?? existing?.actorCategory ?? 'active_companion',
      active: options?.active ?? existing?.active ?? true,
      narrativeControlMode:
        options?.narrativeControlMode ??
        existing?.narrativeControlMode ??
        DEFAULT_NARRATIVE_CONTROL,
      combatControlMode:
        options?.combatControlMode ?? existing?.combatControlMode ?? DEFAULT_COMBAT_CONTROL,
      displayOrder: options?.displayOrder ?? existing?.displayOrder ?? this.partyMembers.length,
      joinedAt: existing?.joinedAt ?? now,
      leftAt: options?.active === false ? now : null,
    }

    await database.upsertCampaignPartyMember(member)
    this.partyMembers = [
      ...this.partyMembers.filter((candidate) => candidate.characterId !== character.id),
      member,
    ].sort((a, b) => a.displayOrder - b.displayOrder)
    await this.reconcileSceneTurnStateWithParty()
  }

  async setSpotlightCharacter(characterId: string | null): Promise<void> {
    if (!this.current) throw new Error('No campaign loaded')
    validateSpotlightCharacter(this.partyMembers, characterId)

    await database.updateCampaignSpotlight(this.current.id, characterId)
    this.current = { ...this.current, spotlightCharacterId: characterId, updatedAt: Date.now() }
    if (
      this.sceneTurnState &&
      characterId &&
      this.sceneTurnState.actorOrder.includes(characterId)
    ) {
      await this.setActiveActor(characterId)
    }
  }

  async updateSettings(updates: Partial<CampaignSettings>): Promise<void> {
    if (!this.settings) throw new Error('No campaign settings loaded')
    const next = {
      ...this.settings,
      ...updates,
      nsfwIntensity:
        updates.nsfwIntensity === undefined
          ? this.settings.nsfwIntensity
          : Math.max(0, Math.min(MAX_CONTENT_INTENSITY, Math.floor(updates.nsfwIntensity))),
      updatedAt: Date.now(),
    }
    if (next.maxPartySize < next.defaultPartySize) {
      throw new Error('Maximum party size cannot be smaller than the default party size')
    }
    const {
      campaignId: _campaignId,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      ...changedSettings
    } = updates
    await database.updateCampaignSettings(next.campaignId, changedSettings)
    const persisted = await database.getCampaignSettings(next.campaignId)
    if (!persisted || persisted.nsfwIntensity !== next.nsfwIntensity) {
      throw new Error('Campaign settings write could not be verified')
    }
    this.settings = persisted
  }

  async setRuleset(rulesetId: string): Promise<void> {
    if (!this.current) throw new Error('No campaign loaded')
    const selected = await database.getRuleset(rulesetId)
    if (!selected) throw new Error('Ruleset not found')
    const updated = { ...this.current, rulesetId, updatedAt: Date.now() }
    await database.upsertCampaign(updated)
    this.current = updated
  }

  async setItemOwnership(
    item: Item,
    ownership: {
      ownerCharacterId: string | null
      slotKey?: string | null
      containerItemId?: string | null
    },
  ): Promise<void> {
    if (!this.current) throw new Error('No campaign loaded')
    validateItemOwnership(item, this.current.storyId, this.partyMembers, ownership)

    await database.updateItem(item.id, ownership)
  }

  async startSession(options: {
    primaryCharacterId: string
    title?: string | null
    combatControlPolicy?: CampaignSession['combatControlPolicy']
  }): Promise<CampaignSession> {
    if (!this.current) throw new Error('No campaign loaded')
    if (this.activeSession) {
      throw new Error('End the active session before starting a new session')
    }
    const primary = this.partyMembers.find(
      (member) => member.characterId === options.primaryCharacterId && member.active,
    )
    if (!primary) throw new Error('Primary character must be an active eligible party member')

    const now = Date.now()
    const session: CampaignSession = {
      id: crypto.randomUUID(),
      campaignId: this.current.id,
      sessionNumber: this.sessions.length + 1,
      title: options.title ?? null,
      primaryCharacterId: options.primaryCharacterId,
      narrativeControlPolicy: 'primary_player_companions_autonomous',
      combatControlPolicy:
        options.combatControlPolicy ??
        this.settings?.companionCombatPolicy ??
        'companions_autonomous',
      status: 'active',
      startedAt: now,
      endedAt: null,
    }

    await database.createCampaignSession(session)

    const snapshot = buildSessionPartySnapshot(
      session,
      this.activeParty,
      options.primaryCharacterId,
      now,
    )

    for (const member of snapshot) {
      await database.addSessionPartyMember(member)
    }

    this.sessions = [session, ...this.sessions]
    this.activeSession = session
    this.sessionParty = snapshot
    await this.reconcileSceneTurnStateWithParty()
    return session
  }

  async endSession(status: 'completed' | 'abandoned' = 'completed'): Promise<void> {
    if (!this.activeSession) throw new Error('No active session to end')
    await database.endCampaignSession(this.activeSession.id, status)
    const endedAt = Date.now()
    const endedSession = { ...this.activeSession, status, endedAt }
    this.sessions = this.sessions.map((session) =>
      session.id === endedSession.id ? endedSession : session,
    )
    this.activeSession = null
    this.sessionParty = []
    await this.reconcileSceneTurnStateWithParty()
  }
}

export const campaign = new CampaignStore()

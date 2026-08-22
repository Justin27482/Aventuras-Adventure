import { database } from '$lib/services/database'
import type {
  Campaign,
  CampaignSettings,
  CampaignActorCategory,
  CampaignControlMode,
  CampaignPartyMember,
  CampaignSession,
  Character,
  Item,
  SessionPartyMember,
} from '$lib/types'
import {
  canActivatePartyMember,
  countActiveEligibleMembers,
  validateItemOwnership,
  validateSpotlightCharacter,
  buildSessionPartySnapshot,
} from '$lib/services/campaign/campaign-rules'

const DEFAULT_NARRATIVE_CONTROL: CampaignControlMode = 'autonomous'
const DEFAULT_COMBAT_CONTROL: CampaignControlMode = 'autonomous'
// Fallback ruleset for campaigns created (or backfilled) before a GM chooses one explicitly.
const DEFAULT_RULESET_ID = 'd20-classic'

class CampaignStore {
  current = $state<Campaign | null>(null)
  settings = $state<CampaignSettings | null>(null)
  partyMembers = $state<CampaignPartyMember[]>([])
  sessions = $state<CampaignSession[]>([])
  activeSession = $state<CampaignSession | null>(null)
  sessionParty = $state<SessionPartyMember[]>([])
  loading = $state(false)

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
    } finally {
      this.loading = false
    }
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
      ([, a], [, b]) =>
        Number(b.id === primaryCharacterId) - Number(a.id === primaryCharacterId),
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
      actorCategory:
        options?.actorCategory ?? existing?.actorCategory ?? 'active_companion',
      active: options?.active ?? existing?.active ?? true,
      narrativeControlMode:
        options?.narrativeControlMode ?? existing?.narrativeControlMode ?? DEFAULT_NARRATIVE_CONTROL,
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
  }

  async setSpotlightCharacter(characterId: string | null): Promise<void> {
    if (!this.current) throw new Error('No campaign loaded')
    validateSpotlightCharacter(this.partyMembers, characterId)

    await database.updateCampaignSpotlight(this.current.id, characterId)
    this.current = { ...this.current, spotlightCharacterId: characterId, updatedAt: Date.now() }
  }

  async updateSettings(updates: Partial<CampaignSettings>): Promise<void> {
    if (!this.settings) throw new Error('No campaign settings loaded')
    const next = { ...this.settings, ...updates, updatedAt: Date.now() }
    if (next.maxPartySize < next.defaultPartySize) {
      throw new Error('Maximum party size cannot be smaller than the default party size')
    }
    await database.upsertCampaignSettings(next)
    this.settings = next
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
  }
}

export const campaign = new CampaignStore()

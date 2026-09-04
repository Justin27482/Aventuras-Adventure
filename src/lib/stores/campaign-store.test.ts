import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockDatabase } = vi.hoisted(() => ({
  mockDatabase: {
    getCampaignByStoryId: vi.fn(),
    getCampaignSettings: vi.fn(),
    getCampaignFormationState: vi.fn(),
    getCampaignPartyMembers: vi.fn(),
    getCampaignSessions: vi.fn(),
    getSceneTurnState: vi.fn(),
    upsertCampaign: vi.fn(),
    upsertCampaignSettings: vi.fn(),
    upsertSceneTurnState: vi.fn(),
    upsertCampaignPartyMember: vi.fn(),
    updateCampaignSpotlight: vi.fn(),
    updateCampaignType: vi.fn(),
    deleteRollLedgerEntry: vi.fn(),
    updateItem: vi.fn(),
    createCampaignSession: vi.fn(),
    addSessionPartyMember: vi.fn(),
    getSessionPartyMembers: vi.fn(),
    endCampaignSession: vi.fn(),
    withTransaction: vi.fn(async (fn) => await fn()),
    createStory: vi.fn(),
    addCharacter: vi.fn(),
    addLocation: vi.fn(),
    addItem: vi.fn(),
    addStoryEntry: vi.fn(),
    getCharactersForBranch: vi.fn(),
    getStoryEntriesForBranch: vi.fn(),
    setStoryPack: vi.fn(),
    setStoryCustomVariables: vi.fn(),
    getBackgroundForBranch: vi.fn(),
    getCharacters: vi.fn(),
    getLocations: vi.fn(),
    getItems: vi.fn(),
    getStoryBeats: vi.fn(),
    getCheckpoints: vi.fn(),
    getEntries: vi.fn(),
    getChapterSources: vi.fn(),
    getBranches: vi.fn(),
    cleanupOrphanedEmbeddedImages: vi.fn(),
  },
}))

vi.mock('$lib/services/database', () => ({
  database: mockDatabase,
}))

import { database } from '$lib/services/database'
import { campaign } from './campaign.svelte'
import { story } from './story.svelte'
import type { Character } from '$lib/types'

function buildCharacter(overrides: Partial<Character> & Pick<Character, 'id' | 'name'>): Character {
  return {
    storyId: 'story-1',
    description: null,
    relationship: null,
    traits: [],
    visualDescriptors: {},
    portrait: null,
    status: 'active',
    metadata: null,
    branchId: null,
    ...overrides,
  }
}

describe('campaign store session boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    campaign.reset()

    mockDatabase.getCampaignByStoryId.mockResolvedValue(null)
    mockDatabase.getCampaignSettings.mockResolvedValue(null)
    mockDatabase.getCampaignFormationState.mockResolvedValue(null)
    mockDatabase.getCampaignPartyMembers.mockResolvedValue([])
    mockDatabase.getCampaignSessions.mockResolvedValue([])
    mockDatabase.getSceneTurnState.mockResolvedValue(null)
    mockDatabase.upsertCampaign.mockResolvedValue(undefined)
    mockDatabase.upsertCampaignSettings.mockResolvedValue(undefined)
    mockDatabase.upsertSceneTurnState.mockResolvedValue(undefined)
    mockDatabase.upsertCampaignPartyMember.mockResolvedValue(undefined)
    mockDatabase.updateCampaignSpotlight.mockResolvedValue(undefined)
    mockDatabase.updateCampaignType.mockResolvedValue(undefined)
    mockDatabase.deleteRollLedgerEntry.mockResolvedValue(undefined)
    mockDatabase.updateItem.mockResolvedValue(undefined)
    mockDatabase.createCampaignSession.mockResolvedValue(undefined)
    mockDatabase.addSessionPartyMember.mockResolvedValue(undefined)
    mockDatabase.getSessionPartyMembers.mockResolvedValue([])
    mockDatabase.endCampaignSession.mockResolvedValue(undefined)
    mockDatabase.withTransaction.mockImplementation(async (fn) => await fn())
    mockDatabase.createStory.mockResolvedValue({
      id: 'story-xyz',
      title: 'Brightness Dimmed',
      description: null,
      genre: 'Fantasy',
      templateId: 'wizard-generated',
      mode: 'adventure',
      settings: null,
      memoryConfig: null,
      retryState: null,
      styleReviewState: null,
      timeTracker: null,
      currentBranchId: null,
      currentBgImage: null,
      createdAt: 1,
      updatedAt: 1,
    })
    mockDatabase.addCharacter.mockResolvedValue(undefined)
    mockDatabase.addLocation.mockResolvedValue(undefined)
    mockDatabase.addItem.mockResolvedValue(undefined)
    mockDatabase.addStoryEntry.mockResolvedValue({
      id: 'entry-1',
      storyId: 'story-xyz',
      type: 'narration',
      content: 'Opening scene',
      parentId: null,
      position: 0,
      metadata: null,
      reasoning: null,
      createdAt: 1,
      branchId: null,
    })
    mockDatabase.getCharactersForBranch.mockResolvedValue([])
    mockDatabase.getStoryEntriesForBranch.mockResolvedValue([])
    mockDatabase.setStoryPack.mockResolvedValue(undefined)
    mockDatabase.setStoryCustomVariables.mockResolvedValue(undefined)
    mockDatabase.getBackgroundForBranch.mockResolvedValue(null)
    mockDatabase.getCharacters.mockResolvedValue([])
    mockDatabase.getLocations.mockResolvedValue([])
    mockDatabase.getItems.mockResolvedValue([])
    mockDatabase.getStoryBeats.mockResolvedValue([])
    mockDatabase.getCheckpoints.mockResolvedValue([])
    mockDatabase.getEntries.mockResolvedValue([])
    mockDatabase.getChapterSources.mockResolvedValue([])
    mockDatabase.getBranches.mockResolvedValue([])
    mockDatabase.cleanupOrphanedEmbeddedImages.mockResolvedValue(undefined)
  })

  it('creates a wizard story without requiring a transaction-level write lock', async () => {
    mockDatabase.getCharactersForBranch.mockResolvedValueOnce([
      buildCharacter({ id: 'primary-1', name: 'Kyra', relationship: 'self' }),
    ])
    mockDatabase.getStoryEntriesForBranch.mockResolvedValueOnce([
      {
        id: 'entry-1',
        storyId: 'story-1',
        type: 'narration',
        content: 'The lamps burned low as the city listened.',
        parentId: null,
        position: 0,
        metadata: null,
        branchId: null,
        createdAt: 1,
      },
    ])
    mockDatabase.addStoryEntry.mockResolvedValueOnce({
      id: 'entry-1',
      storyId: 'story-1',
      type: 'narration',
      content: 'The lamps burned low as the city listened.',
      parentId: null,
      position: 0,
      metadata: null,
      branchId: null,
      createdAt: 1,
    })

    await story.createStoryFromWizard({
      title: 'Brightness Dimmed',
      genre: 'Fantasy',
      description: 'A quiet lantern-lit mystery',
      mode: 'adventure',
      settings: {
        pov: 'third',
        tense: 'present',
        tone: 'moody',
        themes: ['mystery'],
      },
      protagonist: {
        name: 'Kyra',
        description: 'A weary investigator',
        traits: ['careful'],
      },
      startingLocation: {
        name: 'Ashen Square',
        description: 'A quiet courtyard beneath dim lamps.',
      },
      initialItems: [],
      openingScene: 'The lamps burned low as the city listened.',
      characters: [{ name: 'Lys', relationship: 'ally', traits: ['sharp'] }],
    })

    expect(database.withTransaction).not.toHaveBeenCalled()
    expect(database.createStory).toHaveBeenCalledTimes(1)
    expect(database.addStoryEntry).toHaveBeenCalledTimes(1)
  })

  it('persists the prompt pack while creating a party-pending story without an opening', async () => {
    await story.createStoryFromWizard({
      title: 'The Bloom',
      genre: 'Fantasy',
      mode: 'adventure',
      settings: {
        pov: 'third',
        tense: 'present',
      },
      protagonist: {},
      startingLocation: {
        name: 'Campaign Setting',
        description: 'A world waiting for its party.',
      },
      initialItems: [],
      openingScene: '',
      allowEmptyOpening: true,
      characters: [],
      packId: 'custom-pack',
      customVariableValues: { campaignMood: 'ominous' },
    })

    expect(database.createStory).toHaveBeenCalledWith(
      expect.objectContaining({
        packId: 'custom-pack',
        customVariableValues: { campaignMood: 'ominous' },
      }),
    )
    expect(database.addStoryEntry).not.toHaveBeenCalled()
  })

  it('starts and ends a session while preserving the party snapshot boundary', async () => {
    const primary = buildCharacter({ id: 'primary-1', name: 'Kyra', relationship: 'self' })
    const companion = buildCharacter({ id: 'companion-1', name: 'Rin', relationship: 'friend' })

    await campaign.ensureForStory({
      id: 'story-1',
      title: 'The Night Road',
      description: null,
      createdAt: 1,
      updatedAt: 1,
      characters: [primary, companion],
    })

    await campaign.setPartyMember(primary, {
      actorCategory: 'primary_player_character',
      displayOrder: 0,
    })
    await campaign.setPartyMember(companion, {
      actorCategory: 'active_companion',
      displayOrder: 1,
    })

    const session = await campaign.startSession({ primaryCharacterId: primary.id })

    expect(session.primaryCharacterId).toBe(primary.id)
    expect(campaign.activeSession?.id).toBe(session.id)
    expect(campaign.sessionParty.map((member) => member.characterId)).toEqual([
      primary.id,
      companion.id,
    ])

    await campaign.endSession('completed')

    expect(campaign.activeSession).toBeNull()
    expect(campaign.sessionParty).toEqual([])
    expect(mockDatabase.endCampaignSession).toHaveBeenCalledWith(session.id, 'completed')
  })

  it('blocks selecting a spotlight character that is not an active eligible party member', async () => {
    const primary = buildCharacter({ id: 'primary-1', name: 'Kyra', relationship: 'self' })

    await campaign.ensureForStory({
      id: 'story-1',
      title: 'The Night Road',
      description: null,
      createdAt: 1,
      updatedAt: 1,
      characters: [primary],
    })

    await campaign.setPartyMember(primary, {
      actorCategory: 'primary_player_character',
      active: false,
    })

    await expect(campaign.setSpotlightCharacter('primary-1')).rejects.toThrow(
      'Spotlight character must be an active eligible party member',
    )
  })

  it('rejects party-size settings that put the default above the maximum', async () => {
    await campaign.ensureForStory({
      id: 'story-1',
      title: 'The Night Road',
      description: null,
      createdAt: 1,
      updatedAt: 1,
      characters: [],
    })

    await expect(campaign.updateSettings({ defaultPartySize: 6, maxPartySize: 4 })).rejects.toThrow(
      'Maximum party size cannot be smaller than the default party size',
    )
  })

  it('prevents starting a second active session and requires an active primary character', async () => {
    const primary = buildCharacter({ id: 'primary-1', name: 'Kyra', relationship: 'self' })
    const companion = buildCharacter({ id: 'companion-1', name: 'Rin', relationship: 'friend' })

    await campaign.ensureForStory({
      id: 'story-1',
      title: 'The Night Road',
      description: null,
      createdAt: 1,
      updatedAt: 1,
      characters: [primary, companion],
    })

    await campaign.setPartyMember(primary, {
      actorCategory: 'primary_player_character',
      displayOrder: 0,
    })
    await campaign.setPartyMember(companion, {
      actorCategory: 'active_companion',
      displayOrder: 1,
    })

    await campaign.startSession({ primaryCharacterId: primary.id })

    await expect(campaign.startSession({ primaryCharacterId: primary.id })).rejects.toThrow(
      'End the active session before starting a new session',
    )

    await campaign.endSession('completed')

    await campaign.setPartyMember(primary, {
      actorCategory: 'primary_player_character',
      active: false,
    })

    await expect(campaign.startSession({ primaryCharacterId: primary.id })).rejects.toThrow(
      'Primary character must be an active eligible party member',
    )
  })

  it('hydrates missing scene turn state from campaign defaults and party order', async () => {
    mockDatabase.getCampaignByStoryId.mockResolvedValue({
      id: 'campaign-1',
      storyId: 'story-1',
      title: 'The Night Road',
      description: null,
      rulesetId: 'd20-classic',
      spotlightCharacterId: 'primary-1',
      status: 'active',
      createdAt: 1,
      updatedAt: 1,
    })
    mockDatabase.getCampaignSettings.mockResolvedValue({
      campaignId: 'campaign-1',
      defaultPartySize: 4,
      maxPartySize: 6,
      sceneMode: 'combat',
      turnOrderMode: 'initiative',
      diceEnforcement: 'guided',
      nsfwIntensity: 0,
      worldCharter: null,
      companionCombatPolicy: 'companions_autonomous',
      aiPlayersEnabled: false,
      defaultAIPlayerCount: 4,
      createdAt: 1,
      updatedAt: 1,
    })
    mockDatabase.getCampaignPartyMembers.mockResolvedValue([
      {
        id: 'member-1',
        campaignId: 'campaign-1',
        characterId: 'primary-1',
        eligibilityStatus: 'eligible',
        actorCategory: 'primary_player_character',
        active: true,
        narrativeControlMode: 'player_narrative',
        combatControlMode: 'player_narrative',
        displayOrder: 0,
        joinedAt: 1,
        leftAt: null,
      },
      {
        id: 'member-2',
        campaignId: 'campaign-1',
        characterId: 'companion-1',
        eligibilityStatus: 'eligible',
        actorCategory: 'active_companion',
        active: true,
        narrativeControlMode: 'autonomous',
        combatControlMode: 'autonomous',
        displayOrder: 1,
        joinedAt: 1,
        leftAt: null,
      },
    ])

    await campaign.loadForStory('story-1')

    expect(mockDatabase.upsertSceneTurnState).toHaveBeenCalledTimes(1)
    const [state] = mockDatabase.upsertSceneTurnState.mock.calls[0]
    expect(state.campaignId).toBe('campaign-1')
    expect(state.entryId).toBeNull()
    expect(state.sceneMode).toBe('combat')
    expect(state.turnOrderMode).toBe('initiative')
    expect(state.actorOrder).toEqual(['primary-1', 'companion-1'])
    expect(state.activeActorId).toBe('primary-1')
  })

  it('advances turn state and persists active actor changes', async () => {
    await campaign.ensureForStory({
      id: 'story-1',
      title: 'The Night Road',
      description: null,
      createdAt: 1,
      updatedAt: 1,
      characters: [],
    })

    const primary = buildCharacter({ id: 'primary-1', name: 'Kyra', relationship: 'self' })
    const companion = buildCharacter({ id: 'companion-1', name: 'Rin', relationship: 'friend' })

    await campaign.setPartyMember(primary, {
      actorCategory: 'primary_player_character',
      displayOrder: 0,
    })
    await campaign.setPartyMember(companion, {
      actorCategory: 'active_companion',
      displayOrder: 1,
    })

    await campaign.loadSceneTurnState()
    await campaign.setActiveActor('primary-1')
    await campaign.advanceTurn()

    expect(campaign.sceneTurnState?.activeActorId).toBe('companion-1')
    expect(campaign.sceneTurnState?.turnNumber).toBe(1)
    expect(mockDatabase.upsertSceneTurnState).toHaveBeenCalled()
  })

  it('applies per-scene-mode default turn order and persists settings', async () => {
    await campaign.ensureForStory({
      id: 'story-1',
      title: 'The Night Road',
      description: null,
      createdAt: 1,
      updatedAt: 1,
      characters: [],
    })

    const primary = buildCharacter({ id: 'primary-1', name: 'Kyra', relationship: 'self' })
    await campaign.setPartyMember(primary, {
      actorCategory: 'primary_player_character',
      displayOrder: 0,
    })

    await campaign.loadSceneTurnState()
    await campaign.setSceneMode('combat')

    expect(campaign.sceneTurnState?.sceneMode).toBe('combat')
    expect(campaign.sceneTurnState?.turnOrderMode).toBe('initiative')
    expect(campaign.settings?.sceneMode).toBe('combat')
    expect(campaign.settings?.turnOrderMode).toBe('initiative')
    expect(mockDatabase.upsertCampaignSettings).toHaveBeenCalled()
  })

  it('tracks scene transitions and the active turn type when the scene changes', async () => {
    await campaign.ensureForStory({
      id: 'story-1',
      title: 'The Night Road',
      description: null,
      createdAt: 1,
      updatedAt: 1,
      characters: [],
    })

    const primary = buildCharacter({ id: 'primary-1', name: 'Kyra', relationship: 'self' })
    await campaign.setPartyMember(primary, {
      actorCategory: 'primary_player_character',
      displayOrder: 0,
    })

    await campaign.loadSceneTurnState()
    await campaign.setSceneMode('combat')

    expect(campaign.lastSceneTransition).toContain('combat')
    expect(campaign.getCurrentTurnType()).toBe('scene_transition')
  })

  it('allows scene-mode changes without forcing the default turn order', async () => {
    await campaign.ensureForStory({
      id: 'story-1',
      title: 'The Night Road',
      description: null,
      createdAt: 1,
      updatedAt: 1,
      characters: [],
    })

    const primary = buildCharacter({ id: 'primary-1', name: 'Kyra', relationship: 'self' })
    await campaign.setPartyMember(primary, {
      actorCategory: 'primary_player_character',
      displayOrder: 0,
    })

    await campaign.loadSceneTurnState()
    await campaign.setTurnOrderMode('round_robin')
    await campaign.setSceneMode('social', { applyDefaultTurnOrder: false })

    expect(campaign.sceneTurnState?.sceneMode).toBe('social')
    expect(campaign.sceneTurnState?.turnOrderMode).toBe('round_robin')
  })

  it('updates campaign type and persists it', async () => {
    await campaign.ensureForStory({
      id: 'story-1',
      title: 'The Night Road',
      description: null,
      createdAt: 1,
      updatedAt: 1,
      characters: [],
    })

    await campaign.setCampaignType('human_gm_ai_players')

    expect(campaign.current?.campaignType).toBe('human_gm_ai_players')
    expect(mockDatabase.updateCampaignType).toHaveBeenCalledWith(
      campaign.current?.id,
      'human_gm_ai_players',
    )
  })
})

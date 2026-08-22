import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockDatabase } = vi.hoisted(() => ({
  mockDatabase: {
    getCampaignByStoryId: vi.fn(),
    getCampaignSettings: vi.fn(),
    getCampaignPartyMembers: vi.fn(),
    getCampaignSessions: vi.fn(),
    upsertCampaign: vi.fn(),
    upsertCampaignSettings: vi.fn(),
    upsertCampaignPartyMember: vi.fn(),
    updateCampaignSpotlight: vi.fn(),
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
    mockDatabase.getCampaignPartyMembers.mockResolvedValue([])
    mockDatabase.getCampaignSessions.mockResolvedValue([])
    mockDatabase.upsertCampaign.mockResolvedValue(undefined)
    mockDatabase.upsertCampaignSettings.mockResolvedValue(undefined)
    mockDatabase.upsertCampaignPartyMember.mockResolvedValue(undefined)
    mockDatabase.updateCampaignSpotlight.mockResolvedValue(undefined)
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

  it('wraps wizard story creation in a single transaction so partial writes do not orphan a campaign', async () => {
    mockDatabase.addCharacter.mockRejectedValueOnce(new Error('db failure'))

    await expect(
      story.createStoryFromWizard({
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
      }),
    ).rejects.toThrow('db failure')

    expect(database.withTransaction).toHaveBeenCalledTimes(1)
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

    await expect(
      campaign.updateSettings({ defaultPartySize: 6, maxPartySize: 4 }),
    ).rejects.toThrow('Maximum party size cannot be smaller than the default party size')
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
})

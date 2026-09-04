import { beforeEach, describe, expect, it, vi } from 'vitest'

const { database, generatePlainText, renderStoryPrompt } = vi.hoisted(() => ({
  database: {
    getPlayerCharactersForCampaign: vi.fn(),
    getCharacters: vi.fn(),
    getCampaignByStoryId: vi.fn(),
    getAIPlayerMemories: vi.fn(),
    upsertAIPlayerMemory: vi.fn(),
  },
  generatePlainText: vi.fn(),
  renderStoryPrompt: vi.fn(),
}))

vi.mock('$lib/services/database', () => ({ database }))
vi.mock('$lib/services/ai/sdk', () => ({ generatePlainText }))
vi.mock('$lib/services/prompts', () => ({ renderStoryPrompt }))

import { storePrivatePrologueMemory } from './private-prologue-memory'

const baseAssignment = {
  id: 'assignment-1',
  campaignId: 'campaign-1',
  aiPlayerId: 'player-1',
  characterId: 'character-1',
  roleplayNotes: null,
  characterSecrets: [] as Record<string, unknown>[],
  interPlayerRelationshipOverrides: {},
  joinedAt: 1,
  leftAt: null,
}

const narration = {
  id: 'm1',
  type: 'narration',
  campaignId: 'campaign-1',
  sessionId: null,
  timestamp: 1,
  audience: 'private_player',
  visibility: 'player_safe',
  actorId: null,
  actorName: 'GM',
  content: 'The ledger sits behind the darkroom shelf.',
  narrativeWeight: 'normal',
  canPromoteToLog: false,
} as const

describe('storePrivatePrologueMemory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    database.getPlayerCharactersForCampaign.mockResolvedValue([baseAssignment])
    database.getCharacters.mockResolvedValue([{ id: 'character-1', name: 'Elena' }])
    database.getCampaignByStoryId.mockResolvedValue({ id: 'campaign-1', title: 'Clearview' })
    database.getAIPlayerMemories.mockResolvedValue([])
    renderStoryPrompt.mockResolvedValue({
      system: 'MEMORY SYSTEM PROMPT',
      user: 'MEMORY USER PROMPT',
    })
    generatePlainText.mockResolvedValue(
      'I confided in Elena about the missing ledger and we agreed to keep it secret.',
    )
  })

  it('stores the memory on the AI Player profile with campaign origin and keywords', async () => {
    await storePrivatePrologueMemory({
      storyId: 'story-1',
      campaignId: 'campaign-1',
      aiPlayerId: 'player-1',
      setupSessionId: 'setup-1',
      messages: [narration],
    })

    expect(database.upsertAIPlayerMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        aiPlayerId: 'player-1',
        originCampaignId: 'campaign-1',
        originCampaignTitle: 'Clearview',
        originSetupSessionId: 'setup-1',
        characterName: 'Elena',
        source: 'private_prologue',
        scope: 'campaign',
        content: 'I confided in Elena about the missing ledger and we agreed to keep it secret.',
      }),
    )
    const [saved] = database.upsertAIPlayerMemory.mock.calls[0]
    expect(saved.keywords).toContain('elena')
    expect(saved.keywords).toContain('ledger')
  })

  it('updates the existing memory in place for a restarted setup session', async () => {
    database.getAIPlayerMemories.mockResolvedValue([
      {
        id: 'memory-existing',
        originSetupSessionId: 'setup-1',
        scope: 'cross_campaign',
        injectionMode: 'always',
        priority: 9,
        pinned: true,
        createdAt: 100,
      },
    ])

    await storePrivatePrologueMemory({
      storyId: 'story-1',
      campaignId: 'campaign-1',
      aiPlayerId: 'player-1',
      setupSessionId: 'setup-1',
      messages: [narration],
    })

    // GM-tuned recall settings must survive a re-summarize.
    expect(database.upsertAIPlayerMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'memory-existing',
        scope: 'cross_campaign',
        injectionMode: 'always',
        priority: 9,
        pinned: true,
        createdAt: 100,
      }),
    )
    expect(database.upsertAIPlayerMemory).toHaveBeenCalledTimes(1)
  })

  it('does nothing when the transcript is empty', async () => {
    await storePrivatePrologueMemory({
      storyId: 'story-1',
      campaignId: 'campaign-1',
      aiPlayerId: 'player-1',
      setupSessionId: 'setup-1',
      messages: [],
    })

    expect(database.getPlayerCharactersForCampaign).not.toHaveBeenCalled()
    expect(database.upsertAIPlayerMemory).not.toHaveBeenCalled()
  })

  it('does nothing when the AI Player has no active assignment', async () => {
    database.getPlayerCharactersForCampaign.mockResolvedValue([])

    await storePrivatePrologueMemory({
      storyId: 'story-1',
      campaignId: 'campaign-1',
      aiPlayerId: 'player-1',
      setupSessionId: 'setup-1',
      messages: [narration],
    })

    expect(database.upsertAIPlayerMemory).not.toHaveBeenCalled()
  })
})

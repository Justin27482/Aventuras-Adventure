import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const { database, generateProposal } = vi.hoisted(() => ({
  database: {
    getPlayerCharactersForCampaign: vi.fn(),
    getAIPlayer: vi.fn(),
    getCharacters: vi.fn(),
    upsertAIPlayerProposal: vi.fn(),
  },
  generateProposal: vi.fn(),
}))

vi.mock('$lib/services/database', () => ({ database }))
vi.mock('$lib/services/ai-player/ai-player-turn-orchestrator', () => ({
  aiPlayerTurnOrchestrator: { generateProposal },
}))

import { generatePrivatePrologueReply, generateGroupSetupReplies } from './private-prologue-reply'

describe('generatePrivatePrologueReply', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    database.getPlayerCharactersForCampaign.mockResolvedValue([
      { aiPlayerId: 'player-1', characterId: 'character-1', leftAt: null },
    ])
    database.getAIPlayer.mockResolvedValue({ id: 'player-1', name: 'Morgan' })
    database.getCharacters.mockResolvedValue([{ id: 'character-1', name: 'Elena' }])
    generateProposal.mockResolvedValue({
      proposalId: 'proposal-1',
      action: 'Elena steps closer and answers quietly.',
      reasoning: 'Continue the private exchange.',
      confidence: 9,
    })
  })

  it('always targets the engaged AI Player with private in-character context', async () => {
    const reply = await generatePrivatePrologueReply({
      storyId: 'story-1',
      campaignId: 'campaign-1',
      aiPlayerId: 'player-1',
      narration: 'The door closes behind you.',
      sceneMode: 'social',
      recentActions: ['GM: The door closes behind you.'],
    })

    expect(generateProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        aiPlayerId: 'player-1',
        characterId: 'character-1',
        sceneSummary: 'The door closes behind you.',
        audience: { kind: 'private_player', aiPlayerId: 'player-1' },
      }),
    )
    expect(database.upsertAIPlayerProposal).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'proposal-1', action: reply.proposal.action }),
      null,
    )
    expect(reply).toMatchObject({
      type: 'proposal',
      audience: 'private_player',
      actorId: 'character-1',
      actorName: 'Morgan (Elena)',
      reviewStatus: 'pending',
    })
  })

  it('fails clearly when the private AI Player has no assigned character', async () => {
    database.getPlayerCharactersForCampaign.mockResolvedValue([])

    await expect(
      generatePrivatePrologueReply({
        storyId: 'story-1',
        campaignId: 'campaign-1',
        aiPlayerId: 'player-1',
        narration: 'A private moment begins.',
        sceneMode: 'social',
        recentActions: [],
      }),
    ).rejects.toThrow('does not have an assigned character')
    expect(generateProposal).not.toHaveBeenCalled()
  })
})

describe('generateGroupSetupReplies', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    database.getPlayerCharactersForCampaign.mockResolvedValue([
      { aiPlayerId: 'player-1', characterId: 'character-1', leftAt: null },
      { aiPlayerId: 'player-2', characterId: 'character-2', leftAt: null },
    ])
    database.getAIPlayer.mockImplementation((id: string) =>
      Promise.resolve(
        id === 'player-1' ? { id: 'player-1', name: 'Morgan' } : { id: 'player-2', name: 'Sasha' },
      ),
    )
    database.getCharacters.mockResolvedValue([
      { id: 'character-1', name: 'Elena' },
      { id: 'character-2', name: 'Rowan' },
    ])
    generateProposal.mockImplementation((input: { aiPlayerId: string }) =>
      Promise.resolve({
        proposalId: `proposal-${input.aiPlayerId}`,
        action: `${input.aiPlayerId} reacts in character.`,
        reasoning: 'Bonding scene reaction.',
        confidence: 8,
      }),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('generates one full-table in-character reply per bonding-session participant', async () => {
    const resultPromise = generateGroupSetupReplies({
      storyId: 'story-1',
      campaignId: 'campaign-1',
      setupSessionId: 'setup-1',
      aiPlayerIds: ['player-1', 'player-2'],
      narration: 'The studio hums with old electronics.',
      sceneMode: 'bonding',
      recentActions: [],
    })
    await vi.runAllTimersAsync()
    const replies = await resultPromise

    expect(replies).toHaveLength(2)
    expect(generateProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        aiPlayerId: 'player-1',
        characterId: 'character-1',
        audience: { kind: 'full_table' },
      }),
    )
    expect(generateProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        aiPlayerId: 'player-2',
        characterId: 'character-2',
        audience: { kind: 'full_table' },
      }),
    )
    expect(replies.map((reply) => reply.audience)).toEqual(['full_table', 'full_table'])
    expect(replies.map((reply) => reply.actorName)).toEqual(['Morgan (Elena)', 'Sasha (Rowan)'])
  })

  it('skips a participant with no assigned character instead of failing the batch', async () => {
    database.getPlayerCharactersForCampaign.mockResolvedValue([
      { aiPlayerId: 'player-1', characterId: 'character-1', leftAt: null },
    ])

    const resultPromise = generateGroupSetupReplies({
      storyId: 'story-1',
      campaignId: 'campaign-1',
      setupSessionId: 'setup-1',
      aiPlayerIds: ['player-1', 'player-2'],
      narration: 'The studio hums with old electronics.',
      sceneMode: 'bonding',
      recentActions: [],
    })
    await vi.runAllTimersAsync()
    const replies = await resultPromise

    expect(replies).toHaveLength(1)
    expect(replies[0].actorName).toBe('Morgan (Elena)')
  })

  it('reports typing start and streams each reply as it becomes ready', async () => {
    const typingOrder: string[] = []
    const streamedOrder: string[] = []

    const resultPromise = generateGroupSetupReplies({
      storyId: 'story-1',
      campaignId: 'campaign-1',
      setupSessionId: 'setup-1',
      aiPlayerIds: ['player-1', 'player-2'],
      narration: 'The studio hums with old electronics.',
      sceneMode: 'bonding',
      recentActions: [],
      onTypingStart: (aiPlayerId) => typingOrder.push(aiPlayerId),
      onReply: (reply) => streamedOrder.push(reply.proposal.aiPlayerId),
    })
    await vi.runAllTimersAsync()
    await resultPromise

    expect(typingOrder).toEqual(['player-1', 'player-2'])
    expect(streamedOrder).toEqual(['player-1', 'player-2'])
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { database, generateProposal, generateReaction } = vi.hoisted(() => ({
  database: {
    getPlayerCharactersForCampaign: vi.fn(),
    getAIPlayer: vi.fn(),
    getCharacters: vi.fn(),
    upsertAIPlayerProposal: vi.fn(),
  },
  generateProposal: vi.fn(),
  generateReaction: vi.fn(),
}))

vi.mock('$lib/services/database', () => ({ database }))
vi.mock('$lib/services/ai-player/ai-player-turn-orchestrator', () => ({
  aiPlayerTurnOrchestrator: { generateProposal },
}))
vi.mock('./table-talk-orchestrator', () => ({
  TableTalkOrchestrator: { generateReaction },
}))

import { forceAIResponse } from './force-ai-response'

describe('forceAIResponse', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    database.getPlayerCharactersForCampaign.mockResolvedValue([
      { aiPlayerId: 'player-1', characterId: 'character-1', leftAt: null },
    ])
    database.getAIPlayer.mockResolvedValue({ id: 'player-1', name: 'Morgan' })
    database.getCharacters.mockResolvedValue([{ id: 'character-1', name: 'Elena' }])
  })

  it('generates an in-character reply steered by GM guidance', async () => {
    generateProposal.mockResolvedValue({
      proposalId: 'proposal-1',
      action: 'Elena steps forward and offers a hand.',
      reasoning: 'Follow the GM guidance.',
      confidence: 8,
    })

    const message = await forceAIResponse({
      storyId: 'story-1',
      campaignId: 'campaign-1',
      aiPlayerId: 'player-1',
      mode: 'ic',
      guidance: 'Have Elena offer a truce.',
      sceneMode: 'social',
      recentActions: ['GM: The room falls silent.'],
      audience: { kind: 'full_table' },
      tableTalkIntensity: 4,
    })

    expect(generateProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        aiPlayerId: 'player-1',
        characterId: 'character-1',
        sceneSummary: 'GM: The room falls silent.',
        goal: 'GM guidance: Have Elena offer a truce.',
        targetLength: '',
        audience: { kind: 'full_table' },
      }),
    )
    expect(message).toMatchObject({ type: 'proposal', audience: 'full_table' })
  })

  it('defaults to no explicit length instruction at level 3', async () => {
    generateProposal.mockResolvedValue({
      proposalId: 'proposal-1',
      action: 'Elena nods.',
      reasoning: 'Stay concise.',
      confidence: 7,
    })

    await forceAIResponse({
      storyId: 'story-1',
      campaignId: 'campaign-1',
      aiPlayerId: 'player-1',
      mode: 'ic',
      sceneMode: 'social',
      recentActions: ['GM: The room falls silent.'],
      audience: { kind: 'full_table' },
      tableTalkIntensity: 4,
    })

    expect(generateProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        goal: 'Take an in-character turn appropriate to the current scene.',
        targetLength: '',
      }),
    )
  })

  it('does not clamp IC length instructions; full range is available with a UI-side warning', async () => {
    generateProposal.mockResolvedValue({
      proposalId: 'proposal-1',
      action: 'Elena delivers a long speech.',
      reasoning: 'Expand as instructed.',
      confidence: 7,
    })

    await forceAIResponse({
      storyId: 'story-1',
      campaignId: 'campaign-1',
      aiPlayerId: 'player-1',
      mode: 'ic',
      guidance: 'Have Elena offer a truce.',
      sceneMode: 'social',
      recentActions: ['GM: The room falls silent.'],
      audience: { kind: 'full_table' },
      tableTalkIntensity: 4,
      responseLength: 10,
    })

    expect(generateProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        goal: 'GM guidance: Have Elena offer a truce.',
        targetLength: 'Respond with a full page of prose (about ten to twelve paragraphs).',
      }),
    )
  })

  it('generates an out-of-character reaction steered by GM guidance', async () => {
    generateReaction.mockResolvedValue({
      id: 'reaction-1',
      aiPlayerId: 'player-1',
      characterName: 'Morgan (Elena)',
      content: 'Ooh, plot twist!',
      sentiment: 'positive',
      emoji: '😄',
      intensity: 5,
    })

    const message = await forceAIResponse({
      storyId: 'story-1',
      campaignId: 'campaign-1',
      aiPlayerId: 'player-1',
      mode: 'ooc',
      guidance: 'React to the surprise reveal.',
      sceneMode: 'social',
      recentActions: ['The lights flicker and go dark.'],
      otherCharacters: [{ name: 'Rowan', playerName: 'Sasha' }],
      audience: { kind: 'full_table' },
      tableTalkIntensity: 5,
    })

    expect(generateReaction).toHaveBeenCalledWith(
      expect.objectContaining({
        aiPlayerId: 'player-1',
        recentAction: 'The lights flicker and go dark.',
        sceneContext: 'social — GM guidance: React to the surprise reveal.',
        otherCharacters: [{ name: 'Rowan', playerName: 'Sasha' }],
        forceResponse: true,
      }),
    )
    expect(message).toMatchObject({ type: 'table_talk', content: 'Ooh, plot twist!' })
  })

  it('keeps the full length range for OOC plain-text responses (no JSON truncation risk)', async () => {
    generateReaction.mockResolvedValue({
      id: 'reaction-1',
      aiPlayerId: 'player-1',
      characterName: 'Morgan (Elena)',
      content: 'A long OOC ramble.',
      sentiment: 'positive',
      emoji: '😄',
      intensity: 5,
    })

    await forceAIResponse({
      storyId: 'story-1',
      campaignId: 'campaign-1',
      aiPlayerId: 'player-1',
      mode: 'ooc',
      sceneMode: 'social',
      recentActions: ['The lights flicker and go dark.'],
      audience: { kind: 'full_table' },
      tableTalkIntensity: 5,
      responseLength: 10,
    })

    expect(generateReaction).toHaveBeenCalledWith(
      expect.objectContaining({
        sceneContext: 'social Respond with a full page of prose (about ten to twelve paragraphs).',
      }),
    )
  })

  it('fails clearly when the AI Player has no assigned character', async () => {
    database.getPlayerCharactersForCampaign.mockResolvedValue([])

    await expect(
      forceAIResponse({
        storyId: 'story-1',
        campaignId: 'campaign-1',
        aiPlayerId: 'player-1',
        mode: 'ic',
        sceneMode: 'social',
        recentActions: [],
        audience: { kind: 'full_table' },
        tableTalkIntensity: 4,
      }),
    ).rejects.toThrow('does not have an assigned character')
  })
})

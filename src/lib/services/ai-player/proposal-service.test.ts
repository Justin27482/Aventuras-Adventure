import { beforeEach, describe, expect, it, vi } from 'vitest'

const { generateStructured, contextFactory, ensurePromptTemplateComplete } = vi.hoisted(() => ({
  generateStructured: vi.fn(),
  contextFactory: vi.fn(),
  ensurePromptTemplateComplete: vi.fn(),
}))

vi.mock('$lib/services/ai/sdk', () => ({ generateStructured }))
vi.mock('$lib/services/context/context-builder', () => ({
  ContextBuilder: { forAIPlayer: contextFactory },
}))
vi.mock('$lib/services/packs/pack-service', () => ({
  packService: { ensurePromptTemplateComplete },
}))

import { AIPlayerProposalService } from './proposal-service'

describe('AIPlayerProposalService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    contextFactory.mockImplementation(async () => ({
      add: vi.fn(),
      getPackId: () => 'default-pack',
      render: vi.fn().mockResolvedValue({
        system: 'CUSTOM PACK PLAYER SYSTEM',
        user: 'CUSTOM PACK PROPOSAL TASK',
      }),
      getContext: () => ({
        aiPlayerPrompt: 'PLAYER PROMPT',
        aiPlayerRecentActions: '',
      }),
    }))
    generateStructured.mockImplementation(async ({ prompt }: { prompt: string }) => ({
      action: prompt.includes('player-2') ? 'Ask for help.' : 'Scout ahead.',
      reasoning: 'This is consistent with the character.',
      confidence: 8,
    }))
  })

  it('maps a structured model result to an attributed proposal', async () => {
    const proposal = await new AIPlayerProposalService().generateProposal({
      storyId: 'story-1',
      campaignId: 'campaign-1',
      aiPlayerId: 'player-1',
      characterId: 'character-1',
      sceneMode: 'social',
      sceneSummary: 'The party reaches a crowded market.',
      goal: 'Find a guide.',
    })

    expect(proposal).toMatchObject({
      aiPlayerId: 'player-1',
      characterId: 'character-1',
      campaignId: 'campaign-1',
      sceneMode: 'social',
      action: 'Scout ahead.',
      confidence: 8,
    })
    expect(proposal.id).toEqual(expect.any(String))
    expect(contextFactory).toHaveBeenCalledWith(
      'story-1',
      'player-1',
      undefined,
      { kind: 'full_table' },
      undefined,
    )
    expect(ensurePromptTemplateComplete).toHaveBeenCalledWith('default-pack', 'ai-player-proposal')
    expect(generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        system: 'CUSTOM PACK PLAYER SYSTEM',
        prompt: 'CUSTOM PACK PROPOSAL TASK',
      }),
      'aiPlayerProposal',
    )
  })

  it('passes the requested audience and recent chat transcript through to the AI Player context', async () => {
    await new AIPlayerProposalService().generateProposal({
      storyId: 'story-1',
      campaignId: 'campaign-1',
      aiPlayerId: 'player-1',
      characterId: 'character-1',
      sceneMode: 'social',
      sceneSummary: 'The party reaches a crowded market.',
      recentActions: ['GM: The market is crowded.', 'Rowan: I check the stalls.'],
      audience: { kind: 'private_player', aiPlayerId: 'player-1' },
    })

    expect(contextFactory).toHaveBeenCalledWith(
      'story-1',
      'player-1',
      undefined,
      { kind: 'private_player', aiPlayerId: 'player-1' },
      ['GM: The market is crowded.', 'Rowan: I check the stalls.'],
    )
  })

  it('generates proposals in parallel for multiple AI Players', async () => {
    const pending: Array<() => void> = []
    generateStructured.mockImplementation(
      () =>
        new Promise((resolve) => {
          pending.push(() =>
            resolve({ action: 'Act.', reasoning: 'Reason.', confidence: 6 }),
          )
        }),
    )

    const resultPromise = new AIPlayerProposalService().generateProposals([
      {
        storyId: 'story-1', campaignId: 'campaign-1', aiPlayerId: 'player-1', characterId: 'character-1',
        sceneMode: 'combat', sceneSummary: 'A threat appears.',
      },
      {
        storyId: 'story-1', campaignId: 'campaign-1', aiPlayerId: 'player-2', characterId: 'character-2',
        sceneMode: 'combat', sceneSummary: 'A threat appears.',
      },
    ])

    await vi.waitFor(() => expect(generateStructured).toHaveBeenCalledTimes(2))
    expect(pending).toHaveLength(2)
    pending.forEach((resolve) => resolve())
    expect(await resultPromise).toHaveLength(2)
  })
})

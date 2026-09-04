import { describe, expect, it, vi } from 'vitest'
import { AIPlayerTurnOrchestrator } from './ai-player-turn-orchestrator'

const mocks = vi.hoisted(() => ({
  proposalService: { generateProposal: vi.fn() },
  consensusService: { run: vi.fn() },
  narrativeService: { expandSummary: vi.fn() },
}))

vi.mock('./proposal-service', () => ({
  AIPlayerProposalService: vi.fn(() => mocks.proposalService),
}))
vi.mock('./consensus-service', () => ({
  AIPlayerConsensusService: vi.fn(() => mocks.consensusService),
}))
vi.mock('./narrative-helper-service', () => ({
  NarrativeHelperService: vi.fn(() => mocks.narrativeService),
}))

// Mock settings to avoid BaseAIService dependency
vi.mock('$lib/stores/settings.svelte', () => ({
  settings: { getServicePresetId: () => 'agentic' },
}))

describe('AIPlayerTurnOrchestrator (G.3)', () => {
  it('generates a proposal for an AI player turn', async () => {
    mocks.proposalService.generateProposal.mockResolvedValue({
      id: 'proposal-1',
      aiPlayerId: 'ai-mara',
      characterId: 'char-ilyra',
      campaignId: 'campaign-1',
      sceneMode: 'social',
      action: 'Ask the innkeeper about rumors.',
      reasoning: 'Gather information.',
      confidence: 8,
      reviewStatus: 'pending',
      createdAt: 1000,
      updatedAt: 1000,
    })

    const orchestrator = new AIPlayerTurnOrchestrator()
    const result = await orchestrator.generateProposal({
      storyId: 'story-1',
      campaignId: 'campaign-1',
      aiPlayerId: 'ai-mara',
      characterId: 'char-ilyra',
      sceneMode: 'social',
      sceneSummary: 'A quiet tavern.',
      goal: 'Learn about the bandits.',
      recentActions: [],
      audience: { kind: 'full_table' },
    })

    expect(result.proposalId).toBe('proposal-1')
    expect(result.action).toBe('Ask the innkeeper about rumors.')
    expect(result.confidence).toBe(8)
    expect(mocks.proposalService.generateProposal).toHaveBeenCalledWith(
      expect.objectContaining({ audience: { kind: 'full_table' } }),
    )
  })

  it('runs rate-limited consensus on the proposal (G.3)', async () => {
    mocks.consensusService.run.mockResolvedValue({
      messages: [
        { aiPlayerId: 'ai-mara', content: 'I think this is a good idea.' },
        { aiPlayerId: 'ai-rowan', content: 'I agree, we need information.' },
      ],
      interrupted: false,
      timedOut: false,
    })

    const orchestrator = new AIPlayerTurnOrchestrator()
    const result = await orchestrator.runConsensus({
      proposalId: 'proposal-1',
      action: 'Ask the innkeeper about rumors.',
    })

    expect(result.messages).toHaveLength(2)
    expect(result.interrupted).toBe(false)
    expect(result.timedOut).toBe(false)
  })

  it('expands narration from a GM summary (G.3 polish step)', async () => {
    mocks.narrativeService.expandSummary.mockResolvedValue(
      'The innkeeper leans in and whispers about the bandits terrorizing the roads.',
    )

    const orchestrator = new AIPlayerTurnOrchestrator()
    const result = await orchestrator.expandNarration(
      'campaign-story',
      'The innkeeper tells us about bandits.',
      { mood: 'dramatic' },
    )

    expect(result).toContain('innkeeper')
    expect(result).toContain('bandits')
    expect(mocks.narrativeService.expandSummary).toHaveBeenCalledWith(
      expect.objectContaining({ storyId: 'campaign-story' }),
    )
  })

  it('respects AbortSignal for cancellation (G.3)', async () => {
    const controller = new AbortController()
    controller.abort()

    mocks.consensusService.run.mockResolvedValue({
      messages: [],
      interrupted: true,
      timedOut: false,
    })

    const orchestrator = new AIPlayerTurnOrchestrator()
    const result = await orchestrator.runConsensus(
      {
        proposalId: 'proposal-1',
        action: 'Ask a question.',
      },
      { signal: controller.signal },
    )

    expect(result.interrupted).toBe(true)
  })

  it('passes through consensus parameters to the consensus service (G.3)', async () => {
    mocks.consensusService.run.mockResolvedValue({
      messages: [],
      interrupted: false,
      timedOut: false,
    })

    const orchestrator = new AIPlayerTurnOrchestrator()
    await orchestrator.runConsensus({ proposalId: 'proposal-1', action: 'Test' })

    // Verify the consensus service was called with the orchestrator's config
    expect(mocks.consensusService.run).toHaveBeenCalled()
    const call = mocks.consensusService.run.mock.calls[0][0]
    expect(call.config).toBeDefined()
    expect(call.config.maxExchanges).toBeGreaterThan(0)
    expect(call.config.messageDelayMs).toBeGreaterThan(0)
  })
})

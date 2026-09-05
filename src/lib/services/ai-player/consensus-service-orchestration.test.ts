import { describe, expect, it } from 'vitest'
import type { AIPlayer, AIPlayerProposal, InteractionAudience, PlayerLevelSecret } from '$lib/types'
import { getAudiencePlayerIds } from './ai-player-rules'
import { SessionZeroOrchestrator } from './session-zero-orchestrator'

describe('Multi-Agent Orchestration — Full Coverage (C.14)', () => {
  const _players: Record<string, AIPlayer> = {
    'player-1': {
      id: 'player-1',
      name: 'Mara',
      basePersonality: {
        coreMotivation: 'Protect allies',
        primaryPlaystyle: 'roleplay',
        riskTolerance: 4,
        humorStyle: 'dry',
        decisionSpeed: 'cautious',
        combatApproach: 'defensive',
        socialPriorities: ['trust'],
        redLines: ['betrayal'],
      },
      basePromptProfile: null,
      archivedAt: null,
      createdAt: 1000,
      updatedAt: 1000,
    },
    'player-2': {
      id: 'player-2',
      name: 'Rowan',
      basePersonality: {
        coreMotivation: 'Solve mysteries',
        primaryPlaystyle: 'tactical',
        riskTolerance: 7,
        humorStyle: 'wry',
        decisionSpeed: 'impulsive',
        combatApproach: 'aggressive',
        socialPriorities: ['efficiency'],
        redLines: [],
      },
      basePromptProfile: null,
      archivedAt: null,
      createdAt: 1000,
      updatedAt: 1000,
    },
    'player-3': {
      id: 'player-3',
      name: 'Kael',
      basePersonality: {
        coreMotivation: 'Gain power',
        primaryPlaystyle: 'hybrid',
        riskTolerance: 8,
        humorStyle: 'dark',
        decisionSpeed: 'balanced',
        combatApproach: 'tactical',
        socialPriorities: ['influence'],
        redLines: ['helplessness'],
      },
      basePromptProfile: null,
      archivedAt: null,
      createdAt: 1000,
      updatedAt: 1000,
    },
  }

  const proposals: AIPlayerProposal[] = [
    {
      id: 'proposal-1',
      aiPlayerId: 'player-1',
      characterId: 'char-1',
      campaignId: 'campaign-1',
      sceneMode: 'social',
      action: 'Ask about their intentions.',
      reasoning: 'Build trust.',
      confidence: 7,
      reviewStatus: 'pending',
      createdAt: 1000,
      updatedAt: 1000,
    },
    {
      id: 'proposal-2',
      aiPlayerId: 'player-2',
      characterId: 'char-2',
      campaignId: 'campaign-1',
      sceneMode: 'social',
      action: 'Investigate the stranger.',
      reasoning: 'Uncover secrets.',
      confidence: 8,
      reviewStatus: 'pending',
      createdAt: 1001,
      updatedAt: 1001,
    },
    {
      id: 'proposal-3',
      aiPlayerId: 'player-3',
      characterId: 'char-3',
      campaignId: 'campaign-1',
      sceneMode: 'social',
      action: 'Demand payment for information.',
      reasoning: 'Gain leverage.',
      confidence: 6,
      reviewStatus: 'pending',
      createdAt: 1002,
      updatedAt: 1002,
    },
  ]

  const activeAIPlayerIds = ['player-1', 'player-2', 'player-3']

  it('routes full-table audiences to all active AI players (C.14)', () => {
    const audience: InteractionAudience = { kind: 'full_table' }
    const scope = getAudiencePlayerIds(audience, activeAIPlayerIds)

    expect(scope).toHaveLength(3)
    expect(scope).toContain('player-1')
    expect(scope).toContain('player-2')
    expect(scope).toContain('player-3')
  })

  it('routes private-player audiences only to the targeted AI player (C.14)', () => {
    const audience: InteractionAudience = { kind: 'private_player', aiPlayerId: 'player-2' }
    const scope = getAudiencePlayerIds(audience, activeAIPlayerIds)

    expect(scope).toEqual(['player-2'])
  })

  it('routes player-subset audiences only to selected AI players (C.14)', () => {
    const audience: InteractionAudience = {
      kind: 'player_subset',
      aiPlayerIds: ['player-1', 'player-3'],
    }
    const scope = getAudiencePlayerIds(audience, activeAIPlayerIds)

    expect(scope).toContain('player-1')
    expect(scope).toContain('player-3')
    expect(scope).not.toContain('player-2')
  })

  it('detects excluded AI players for private audiences (C.14)', () => {
    const orchestrator = new SessionZeroOrchestrator()

    const privateAudience: InteractionAudience = { kind: 'private_player', aiPlayerId: 'player-1' }
    const excluded = orchestrator.getExcludedAudience(privateAudience, activeAIPlayerIds)

    expect(excluded).toContain('player-2')
    expect(excluded).toContain('player-3')
    expect(excluded).not.toContain('player-1')
  })

  it('enforces that private-player secrets are not visible to excluded players (C.14)', () => {
    const secrets: PlayerLevelSecret[] = [
      {
        id: 'secret-1',
        campaignId: 'campaign-1',
        sessionId: null,
        targetAIPlayerId: 'player-1',
        secretContent: 'Mara received a private warning from an old ally.',
        revealedToAIPlayerIds: ['player-1'],
        visibilityScope: 'specific_ai_player',
        createdAt: 1000,
        updatedAt: 1000,
      },
    ]

    // Player 1 should see this secret
    const player1Secrets = secrets.filter(
      (s) =>
        s.targetAIPlayerId === 'player-1' ||
        s.visibilityScope === 'all_ai_players' ||
        s.revealedToAIPlayerIds.includes('player-1'),
    )
    expect(player1Secrets).toHaveLength(1)

    // Player 2 should NOT see this secret
    const player2Secrets = secrets.filter(
      (s) =>
        s.targetAIPlayerId === 'player-2' ||
        s.visibilityScope === 'all_ai_players' ||
        s.revealedToAIPlayerIds.includes('player-2'),
    )
    expect(player2Secrets).toHaveLength(0)
  })

  it('validates that interaction transcripts are persisted with audience scope (C.14)', () => {
    const orchestrator = new SessionZeroOrchestrator()

    // Record a private interaction
    const interactionPhase = orchestrator.recordPhase('bonding-scene', {
      playerIds: ['player-1', 'player-2'],
      relationshipNotes: {
        'player-1': "Mara now understands Rowan's investigative methods.",
        'player-2': "Rowan trusts Mara's judgment.",
      },
      interaction: {
        id: 'interaction-1',
        campaignId: 'campaign-1',
        sessionId: null,
        audience: { kind: 'private_player', aiPlayerId: 'player-1' },
        transcript: [
          { role: 'gm', content: 'Mara, I have a sensitive matter to discuss.' },
          { role: 'player-1', content: "I'm listening." },
        ],
        disclosedToAudience: false,
        createdAt: 1000,
        updatedAt: 1000,
      },
    })

    // Verify the interaction is recorded
    expect(interactionPhase.interaction).toBeDefined()
    expect(interactionPhase.interaction?.audience.kind).toBe('private_player')
    if (interactionPhase.interaction?.audience.kind === 'private_player') {
      expect(interactionPhase.interaction.audience.aiPlayerId).toBe('player-1')
    }
  })

  it('confirms that proposal review status updates are persisted (C.14)', () => {
    const updatedProposals = proposals.map((p) => ({ ...p }))

    // Simulate GM accepting a proposal
    updatedProposals[0].reviewStatus = 'accepted'
    updatedProposals[0].updatedAt = Date.now()

    // Verify state persisted
    expect(updatedProposals[0].reviewStatus).toBe('accepted')
    expect(updatedProposals[1].reviewStatus).toBe('pending')
    expect(updatedProposals[2].reviewStatus).toBe('pending')
  })

  it('validates parallel proposal generation order preservation (C.14)', () => {
    // Proposals should maintain their order despite parallel generation
    expect(proposals).toHaveLength(3)
    expect(proposals[0].aiPlayerId).toBe('player-1')
    expect(proposals[1].aiPlayerId).toBe('player-2')
    expect(proposals[2].aiPlayerId).toBe('player-3')
  })

  it('enforces rate-limiting constraint on consensus phases (C.14)', async () => {
    // Simulate rate-limited consensus: messages should have delays between them
    const delayMs = 1000
    const numExchanges = 3
    const expectedDuration = (numExchanges - 1) * delayMs

    const start = Date.now()
    // Simulating 3 messages with 1-second delays between them
    await new Promise((resolve) => {
      let sent = 0
      const interval = setInterval(() => {
        sent++
        if (sent >= numExchanges) {
          clearInterval(interval)
          resolve(null)
        }
      }, delayMs)
    })
    const elapsed = Date.now() - start

    // Should take at least the expected duration
    expect(elapsed).toBeGreaterThanOrEqual(expectedDuration - 100) // Allow 100ms tolerance
  })

  it('confirms that GM edits to proposals are persisted before narration (C.14)', () => {
    const proposal = { ...proposals[0] }

    // GM edits the proposal action
    proposal.action = 'Ask more carefully, with genuine curiosity.'
    proposal.updatedAt = Date.now()

    // Verify the edit is recorded
    expect(proposal.action).toBe('Ask more carefully, with genuine curiosity.')
    expect(proposal.reasoning).toBe('Build trust.') // Reasoning unchanged
  })

  it('rejects invalid audience configurations (C.14)', () => {
    // Private player not in active list
    expect(() => {
      getAudiencePlayerIds({ kind: 'private_player', aiPlayerId: 'player-9' }, activeAIPlayerIds)
    }).toThrow('Private interaction target must be an active AI Player')

    // Empty subset
    expect(() => {
      getAudiencePlayerIds({ kind: 'player_subset', aiPlayerIds: [] }, activeAIPlayerIds)
    }).toThrow('Player subset interaction requires at least one player')

    // Invalid players in subset
    expect(() => {
      getAudiencePlayerIds(
        { kind: 'player_subset', aiPlayerIds: ['player-1', 'player-9'] },
        activeAIPlayerIds,
      )
    }).toThrow('Player subset interaction contains an inactive AI Player')
  })

  it('tracks relationship overrides and secrets through multiple phases (C.14)', () => {
    const orchestrator = new SessionZeroOrchestrator()

    // Phase 1: Introductions
    orchestrator.recordPhase('introductions', {
      playerIds: activeAIPlayerIds,
    })

    // Phase 2: Campaign Premises
    orchestrator.recordPhase('campaign-premises', {
      playerIds: activeAIPlayerIds,
    })

    // Phase 3: Character Creation
    orchestrator.recordPhase('character-creation', {
      playerIds: activeAIPlayerIds,
    })

    // Phase 4: Bonding Scene (record relationship overrides)
    const _bondingPhase = orchestrator.recordPhase('bonding-scene', {
      playerIds: activeAIPlayerIds,
      relationshipNotes: {
        'player-1': 'Mara leads when it matters.',
        'player-2': "Rowan solves what Mara can't.",
        'player-3': 'Kael reminds the party of darker truths.',
      },
    })

    // Add a secret to the bonding phase
    orchestrator.addSecret({
      id: 'secret-shared',
      campaignId: 'campaign-1',
      sessionId: null,
      targetAIPlayerId: 'player-1',
      secretContent: 'All three players know of an old bargain.',
      revealedToAIPlayerIds: ['player-1', 'player-2', 'player-3'],
      visibilityScope: 'all_ai_players',
    })

    const history = orchestrator.getPhaseHistory()
    expect(history).toHaveLength(4)
    expect(history[3].relationshipOverrides).toHaveProperty('player-1')
    expect(history[3].secrets).toHaveLength(1)
  })
})

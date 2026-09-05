import { describe, expect, it } from 'vitest'
import { SessionZeroOrchestrator } from './session-zero-orchestrator'

describe('SessionZeroOrchestrator', () => {
  it('tracks the five session-zero phases in order', () => {
    const orchestrator = new SessionZeroOrchestrator()

    expect(orchestrator.phaseOrder).toEqual([
      'introductions',
      'campaign-premises',
      'character-creation',
      'bonding-scene',
      'secrets',
    ])
  })

  it('captures relationship overrides and player-level secrets', () => {
    const orchestrator = new SessionZeroOrchestrator()

    const state = orchestrator.recordPhase('bonding-scene', {
      playerIds: ['ai-1', 'ai-2'],
      relationshipNotes: {
        'ai-1': 'Alya trusts Rowan and defers to him in tense situations.',
        'ai-2': 'Rowan is the practical one and cares about the group’s safety.',
      },
    })

    const secrets = orchestrator.addSecret({
      id: 'secret-1',
      campaignId: 'campaign-1',
      sessionId: 'session-1',
      targetAIPlayerId: 'ai-1',
      secretContent: 'Alya and Rowan met during a prior job and share a hidden debt.',
      revealedToAIPlayerIds: ['ai-1', 'ai-2'],
      visibilityScope: 'specific_ai_player',
      createdAt: 1000,
      updatedAt: 1001,
    })

    expect(state.relationshipOverrides).toEqual({
      'ai-1': 'Alya trusts Rowan and defers to him in tense situations.',
      'ai-2': 'Rowan is the practical one and cares about the group’s safety.',
    })
    expect(secrets).toHaveLength(1)
    expect(secrets[0].targetAIPlayerId).toBe('ai-1')
    expect(
      orchestrator.hasPrivateAudienceRestriction({ kind: 'private_player', aiPlayerId: 'ai-1' }, [
        'ai-1',
        'ai-2',
      ]),
    ).toBe(true)
  })

  it('locks private GM interactions away from excluded players', () => {
    const orchestrator = new SessionZeroOrchestrator()

    const audience = { kind: 'private_player', aiPlayerId: 'ai-2' } as const
    const activePlayers = ['ai-1', 'ai-2', 'ai-3']

    expect(orchestrator.hasPrivateAudienceRestriction(audience, activePlayers)).toBe(true)
    expect(orchestrator.getAudienceScope(audience, activePlayers)).toEqual(['ai-2'])
    expect(orchestrator.getExcludedAudience(audience, activePlayers)).toEqual(['ai-1', 'ai-3'])
  })
})

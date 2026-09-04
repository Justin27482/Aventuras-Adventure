import { describe, expect, it } from 'vitest'
import { eventBus } from '$lib/services/events'
import {
  emitAIPlayerProposalAccepted,
  emitAIPlayerProposalProposed,
  emitAIPlayerProposalConsensusEnded,
  emitAIPlayerProposalConsensusStarted,
} from './proposal-lifecycle-events'

describe('proposal lifecycle events', () => {
  it('emits lifecycle events for proposal generation, consensus, and acceptance', async () => {
    const seen: string[] = []

    const off = eventBus.subscribe('AIPlayerProposalProposed', (event) => {
      seen.push(event.type)
    })
    eventBus.subscribe('AIPlayerProposalConsensusStarted', (event) => {
      seen.push(event.type)
    })
    eventBus.subscribe('AIPlayerProposalConsensusEnded', (event) => {
      seen.push(event.type)
    })
    eventBus.subscribe('AIPlayerProposalAccepted', (event) => {
      seen.push(event.type)
    })

    emitAIPlayerProposalProposed({
      proposalId: 'p-1',
      aiPlayerId: 'a-1',
      campaignId: 'c-1',
      characterId: 'chr-1',
      sceneMode: 'social',
      action: 'Talk to the innkeeper.',
    })
    emitAIPlayerProposalConsensusStarted({
      campaignId: 'c-1',
      sessionId: null,
      audienceKind: 'full_table',
      proposalIds: ['p-1'],
    })
    emitAIPlayerProposalConsensusEnded({
      campaignId: 'c-1',
      sessionId: null,
      audienceKind: 'full_table',
      proposalIds: ['p-1'],
      interrupted: false,
      timedOut: false,
    })
    emitAIPlayerProposalAccepted({
      proposalId: 'p-1',
      campaignId: 'c-1',
      sessionId: null,
      aiPlayerId: 'a-1',
      characterId: 'chr-1',
      action: 'Talk to the innkeeper.',
    })

    off()
    expect(seen).toEqual([
      'AIPlayerProposalProposed',
      'AIPlayerProposalConsensusStarted',
      'AIPlayerProposalConsensusEnded',
      'AIPlayerProposalAccepted',
    ])
  })
})

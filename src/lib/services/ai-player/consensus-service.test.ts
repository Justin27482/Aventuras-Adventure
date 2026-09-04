import { describe, expect, it } from 'vitest'
import type { AIPlayerProposal } from '$lib/types'
import { AIPlayerConsensusService } from './consensus-service'

const proposals: AIPlayerProposal[] = [
  {
    id: 'proposal-1',
    aiPlayerId: 'player-1',
    characterId: 'character-1',
    campaignId: 'campaign-1',
    sceneMode: 'social',
    action: 'Ask a question.',
    reasoning: 'Need information.',
    confidence: 7,
    reviewStatus: 'pending',
    createdAt: 1,
    updatedAt: 1,
  },
]

describe('AIPlayerConsensusService', () => {
  it('limits consensus to the configured exchange count', async () => {
    const messages = await new AIPlayerConsensusService().run({
      proposals,
      generateMessage: async () => 'I agree.',
      config: { maxExchanges: 2, messageDelayMs: 0 },
    })

    expect(messages.messages).toHaveLength(2)
    expect(messages.timedOut).toBe(false)
    expect(messages.interrupted).toBe(false)
  })

  it('emits each message as it is generated', async () => {
    const emitted: string[] = []
    await new AIPlayerConsensusService().run({
      proposals,
      generateMessage: async () => 'Consider the risk.',
      config: { maxExchanges: 1, messageDelayMs: 0 },
      onMessage: (message) => emitted.push(message.content),
    })

    expect(emitted).toEqual(['Consider the risk.'])
  })

  it('notifies when a player is typing before a consensus message is generated', async () => {
    const typing: Array<{ aiPlayerId: string; delayMs: number }> = []

    await new AIPlayerConsensusService().run({
      proposals,
      generateMessage: async () => 'I agree.',
      config: { maxExchanges: 1, messageDelayMs: 1500 },
      onTyping: ({ aiPlayerId, delayMs }) => typing.push({ aiPlayerId, delayMs }),
    })

    expect(typing).toEqual([{ aiPlayerId: 'player-1', delayMs: 1500 }])
  })

  it('stops when the GM abort signal is triggered', async () => {
    const controller = new AbortController()
    const result = await new AIPlayerConsensusService().run({
      proposals,
      signal: controller.signal,
      generateMessage: async () => {
        controller.abort()
        return 'This message is still recorded.'
      },
      config: { maxExchanges: 3, messageDelayMs: 0 },
    })

    expect(result.interrupted).toBe(true)
    expect(result.messages).toHaveLength(1)
  })
})

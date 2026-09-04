import { describe, expect, it, vi } from 'vitest'
import { get } from 'svelte/store'
import { initializeChatStore } from './chat-store.svelte'
import type { ChatNarration, ChatTableTalk } from '$lib/services/campaign/chat-types'

function createNarration(id: string): ChatNarration {
  return {
    id,
    type: 'narration',
    campaignId: 'campaign-1',
    sessionId: 'session-1',
    timestamp: 1,
    audience: 'full_table',
    visibility: 'player_safe',
    actorId: null,
    actorName: 'GM',
    content: 'The scene opens in the courtyard.',
    narrativeWeight: 'normal',
    canPromoteToLog: true,
  }
}

describe('chat store persistence hook', () => {
  it('persists newly added messages but not hydrated history', async () => {
    const persist = vi.fn().mockResolvedValue(undefined)
    const chat = initializeChatStore('campaign-1', 'session-1', persist)

    chat.addMessages([createNarration('hydrated-message')])
    expect(persist).not.toHaveBeenCalled()

    chat.addMessage(createNarration('new-message'))
    await vi.waitFor(() => expect(persist).toHaveBeenCalledWith(createNarration('new-message')))
    expect(get(chat).messages).toHaveLength(2)
  })

  it('deduplicates messages when story entries reconcile after history hydration', () => {
    const chat = initializeChatStore('campaign-1', 'session-1')
    const opening = createNarration('story:opening')

    chat.addMessages([opening])
    chat.addMessages([opening])

    expect(get(chat).messages).toEqual([opening])
  })

  it('keeps asynchronously restored messages in ascending timestamp order', () => {
    const chat = initializeChatStore('campaign-1', 'session-1')
    const newest = { ...createNarration('newest'), timestamp: 30 }
    const oldest = { ...createNarration('oldest'), timestamp: 10 }
    const middle = { ...createNarration('middle'), timestamp: 20 }

    chat.addMessage(newest)
    chat.addMessages([oldest, middle])

    expect(get(chat).messages.map((message) => message.id)).toEqual(['oldest', 'middle', 'newest'])
  })

  it('updates and removes messages for continuity corrections', () => {
    const chat = initializeChatStore('campaign-1', 'session-1')
    const original = { ...createNarration('continuity-message'), timestamp: 10 }
    const corrected = { ...original, content: 'The corrected scene description.' }

    chat.addMessages([original])
    chat.updateMessage(corrected)
    expect(get(chat).messages).toEqual([corrected])
    expect(get(chat).messages[0].timestamp).toBe(10)

    chat.removeMessage(corrected.id)
    expect(get(chat).messages).toEqual([])
  })

  it('updates and removes campaign-wide table talk without changing its timestamp', () => {
    const chat = initializeChatStore('campaign-1', null)
    const original: ChatTableTalk = {
      id: 'table-talk-1',
      type: 'table_talk',
      campaignId: 'campaign-1',
      sessionId: null,
      timestamp: 20,
      audience: 'full_table',
      visibility: 'player_safe',
      actorName: 'GM',
      content: 'Should we lean into the mystery?',
      intensity: 4,
      sentiment: 'neutral',
      emoji: '🎙️',
    }

    chat.addMessages([original])
    chat.updateMessage({ ...original, content: 'Should we focus on the mystery first?' })
    expect(get(chat).messages[0]).toMatchObject({
      content: 'Should we focus on the mystery first?',
      timestamp: 20,
    })

    chat.removeMessage(original.id)
    expect(get(chat).messages).toEqual([])
  })
})

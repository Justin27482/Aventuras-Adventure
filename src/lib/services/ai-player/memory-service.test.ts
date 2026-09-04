import { describe, expect, it } from 'vitest'
import type { AIPlayerMemory } from '$lib/types'
import { renderMemoriesForPrompt, selectRelevantMemories } from './memory-service'

function memory(overrides: Partial<AIPlayerMemory> = {}): AIPlayerMemory {
  return {
    id: 'memory-1',
    aiPlayerId: 'player-1',
    originCampaignId: 'campaign-1',
    originCampaignTitle: 'Clearview',
    originSetupSessionId: null,
    originSessionId: null,
    characterId: 'character-1',
    characterName: 'Elena',
    source: 'private_prologue',
    title: 'The missing ledger',
    content: 'I hid the ledger behind the darkroom shelf.',
    keywords: ['ledger', 'darkroom'],
    scope: 'campaign',
    injectionMode: 'keyword',
    priority: 5,
    pinned: false,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe('selectRelevantMemories', () => {
  it('includes a keyword match from the same campaign', () => {
    const selected = selectRelevantMemories([memory()], {
      campaignId: 'campaign-1',
      query: 'She asks about the ledger again.',
    })

    expect(selected.map((item) => item.id)).toEqual(['memory-1'])
  })

  it('excludes a same-campaign memory with no keyword match', () => {
    const selected = selectRelevantMemories([memory()], {
      campaignId: 'campaign-1',
      query: 'They discuss the weather.',
    })

    expect(selected).toEqual([])
  })

  it('never recalls another campaign memory that is campaign-scoped', () => {
    const selected = selectRelevantMemories(
      [memory({ originCampaignId: 'campaign-2', scope: 'campaign', injectionMode: 'always' })],
      { campaignId: 'campaign-1', query: 'ledger' },
    )

    expect(selected).toEqual([])
  })

  it('recalls another campaign memory only when explicitly marked cross_campaign', () => {
    const selected = selectRelevantMemories(
      [memory({ id: 'memory-2', originCampaignId: 'campaign-2', scope: 'cross_campaign' })],
      { campaignId: 'campaign-1', query: 'the ledger' },
    )

    expect(selected.map((item) => item.id)).toEqual(['memory-2'])
  })

  it('excludes memories the player disabled with scope or injection never', () => {
    const selected = selectRelevantMemories(
      [
        memory({ id: 'scope-never', scope: 'never', injectionMode: 'always' }),
        memory({ id: 'injection-never', injectionMode: 'never', pinned: true }),
      ],
      { campaignId: 'campaign-1', query: 'ledger' },
    )

    expect(selected).toEqual([])
  })

  it('always includes pinned and always-mode memories regardless of the query', () => {
    const selected = selectRelevantMemories(
      [
        memory({ id: 'pinned', pinned: true, keywords: [] }),
        memory({ id: 'always', injectionMode: 'always', keywords: [] }),
      ],
      { campaignId: 'campaign-1', query: 'unrelated talk' },
    )

    expect(selected.map((item) => item.id).sort()).toEqual(['always', 'pinned'])
  })

  it('orders by pinned, then priority, then recency, and respects the cap', () => {
    const selected = selectRelevantMemories(
      [
        memory({ id: 'low', injectionMode: 'always', priority: 1, createdAt: 5 }),
        memory({ id: 'high', injectionMode: 'always', priority: 9, createdAt: 2 }),
        memory({ id: 'pinned', injectionMode: 'always', priority: 1, pinned: true }),
      ],
      { campaignId: 'campaign-1', query: '', maxMemories: 2 },
    )

    expect(selected.map((item) => item.id)).toEqual(['pinned', 'high'])
  })
})

describe('renderMemoriesForPrompt', () => {
  it('labels cross-campaign recall so it is not treated as current-campaign events', () => {
    const rendered = renderMemoriesForPrompt(
      [
        memory({ id: 'here' }),
        memory({ id: 'there', originCampaignId: 'campaign-2', originCampaignTitle: 'Old Vault' }),
      ],
      'campaign-1',
    )

    expect(rendered).toContain('[this campaign] The missing ledger')
    expect(rendered).toContain('[from Old Vault — do not treat as events of this campaign]')
  })

  it('renders nothing when there are no memories', () => {
    expect(renderMemoriesForPrompt([], 'campaign-1')).toBe('')
  })
})

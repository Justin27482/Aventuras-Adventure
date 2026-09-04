import { describe, expect, it } from 'vitest'
import { decodeWorldbuildingWorkspace, encodeWorldbuildingDraft } from './workspace-codec'

describe('worldbuilding workspace codec', () => {
  it('loads the legacy default workspace with its original draft and default pack', () => {
    const workspace = decodeWorldbuildingWorkspace({
      id: 'default',
      draft: JSON.stringify({ title: 'Ashfall', genre: 'Fantasy' }),
      charter: '# Ashfall',
      conversation: JSON.stringify([{ role: 'user', content: 'Build Ashfall.' }]),
      updated_at: 10,
    })

    expect(workspace.title).toBe('Ashfall')
    expect(workspace.promptPackId).toBe('default-pack')
    expect(workspace.draft).toEqual({ title: 'Ashfall', genre: 'Fantasy' })
  })

  it('round-trips conversation metadata without exposing it as form fields', () => {
    const encoded = encodeWorldbuildingDraft({
      id: 'workspace-1',
      title: 'Darker Ashfall',
      promptPackId: 'dark-worlds',
      draft: { title: 'Ashfall', boundaries: 'No coercion' },
      charter: '',
      conversation: [],
      updatedAt: 10,
    })
    const decoded = decodeWorldbuildingWorkspace({
      id: 'workspace-1',
      draft: JSON.stringify(encoded),
      charter: '',
      conversation: '[]',
      updated_at: 10,
    })

    expect(decoded.title).toBe('Darker Ashfall')
    expect(decoded.promptPackId).toBe('dark-worlds')
    expect(decoded.draft).toEqual({ title: 'Ashfall', boundaries: 'No coercion' })
  })
})

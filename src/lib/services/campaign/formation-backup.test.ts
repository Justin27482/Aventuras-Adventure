import { describe, expect, it } from 'vitest'
import type { CampaignFormationSnapshot } from '$lib/types'
import {
  canRestoreFormationBackup,
  checksumFormationSnapshot,
  stableFormationSnapshotJson,
} from './formation-backup'

const snapshot: CampaignFormationSnapshot = {
  version: 1,
  campaignId: 'campaign-1',
  storyId: 'story-1',
  tables: {
    characters: [{ id: 'character-2' }, { id: 'character-1' }],
    party_members: [{ id: 'party-1' }],
  },
  itemOwnership: [],
}

describe('formation backup rules', () => {
  it('produces a stable checksum independent of table insertion order', async () => {
    const reordered: CampaignFormationSnapshot = {
      ...snapshot,
      tables: {
        party_members: [{ id: 'party-1' }],
        characters: [{ id: 'character-1' }, { id: 'character-2' }],
      },
    }
    expect(stableFormationSnapshotJson(snapshot)).toBe(stableFormationSnapshotJson(reordered))
    expect(await checksumFormationSnapshot(snapshot)).toBe(
      await checksumFormationSnapshot(reordered),
    )
  })

  it('allows restore only before replacement cast or normal play exists', () => {
    expect(
      canRestoreFormationBackup({
        restoredAt: null,
        liveCharacterCount: 0,
        normalSessionCount: 0,
        setupSessionCount: 0,
      }),
    ).toBe(true)
    expect(
      canRestoreFormationBackup({
        restoredAt: null,
        liveCharacterCount: 1,
        normalSessionCount: 0,
        setupSessionCount: 0,
      }),
    ).toBe(false)
    expect(
      canRestoreFormationBackup({
        restoredAt: null,
        liveCharacterCount: 0,
        normalSessionCount: 0,
        setupSessionCount: 1,
      }),
    ).toBe(false)
    expect(
      canRestoreFormationBackup({
        restoredAt: 10,
        liveCharacterCount: 0,
        normalSessionCount: 0,
        setupSessionCount: 0,
      }),
    ).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { groupInventoryByOwner } from './inventory-grouping'
import type { CampaignPartyMember, Item } from '$lib/types'

function buildItem(id: string, ownerCharacterId: string | null): Item {
  return {
    id,
    storyId: 'story-1',
    name: `Item ${id}`,
    description: null,
    quantity: 1,
    equipped: false,
    location: 'inventory',
    ownerCharacterId,
    slotKey: null,
    containerItemId: null,
    metadata: null,
    branchId: null,
  }
}

function buildMember(characterId: string, displayOrder: number): CampaignPartyMember {
  return {
    id: `member-${characterId}`,
    campaignId: 'campaign-1',
    characterId,
    eligibilityStatus: 'eligible',
    actorCategory: 'active_companion',
    active: true,
    narrativeControlMode: 'autonomous',
    combatControlMode: 'autonomous',
    displayOrder,
    joinedAt: 0,
    leftAt: null,
  }
}

describe('groupInventoryByOwner', () => {
  it('groups items under their owning party member, in display order', () => {
    const members = [buildMember('char-2', 1), buildMember('char-1', 0)]
    const items = [buildItem('item-1', 'char-1'), buildItem('item-2', 'char-2')]

    const groups = groupInventoryByOwner(items, members)

    expect(groups.map((g) => g.characterId)).toEqual(['char-1', 'char-2', null])
    expect(groups[0].items.map((i) => i.id)).toEqual(['item-1'])
    expect(groups[1].items.map((i) => i.id)).toEqual(['item-2'])
  })

  it('puts unowned items in the shared stash bucket', () => {
    const members = [buildMember('char-1', 0)]
    const items = [buildItem('item-1', null), buildItem('item-2', 'char-1')]

    const groups = groupInventoryByOwner(items, members)
    const stash = groups.find((g) => g.characterId === null)

    expect(stash?.items.map((i) => i.id)).toEqual(['item-1'])
  })

  it('includes members with empty inventories as empty groups', () => {
    const members = [buildMember('char-1', 0)]
    const groups = groupInventoryByOwner([], members)

    expect(groups).toEqual([
      { characterId: 'char-1', items: [] },
      { characterId: null, items: [] },
    ])
  })
})

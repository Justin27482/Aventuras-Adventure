import { describe, expect, it } from 'vitest'
import {
  applyClothingDurabilityDelta,
  applyResourceDelta,
  assertNoCoercedConsentMutation,
  clampResourceValue,
  useAbilityResource,
  validateEquipSlot,
  validateItemTransfer,
  validateMoneyAmount,
  validateSlotCarryLimit,
  validateInventorySlotCapacity,
} from './mechanics-rules'
import type { CampaignPartyMember, Item, RulesetSlot } from '$lib/types'

function buildItem(overrides: Partial<Item> & Pick<Item, 'id'>): Item {
  return {
    storyId: 'story-1',
    name: 'Item',
    description: null,
    quantity: 1,
    equipped: false,
    location: 'inventory',
    ownerCharacterId: null,
    slotKey: null,
    containerItemId: null,
    metadata: null,
    branchId: null,
    ...overrides,
  }
}

function buildMember(
  overrides: Partial<CampaignPartyMember> & Pick<CampaignPartyMember, 'characterId'>,
): CampaignPartyMember {
  return {
    id: crypto.randomUUID(),
    campaignId: 'campaign-1',
    eligibilityStatus: 'eligible',
    actorCategory: 'active_companion',
    active: true,
    narrativeControlMode: 'autonomous',
    combatControlMode: 'autonomous',
    displayOrder: 0,
    joinedAt: 0,
    leftAt: null,
    ...overrides,
  }
}

describe('clampResourceValue / applyResourceDelta', () => {
  it('clamps within [min, max]', () => {
    expect(clampResourceValue(15, 0, 10)).toBe(10)
    expect(clampResourceValue(-5, 0, 10)).toBe(0)
    expect(clampResourceValue(5, 0, 10)).toBe(5)
  })

  it('never lets a resource go below zero even on a large negative delta', () => {
    const result = applyResourceDelta({ current: 5, max: 20 }, -100)
    expect(result.current).toBe(0)
  })

  it('never lets a resource exceed max on a large positive delta', () => {
    const result = applyResourceDelta({ current: 5, max: 20 }, 100)
    expect(result.current).toBe(20)
  })
})

describe('validateMoneyAmount', () => {
  it('allows zero and positive amounts', () => {
    expect(() => validateMoneyAmount(0)).not.toThrow()
    expect(() => validateMoneyAmount(50)).not.toThrow()
  })

  it('rejects negative amounts', () => {
    expect(() => validateMoneyAmount(-1)).toThrow(/negative/)
  })
})

describe('useAbilityResource', () => {
  it('deducts the cost when affordable', () => {
    const result = useAbilityResource({ current: 5, max: 10 }, 3)
    expect(result.current).toBe(2)
  })

  it('throws when the resource cannot cover the cost (ability-use floor validation)', () => {
    expect(() => useAbilityResource({ current: 1, max: 10 }, 3)).toThrow(/Not enough resource/)
  })
})

describe('validateEquipSlot', () => {
  const slots: RulesetSlot[] = [
    {
      id: 's1',
      rulesetId: 'r1',
      key: 'weapon',
      label: 'Weapon',
      slotType: 'wearable',
      sortOrder: 0,
    },
  ]

  it('allows equipping into a known, unoccupied slot', () => {
    const item = buildItem({ id: 'item-1', ownerCharacterId: 'char-1' })
    expect(() => validateEquipSlot(item, 'weapon', slots, [])).not.toThrow()
  })

  it('rejects an unknown slot key', () => {
    const item = buildItem({ id: 'item-1', ownerCharacterId: 'char-1' })
    expect(() => validateEquipSlot(item, 'tail', slots, [])).toThrow(/Unknown equipment slot/)
  })

  it('rejects equipping when another item already occupies the slot for that owner', () => {
    const item = buildItem({ id: 'item-1', ownerCharacterId: 'char-1' })
    const occupying = buildItem({
      id: 'item-2',
      ownerCharacterId: 'char-1',
      slotKey: 'weapon',
      equipped: true,
    })
    expect(() => validateEquipSlot(item, 'weapon', slots, [occupying])).toThrow(/already occupied/)
  })

  it('allows two different characters to each occupy the same slot key', () => {
    const item = buildItem({ id: 'item-1', ownerCharacterId: 'char-2' })
    const otherOwnerOccupying = buildItem({
      id: 'item-2',
      ownerCharacterId: 'char-1',
      slotKey: 'weapon',
      equipped: true,
    })
    expect(() => validateEquipSlot(item, 'weapon', slots, [otherOwnerOccupying])).not.toThrow()
  })
})

describe('validateItemTransfer', () => {
  it('allows transferring to an eligible party member', () => {
    const item = buildItem({ id: 'item-1', storyId: 'story-1', ownerCharacterId: null })
    const members = [buildMember({ characterId: 'char-1' })]
    expect(() => validateItemTransfer(item, 'story-1', members, 'char-1')).not.toThrow()
  })

  it('allows transferring back to the shared stash (null owner)', () => {
    const item = buildItem({ id: 'item-1', storyId: 'story-1', ownerCharacterId: 'char-1' })
    const members = [buildMember({ characterId: 'char-1' })]
    expect(() => validateItemTransfer(item, 'story-1', members, null)).not.toThrow()
  })

  it('rejects transferring to a character not in the eligible party', () => {
    const item = buildItem({ id: 'item-1', storyId: 'story-1', ownerCharacterId: null })
    const members: CampaignPartyMember[] = []
    expect(() => validateItemTransfer(item, 'story-1', members, 'stranger')).toThrow(
      /eligible campaign character/,
    )
  })

  it('rejects transferring an item that belongs to a different campaign story', () => {
    const item = buildItem({ id: 'item-1', storyId: 'other-story', ownerCharacterId: null })
    const members = [buildMember({ characterId: 'char-1' })]
    expect(() => validateItemTransfer(item, 'story-1', members, 'char-1')).toThrow(
      /does not belong to the active campaign/,
    )
  })
})

describe('applyClothingDurabilityDelta', () => {
  it('clamps durability within [0, max]', () => {
    expect(applyClothingDurabilityDelta(5, -10, 20)).toBe(0)
    expect(applyClothingDurabilityDelta(15, 10, 20)).toBe(20)
    expect(applyClothingDurabilityDelta(15, -5, 20)).toBe(10)
  })
})

describe('validateSlotCarryLimit', () => {
  it('allows a single equipped item per slot per owner', () => {
    const items = [
      buildItem({ id: 'item-1', ownerCharacterId: 'char-1', slotKey: 'weapon', equipped: true }),
    ]
    expect(() => validateSlotCarryLimit('char-1', 'weapon', items)).not.toThrow()
  })

  it('rejects more than one equipped item in the same slot for the same owner', () => {
    const items = [
      buildItem({ id: 'item-1', ownerCharacterId: 'char-1', slotKey: 'weapon', equipped: true }),
      buildItem({ id: 'item-2', ownerCharacterId: 'char-1', slotKey: 'weapon', equipped: true }),
    ]
    expect(() => validateSlotCarryLimit('char-1', 'weapon', items)).toThrow(/More than one item/)
  })
})

describe('validateInventorySlotCapacity', () => {
  it('counts carried stacks and equipped armor, but not equipped clothing', () => {
    const items = [
      {
        id: 'bag',
        storyId: 's',
        name: 'Potion',
        description: null,
        quantity: 1,
        equipped: false,
        location: 'inventory',
        ownerCharacterId: 'pc',
        metadata: null,
        branchId: null,
      },
      {
        id: 'armor',
        storyId: 's',
        name: 'Leather Armor',
        description: null,
        quantity: 1,
        equipped: true,
        location: 'inventory',
        ownerCharacterId: 'pc',
        metadata: null,
        branchId: null,
      },
      {
        id: 'cloak',
        storyId: 's',
        name: 'Travel Cloak',
        description: null,
        quantity: 1,
        equipped: true,
        location: 'inventory',
        ownerCharacterId: 'pc',
        metadata: null,
        branchId: null,
      },
    ]

    expect(() => validateInventorySlotCapacity('pc', items, 2)).not.toThrow()
    expect(() => validateInventorySlotCapacity('pc', items, 1)).toThrow(
      'Inventory slot capacity exceeded',
    )
  })
})

describe('assertNoCoercedConsentMutation', () => {
  it('is a no-op guardrail choke point for every mutation kind used in Phase 3', () => {
    expect(() => assertNoCoercedConsentMutation({ kind: 'resource_delta' })).not.toThrow()
    expect(() =>
      assertNoCoercedConsentMutation({ kind: 'ability_use', note: 'fireball' }),
    ).not.toThrow()
    expect(() =>
      assertNoCoercedConsentMutation({ kind: 'condition', note: 'poisoned' }),
    ).not.toThrow()
  })
})

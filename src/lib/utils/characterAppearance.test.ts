import { describe, expect, it } from 'vitest'
import { formatCharacterAppearance } from './characterAppearance'
import type { Item } from '$lib/types'

function clothingItem(overrides: Partial<Item>): Item {
  return {
    id: 'item-1',
    storyId: 'story-1',
    name: 'Traveling coat',
    description: 'A charcoal wool coat',
    quantity: 1,
    equipped: true,
    location: 'inventory',
    ownerCharacterId: 'character-1',
    slotKey: 'outerwear',
    containerItemId: null,
    metadata: {
      clothing: {
        isClothing: true,
        durability: 70,
        maxDurability: 100,
        exposedZones: ['arms'],
      },
    },
    branchId: null,
    ...overrides,
  }
}

describe('formatCharacterAppearance', () => {
  it('combines baseline and only the target character’s equipped clothing', () => {
    const appearance = formatCharacterAppearance(
      {
        id: 'character-1',
        visualDescriptors: {
          hair: 'short black hair',
          presence: 'calm and precise',
          clothing: 'usually favors practical dark layers',
        },
      },
      [
        clothingItem({}),
        clothingItem({
          id: 'item-2',
          name: 'Other character’s robe',
          ownerCharacterId: 'character-2',
        }),
      ],
    )

    expect(appearance).toContain('Baseline appearance:')
    expect(appearance).toContain('Presence: calm and precise')
    expect(appearance).toContain('Traveling coat')
    expect(appearance).not.toContain('Other character’s robe')
  })

  it('omits unequipped and non-clothing items from the current outfit', () => {
    const appearance = formatCharacterAppearance(
      { id: 'character-1', visualDescriptors: { face: 'freckled' } },
      [
        clothingItem({ equipped: false }),
        clothingItem({
          id: 'item-2',
          name: 'Compass',
          metadata: {},
        }),
      ],
    )

    expect(appearance).toBe('Face: freckled')
  })

  it('includes current clothing damage and exposure state', () => {
    const appearance = formatCharacterAppearance(
      { id: 'character-1', visualDescriptors: {} },
      [
        clothingItem({
          metadata: {
            clothing: {
              isClothing: true,
              durability: 0,
              maxDurability: 100,
              exposedZones: ['torso', 'arms'],
            },
          },
        }),
      ],
    )

    expect(appearance).toContain('unusable')
    expect(appearance).toContain('exposed at torso, arms')
  })
})

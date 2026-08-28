/**
 * Groups a story's items by owning party member, with unowned items in the
 * shared stash bucket (task 3.8).
 */

import type { CampaignPartyMember, Item } from '$lib/types'

export interface InventoryGroup {
  characterId: string | null
  items: Item[]
}

/** `characterId: null` is the shared stash bucket for unowned items. */
export function groupInventoryByOwner(
  items: Item[],
  members: CampaignPartyMember[],
): InventoryGroup[] {
  const orderedOwnerIds = members
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((member) => member.characterId)

  const buckets = new Map<string | null, Item[]>()
  buckets.set(null, [])
  for (const ownerId of orderedOwnerIds) buckets.set(ownerId, [])

  for (const item of items) {
    const ownerId = item.ownerCharacterId ?? null
    if (!buckets.has(ownerId)) buckets.set(ownerId, [])
    buckets.get(ownerId)!.push(item)
  }

  const groups: InventoryGroup[] = orderedOwnerIds.map((characterId) => ({
    characterId,
    items: buckets.get(characterId) ?? [],
  }))
  groups.push({ characterId: null, items: buckets.get(null) ?? [] })
  return groups
}

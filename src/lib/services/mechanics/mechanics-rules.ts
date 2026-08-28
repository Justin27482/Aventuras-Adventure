/**
 * Pure validation/mutation-shape functions for Phase 3 mechanics: resource
 * clamps, ability-use costs, item equip/transfer, and clothing durability.
 * No I/O here — callers (mechanics-service.ts) persist the results.
 */

import type { CampaignPartyMember, Item, ResourceValue, Ruleset, RulesetSlot } from '$lib/types'
import { validateItemOwnership } from '$lib/services/campaign/campaign-rules'

/** Clamps a value into [min, max] (max may be omitted for unbounded resources). */
export function clampResourceValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Applies a delta to a resource, clamping the result to [0, max]. Never allows negative current. */
export function applyResourceDelta(resource: ResourceValue, delta: number): ResourceValue {
  return { ...resource, current: clampResourceValue(resource.current + delta, 0, resource.max) }
}

/** Throws if the given money amount would go negative. */
export function validateMoneyAmount(amount: number): void {
  if (amount < 0) {
    throw new Error('Money amount cannot go negative')
  }
}

/**
 * Validates and applies an ability's resource cost. Throws if the character
 * doesn't have enough of the resource (ability-use floor validation).
 */
export function useAbilityResource(resource: ResourceValue, cost: number): ResourceValue {
  if (resource.current < cost) {
    throw new Error(
      `Not enough resource to use this ability (need ${cost}, have ${resource.current})`,
    )
  }
  return applyResourceDelta(resource, -cost)
}

/** Validates a slot key exists on the ruleset and no other item already occupies it for this owner. */
export function validateEquipSlot(
  item: Pick<Item, 'id' | 'ownerCharacterId'>,
  slotKey: string,
  rulesetSlots: RulesetSlot[],
  currentlyEquipped: Item[],
): void {
  if (!rulesetSlots.some((slot) => slot.key === slotKey)) {
    throw new Error(`Unknown equipment slot: "${slotKey}"`)
  }
  const conflict = currentlyEquipped.find(
    (candidate) =>
      candidate.id !== item.id &&
      candidate.ownerCharacterId === item.ownerCharacterId &&
      candidate.slotKey === slotKey &&
      candidate.equipped,
  )
  if (conflict) {
    throw new Error(`Slot "${slotKey}" is already occupied by another item`)
  }
}

/**
 * Validates transferring an item to a new owner (or to the shared stash if
 * `toCharacterId` is null). Reuses the same eligibility rule as ownership
 * assignment so a transfer can never hand an item to an ineligible character.
 */
export function validateItemTransfer(
  item: Item,
  campaignStoryId: string | null,
  members: CampaignPartyMember[],
  toCharacterId: string | null,
): void {
  validateItemOwnership(item, campaignStoryId, members, { ownerCharacterId: toCharacterId })
}

/** Clamps a clothing durability change to [0, maxDurability]; ownership is inherent to the item row. */
export function applyClothingDurabilityDelta(
  currentDurability: number,
  delta: number,
  maxDurability: number,
): number {
  return clampResourceValue(currentDurability + delta, 0, maxDurability)
}

/**
 * Slot-based carry validation: at most one equipped item per named slot per
 * owner. This is deliberately NOT a weight/encumbrance system — Item has no
 * weight field, and adding one would be a broad schema change out of scope
 * for this pass. Revisit if full encumbrance is required later.
 */
export function validateSlotCarryLimit(
  ownerCharacterId: string | null,
  slotKey: string,
  items: Item[],
): void {
  const occupants = items.filter(
    (item) =>
      item.ownerCharacterId === ownerCharacterId && item.slotKey === slotKey && item.equipped,
  )
  if (occupants.length > 1) {
    throw new Error(`More than one item is equipped in slot "${slotKey}" for this character`)
  }
}

export function validateEncumbrance(
  ownerCharacterId: string,
  items: Item[],
  ruleset: Pick<Ruleset, 'encumbranceMode' | 'encumbranceCapacityFormula'>,
  capacity: number,
): void {
  if (ruleset.encumbranceMode === 'slot') return
  const carriedWeight = items
    .filter((item) => item.ownerCharacterId === ownerCharacterId && item.location === 'inventory')
    .reduce((total, item) => total + Math.max(0, item.weight ?? 0) * Math.max(0, item.quantity), 0)
  if (carriedWeight > capacity) {
    throw new Error(`Carrying capacity exceeded (${carriedWeight} / ${capacity})`)
  }
}

/** Counts carried item stacks against a ruleset's slot capacity; equipped wearable items use named slots instead. */
export function validateInventorySlotCapacity(
  ownerCharacterId: string,
  items: Item[],
  capacity: number,
): void {
  const carriedSlots = items.filter(
    (item) =>
      item.ownerCharacterId === ownerCharacterId &&
      item.location === 'inventory' &&
      (!item.equipped || isArmorItem(item)),
  ).length
  if (carriedSlots > capacity) {
    throw new Error(`Inventory slot capacity exceeded (${carriedSlots} / ${capacity})`)
  }
}

/** Armor occupies carry capacity even when equipped; ordinary clothing only uses wearable slots. */
export function isArmorItem(item: Pick<Item, 'name' | 'metadata'>): boolean {
  const metadata = item.metadata?.armor
  if (typeof metadata === 'boolean') return metadata
  if (metadata && typeof metadata === 'object' && 'isArmor' in metadata) {
    return metadata.isArmor === true
  }
  return /\b(armor|armour|breastplate|cuirass|chainmail|mail|plate armor|scale armor|shield)\b/i.test(
    item.name,
  )
}

/**
 * GUARDRAIL (hard ban, task 3.11/3.12): mechanics-driven state mutations must
 * never compel a sexual act or override a character's consent, even under
 * coercive/mind-control narrative framing. No Phase 3 mechanic (resources,
 * abilities, inventory) can express this today, so this is a deliberate no-op —
 * but it is the single choke point every future mutation type MUST call before
 * applying an effect. Any future mind-control/coercion mechanic must throw here
 * rather than allow the mutation through.
 */
export function assertNoCoercedConsentMutation(_mutation: { kind: string; note?: string }): void {
  // Intentionally empty for Phase 3's mutation types (resource/ability/inventory).
}

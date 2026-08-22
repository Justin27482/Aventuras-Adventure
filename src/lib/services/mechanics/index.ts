/**
 * Mechanics module (Phase 3): character sheets, resource formulas, and
 * inventory/equipment validation rules.
 */

export { evaluateFormula } from './resource-formulas'
export {
  clampResourceValue,
  applyResourceDelta,
  validateMoneyAmount,
  useAbilityResource,
  validateEquipSlot,
  validateItemTransfer,
  applyClothingDurabilityDelta,
  validateSlotCarryLimit,
  assertNoCoercedConsentMutation,
} from './mechanics-rules'
export { groupInventoryByOwner, type InventoryGroup } from './inventory-grouping'
export { mechanicsService } from './mechanics-service'

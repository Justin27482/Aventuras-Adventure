/**
 * Mechanics Service (Phase 3, task 3.10)
 *
 * Character sheet CRUD, resource-max computation from ruleset formulas, and
 * the validated mutation entry points (resource deltas, ability use,
 * conditions) that persist through database.ts.
 */

import { database } from '$lib/services/database'
import type {
  CharacterSheet,
  ConditionState,
  FullRuleset,
  ResourceValue,
  RulesetResource,
} from '$lib/types'
import { evaluateFormula } from './resource-formulas'
import {
  applyResourceDelta,
  assertNoCoercedConsentMutation,
  useAbilityResource,
} from './mechanics-rules'

class MechanicsService {
  /** Computes a resource's max value for a character at a given level. */
  computeResourceMax(
    resource: RulesetResource,
    statValues: Record<string, number>,
    level: number,
  ): number {
    const max = evaluateFormula(resource.maxFormula, { ...statValues, level })
    return Math.max(resource.minValue, Math.round(max))
  }

  /** Loads a character's sheet, or creates one seeded from the ruleset's defaults. */
  async getOrCreateSheet(characterId: string, ruleset: FullRuleset): Promise<CharacterSheet> {
    const existing = await database.getCharacterSheet(characterId)
    if (existing) return existing

    const now = Date.now()
    const statValues: Record<string, number> = {}
    for (const stat of ruleset.stats) statValues[stat.key] = stat.defaultValue

    const resourceValues: Record<string, ResourceValue> = {}
    for (const resource of ruleset.resources) {
      const max = this.computeResourceMax(resource, statValues, 1)
      resourceValues[resource.key] = { current: max, max }
    }

    const conditionStates: Record<string, ConditionState> = {}
    for (const condition of ruleset.conditions) {
      conditionStates[condition.key] = { active: false, note: null }
    }

    const sheet: CharacterSheet = {
      characterId,
      rulesetId: ruleset.ruleset.id,
      statValues,
      resourceValues,
      conditionStates,
      level: 1,
      xp: 0,
      createdAt: now,
      updatedAt: now,
    }
    await database.upsertCharacterSheet(sheet)
    return sheet
  }

  async applyResourceDelta(
    characterId: string,
    resourceKey: string,
    delta: number,
  ): Promise<CharacterSheet> {
    assertNoCoercedConsentMutation({ kind: 'resource_delta', note: resourceKey })
    const sheet = await this.requireSheet(characterId)
    const resource = this.requireResource(sheet, resourceKey)
    const updated: CharacterSheet = {
      ...sheet,
      resourceValues: {
        ...sheet.resourceValues,
        [resourceKey]: applyResourceDelta(resource, delta),
      },
      updatedAt: Date.now(),
    }
    await database.upsertCharacterSheet(updated)
    return updated
  }

  /** Spends a resource on an ability use; throws if the character can't afford it. */
  async useAbility(
    characterId: string,
    resourceKey: string,
    cost: number,
  ): Promise<CharacterSheet> {
    assertNoCoercedConsentMutation({ kind: 'ability_use', note: resourceKey })
    const sheet = await this.requireSheet(characterId)
    const resource = this.requireResource(sheet, resourceKey)
    const updated: CharacterSheet = {
      ...sheet,
      resourceValues: {
        ...sheet.resourceValues,
        [resourceKey]: useAbilityResource(resource, cost),
      },
      updatedAt: Date.now(),
    }
    await database.upsertCharacterSheet(updated)
    return updated
  }

  async setCondition(
    characterId: string,
    conditionKey: string,
    active: boolean,
    note: string | null = null,
  ): Promise<CharacterSheet> {
    assertNoCoercedConsentMutation({ kind: 'condition', note: conditionKey })
    const sheet = await this.requireSheet(characterId)
    const updated: CharacterSheet = {
      ...sheet,
      conditionStates: { ...sheet.conditionStates, [conditionKey]: { active, note } },
      updatedAt: Date.now(),
    }
    await database.upsertCharacterSheet(updated)
    return updated
  }

  private async requireSheet(characterId: string): Promise<CharacterSheet> {
    const sheet = await database.getCharacterSheet(characterId)
    if (!sheet) throw new Error(`No character sheet exists for character "${characterId}"`)
    return sheet
  }

  private requireResource(sheet: CharacterSheet, resourceKey: string): ResourceValue {
    const resource = sheet.resourceValues[resourceKey]
    if (!resource) throw new Error(`Unknown resource "${resourceKey}" on this character sheet`)
    return resource
  }
}

export const mechanicsService = new MechanicsService()

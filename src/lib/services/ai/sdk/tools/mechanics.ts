/**
 * Mechanics Tools (Phase 3, task 3.9)
 *
 * Tool definitions for resource/ability/condition state mutation, backed by
 * mechanicsService. Not yet wired into any live agent — tool *execution*
 * wiring and approval flow is Phase 8's scope; this only defines the schemas
 * and validated execute() bodies.
 *
 * GUARDRAIL: every mutation here passes through mechanicsService, which calls
 * assertNoCoercedConsentMutation before applying any effect. No tool in this
 * file may bypass mechanicsService and mutate a character sheet directly.
 */

import { tool } from 'ai'
import { z } from 'zod'
import { mechanicsService } from '$lib/services/mechanics'

export function createMechanicsTools() {
  return {
    /** Reads a character's current stat/resource/condition state. */
    get_character_sheet: tool({
      description: "Read a character's current stats, resources, conditions, level, and XP.",
      inputSchema: z.object({
        characterId: z.string().describe('The character whose sheet to read'),
      }),
      execute: async ({ characterId }: { characterId: string }) => {
        const { database } = await import('$lib/services/database')
        const sheet = await database.getCharacterSheet(characterId)
        if (!sheet) {
          return { found: false, error: `No character sheet exists for "${characterId}"` }
        }
        return { found: true, sheet }
      },
    }),

    /** Applies a signed delta to a resource (e.g. damage, healing), clamped to [0, max]. */
    apply_resource_delta: tool({
      description:
        'Apply a signed delta to a character resource (e.g. -8 health for damage, +5 for healing). Result is clamped to [0, max].',
      inputSchema: z.object({
        characterId: z.string().describe('The character whose resource changes'),
        resourceKey: z.string().describe('The resource key, e.g. "health" or "mana"'),
        delta: z.number().describe('Signed amount to apply (negative to reduce, positive to restore)'),
      }),
      execute: async ({
        characterId,
        resourceKey,
        delta,
      }: {
        characterId: string
        resourceKey: string
        delta: number
      }) => {
        try {
          const sheet = await mechanicsService.applyResourceDelta(characterId, resourceKey, delta)
          return { success: true, resource: sheet.resourceValues[resourceKey] }
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),

    /** Spends a resource to use an ability; fails if the character can't afford the cost. */
    use_ability: tool({
      description:
        "Spend a resource to use an ability. Fails without effect if the character's resource is below the cost.",
      inputSchema: z.object({
        characterId: z.string().describe('The character using the ability'),
        resourceKey: z.string().describe('The resource key the ability spends, e.g. "stamina"'),
        cost: z.number().describe('The resource cost of the ability'),
      }),
      execute: async ({
        characterId,
        resourceKey,
        cost,
      }: {
        characterId: string
        resourceKey: string
        cost: number
      }) => {
        try {
          const sheet = await mechanicsService.useAbility(characterId, resourceKey, cost)
          return { success: true, resource: sheet.resourceValues[resourceKey] }
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),

    /** Sets a condition (e.g. poisoned, prone) active or inactive on a character. */
    set_condition: tool({
      description: 'Set a ruleset condition active or inactive on a character, with an optional note.',
      inputSchema: z.object({
        characterId: z.string().describe('The character to apply the condition to'),
        conditionKey: z.string().describe('The condition key, e.g. "poisoned" or "prone"'),
        active: z.boolean().describe('Whether the condition is now active'),
        note: z.string().optional().describe('Optional note about the condition (e.g. duration, source)'),
      }),
      execute: async ({
        characterId,
        conditionKey,
        active,
        note,
      }: {
        characterId: string
        conditionKey: string
        active: boolean
        note?: string
      }) => {
        try {
          const sheet = await mechanicsService.setCondition(
            characterId,
            conditionKey,
            active,
            note ?? null,
          )
          return { success: true, condition: sheet.conditionStates[conditionKey] }
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),
  }
}

/**
 * Mechanics Tools (Phase 8, tasks 8.1 & 8.2)
 *
 * Full tool definitions for mechanics execution: dice rolling, resource adjustment,
 * conditions, item management, money, scene/turn control, and quest threads.
 *
 * GUARDRAIL: every mutation passes through mechanicsService or database validation,
 * maintaining content safety and hard-ban assertions across all execution boundaries.
 */

import { tool } from 'ai'
import { z } from 'zod'
import { mechanicsService } from '$lib/services/mechanics'
import { eventBus } from '$lib/services/events'

export function createMechanicsTools(campaignId?: string, storyId?: string) {
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

    /** Rolls dice using the dice service and records on the ledger. */
    roll_dice: tool({
      description:
        'Roll dice (e.g. "1d20+3" or "2d6") against an optional DC and record on the ledger.',
      inputSchema: z.object({
        campaignId: z.string().optional().describe('Campaign ID'),
        actorId: z.string().optional().describe('Actor ID performing the roll'),
        notation: z.string().describe('Dice notation, e.g. "1d20+5"'),
        dc: z.number().nullable().optional().describe('Target Difficulty Class'),
        reason: z.string().optional().describe('Reason for roll'),
      }),
      execute: async ({ campaignId: reqCampId, actorId, notation, dc, reason }) => {
        const targetCampId = reqCampId || campaignId
        if (!targetCampId) return { success: false, error: 'Campaign ID required' }
        try {
          const { roll: rollFn } = await import('$lib/services/dice')
          const result = await rollFn({
            campaignId: targetCampId,
            actorId: actorId ?? null,
            notation,
            dc: dc ?? null,
            reason: reason ?? 'Mechanics tool roll',
            visibility: 'player_safe',
          })
          eventBus.emit({
            type: 'DiceRolled',
            campaignId: result.entry.campaignId,
            sessionId: result.entry.sessionId,
            actorId: result.entry.actorId,
            notation: result.entry.notation,
            total: result.entry.total,
            dc: result.entry.dc,
            outcome: result.entry.outcome,
            entry: result.entry,
          })
          return { success: true, result }
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),

    /** Emits a roll request for a player. */
    request_player_roll: tool({
      description: 'Request a player roll for a check.',
      inputSchema: z.object({
        campaignId: z.string().optional().describe('Campaign ID'),
        actorId: z.string().optional().describe('Target actor ID'),
        notation: z.string().describe('Dice notation, e.g. "1d20+2"'),
        dc: z.number().nullable().optional().describe('DC'),
        reason: z.string().optional().describe('Reason for request'),
      }),
      execute: async ({ campaignId: reqCampId, actorId, notation, dc, reason }) => {
        const targetCampId = reqCampId || campaignId
        if (!targetCampId) return { success: false, error: 'Campaign ID required' }
        eventBus.emit({
          type: 'RollRequested',
          campaignId: targetCampId,
          sessionId: null,
          actorId: actorId ?? null,
          notation,
          dc: dc ?? null,
          reason: reason ?? null,
        })
        return { success: true, requested: { notation, dc, reason } }
      },
    }),

    /** Applies a signed delta to a resource (e.g. damage, healing), clamped to [0, max]. */
    apply_resource_delta: tool({
      description:
        'Apply a signed delta to a character resource (e.g. -8 health for damage, +5 for healing). Result is clamped to [0, max].',
      inputSchema: z.object({
        characterId: z.string().describe('The character whose resource changes'),
        resourceKey: z.string().describe('The resource key, e.g. "health" or "mana"'),
        delta: z
          .number()
          .describe('Signed amount to apply (negative to reduce, positive to restore)'),
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

    /** Alias for apply_resource_delta */
    adjust_resource: tool({
      description: 'Adjust a character resource value.',
      inputSchema: z.object({
        characterId: z.string().describe('Character ID'),
        resourceKey: z.string().describe('Resource key'),
        delta: z.number().describe('Delta (+ or -)'),
      }),
      execute: async ({ characterId, resourceKey, delta }) => {
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

    /** Alias for use_ability */
    spend_ability_use: tool({
      description: 'Spend ability resource cost.',
      inputSchema: z.object({
        characterId: z.string().describe('Character ID'),
        resourceKey: z.string().describe('Resource key'),
        cost: z.number().describe('Cost'),
      }),
      execute: async ({ characterId, resourceKey, cost }) => {
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
      description:
        'Set a ruleset condition active or inactive on a character, with an optional note.',
      inputSchema: z.object({
        characterId: z.string().describe('The character to apply the condition to'),
        conditionKey: z.string().describe('The condition key, e.g. "poisoned" or "prone"'),
        active: z.boolean().describe('Whether the condition is now active'),
        note: z
          .string()
          .optional()
          .describe('Optional note about the condition (e.g. duration, source)'),
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

    apply_condition: tool({
      description: 'Apply an active condition to a character.',
      inputSchema: z.object({
        characterId: z.string().describe('Character ID'),
        conditionKey: z.string().describe('Condition key'),
        note: z.string().optional().describe('Note'),
      }),
      execute: async ({ characterId, conditionKey, note }) => {
        try {
          const sheet = await mechanicsService.setCondition(
            characterId,
            conditionKey,
            true,
            note ?? null,
          )
          return { success: true, condition: sheet.conditionStates[conditionKey] }
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),

    remove_condition: tool({
      description: 'Remove a condition from a character.',
      inputSchema: z.object({
        characterId: z.string().describe('Character ID'),
        conditionKey: z.string().describe('Condition key'),
      }),
      execute: async ({ characterId, conditionKey }) => {
        try {
          const sheet = await mechanicsService.setCondition(characterId, conditionKey, false, null)
          return { success: true, condition: sheet.conditionStates[conditionKey] }
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),

    grant_xp: tool({
      description: 'Grant XP to a character and handle level ups.',
      inputSchema: z.object({
        characterId: z.string().describe('Character ID'),
        amount: z.number().positive().describe('XP amount'),
      }),
      execute: async ({ characterId, amount }) => {
        try {
          const sheet = await mechanicsService.grantXP(characterId, amount)
          return { success: true, level: sheet.level, xp: sheet.xp }
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),

    award_item: tool({
      description: 'Award a new item to a character or shared stash.',
      inputSchema: z.object({
        storyId: z.string().optional().describe('Story ID'),
        characterId: z
          .string()
          .nullable()
          .optional()
          .describe('Owner character ID or null for shared stash'),
        name: z.string().describe('Item name'),
        description: z.string().optional().describe('Item description'),
        quantity: z.number().optional().describe('Quantity'),
      }),
      execute: async ({ storyId: reqStoryId, characterId, name, description, quantity }) => {
        const targetStoryId = reqStoryId || storyId
        if (!targetStoryId) return { success: false, error: 'Story ID required' }
        try {
          const { database } = await import('$lib/services/database')
          const item = {
            id: crypto.randomUUID(),
            storyId: targetStoryId,
            name,
            description: description ?? null,
            quantity: quantity ?? 1,
            equipped: false,
            location: 'inventory',
            ownerCharacterId: characterId ?? null,
            metadata: { source: 'mechanics' },
            branchId: null,
          }
          await database.addItem(item)
          return { success: true, item }
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),

    remove_item: tool({
      description: 'Remove an item by item ID.',
      inputSchema: z.object({
        itemId: z.string().describe('Item ID'),
      }),
      execute: async ({ itemId }) => {
        try {
          const { database } = await import('$lib/services/database')
          await database.deleteItem(itemId)
          return { success: true, removedItemId: itemId }
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),

    equip_item: tool({
      description: 'Equip or unequip an item for its owner.',
      inputSchema: z.object({
        itemId: z.string().describe('Item ID'),
        equipped: z.boolean().describe('Equipped status'),
        slotKey: z.string().optional().describe('Slot key'),
      }),
      execute: async ({ itemId, equipped, slotKey }) => {
        try {
          const { database } = await import('$lib/services/database')
          await database.updateItem(itemId, { equipped, slotKey: slotKey ?? null })
          return { success: true, itemId, equipped }
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),

    transfer_item: tool({
      description: 'Transfer item ownership to another character or shared stash.',
      inputSchema: z.object({
        itemId: z.string().describe('Item ID'),
        targetCharacterId: z
          .string()
          .nullable()
          .describe('New owner character ID or null for shared stash'),
      }),
      execute: async ({ itemId, targetCharacterId }) => {
        try {
          const { database } = await import('$lib/services/database')
          await database.updateItem(itemId, { ownerCharacterId: targetCharacterId })
          return { success: true, itemId, targetCharacterId }
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),

    adjust_money: tool({
      description: 'Adjust currency balance (+ or -). Fails if balance would go negative.',
      inputSchema: z.object({
        storyId: z.string().optional().describe('Story ID'),
        delta: z.number().describe('Amount delta (+ or -)'),
        reason: z.string().optional().describe('Reason for adjustment'),
      }),
      execute: async ({ storyId: reqStoryId, delta, reason }) => {
        const targetStoryId = reqStoryId || storyId
        if (!targetStoryId) return { success: false, error: 'Story ID required' }
        try {
          const newAmount = await mechanicsService.adjustMoney(
            targetStoryId,
            delta,
            reason ?? 'Mechanics adjust',
          )
          return { success: true, newAmount }
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),

    advance_time: tool({
      description: 'Advance in-story time by minutes.',
      inputSchema: z.object({
        storyId: z.string().optional().describe('Story ID'),
        minutes: z.number().positive().describe('Minutes to advance'),
      }),
      execute: async ({ storyId: reqStoryId, minutes }) => {
        const targetStoryId = reqStoryId || storyId
        if (!targetStoryId) return { success: false, error: 'Story ID required' }
        try {
          const { database } = await import('$lib/services/database')
          const storyData = await database.getStory(targetStoryId)
          if (!storyData) return { success: false, error: 'Story not found' }
          const t = storyData.timeTracker ?? { years: 0, days: 0, hours: 0, minutes: 0 }
          const totalMinutes = t.minutes + minutes
          const hoursToAdd = Math.floor(totalMinutes / 60)
          const newMinutes = totalMinutes % 60
          const totalHours = t.hours + hoursToAdd
          const daysToAdd = Math.floor(totalHours / 24)
          const newHours = totalHours % 24
          const totalDays = t.days + daysToAdd
          const yearsToAdd = Math.floor(totalDays / 365)
          const newDays = totalDays % 365
          const newYears = t.years + yearsToAdd
          const newTime = { years: newYears, days: newDays, hours: newHours, minutes: newMinutes }
          await database.saveTimeTracker(targetStoryId, newTime)
          return { success: true, time: newTime }
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),

    set_scene_mode: tool({
      description: 'Change active scene mode.',
      inputSchema: z.object({
        mode: z
          .enum([
            'free',
            'exploration',
            'travel',
            'camp',
            'settlement',
            'combat',
            'social',
            'downtime',
          ])
          .describe('Scene mode'),
      }),
      execute: async ({ mode }) => {
        try {
          const { campaign: campaignStore } = await import('$lib/stores/campaign.svelte')
          if (!campaignStore.current) return { success: false, error: 'No active campaign' }
          await campaignStore.setSceneMode(mode)
          return { success: true, sceneMode: mode }
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),

    set_active_actor: tool({
      description: 'Set active actor.',
      inputSchema: z.object({
        actorId: z.string().describe('Character ID'),
      }),
      execute: async ({ actorId }) => {
        try {
          const { campaign: campaignStore } = await import('$lib/stores/campaign.svelte')
          if (!campaignStore.current) return { success: false, error: 'No active campaign' }
          await campaignStore.setActiveActor(actorId)
          return { success: true, activeActorId: actorId }
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),

    advance_turn: tool({
      description: 'Advance turn state to next actor.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const { campaign: campaignStore } = await import('$lib/stores/campaign.svelte')
          if (!campaignStore.current) return { success: false, error: 'No active campaign' }
          await campaignStore.advanceTurn()
          return { success: true }
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),

    update_quest_thread: tool({
      description: 'Create or update a campaign quest/plot thread.',
      inputSchema: z.object({
        campaignId: z.string().optional().describe('Campaign ID'),
        threadId: z.string().optional().describe('Thread ID'),
        title: z.string().describe('Title'),
        summary: z.string().optional().describe('Summary'),
        threadType: z
          .enum(['plot', 'quest', 'faction', 'mystery', 'character', 'threat', 'custom'])
          .optional()
          .describe('Type'),
        status: z
          .enum(['active', 'dormant', 'resolved', 'abandoned'])
          .optional()
          .describe('Status'),
        visibility: z.enum(['player_safe', 'director_only']).optional().describe('Visibility'),
        priority: z.number().optional().describe('Priority'),
      }),
      execute: async ({
        campaignId: reqCampId,
        threadId,
        title,
        summary,
        threadType,
        status,
        visibility,
        priority,
      }) => {
        const targetCampId = reqCampId || campaignId
        if (!targetCampId) return { success: false, error: 'Campaign ID required' }
        try {
          const { database } = await import('$lib/services/database')
          const now = Date.now()
          const thread = {
            id: threadId || crypto.randomUUID(),
            campaignId: targetCampId,
            title,
            summary: summary ?? null,
            threadType: threadType ?? 'quest',
            status: status ?? 'active',
            visibility: visibility ?? 'player_safe',
            priority: priority ?? 0,
            clockValue: 0,
            clockMax: null,
            stakes: null,
            createdAt: now,
            updatedAt: now,
          }
          await database.upsertCampaignThread(thread)
          return { success: true, thread }
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),

    finish_mechanics: tool({
      description: 'Signal that mechanics adjustments for this turn are complete.',
      inputSchema: z.object({
        summary: z.string().describe('Summary of mechanics changes made'),
      }),
      execute: async ({ summary }) => {
        return { success: true, finished: true, summary }
      },
    }),
  }
}

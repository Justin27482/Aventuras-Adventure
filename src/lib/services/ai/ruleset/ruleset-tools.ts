import { tool } from 'ai'
import { z } from 'zod'
import type { FullRuleset } from '$lib/types'

const definitionKinds = [
  'stat',
  'skill',
  'check_rule',
  'condition',
  'slot',
  'ability',
  'level',
  'resource',
  'spell',
  'creature',
] as const

export type RulesetDefinitionKind = (typeof definitionKinds)[number]

export interface RulesetProposal {
  id: string
  type: 'create_definition' | 'update_definition' | 'update_ruleset'
  kind?: RulesetDefinitionKind
  definition?: Record<string, unknown>
  updates?: Record<string, unknown>
  reason: string
}

export interface RulesetToolContext {
  ruleset: FullRuleset
  onProposal: (proposal: RulesetProposal) => void
  generateId?: () => string
}

export function createRulesetTools(context: RulesetToolContext) {
  const generateId = context.generateId ?? (() => crypto.randomUUID())

  return {
    read_ruleset: tool({
      description: 'Read the complete current ruleset, including stats, skills, checks, conditions, slots, abilities, levels, resources, spells, and monster stat blocks.',
      inputSchema: z.object({}),
      execute: async () => ({
        ruleset: context.ruleset,
      }),
    }),

    list_definitions: tool({
      description: 'List definitions of one category from the current ruleset. Use this before proposing updates.',
      inputSchema: z.object({
        kind: z.enum(definitionKinds),
      }),
      execute: async ({ kind }) => {
        const collection = {
          stat: context.ruleset.stats,
          skill: context.ruleset.skills,
          check_rule: context.ruleset.checkRules,
          condition: context.ruleset.conditions,
          slot: context.ruleset.slots,
          ability: context.ruleset.abilities,
          level: context.ruleset.levels,
          resource: context.ruleset.resources,
          spell: context.ruleset.spells,
          creature: context.ruleset.creatures,
        }[kind]
        return { kind, total: collection.length, definitions: collection }
      },
    }),

    propose_definition: tool({
      description: 'Propose a new or updated ruleset definition. Proposals require approval and are never applied automatically.',
      inputSchema: z.object({
        kind: z.enum(definitionKinds),
        definition: z.record(z.unknown()).describe('Definition fields appropriate to the selected category.'),
        existingId: z.string().optional().describe('Existing definition ID to update instead of creating a new definition.'),
        reason: z.string().describe('Why this definition should be added or changed.'),
      }),
      execute: async ({ kind, definition, existingId, reason }) => {
        const proposal: RulesetProposal = {
          id: generateId(),
          type: existingId ? 'update_definition' : 'create_definition',
          kind,
          definition: { ...definition, ...(existingId ? { id: existingId } : {}) },
          reason,
        }
        context.onProposal(proposal)
        return { success: true, proposal, message: 'Ruleset definition proposal created; approval is required before applying it.' }
      },
    }),

    propose_ruleset_update: tool({
      description: 'Propose changes to ruleset metadata or encumbrance configuration. Changes require approval.',
      inputSchema: z.object({
        updates: z.record(z.unknown()).describe('Allowed fields include name, description, diceSystem, defaultCheckRuleKey, encumbranceMode, encumbranceCapacityFormula, and inventorySlotCapacityFormula.'),
        reason: z.string().describe('Why this ruleset change is needed.'),
      }),
      execute: async ({ updates, reason }) => {
        const proposal: RulesetProposal = { id: generateId(), type: 'update_ruleset', updates, reason }
        context.onProposal(proposal)
        return { success: true, proposal, message: 'Ruleset update proposal created; approval is required before applying it.' }
      },
    }),

    finish_ruleset_assistant: tool({
      description: 'Finish the ruleset design conversation after answering the user or creating proposals.',
      inputSchema: z.object({ summary: z.string() }),
      execute: async ({ summary }) => ({ completed: true, summary }),
    }),
  }
}

export type RulesetTools = ReturnType<typeof createRulesetTools>

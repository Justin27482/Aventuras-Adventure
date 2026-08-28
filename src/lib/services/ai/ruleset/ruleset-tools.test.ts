import { describe, expect, it } from 'vitest'
import { createRulesetTools, type RulesetProposal } from './ruleset-tools'
import type { FullRuleset } from '$lib/types'

const ruleset: FullRuleset = {
  ruleset: {
    id: 'ruleset-1',
    name: 'Test Ruleset',
    description: null,
    isBuiltin: false,
    diceSystem: 'd20',
    defaultCheckRuleKey: null,
    encumbranceMode: 'slot',
    encumbranceCapacityFormula: '10 + strength',
    inventorySlotCapacityFormula: '10 + strength',
    createdAt: 0,
    updatedAt: 0,
  },
  stats: [],
  skills: [],
  checkRules: [],
  conditions: [],
  slots: [],
  abilities: [],
  spells: [],
  creatures: [],
  levels: [],
  resources: [],
}

describe('createRulesetTools', () => {
  it('creates approval-gated definition proposals', async () => {
    const proposals: RulesetProposal[] = []
    const tools = createRulesetTools({ ruleset, onProposal: (proposal) => proposals.push(proposal) })

    const executeProposal = tools.propose_definition.execute! as (input: Record<string, unknown>, options: unknown) => Promise<any>
    const result = await executeProposal({
      kind: 'spell',
      definition: { key: 'spark', label: 'Spark', level: 0 },
      reason: 'Add a basic utility spell.',
    }, {})

    expect(result.success).toBe(true)
    expect(proposals).toHaveLength(1)
    expect(proposals[0]).toMatchObject({ type: 'create_definition', kind: 'spell' })
  })

  it('lists reusable creature definitions from the current ruleset', async () => {
    const tools = createRulesetTools({ ruleset, onProposal: () => {} })
    const executeList = tools.list_definitions.execute! as (input: Record<string, unknown>, options: unknown) => Promise<any>
    const result = await executeList({ kind: 'creature' }, {})

    expect(result).toEqual({ kind: 'creature', total: 0, definitions: [] })
  })
})

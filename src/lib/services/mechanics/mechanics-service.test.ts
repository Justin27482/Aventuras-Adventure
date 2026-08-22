import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockDatabase } = vi.hoisted(() => ({
  mockDatabase: {
    getCharacterSheet: vi.fn(),
    upsertCharacterSheet: vi.fn(),
  },
}))

vi.mock('$lib/services/database', () => ({
  database: mockDatabase,
}))

import type { FullRuleset } from '$lib/types'
import { mechanicsService } from './mechanics-service'

const RULESET: FullRuleset = {
  ruleset: {
    id: 'd20-classic',
    name: 'd20 Classic',
    description: null,
    isBuiltin: true,
    diceSystem: 'd20',
    defaultCheckRuleKey: 'standard-check',
    createdAt: 0,
    updatedAt: 0,
  },
  stats: [
    { id: 's1', rulesetId: 'd20-classic', key: 'constitution', label: 'Constitution', defaultValue: 12, minValue: 1, maxValue: 20, sortOrder: 0 },
  ],
  skills: [],
  checkRules: [],
  conditions: [
    { id: 'c1', rulesetId: 'd20-classic', key: 'poisoned', label: 'Poisoned', description: null, sortOrder: 0 },
  ],
  slots: [],
  abilities: [],
  levels: [],
  resources: [
    { id: 'r1', rulesetId: 'd20-classic', key: 'health', label: 'Health', maxFormula: '10 + constitution + level * 5', minValue: 0, sortOrder: 0 },
  ],
}

describe('mechanicsService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getOrCreateSheet', () => {
    it('returns an existing sheet without creating a new one', async () => {
      const existing = {
        characterId: 'char-1',
        rulesetId: 'd20-classic',
        statValues: {},
        resourceValues: {},
        conditionStates: {},
        level: 1,
        xp: 0,
        createdAt: 0,
        updatedAt: 0,
      }
      mockDatabase.getCharacterSheet.mockResolvedValue(existing)

      const sheet = await mechanicsService.getOrCreateSheet('char-1', RULESET)

      expect(sheet).toBe(existing)
      expect(mockDatabase.upsertCharacterSheet).not.toHaveBeenCalled()
    })

    it('seeds a new sheet from ruleset defaults, computing resource max via the formula', async () => {
      mockDatabase.getCharacterSheet.mockResolvedValue(null)

      const sheet = await mechanicsService.getOrCreateSheet('char-1', RULESET)

      expect(sheet.statValues).toEqual({ constitution: 12 })
      // 10 + 12 + level(1) * 5 = 27
      expect(sheet.resourceValues.health).toEqual({ current: 27, max: 27 })
      expect(sheet.conditionStates.poisoned).toEqual({ active: false, note: null })
      expect(sheet.level).toBe(1)
      expect(mockDatabase.upsertCharacterSheet).toHaveBeenCalledWith(sheet)
    })
  })

  describe('applyResourceDelta', () => {
    it('clamps the resource within [0, max] and persists the sheet', async () => {
      mockDatabase.getCharacterSheet.mockResolvedValue({
        characterId: 'char-1',
        rulesetId: 'd20-classic',
        statValues: { constitution: 12 },
        resourceValues: { health: { current: 5, max: 27 } },
        conditionStates: {},
        level: 1,
        xp: 0,
        createdAt: 0,
        updatedAt: 0,
      })

      const sheet = await mechanicsService.applyResourceDelta('char-1', 'health', -100)

      expect(sheet.resourceValues.health.current).toBe(0)
      expect(mockDatabase.upsertCharacterSheet).toHaveBeenCalledTimes(1)
    })

    it('throws for an unknown resource key', async () => {
      mockDatabase.getCharacterSheet.mockResolvedValue({
        characterId: 'char-1',
        rulesetId: 'd20-classic',
        statValues: {},
        resourceValues: {},
        conditionStates: {},
        level: 1,
        xp: 0,
        createdAt: 0,
        updatedAt: 0,
      })

      await expect(mechanicsService.applyResourceDelta('char-1', 'mana', -1)).rejects.toThrow(
        /Unknown resource/,
      )
    })

    it('throws when no sheet exists for the character', async () => {
      mockDatabase.getCharacterSheet.mockResolvedValue(null)
      await expect(mechanicsService.applyResourceDelta('char-1', 'health', -1)).rejects.toThrow(
        /No character sheet exists/,
      )
    })
  })

  describe('useAbility', () => {
    it('deducts the cost when affordable', async () => {
      mockDatabase.getCharacterSheet.mockResolvedValue({
        characterId: 'char-1',
        rulesetId: 'd20-classic',
        statValues: {},
        resourceValues: { health: { current: 10, max: 27 } },
        conditionStates: {},
        level: 1,
        xp: 0,
        createdAt: 0,
        updatedAt: 0,
      })

      const sheet = await mechanicsService.useAbility('char-1', 'health', 4)
      expect(sheet.resourceValues.health.current).toBe(6)
    })

    it('rejects use when the resource cannot cover the cost', async () => {
      mockDatabase.getCharacterSheet.mockResolvedValue({
        characterId: 'char-1',
        rulesetId: 'd20-classic',
        statValues: {},
        resourceValues: { health: { current: 1, max: 27 } },
        conditionStates: {},
        level: 1,
        xp: 0,
        createdAt: 0,
        updatedAt: 0,
      })

      await expect(mechanicsService.useAbility('char-1', 'health', 4)).rejects.toThrow(
        /Not enough resource/,
      )
    })
  })

  describe('setCondition', () => {
    it('sets a condition active with a note and persists the sheet', async () => {
      mockDatabase.getCharacterSheet.mockResolvedValue({
        characterId: 'char-1',
        rulesetId: 'd20-classic',
        statValues: {},
        resourceValues: {},
        conditionStates: { poisoned: { active: false, note: null } },
        level: 1,
        xp: 0,
        createdAt: 0,
        updatedAt: 0,
      })

      const sheet = await mechanicsService.setCondition('char-1', 'poisoned', true, 'bitten by a viper')

      expect(sheet.conditionStates.poisoned).toEqual({ active: true, note: 'bitten by a viper' })
      expect(mockDatabase.upsertCharacterSheet).toHaveBeenCalledTimes(1)
    })
  })
})

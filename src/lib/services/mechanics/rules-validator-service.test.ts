import { describe, expect, it } from 'vitest'
import { rulesValidatorService } from './rules-validator-service'

describe('RulesValidatorService', () => {
  it('validates sheet level and resource consistency', () => {
    const validResult = rulesValidatorService.validateSheet({
      characterId: 'c1',
      rulesetId: 'r1',
      statValues: { strength: 10 },
      resourceValues: { health: { current: 10, max: 20 } },
      conditionStates: {},
      level: 1,
      xp: 0,
      createdAt: 1,
      updatedAt: 1,
    })
    expect(validResult.valid).toBe(true)

    const invalidResult = rulesValidatorService.validateSheet({
      characterId: 'c1',
      rulesetId: 'r1',
      statValues: {},
      resourceValues: { health: { current: -5, max: 20 } },
      conditionStates: {},
      level: 0,
      xp: -100,
      createdAt: 1,
      updatedAt: 1,
    })
    expect(invalidResult.valid).toBe(false)
    expect(invalidResult.errors).toContain('Level must be at least 1')
    expect(invalidResult.errors).toContain('XP cannot be negative')
    expect(invalidResult.errors).toContain('Resource "health" current value (-5) cannot be negative')
  })

  it('validates negative money protection', () => {
    expect(rulesValidatorService.validateMoney(100).valid).toBe(true)
    expect(rulesValidatorService.validateMoney(-50).valid).toBe(false)
  })

  it('validates party capacity limits', () => {
    const members = [
      { id: '1', campaignId: 'c', characterId: 'a', active: true, eligibilityStatus: 'eligible' },
      { id: '2', campaignId: 'c', characterId: 'b', active: true, eligibilityStatus: 'eligible' },
      { id: '3', campaignId: 'c', characterId: 'd', active: true, eligibilityStatus: 'eligible' },
    ] as any

    expect(rulesValidatorService.validatePartyLimit(members, 4).valid).toBe(true)
    expect(rulesValidatorService.validatePartyLimit(members, 2).valid).toBe(false)
  })
})

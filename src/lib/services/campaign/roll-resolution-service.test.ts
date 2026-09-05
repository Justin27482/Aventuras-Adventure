import { describe, expect, it } from 'vitest'
import { RollResolutionService } from './roll-resolution-service'

describe('RollResolutionService', () => {
  it('uses the provided display label when formatting a roll', () => {
    const result = RollResolutionService.formatRoll(
      {
        id: 'roll-1',
        campaignId: 'campaign-1',
        sessionId: null,
        actorId: 'character-1',
        notation: 'd20',
        seed: 'seed-1',
        rolls: [14],
        modifier: 0,
        total: 14,
        dc: 12,
        outcome: 'success',
        reason: 'Turn off the tablet',
        visibility: 'player_safe',
        biasApplied: null,
        createdAt: 1,
      },
      'Dexterity Check',
    )

    expect(result.displayLabel).toBe('Dexterity Check')
    expect(result.formattedResult).toContain('**14**')
    expect(result.formattedResult).toContain('Success')
  })
})

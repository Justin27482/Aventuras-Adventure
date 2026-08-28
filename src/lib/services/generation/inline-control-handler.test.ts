import { describe, expect, it } from 'vitest'
import { handleInlineControlTags } from './inline-control-handler'

describe('handleInlineControlTags', () => {
  it('returns clean narrative and typed control intents', () => {
    const result = handleInlineControlTags(
      'The gate shudders. <scene mode="combat"/><roll notation="1d20+2" dc="14" reason="Strike"/>',
      { sceneModes: ['combat'], actorIds: ['alexa'] },
    )

    expect(result.narrative).toBe('The gate shudders. ')
    expect(result.issues).toEqual([])
    expect(result.intents.map((intent) => intent.kind)).toEqual(['scene', 'roll'])
    expect(result.intents[1]).toMatchObject({ notation: '1d20+2', dc: 14, reason: 'Strike' })
  })

  it('does not return invalid tags as executable intents', () => {
    const result = handleInlineControlTags('Text <actor id="enemy"/>', {
      actorIds: ['alexa'],
    })

    expect(result.intents).toEqual([])
    expect(result.issues[0].message).toBe("Unknown actor 'enemy'.")
    expect(result.narrative).toBe('Text ')
  })
})

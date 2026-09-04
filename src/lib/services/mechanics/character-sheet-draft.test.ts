import { describe, expect, it } from 'vitest'
import type { CharacterSheetDraft } from '$lib/types'
import { copyCharacterSheetDraft } from './character-sheet-draft'

describe('copyCharacterSheetDraft', () => {
  it('converts nested reactive proxies into an independent cloneable draft', () => {
    const resource = new Proxy({ current: 4, max: 8 }, {})
    const condition = new Proxy({ active: true, note: 'Distracted' }, {})
    const draft = new Proxy<CharacterSheetDraft>(
      {
        name: 'Kyra',
        description: 'A careful investigator.',
        traits: new Proxy(['careful'], {}),
        visualDescriptors: new Proxy({ eyes: 'green' }, {}),
        sheet: new Proxy(
          {
            rulesetId: 'ruleset-1',
            statValues: new Proxy({ resolve: 12 }, {}),
            resourceValues: new Proxy({ focus: resource }, {}),
            conditionStates: new Proxy({ distracted: condition }, {}),
            level: 2,
            xp: 10,
          },
          {},
        ),
      },
      {},
    )

    const copy = copyCharacterSheetDraft(draft)

    expect(() => structuredClone(copy)).not.toThrow()
    copy.sheet.resourceValues.focus.current = 1
    copy.sheet.conditionStates.distracted.note = null
    expect(resource.current).toBe(4)
    expect(condition.note).toBe('Distracted')
  })
})
import { describe, expect, it } from 'vitest'
import {
  extractInlineControlTags,
  hasIncompleteInlineControlTag,
  stripInlineControlTags,
  validateInlineControlTags,
} from './inlineControlParser'

describe('inline control parser', () => {
  it('extracts roll, scene, turn, and actor tags with attributes and positions', () => {
    const content =
      'Before <scene mode="combat"/> roll <roll notation="1d20+3" dc="15"/> <actor id="alexa"/> <turn action="advance"/>'
    const tags = extractInlineControlTags(content)

    expect(tags.map((tag) => tag.name)).toEqual(['scene', 'roll', 'actor', 'turn'])
    expect(tags[0].attributes).toEqual({ mode: 'combat' })
    expect(tags[1].attributes).toEqual({ notation: '1d20+3', dc: '15' })
    expect(content.slice(tags[2].startIndex, tags[2].endIndex)).toBe('<actor id="alexa"/>')
  })

  it('supports single-quoted attributes and strips recognized tags only', () => {
    expect(stripInlineControlTags("<scene mode='travel'/> Keep this <unknown />")).toBe(
      ' Keep this <unknown />',
    )
  })

  it('identifies an incomplete control tag and safe render boundary', () => {
    const content = 'Narrative <roll notation="1d20"'
    expect(hasIncompleteInlineControlTag(content)).toEqual({
      incomplete: true,
      safeEnd: content.indexOf('<roll'),
    })
    expect(hasIncompleteInlineControlTag('Narrative <roll notation="1d20"/>')).toEqual({
      incomplete: false,
      safeEnd: 'Narrative <roll notation="1d20"/>'.length,
    })
  })

  it('validates tag-specific attributes and known runtime values', () => {
    const tags = extractInlineControlTags(
      '<roll dc="invalid_difficulty"/> <scene mode="unknown"/> <actor id="missing"/> <turn/>',
    )
    const issues = validateInlineControlTags(tags, {
      sceneModes: ['combat'],
      actorIds: ['alexa'],
    })

    expect(issues.map((issue) => issue.message)).toEqual([
      'Roll dc must be a number or valid difficulty word.',
      "Unknown scene mode 'unknown'.",
      "Unknown actor 'missing'.",
      'Turn tag requires action.',
    ])
  })
})

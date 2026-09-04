import { describe, expect, it } from 'vitest'
import { PROMPT_TEMPLATES } from './index'

describe('Narrative helper prompt template', () => {
  it('includes a built-in narrative helper prompt for GM prose polishing', () => {
    const template = PROMPT_TEMPLATES.find((entry) => entry.id === 'narrative-helper')

    expect(template).toBeDefined()
    expect(template?.category).toBe('gm')
    expect(template?.content).toContain('Hard Constraints')
    expect(template?.userContent).toContain('{{ summary }}')
    expect(template?.userContent).toContain('{{ narrativeHelperOperation }}')
    expect(template?.userContent).toContain('{{ previousNarration }}')
  })
})

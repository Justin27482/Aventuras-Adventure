import { describe, expect, it } from 'vitest'
import { PROMPT_TEMPLATES } from './index'

describe('worldbuilding prompt pack contract', () => {
  it('exposes editable conversation and charter expansion prompts', () => {
    const assistant = PROMPT_TEMPLATES.find((entry) => entry.id === 'worldbuilding-assistant')
    const expansion = PROMPT_TEMPLATES.find(
      (entry) => entry.id === 'worldbuilding-charter-expansion',
    )

    expect(assistant?.content).toContain('boundaries as binding')
    expect(assistant?.userContent).toContain('{{ worldbuildingConversation }}')
    expect(expansion?.content).toContain('Preserve all provided facts and boundaries')
    expect(expansion?.userContent).toContain('{{ worldbuildingCharter }}')
  })
})

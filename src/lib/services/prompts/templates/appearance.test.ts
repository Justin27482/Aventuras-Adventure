import { describe, expect, it } from 'vitest'
import { checkPromptPackCompatibility } from '$lib/services/packs/prompt-pack-compatibility'
import { PROMPT_TEMPLATES } from './index'

describe('Appearance Assistant prompt template', () => {
  it('registers editable system and user content with known variables', () => {
    const template = PROMPT_TEMPLATES.find((entry) => entry.id === 'appearance-assistant')

    expect(template).toBeDefined()
    expect(template?.content).toContain('{{ appearanceDescriptorLabels }}')
    expect(template?.userContent).toContain('{{ characterName }}')
    expect(template?.userContent).toContain('{{ currentAppearance }}')
    expect(template?.userContent).toContain('{{ appearanceGuidance }}')

    const report = checkPromptPackCompatibility(
      [
        {
          id: 'appearance-system',
          packId: 'test-pack',
          templateId: template!.id,
          content: template!.content,
          contentHash: '',
          createdAt: 0,
          updatedAt: 0,
        },
        {
          id: 'appearance-user',
          packId: 'test-pack',
          templateId: `${template!.id}-user`,
          content: template!.userContent!,
          contentHash: '',
          createdAt: 0,
          updatedAt: 0,
        },
      ],
      ['appearance-assistant', 'appearance-assistant-user'],
    )

    expect(report).toEqual({ compatible: true, missingTemplateIds: [], issues: [] })
  })
})

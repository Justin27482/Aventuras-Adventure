import { describe, expect, it } from 'vitest'
import type { PackTemplate } from './types'
import { checkPromptPackCompatibility } from './prompt-pack-compatibility'
import { PROMPT_TEMPLATES } from '$lib/services/prompts/templates'

function template(templateId: string, content: string): PackTemplate {
  return {
    id: `${templateId}-row`,
    packId: 'pack-1',
    templateId,
    content,
    contentHash: 'hash',
    createdAt: 1,
    updatedAt: 1,
  }
}

describe('checkPromptPackCompatibility', () => {
  it('reports missing templates without treating them as content errors', () => {
    const report = checkPromptPackCompatibility(
      [template('adventure', 'Hello {{ protagonistName }}')],
      ['adventure', 'gm-core'],
    )

    expect(report.missingTemplateIds).toEqual(['gm-core'])
    expect(report.issues).toEqual([])
    expect(report.compatible).toBe(false)
  })

  it('reports unknown variables while allowing registered campaign variables', () => {
    const report = checkPromptPackCompatibility(
      [
        template(
          'turn-order-context',
          '{{ activeActorName }} {{ sceneMode }} {{ notRegistered }}',
        ),
      ],
      ['turn-order-context'],
    )

    expect(report.issues).toEqual([
      {
        templateId: 'turn-order-context',
        type: 'unknown_variable',
        message: "Template references unknown variable 'notRegistered'",
      },
    ])
  })

  it('reports invalid Liquid syntax', () => {
    const report = checkPromptPackCompatibility(
      [template('adventure', '{% if protagonistName %}broken')],
      ['adventure'],
    )

    expect(report.issues[0]).toMatchObject({
      templateId: 'adventure',
      type: 'syntax',
    })
    expect(report.compatible).toBe(false)
  })

  it('allows lorebook generation context variables', () => {
    const report = checkPromptPackCompatibility(
      [
        template(
          'lorebook-entry-generation-user',
          '{{ entityType }} {{ storyContext }} {{ entryName }} {{ existingDescription }}',
        ),
      ],
      ['lorebook-entry-generation-user'],
    )

    expect(report.issues).toEqual([])
    expect(report.compatible).toBe(true)
  })
})

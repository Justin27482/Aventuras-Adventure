import { beforeEach, describe, expect, it, vi } from 'vitest'

const { generatePlainText, renderStoryPrompt } = vi.hoisted(() => ({
  generatePlainText: vi.fn(),
  renderStoryPrompt: vi.fn(),
}))

vi.mock('$lib/services/ai/sdk', () => ({
  generatePlainText,
}))
vi.mock('$lib/services/prompts', () => ({ renderStoryPrompt }))

import { NarrativeHelperService, buildNarrativeHelperMetadata } from './narrative-helper-service'

describe('NarrativeHelperService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    renderStoryPrompt.mockResolvedValue({
      system: 'CUSTOM NARRATIVE HELPER SYSTEM',
      user: 'CUSTOM NARRATIVE HELPER USER',
    })
  })

  it('expands a GM-ready summary into polished narration', async () => {
    generatePlainText.mockResolvedValue(
      'A tense standoff settles as the party approaches the shrine.',
    )

    const service = new NarrativeHelperService()
    const result = await service.expandSummary({
      storyId: 'campaign-story',
      summary: 'The party reaches the shrine and argues about the relic.',
      sceneSummary: 'The shrine sits beneath a dead moon. Everyone is tense.',
      mood: 'tense',
      audience: 'full_table',
      includeFactCheck: true,
    })

    expect(result).toBe('A tense standoff settles as the party approaches the shrine.')
    expect(renderStoryPrompt).toHaveBeenCalledWith(
      'campaign-story',
      'narrative-helper',
      expect.objectContaining({
        narrativeHelperOperation: 'expand',
        summary: 'The party reaches the shrine and argues about the relic.',
        mood: 'tense',
      }),
    )
    expect(generatePlainText).toHaveBeenCalledWith(
      expect.objectContaining({
        presetId: 'agentic',
        system: 'CUSTOM NARRATIVE HELPER SYSTEM',
        prompt: 'CUSTOM NARRATIVE HELPER USER',
      }),
      'narrative-helper',
    )
  })

  it('regenerates a summary without inventing new facts', async () => {
    generatePlainText.mockResolvedValue(
      'The party approaches the shrine with the relic still uncertain in hand.',
    )

    const service = new NarrativeHelperService()
    const result = await service.regenerate({
      storyId: 'campaign-story',
      summary: 'The party reaches the shrine and argues about the relic.',
      previousText: 'Earlier draft text',
      tone: 'dramatic',
    })

    expect(result).toBe('The party approaches the shrine with the relic still uncertain in hand.')
    expect(renderStoryPrompt).toHaveBeenCalledWith(
      'campaign-story',
      'narrative-helper',
      expect.objectContaining({
        narrativeHelperOperation: 'regenerate',
        previousNarration: 'Earlier draft text',
        mood: 'dramatic',
      }),
    )
    expect(generatePlainText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: 'CUSTOM NARRATIVE HELPER SYSTEM',
        prompt: 'CUSTOM NARRATIVE HELPER USER',
      }),
      'narrative-helper',
    )
  })

  it('captures the source summary and final narration in story metadata for auditability', () => {
    const metadata = buildNarrativeHelperMetadata(
      'The party reaches the shrine and argues about the relic.',
      'The party approaches the shrine with the relic still uncertain in hand.',
    )

    expect(metadata).toMatchObject({
      source: 'gm-narration-helper',
      narrativeHelper: {
        summary: 'The party reaches the shrine and argues about the relic.',
        generatedNarration:
          'The party approaches the shrine with the relic still uncertain in hand.',
      },
    })
  })
})

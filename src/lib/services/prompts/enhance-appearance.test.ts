import { beforeEach, describe, expect, it, vi } from 'vitest'

const { generatePlainText, renderStoryPrompt } = vi.hoisted(() => ({
  generatePlainText: vi.fn(),
  renderStoryPrompt: vi.fn(),
}))

vi.mock('$lib/services/ai/sdk', () => ({ generatePlainText }))
vi.mock('./render-story-prompt', () => ({ renderStoryPrompt }))

import { enhanceAppearance } from './enhance-appearance'

describe('enhanceAppearance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    renderStoryPrompt.mockResolvedValue({ system: 'CUSTOM PACK SYSTEM', user: 'CUSTOM PACK USER' })
    generatePlainText.mockResolvedValue('Face: angular')
  })

  it('renders the active story pack and sends its prompt to the Appearance Assistant model', async () => {
    const result = await enhanceAppearance({
      storyId: 'active-story',
      characterName: 'Elena',
      currentAppearance: '',
      appearanceGuidance: 'weathered traveler',
      descriptorLabels: ['Face', 'Hair', 'Wings'],
    })

    expect(renderStoryPrompt).toHaveBeenCalledWith('active-story', 'appearance-assistant', {
      characterName: 'Elena',
      currentAppearance: '(not yet specified)',
      appearanceGuidance: 'weathered traveler',
      appearanceDescriptorLabels: 'Face, Hair, Wings',
    })
    expect(generatePlainText).toHaveBeenCalledWith(
      {
        presetId: 'agentic',
        system: 'CUSTOM PACK SYSTEM',
        prompt: 'CUSTOM PACK USER',
      },
      'appearanceAssistant',
    )
    expect(result).toBe('Face: angular')
  })
})

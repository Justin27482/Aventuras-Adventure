import { generatePlainText } from '$lib/services/ai/sdk'
import { renderStoryPrompt } from './render-story-prompt'

interface EnhanceAppearanceOptions {
  storyId: string
  characterName: string
  currentAppearance: string
  appearanceGuidance: string
  descriptorLabels: string[]
}

export async function enhanceAppearance(options: EnhanceAppearanceOptions): Promise<string> {
  const { system, user } = await renderStoryPrompt(options.storyId, 'appearance-assistant', {
    characterName: options.characterName,
    currentAppearance: options.currentAppearance || '(not yet specified)',
    appearanceGuidance: options.appearanceGuidance,
    appearanceDescriptorLabels: options.descriptorLabels.join(', '),
  })

  return generatePlainText(
    {
      presetId: 'agentic',
      system,
      prompt: user,
    },
    'appearanceAssistant',
  )
}

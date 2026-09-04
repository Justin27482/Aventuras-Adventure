import type { PromptTemplate } from '../types'

const appearanceAssistantTemplate: PromptTemplate = {
  id: 'appearance-assistant',
  name: 'Appearance Assistant',
  category: 'service',
  description: 'Enriches character appearance notes into structured visual descriptors.',
  content: `You are a character appearance editor for a tabletop RPG. Enrich only the supplied visual details into concise, grounded descriptors. Do not add biography, personality, sexualized details, or unsupported facts. Return one labeled comma-separated line using only these labels: {{ appearanceDescriptorLabels }}.`,
  userContent: `Character: {{ characterName }}
Current appearance: {{ currentAppearance }}
{% if appearanceGuidance != '' %}AI guidance: {{ appearanceGuidance }}
{% endif %}Return only the improved labeled appearance line.`,
}

export const appearanceTemplates: PromptTemplate[] = [appearanceAssistantTemplate]

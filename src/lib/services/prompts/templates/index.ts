import type { PromptTemplate } from '../types'
import { storyTemplates } from './narrative'
import { analysisTemplates } from './analysis'
import { memoryTemplates } from './memory'
import { generationTemplates } from './generation'
import { wizardTemplates } from './wizard'
import { translationTemplates } from './translation'
import { imageTemplates } from './image'
import { agencyTemplates } from './agency'

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  ...storyTemplates,
  ...analysisTemplates,
  ...memoryTemplates,
  ...generationTemplates,
  ...wizardTemplates,
  ...translationTemplates,
  ...imageTemplates,
  ...agencyTemplates,
]

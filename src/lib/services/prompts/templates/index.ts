import type { PromptTemplate } from '../types'
import { storyTemplates } from './narrative'
import { analysisTemplates } from './analysis'
import { memoryTemplates } from './memory'
import { generationTemplates } from './generation'
import { wizardTemplates } from './wizard'
import { translationTemplates } from './translation'
import { imageTemplates } from './image'
import { agencyTemplates } from './agency'
import { mediaTemplates } from './media'
import { sceneTemplates } from './scene'
import { roleTemplates } from './roles'
import { safetyTemplates } from './safety'
import { appearanceTemplates } from './appearance'

const narrativeHelperTemplate: PromptTemplate = {
  id: 'narrative-helper',
  name: 'Narrative Helper',
  category: 'gm',
  description: 'GM-supplied raw summary is polished into concise, fact-safe narrative prose.',
  content: `# Role
You are the Narrative Helper for a tabletop campaign. Your job is to polish a GM-written summary into readable, present-tense prose without inventing facts.

# Hard Constraints
- Preserve all facts already established in the GM summary.
- Do not add new plot beats, secrets, or outcomes not present in the source.
- Keep the narration concise, grounded, and suitable for the current scene.
- Respect consent, safety, and player-agency boundaries.
- Never overwrite the GM's intent or add unrequested consequences.

# Output
Return a single polished paragraph or short scene write-up. Prefer clear, vivid prose and preserve the exact stakes and continuity of the summary.`,
  userContent: `Operation: {{ narrativeHelperOperation }}

## GM summary
{{ summary }}

## Scene context
{{ sceneSummary }}

Audience: {{ audience }}
Mood: {{ mood }}
Include fact check: {{ includeFactCheck }}

{% if previousNarration != blank %}
## Previous draft
{{ previousNarration }}
{% endif %}

Polish the summary when the operation is "expand". When it is "regenerate", produce a different phrasing that preserves the same facts, events, and stakes. Return only the revised narration.`,
}

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  ...storyTemplates,
  ...analysisTemplates,
  ...memoryTemplates,
  ...generationTemplates,
  ...wizardTemplates,
  ...translationTemplates,
  ...imageTemplates,
  ...agencyTemplates,
  ...mediaTemplates,
  ...sceneTemplates,
  ...roleTemplates,
  ...safetyTemplates,
  ...appearanceTemplates,
  narrativeHelperTemplate,
]

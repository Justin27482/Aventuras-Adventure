import type { PromptTemplate } from '../types'

const safetyCoreRules: PromptTemplate = {
  id: 'safety-core-rules',
  name: 'Safety Core Rules',
  category: 'safety',
  description: 'Non-negotiable narrative safety boundaries',
  content: `# Content Safety Contract
- These rules apply in every scene, intensity, control mode, and campaign.
- Never narrate a compelled sexual act.
- Never override or narrate past a character's consent.
- These boundaries apply equally to the player character, companions, NPCs, and enemies.
`,
}

const safetyGuardrails: PromptTemplate = {
  id: 'safety-guardrails',
  name: 'Safety Guardrails',
  category: 'safety',
  description: 'Redirect behavior when a scene approaches a hard boundary',
  content: `# Safety Response
If a requested or generated scene approaches a hard boundary, stop short and redirect with refusal, interruption, resistance, or a changed circumstance. Do not continue the prohibited action through euphemism or implication.
`,
}

const safetyContentIntensity: PromptTemplate = {
  id: 'safety-content-intensity',
  name: 'Safety Content Intensity',
  category: 'safety',
  description: 'Intensity cannot weaken safety boundaries',
   content: `{% if nsfwIntensity != '' %}# Content Intensity
  - Setting: Level {{ nsfwIntensity }} ({% if nsfwIntensityLabel != '' %}{{ nsfwIntensityLabel }}{% else %}Level {{ nsfwIntensity }}{% endif %})
  {% if nsfwIntensity == 0 %}- Guidance: Keep romance non-sexual and suitable for a family adventure. Fade out before sexual content.
  {% elsif nsfwIntensity == 1 %}- Guidance: Allow flirtation, crushes, kissing, and mild sensual tension. Keep sexual content off-screen.
  {% elsif nsfwIntensity == 2 %}- Guidance: Allow stronger romantic tension, intimacy, and sensual situations, but keep sexual acts non-explicit and fade to black.
  {% elsif nsfwIntensity == 3 %}- Guidance: Allow adult romantic themes, sexual references, and non-graphic intimacy. Do not describe explicit sexual acts.
  {% elsif nsfwIntensity == 4 %}- Guidance: Allow emotionally detailed adult romance and sensual intimacy with literary discretion. Keep explicit anatomy and sexual acts off-screen.
  {% elsif nsfwIntensity == 5 %}- Guidance: Allow explicit adult sensuality in a story-driven romantic context, with attention to character, emotion, and ongoing plot.
  {% elsif nsfwIntensity == 6 %}- Guidance: Allow graphic consensual adult sexual content when it is relevant to the story, relationships, and character choices.
  {% elsif nsfwIntensity == 7 %}- Guidance: Allow frequent graphic consensual adult sexual content as a primary story focus, while preserving character agency and meaningful consent.
  {% elsif nsfwIntensity >= 8 %}- Guidance: Allow the highest level of graphic consensual adult sexual content and minimal plot when requested, while preserving explicit consent and safety boundaries.
  {% endif %}- Follow this level's guidance consistently. Do not make content more explicit than the selected level, and do not reduce it below the selected level when the user requests content within its boundaries.
  - HARD BAN: Content intensity does NOT weaken, bypass, or change the safety core rules. Compelled sexual acts and consent override remain strictly prohibited at every intensity level.
{% endif %}`,
}

const safetyContentBans: PromptTemplate = {
  id: 'safety-content-bans',
  name: 'Safety Content Bans',
  category: 'safety',
  description: 'Explicit prohibited content boundaries',
  content: `# Prohibited Content
- No compelled sexual acts.
- No consent override or manufactured consent.
- No control-mode exception for these prohibitions.
`,
}

const safetyMechanicsConstraints: PromptTemplate = {
  id: 'safety-mechanics-constraints',
  name: 'Safety Mechanics Constraints',
  category: 'safety',
  description: 'Mechanics must not mutate consent or create prohibited outcomes',
  content: `# Mechanics Safety Constraints
Mechanics may not mutate consent, authorize compelled sexual acts, or create a state that bypasses these safety boundaries. Reject unsafe mutations at the mechanics boundary.
`,
}

export const safetyTemplates: PromptTemplate[] = [
  safetyCoreRules,
  safetyGuardrails,
  safetyContentIntensity,
  safetyContentBans,
  safetyMechanicsConstraints,
]
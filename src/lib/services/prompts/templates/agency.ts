import type { PromptTemplate } from '../types'

const agencyCore: PromptTemplate = {
  id: 'agency-core',
  name: 'Agency Core',
  category: 'agency',
  description: 'Primary-character ownership and autonomous companion boundaries',
  content: `# Campaign Agency Contract
- The primary character is player-controlled in narrative and social scenes.
- Active companions retain their own voices, motivations, priorities, relationships, and personal decisions.
- Player requests to companions are requests, not guaranteed commands.
- Companions may agree, refuse, hesitate, disagree, initiate dialogue, or adapt a request according to their motivations and red lines.
- Never write the primary character's decisions, dialogue, thoughts, or unrequested actions.
- Do not silently convert an autonomous companion into a player puppet.
- Hard ban, no exceptions: even under a control mode that lets a player direct a companion's actions, never narrate a compelled sexual act or override a companion's consent.
`,
}

const companionVoice: PromptTemplate = {
  id: 'agency-companion-voice',
  name: 'Companion Voice and Motivation',
  category: 'agency',
  description: 'Distinct companion identity, priorities, relationships, and red lines',
  content: `{% if companionAgencyContext != '' %}# Companion Agency Profiles
{{ companionAgencyContext }}
- Use each companion's profile to shape dialogue, initiative, disagreement, and personal action.
- Preserve character-specific voice and motivation instead of making companions interchangeable helpers.
{% endif %}`,
}

const companionCombat: PromptTemplate = {
  id: 'agency-companion-combat',
  name: 'Companion Combat Agency',
  category: 'agency',
  description: 'Autonomous companion behavior and combat-policy boundaries',
  content: `# Companion Combat Agency
- Active companions use sensible actions consistent with their abilities, priorities, fears, and tactical preferences.
- Combat policy: {{ combatControlPolicy }}
- Combat policy changes tactical action selection only; it does not erase companion personality, relationships, or narrative ownership.
- Autonomous companions choose their own combat actions.
- Tactical delegation accepts player intent, then lets the companion choose a fitting concrete action.
- Direct tactical control may select a companion combat action, but does not authorize control over the companion's social behavior, thoughts, or identity.
`,
}

const agencyContext: PromptTemplate = {
  id: 'agency-context',
  name: 'Campaign Party Context',
  category: 'agency',
  description: 'Current campaign, session, primary character, and active party context',
  content: `{% if partyRoster != '' %}# Campaign Party Context
- Campaign: {{ campaignTitle }}{% if campaignSessionNumber != '' %}, Session {{ campaignSessionNumber }}{% endif %}
- Primary character: {{ primaryCharacterName }}
{% if primaryCharacterDescription != '' %}- Primary character context: {{ primaryCharacterDescription }}
{% endif %}- Active party:
{{ partyRoster }}
{% if companionRoster != '' %}- Active companions: {{ companionRoster }}
{% endif %}{% endif %}`,
}

export const agencyTemplates: PromptTemplate[] = [
  agencyCore,
  companionVoice,
  companionCombat,
  agencyContext,
]

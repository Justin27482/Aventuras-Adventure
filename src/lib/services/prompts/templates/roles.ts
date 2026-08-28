import type { PromptTemplate } from '../types'

const worldCharterContext: PromptTemplate = {
  id: 'world-charter-context',
  name: 'World Charter Context',
  category: 'gm',
  description: 'Established campaign truths and director guidance',
  content: `{% if worldCharter != '' %}# World Charter
{{ worldCharter }}
{% endif %}`,
}

const rulesDigestContext: PromptTemplate = {
  id: 'rules-digest-context',
  name: 'Rules Digest Context',
  category: 'gm',
  description: 'Compact active ruleset and check guidance',
  content: `{% if rulesetDigest != '' %}# Rules Digest
{{ rulesetDigest }}
{% endif %}`,
}

const partyRosterContext: PromptTemplate = {
  id: 'party-roster-context',
  name: 'Party Roster Context',
  category: 'agency',
  description: 'Active party members and control modes',
  content: `{% if partyRoster != '' %}# Active Party Roster
{{ partyRoster }}
{% endif %}{% if companionRoster != '' %}- Active companions: {{ companionRoster }}
{% endif %}`,
}

const narrativePriming: PromptTemplate = {
  id: 'narrative-priming',
  name: 'Narrative Priming',
  category: 'story',
  description: 'Conversation-role primer for narrative generation',
  content: `You are the narrator of this interactive adventure. Write in {{ tense }} tense, {% if pov == 'third' %}third person (they/the character name).{% else %}second person (you/your).{% endif %}

Your role:
- Control NPCs and the environment while resolving the currently acting character's action.
- Never write the currently acting character's unsubmitted dialogue, decisions, or inner thoughts.
{% if pov == 'third' %}- Refer to the currently acting character as {{ activeActorName }} or they/them.
{% else %}- Describe what the player experiences as the currently acting character.
{% endif %}
- Begin by resolving the current action and leave a natural opening for the next action.`,
}

export const roleTemplates: PromptTemplate[] = [
  worldCharterContext,
  rulesDigestContext,
  partyRosterContext,
  narrativePriming,
]

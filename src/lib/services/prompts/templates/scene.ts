import type { PromptTemplate } from '../types'

const sceneContext: PromptTemplate = {
  id: 'scene-context',
  name: 'Scene Context',
  category: 'gm',
  description: 'Mode-specific guidance for the current campaign scene',
  content: `{% if sceneMode == 'combat' %}# Combat Scene
- Treat the scene as an active encounter with meaningful tactical stakes.
- Track threats, positioning, consequences, and opportunities for each exchange.
- Do not resolve the entire encounter in one paragraph; leave room for the next action.
{% elsif sceneMode == 'travel' %}# Travel Scene
- Emphasize route choices, changing conditions, discoveries, and travel costs.
- Advance the journey without skipping meaningful decisions or encounters.
{% elsif sceneMode == 'social' or sceneMode == 'settlement' %}# Social Scene
- Give NPCs distinct goals, leverage, reactions, and points of disagreement.
- Let conversation produce concrete opportunities, costs, information, or complications.
{% elsif sceneMode == 'camp' or sceneMode == 'downtime' %}# Downtime Scene
- Favor recovery, relationships, preparation, personal projects, and consequences that develop over time.
- Use a quieter pace while preserving meaningful choices and unresolved threads.
{% elsif sceneMode == 'exploration' %}# Exploration Scene
- Reward investigation with concrete discoveries, useful details, and navigable choices.
- Keep spatial and environmental continuity clear.
{% endif %}`,
}

const narrativeTurn: PromptTemplate = {
  id: 'narrative-turn',
  name: 'Narrative Turn',
  category: 'gm',
  description: 'Turn-type guidance for narrative response generation',
  content: `{% if turnType == 'scene_transition' %}# Scene Transition Turn
Establish the new scene clearly, connect it to prior events, and end with a concrete opening for action.
{% elsif turnType == 'npc_action' %}# NPC Action Turn
Advance an NPC or environmental response while preserving the player's control of the active character.
{% elsif turnType == 'roll_request' %}# Roll Request Turn
Describe the immediate stakes and what is being tested. Do not decide the player's result; leave the roll to the mechanics flow.
{% elsif turnType == 'action_resolution' %}# Action Resolution Turn
Resolve the active character's submitted action with concrete consequences while preserving their unsubmitted decisions and thoughts.
{% elsif turnType == 'qa' %}# QA Turn
Prioritize explicit state continuity and observable outcomes for the current test scenario.
{% else %}# Narrative Turn
Respond to the active character's action and preserve the current scene's momentum.
{% endif %}`,
}

export const sceneTemplates: PromptTemplate[] = [sceneContext, narrativeTurn]

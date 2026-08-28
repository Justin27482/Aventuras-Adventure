import type { ModelMessage } from 'ai'
import { BaseAIService } from '../BaseAIService'
import { createAgentFromPreset, stopWhenDone } from '../sdk/agents'
import { createRulesetTools, type RulesetProposal, type RulesetTools } from './ruleset-tools'
import type { FullRuleset } from '$lib/types'

export interface RulesetAssistantContext {
  ruleset: FullRuleset
  onProposal: (proposal: RulesetProposal) => void
}

export type RulesetAssistantResult = {
  text: string
  proposals: RulesetProposal[]
}

export class RulesetAssistantService extends BaseAIService {
  private history: ModelMessage[] = []

  reset(): void {
    this.history = []
  }

  async runSession(
    context: RulesetAssistantContext,
    userMessage: string,
    signal?: AbortSignal,
  ): Promise<RulesetAssistantResult> {
    const proposals: RulesetProposal[] = []
    const tools = createRulesetTools({
      ruleset: JSON.parse(JSON.stringify(context.ruleset)) as FullRuleset,
      onProposal: (proposal) => {
        proposals.push(proposal)
        context.onProposal(proposal)
      },
    })

    this.history.push({ role: 'user', content: userMessage })
    const assistant = createAgentFromPreset<RulesetTools>(
      {
        presetId: this.presetId,
        instructions: [
          'You are a ruleset design assistant for a tabletop campaign engine.',
          'Help the user design coherent, reusable mechanics for stats, skills, checks, conditions, slots, abilities, spells, resources, monsters, and encumbrance.',
          'Inspect the current ruleset before suggesting changes when details matter.',
          'Never apply mutations directly. Use proposal tools and explain that approval is required.',
          'Preserve player agency and do not create mechanics that compel sexual acts or override consent.',
          'Finish with a concise summary after answering or creating proposals.',
        ].join('\n'),
        tools,
        stopWhen: stopWhenDone(12),
        signal,
      },
      'ruleset-assistant',
    )

    const result = await assistant.agent.generate({ messages: this.history })
    const response = result.response
    this.history.push(...response.messages)

    const textParts = response.messages
      .filter((message) => message.role === 'assistant')
      .flatMap((message) => (typeof message.content === 'string' ? [message.content] : []))

    return { text: textParts.join('\n').trim(), proposals }
  }
}

export const rulesetAssistantService = new RulesetAssistantService('rulesetAssistant')

import type { InteractionAudience } from '$lib/types'
import { ContextBuilder } from '$lib/services/context/context-builder'
import { AIPlayerProposalService } from './proposal-service'
import { AIPlayerConsensusService } from './consensus-service'
import { NarrativeHelperService } from './narrative-helper-service'

export interface AIPlayerTurnFlowInput {
  storyId: string
  campaignId: string
  aiPlayerId: string
  characterId: string
  sceneMode: string
  sceneSummary: string
  goal?: string
  targetLength?: string
  recentActions?: string[]
  audience: InteractionAudience
}

export interface AIPlayerTurnFlowOutput {
  proposalId: string
  action: string
  reasoning: string
  confidence: number
  consensusMessages: string[]
  consensusInterrupted: boolean
  consensusTimedOut: boolean
}

/**
 * AIPlayerTurnOrchestrator handles the full turn flow for an AI player:
 * 1. Inject scoped context (audience-gated knowledge)
 * 2. Generate proposal
 * 3. Run optional rate-limited consensus
 * 4. Return for GM narration
 *
 * Implements G.3 from the engineering tasks.
 * Not responsible for persistence; caller persists proposal, consensus, and final narration.
 */
export class AIPlayerTurnOrchestrator {
  private proposalService = new AIPlayerProposalService()
  private consensusService = new AIPlayerConsensusService()
  private narrativeService = new NarrativeHelperService()

  async generateProposal(input: AIPlayerTurnFlowInput): Promise<{
    proposalId: string
    action: string
    reasoning: string
    confidence: number
  }> {
    const proposal = await this.proposalService.generateProposal({
      storyId: input.storyId,
      campaignId: input.campaignId,
      aiPlayerId: input.aiPlayerId,
      characterId: input.characterId,
      sceneMode: input.sceneMode,
      sceneSummary: input.sceneSummary,
      goal: input.goal,
      targetLength: input.targetLength,
      recentActions: input.recentActions,
      audience: input.audience,
    })

    return {
      proposalId: proposal.id,
      action: proposal.action,
      reasoning: proposal.reasoning,
      confidence: proposal.confidence,
    }
  }

  async runConsensus(
    proposal: { proposalId: string; action: string },
    config?: {
      maxExchanges?: number
      messageDelayMs?: number
      timeoutMs?: number
      onMessage?: (message: { aiPlayerId: string; content: string }) => void
      onTyping?: (state: { aiPlayerId: string; delayMs: number }) => void
      signal?: AbortSignal
    },
  ): Promise<{
    messages: string[]
    interrupted: boolean
    timedOut: boolean
  }> {
    const result = await this.consensusService.run({
      proposals: [
        {
          id: proposal.proposalId,
          aiPlayerId: '',
          characterId: '',
          campaignId: '',
          sceneMode: '',
          action: proposal.action,
          reasoning: '',
          confidence: 0,
          reviewStatus: 'pending',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      generateMessage: async () => 'OOC consensus placeholder',
      config: {
        maxExchanges: config?.maxExchanges ?? 3,
        messageDelayMs: config?.messageDelayMs ?? 1000,
      },
      onMessage: config?.onMessage,
      onTyping: config?.onTyping,
      signal: config?.signal,
    })

    return {
      messages: result.messages.map((m) => m.content),
      interrupted: result.interrupted,
      timedOut: result.timedOut,
    }
  }

  async expandNarration(
    storyId: string,
    summary: string,
    options?: {
      mood?: 'tense' | 'mystical' | 'dramatic' | 'light' | 'neutral'
      signal?: AbortSignal
    },
  ): Promise<string> {
    return this.narrativeService.expandSummary({
      storyId,
      summary,
      mood: options?.mood,
      signal: options?.signal,
    })
  }
}

export const aiPlayerTurnOrchestrator = new AIPlayerTurnOrchestrator()

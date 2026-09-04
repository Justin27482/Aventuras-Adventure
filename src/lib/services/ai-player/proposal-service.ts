import { z } from 'zod'
import { generateStructured } from '$lib/services/ai/sdk'
import { ContextBuilder } from '$lib/services/context/context-builder'
import { packService } from '$lib/services/packs/pack-service'
import type { AIPlayerProposal, InteractionAudience } from '$lib/types'

const proposalResultSchema = z.object({
  action: z.string().min(1),
  reasoning: z.string().min(1),
  confidence: z.number().min(1).max(10),
})

export interface AIPlayerProposalRequest {
  storyId: string
  campaignId: string
  aiPlayerId: string
  characterId: string
  sceneMode: string
  sceneSummary: string
  recentActions?: string[]
  goal?: string
  targetLength?: string
  audience?: InteractionAudience
}

export class AIPlayerProposalService {
  async generateProposal(request: AIPlayerProposalRequest): Promise<AIPlayerProposal> {
    const audience = request.audience ?? { kind: 'full_table' as const }
    const context = await ContextBuilder.forAIPlayer(
      request.storyId,
      request.aiPlayerId,
      undefined,
      audience,
      request.recentActions,
    )
    context.add({
      sceneMode: request.sceneMode,
      narrativeResponse: request.sceneSummary,
      aiPlayerSceneGoal: request.goal ?? '',
      aiPlayerTargetLength: request.targetLength ?? '',
      aiPlayerRecentActions: (request.recentActions ?? []).join('\n'),
    })
    // Guard against a pack missing this template row, which would otherwise render
    // empty and silently fall back to the generic prompt below with no GM guidance.
    await packService.ensurePromptTemplateComplete(context.getPackId(), 'ai-player-proposal')
    const renderedContext = context.getContext()
    const proposalPrompt = await context.render('ai-player-proposal')
    const result = await generateStructured(
      {
        presetId: 'agentic',
        schema: proposalResultSchema,
        system: proposalPrompt.system || renderedContext.aiPlayerPrompt || 'You are an AI Player.',
        prompt: proposalPrompt.user || 'Propose one concrete, playable action for your character.',
      },
      'aiPlayerProposal',
    )

    return {
      id: crypto.randomUUID(),
      aiPlayerId: request.aiPlayerId,
      characterId: request.characterId,
      campaignId: request.campaignId,
      sceneMode: request.sceneMode,
      action: result.action,
      reasoning: result.reasoning,
      confidence: result.confidence,
      reviewStatus: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
  }

  async generateProposals(requests: AIPlayerProposalRequest[]): Promise<AIPlayerProposal[]> {
    return Promise.all(requests.map((request) => this.generateProposal(request)))
  }
}

export const aiPlayerProposalService = new AIPlayerProposalService()

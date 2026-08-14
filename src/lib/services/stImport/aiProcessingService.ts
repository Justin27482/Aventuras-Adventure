import { z } from 'zod'
import { BaseAIService } from '$lib/services/ai/BaseAIService'
import { ContextBuilder } from '$lib/services/context'
import type { POV } from '$lib/types'
import type { Tense } from '$lib/services/ai/wizard/ScenarioService'
import type { STChatMessage } from '$lib/services/stChatImporter'

type DetectionConfidence = 'low' | 'medium' | 'high'

const stStyleDetectionSchema = z.object({
  pov: z.enum(['first', 'second', 'third']),
  tense: z.enum(['past', 'present']),
  confidence: z.enum(['low', 'medium', 'high']),
  rationale: z.string().max(400).optional().default(''),
})

const stRewriteBatchSchema = z.object({
  messages: z
    .array(
      z.object({
        index: z.number().int().min(0),
        content: z.string().min(1),
      }),
    )
    .default([]),
})

export interface STStyleDetectionResult {
  pov: POV
  tense: Tense
  confidence: DetectionConfidence
  rationale: string
}

export class STImportAIProcessingService extends BaseAIService {
  constructor() {
    super('stImportProcessing')
  }

  async detectStyle(messages: STChatMessage[], packId: string): Promise<STStyleDetectionResult> {
    const sample = messages
      .slice(0, 80)
      .map((m, i) => `${i + 1}. [${m.type}] ${m.content}`)
      .join('\n')

    const ctx = new ContextBuilder(packId)
    ctx.add({ messagesSample: sample || '(no messages)' })
    const { system, user } = await ctx.render('st-import-style-detection')

    const result = await this.generate(
      stStyleDetectionSchema,
      system,
      user,
      'st-import-style-detection',
      {
        reasoningEffortOverride: 'low',
        reasoningMaxTokensOverride: 512,
      },
    )

    return {
      pov: result.pov,
      tense: result.tense,
      confidence: result.confidence,
      rationale: result.rationale || '',
    }
  }

  async rewriteBatch(
    messages: STChatMessage[],
    packId: string,
    targetPOV: POV,
    targetTense: Tense,
    toneGuidance: string,
  ): Promise<STChatMessage[]> {
    if (messages.length === 0) return []

    const ctx = new ContextBuilder(packId)
    ctx.add({
      targetPOV,
      targetTense,
      toneGuidance: toneGuidance || 'Keep voice natural and immersive.',
      messagesJson: JSON.stringify(
        messages.map((m, index) => ({ index, type: m.type, content: m.content })),
        null,
        2,
      ),
    })

    const { system, user } = await ctx.render('st-import-style-rewrite')
    const result = await this.generate(
      stRewriteBatchSchema,
      system,
      user,
      'st-import-style-rewrite',
      {
        reasoningEffortOverride: 'low',
        reasoningMaxTokensOverride: 768,
      },
    )

    if (!result.messages?.length) return messages

    const byIndex = new Map(result.messages.map((m) => [m.index, m.content.trim()]))
    return messages.map((msg, index) => {
      const rewritten = byIndex.get(index)
      if (!rewritten) return msg
      return { ...msg, content: rewritten }
    })
  }

  async cleanupBatch(messages: STChatMessage[], packId: string): Promise<STChatMessage[]> {
    if (messages.length === 0) return []

    const ctx = new ContextBuilder(packId)
    ctx.add({
      messagesJson: JSON.stringify(
        messages.map((m, index) => ({ index, type: m.type, content: m.content })),
        null,
        2,
      ),
    })

    const { system, user } = await ctx.render('st-import-creative-cleanup')
    const result = await this.generate(
      stRewriteBatchSchema,
      system,
      user,
      'st-import-creative-cleanup',
      {
        reasoningEffortOverride: 'low',
        reasoningMaxTokensOverride: 768,
      },
    )

    if (!result.messages?.length) return messages

    const byIndex = new Map(result.messages.map((m) => [m.index, m.content.trim()]))
    return messages.map((msg, index) => {
      const cleaned = byIndex.get(index)
      if (!cleaned) return msg
      return { ...msg, content: cleaned }
    })
  }
}

export const stImportAIProcessingService = new STImportAIProcessingService()

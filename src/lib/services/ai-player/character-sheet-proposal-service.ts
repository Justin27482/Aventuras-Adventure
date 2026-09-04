import { z } from 'zod'
import { generateStructured } from '$lib/services/ai/sdk'
import { database } from '$lib/services/database'
import { renderPackPrompt } from '$lib/services/prompts'
import { renderAIPlayerVoiceProfile } from './personality-service'
import type { CharacterSheetProposal, FullRuleset } from '$lib/types'

const draftSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  traits: z.array(z.string()),
  visualDescriptors: z.record(z.string()),
  sheet: z.object({
    rulesetId: z.string(),
    statValues: z.record(z.number()),
    resourceValues: z.record(z.object({ current: z.number(), max: z.number() })),
    conditionStates: z.record(z.object({ active: z.boolean(), note: z.string().nullable() })),
    level: z.number().int().min(1),
    xp: z.number().int().min(0),
  }),
})

export class CharacterSheetProposalService {
  async generate(input: {
    storyId: string
    campaignId: string
    setupSessionId: string | null
    aiPlayerId: string
    ruleset: FullRuleset
    guidance?: string
  }): Promise<CharacterSheetProposal> {
    const [player, story, campaignSettings, packId] = await Promise.all([
      database.getAIPlayer(input.aiPlayerId),
      database.getStory(input.storyId),
      database.getCampaignSettings(input.campaignId),
      database.getStoryPackId(input.storyId),
    ])
    if (!player || !story) throw new Error('AI Player or campaign story is unavailable')
    const voice = renderAIPlayerVoiceProfile(player)
    const prompt = await renderPackPrompt(packId ?? 'default-pack', 'ai-player-character-sheet', {
      aiPlayerVoicePrompt: voice,
      characterCreationWorldContext: [
        story.title,
        story.description,
        campaignSettings?.worldCharter,
      ]
        .filter(Boolean)
        .join('\n\n'),
      characterCreationRuleset: JSON.stringify({
        id: input.ruleset.ruleset.id,
        stats: input.ruleset.stats,
        resources: input.ruleset.resources,
        conditions: input.ruleset.conditions,
        skills: input.ruleset.skills,
        slots: input.ruleset.slots,
      }),
      characterCreationGuidance:
        input.guidance?.trim() || 'Create a campaign-appropriate character.',
    })
    const payload = await generateStructured(
      { presetId: 'agentic', schema: draftSchema, system: prompt.system, prompt: prompt.user },
      'aiPlayerCharacterSheetProposal',
    )
    const proposal: CharacterSheetProposal = {
      id: crypto.randomUUID(),
      campaignId: input.campaignId,
      setupSessionId: input.setupSessionId,
      aiPlayerId: input.aiPlayerId,
      characterId: null,
      proposalType: 'create',
      payload,
      status: 'pending',
      reviewNotes: null,
      createdAt: Date.now(),
      reviewedAt: null,
    }
    await database.upsertCharacterSheetProposal(proposal)
    return proposal
  }
}

export const characterSheetProposalService = new CharacterSheetProposalService()

import { generateStructured } from '$lib/services/ai/sdk'
import { z } from 'zod'
import type { Campaign, CampaignSettings } from '$lib/types'

const encounterPrerollSchema = z.object({
  name: z.string().min(1),
  enemies: z.string().min(1),
  difficulty: z.enum(['trivial', 'easy', 'moderate', 'hard', 'deadly']),
  description: z.string().min(1),
  environmentalHazards: z.string().optional(),
})

const lootPrerollSchema = z.object({
  itemName: z.string().min(1),
  rarity: z.enum(['common', 'uncommon', 'rare', 'very_rare', 'legendary']),
  type: z.string().min(1),
  description: z.string().min(1),
  estimatedGold: z.number().min(0),
})

export interface PrerolledEncounter {
  id: string
  name: string
  enemies: string
  difficulty: 'trivial' | 'easy' | 'moderate' | 'hard' | 'deadly'
  description: string
  environmentalHazards?: string
}

export interface PrerolledLoot {
  id: string
  itemName: string
  rarity: 'common' | 'uncommon' | 'rare' | 'very_rare' | 'legendary'
  type: string
  description: string
  estimatedGold: number
}

export class PrerollService {
  async prerollEncountersForSession(
    campaign: Campaign,
    settings: CampaignSettings,
    sceneMode: string,
    count: number = 15,
  ): Promise<PrerolledEncounter[]> {
    if (count <= 0) throw new Error('Encounter count must be at least 1')
    if (count > 30) throw new Error('Cannot pre-roll more than 30 encounters at once')

    const encounters: PrerolledEncounter[] = []
    const systemPrompt = [
      `You are generating tabletop RPG encounters for a campaign in ${settings.worldCharter ? 'a specific world' : 'a generic fantasy setting'}.`,
      `Scene mode: ${sceneMode}`,
      `Party intensity level: ${settings.nsfwIntensity}/8`,
      'Generate varied, interesting encounters that fit the current scene mode.',
      'Difficulty should vary across the set.',
    ].join('\n')

    for (let i = 0; i < count; i++) {
      const result = await generateStructured(
        {
          presetId: 'agentic',
          schema: encounterPrerollSchema,
          system: systemPrompt,
          prompt: `Generate encounter ${i + 1}/${count} for a ${sceneMode} scene. Return JSON only.`,
        },
        'preroll-encounter',
      )

      encounters.push({
        id: crypto.randomUUID(),
        name: result.name,
        enemies: result.enemies,
        difficulty: result.difficulty,
        description: result.description,
        environmentalHazards: result.environmentalHazards,
      })
    }

    return encounters
  }

  async prerollLootForSession(
    campaign: Campaign,
    settings: CampaignSettings,
    expectedEnemyCount: number = 5,
  ): Promise<PrerolledLoot[]> {
    if (expectedEnemyCount <= 0) throw new Error('Expected enemy count must be at least 1')

    const lootItems: PrerolledLoot[] = []
    const count = Math.min(expectedEnemyCount + 2, 10) // Pre-roll 2 extra in case GM needs more

    const systemPrompt = [
      `You are generating loot drops for a tabletop RPG campaign.`,
      `Campaign intensity: ${settings.nsfwIntensity}/8`,
      `Expected enemy count: ${expectedEnemyCount}`,
      'Generate varied loot appropriate for the campaign tone.',
      'Include a mix of rarities, but skew common->uncommon for low enemy counts.',
    ].join('\n')

    for (let i = 0; i < count; i++) {
      const result = await generateStructured(
        {
          presetId: 'agentic',
          schema: lootPrerollSchema,
          system: systemPrompt,
          prompt: `Generate loot item ${i + 1}/${count}. Return JSON only.`,
        },
        'preroll-loot',
      )

      lootItems.push({
        id: crypto.randomUUID(),
        itemName: result.itemName,
        rarity: result.rarity,
        type: result.type,
        description: result.description,
        estimatedGold: result.estimatedGold,
      })
    }

    return lootItems
  }
}

export const prerollService = new PrerollService()

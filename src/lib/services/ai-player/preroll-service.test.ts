import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Campaign, CampaignSettings } from '$lib/types'
import { PrerollService } from './preroll-service'

const { generateStructured } = vi.hoisted(() => ({
  generateStructured: vi.fn(),
}))

vi.mock('$lib/services/ai/sdk', () => ({ generateStructured }))

describe('PrerollService (Phase F)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const campaign: Campaign = {
    id: 'campaign-1',
    storyId: 'story-1',
    title: 'Ashfall',
    description: 'A falling ash campaign',
    rulesetId: 'ruleset-1',
    spotlightCharacterId: null,
    status: 'active',
    createdAt: 1000,
    updatedAt: 1000,
  }

  const settings: CampaignSettings = {
    campaignId: 'campaign-1',
    defaultPartySize: 4,
    maxPartySize: 6,
    sceneMode: 'combat',
    turnOrderMode: 'standard',
    diceEnforcement: 'strict',
    nsfwIntensity: 4,
    worldCharter: 'A world in decline.',
    gmPersona: 'Fair and impartial.',
    companionCombatPolicy: 'companions_autonomous',
    aiPlayersEnabled: false,
    defaultAIPlayerCount: 0,
    createdAt: 1000,
    updatedAt: 1000,
  }

  it('pre-rolls 15 encounters by default (F.1)', async () => {
    let callCount = 0
    generateStructured.mockImplementation(async ({ prompt: _prompt }: { prompt: string }) => ({
      name: `Encounter ${callCount + 1}`,
      enemies: 'Goblins and a Hobgoblin',
      difficulty: callCount % 5 === 0 ? 'deadly' : callCount % 2 === 0 ? 'hard' : 'moderate',
      description: 'A classic dungeon encounter.',
      environmentalHazards: callCount % 3 === 0 ? 'Loose rocks overhead' : undefined,
      ...(callCount++, {}),
    }))

    const service = new PrerollService()
    const encounters = await service.prerollEncountersForSession(campaign, settings, 'combat', 15)

    expect(encounters).toHaveLength(15)
    expect(generateStructured).toHaveBeenCalledTimes(15)
    expect(encounters[0]).toHaveProperty('id')
    expect(encounters[0]).toHaveProperty('name')
    expect(encounters[0]).toHaveProperty('difficulty')
  })

  it('respects custom encounter count (F.1)', async () => {
    generateStructured.mockResolvedValue({
      name: 'Test Encounter',
      enemies: 'Test Enemies',
      difficulty: 'moderate',
      description: 'Test description',
    })

    const service = new PrerollService()
    const encounters = await service.prerollEncountersForSession(campaign, settings, 'social', 5)

    expect(encounters).toHaveLength(5)
    expect(generateStructured).toHaveBeenCalledTimes(5)
  })

  it('rejects invalid encounter counts (F.1)', async () => {
    const service = new PrerollService()

    await expect(
      service.prerollEncountersForSession(campaign, settings, 'combat', 0),
    ).rejects.toThrow('Encounter count must be at least 1')

    await expect(
      service.prerollEncountersForSession(campaign, settings, 'combat', 31),
    ).rejects.toThrow('Cannot pre-roll more than 30 encounters at once')
  })

  it('pre-rolls loot based on expected enemy count (F.2)', async () => {
    generateStructured.mockResolvedValue({
      itemName: 'Sword of Sharpness',
      rarity: 'rare',
      type: 'weapon',
      description: 'A finely crafted blade.',
      estimatedGold: 500,
    })

    const service = new PrerollService()
    const loot = await service.prerollLootForSession(campaign, settings, 5)

    // Should pre-roll 7 items (5 enemies + 2 extra)
    expect(loot).toHaveLength(7)
    expect(generateStructured).toHaveBeenCalledTimes(7)
  })

  it('caps loot pre-rolls at 10 items (F.2)', async () => {
    generateStructured.mockResolvedValue({
      itemName: 'Gold Coin',
      rarity: 'common',
      type: 'currency',
      description: 'Standard coinage.',
      estimatedGold: 1,
    })

    const service = new PrerollService()
    const loot = await service.prerollLootForSession(campaign, settings, 20)

    // Should cap at 10 even with high enemy count
    expect(loot).toHaveLength(10)
  })

  it('rejects invalid enemy count for loot (F.2)', async () => {
    const service = new PrerollService()

    await expect(service.prerollLootForSession(campaign, settings, 0)).rejects.toThrow(
      'Expected enemy count must be at least 1',
    )
  })

  it('includes world charter context in encounter generation (F.1)', async () => {
    generateStructured.mockResolvedValue({
      name: 'Encounter',
      enemies: 'Enemies',
      difficulty: 'moderate',
      description: 'Description',
    })

    const service = new PrerollService()
    await service.prerollEncountersForSession(campaign, settings, 'dungeon', 1)

    const call = generateStructured.mock.calls[0][0]
    expect(call.system).toContain('a specific world')
  })

  it('assigns unique IDs to each pre-roll (F.1, F.2)', async () => {
    let callCount = 0
    generateStructured.mockImplementation(async () => ({
      name: `Item ${callCount + 1}`,
      enemies: 'Enemies',
      difficulty: 'moderate',
      description: 'Desc',
      rarity: 'common',
      type: 'item',
      estimatedGold: 0,
      itemName: `Item ${callCount + 1}`,
      ...(callCount++, {}),
    }))

    const service = new PrerollService()
    const encounters = await service.prerollEncountersForSession(campaign, settings, 'combat', 3)

    const ids = encounters.map((e) => e.id)
    expect(new Set(ids).size).toBe(3) // All unique
  })

  it('varies encounter difficulty across the set (F.1)', async () => {
    const difficulties = ['trivial', 'easy', 'moderate', 'hard', 'deadly'] as const
    let callCount = 0

    generateStructured.mockImplementation(async () => ({
      name: 'Encounter',
      enemies: 'Enemies',
      difficulty: difficulties[callCount % 5],
      description: 'Description',
      ...(callCount++, {}),
    }))

    const service = new PrerollService()
    const encounters = await service.prerollEncountersForSession(campaign, settings, 'combat', 5)

    const difficultiesInSet = new Set(encounters.map((e) => e.difficulty))
    expect(difficultiesInSet.size).toBeGreaterThan(1) // Varied
  })
})

import { describe, expect, it, vi } from 'vitest'
import { AIPlayerRoutingService } from './ai-player-routing-service'

const { database } = vi.hoisted(() => ({
  database: {
    getPlayerCharactersForCampaign: vi.fn(),
    getCampaignAIPlayers: vi.fn(),
  },
}))

vi.mock('$lib/services/database', () => ({ database }))

describe('AIPlayerRoutingService (G.1, G.2)', () => {
  const service = new AIPlayerRoutingService()

  it('detects when a character is AI-controlled (G.1)', async () => {
    database.getPlayerCharactersForCampaign.mockResolvedValue([
      {
        id: 'pc-assign-1',
        campaignId: 'campaign-1',
        aiPlayerId: 'ai-mara',
        characterId: 'char-ilyra',
        roleplayNotes: null,
        characterSecrets: [],
        interPlayerRelationshipOverrides: {},
        joinedAt: 1000,
        leftAt: null,
      },
      {
        id: 'pc-assign-2',
        campaignId: 'campaign-1',
        aiPlayerId: 'ai-rowan',
        characterId: 'char-rowan',
        roleplayNotes: null,
        characterSecrets: [],
        interPlayerRelationshipOverrides: {},
        joinedAt: 1000,
        leftAt: null,
      },
    ])

    expect(await service.isCharacterAIControlled('campaign-1', 'char-ilyra')).toBe(true)
    expect(await service.isCharacterAIControlled('campaign-1', 'char-human')).toBe(false)
  })

  it('retrieves the AI player controlling a character (G.1)', async () => {
    database.getPlayerCharactersForCampaign.mockResolvedValue([
      {
        id: 'pc-assign-1',
        campaignId: 'campaign-1',
        aiPlayerId: 'ai-mara',
        characterId: 'char-ilyra',
        roleplayNotes: null,
        characterSecrets: [],
        interPlayerRelationshipOverrides: {},
        joinedAt: 1000,
        leftAt: null,
      },
    ])

    const result = await service.getAIPlayerForCharacter('campaign-1', 'char-ilyra')
    expect(result).toEqual({
      aiPlayerId: 'ai-mara',
      playerCharacterId: 'pc-assign-1',
    })
  })

  it('returns null for non-AI-controlled characters', async () => {
    database.getPlayerCharactersForCampaign.mockResolvedValue([])

    const result = await service.getAIPlayerForCharacter('campaign-1', 'char-human')
    expect(result).toBeNull()
  })

  it('excludes left-the-campaign AI player assignments (G.1)', async () => {
    database.getPlayerCharactersForCampaign.mockResolvedValue([
      {
        id: 'pc-assign-1',
        campaignId: 'campaign-1',
        aiPlayerId: 'ai-mara',
        characterId: 'char-ilyra',
        roleplayNotes: null,
        characterSecrets: [],
        interPlayerRelationshipOverrides: {},
        joinedAt: 1000,
        leftAt: 5000, // Character left
      },
    ])

    expect(await service.isCharacterAIControlled('campaign-1', 'char-ilyra')).toBe(false)
  })

  it('retrieves all active AI players for a campaign (G.2)', async () => {
    database.getCampaignAIPlayers.mockResolvedValue([
      {
        id: 'roster-1',
        campaignId: 'campaign-1',
        aiPlayerId: 'ai-mara',
        joinedAt: 1000,
        leftAt: null,
      },
      {
        id: 'roster-2',
        campaignId: 'campaign-1',
        aiPlayerId: 'ai-rowan',
        joinedAt: 1000,
        leftAt: null,
      },
      {
        id: 'roster-3',
        campaignId: 'campaign-1',
        aiPlayerId: 'ai-kael',
        joinedAt: 2000,
        leftAt: 5000,
      },
    ])

    const active = await service.getActiveAIPlayersForCampaign('campaign-1')
    expect(active).toHaveLength(2)
    expect(active.map((a) => a.aiPlayerId)).toEqual(['ai-mara', 'ai-rowan'])
  })

  it('validates full-table audiences', async () => {
    database.getCampaignAIPlayers.mockResolvedValue([])

    const result = await service.isValidAudience('campaign-1', { kind: 'full_table' })
    expect(result.valid).toBe(true)
  })

  it('validates private-player audiences', async () => {
    database.getCampaignAIPlayers.mockResolvedValue([
      {
        id: 'roster-1',
        campaignId: 'campaign-1',
        aiPlayerId: 'ai-mara',
        joinedAt: 1000,
        leftAt: null,
      },
    ])

    const valid = await service.isValidAudience('campaign-1', {
      kind: 'private_player',
      aiPlayerId: 'ai-mara',
    })
    expect(valid.valid).toBe(true)

    const invalid = await service.isValidAudience('campaign-1', {
      kind: 'private_player',
      aiPlayerId: 'ai-nonexistent',
    })
    expect(invalid.valid).toBe(false)
    expect(invalid.invalidReason).toContain('not an active AI player')
  })

  it('allows a roster-only AI Player in table audiences without character control', async () => {
    database.getCampaignAIPlayers.mockResolvedValue([
      {
        id: 'roster-1',
        campaignId: 'campaign-1',
        aiPlayerId: 'ai-table-only',
        joinedAt: 1000,
        leftAt: null,
      },
    ])
    database.getPlayerCharactersForCampaign.mockResolvedValue([])

    expect(
      await service.isValidAudience('campaign-1', {
        kind: 'private_player',
        aiPlayerId: 'ai-table-only',
      }),
    ).toMatchObject({ valid: true })
    expect(await service.isCharacterAIControlled('campaign-1', 'character-1')).toBe(false)
  })

  it('validates player-subset audiences', async () => {
    database.getCampaignAIPlayers.mockResolvedValue([
      {
        id: 'roster-1',
        campaignId: 'campaign-1',
        aiPlayerId: 'ai-mara',
        joinedAt: 1000,
        leftAt: null,
      },
      {
        id: 'pc-assign-2',
        campaignId: 'campaign-1',
        aiPlayerId: 'ai-rowan',
        characterId: 'char-rowan',
        roleplayNotes: null,
        characterSecrets: [],
        interPlayerRelationshipOverrides: {},
        joinedAt: 1000,
        leftAt: null,
      },
    ])

    const valid = await service.isValidAudience('campaign-1', {
      kind: 'player_subset',
      aiPlayerIds: ['ai-mara', 'ai-rowan'],
    })
    expect(valid.valid).toBe(true)

    const tooMany = await service.isValidAudience('campaign-1', {
      kind: 'player_subset',
      aiPlayerIds: ['ai-mara', 'ai-nonexistent'],
    })
    expect(tooMany.valid).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import type { AIPlayer, PlayerCharacter } from '$lib/types'
import {
  getAudiencePlayerIds,
  validateAIPlayerProfile,
  validatePlayerCharacterAssignment,
} from './ai-player-rules'

const player: AIPlayer = {
  id: 'player-1',
  name: 'Tactician',
  basePersonality: {
    coreMotivation: 'Win cleanly',
    primaryPlaystyle: 'tactical',
    riskTolerance: 5,
    humorStyle: 'dry',
    decisionSpeed: 'balanced',
    combatApproach: 'control the field',
    socialPriorities: [],
    redLines: [],
  },
  basePromptProfile: null,
  archivedAt: null,
  createdAt: 1,
  updatedAt: 1,
}

function assignment(overrides: Partial<PlayerCharacter> = {}): PlayerCharacter {
  return {
    id: 'assignment-1',
    campaignId: 'campaign-1',
    aiPlayerId: 'player-1',
    characterId: 'character-1',
    roleplayNotes: null,
    characterSecrets: [],
    interPlayerRelationshipOverrides: {},
    joinedAt: 1,
    leftAt: null,
    ...overrides,
  }
}

describe('AI Player rules', () => {
  it('accepts a global profile without campaign ownership', () => {
    expect(() => validateAIPlayerProfile(player)).not.toThrow()
  })

  it('rejects invalid personality risk tolerance', () => {
    expect(() =>
      validateAIPlayerProfile({
        ...player,
        basePersonality: { ...player.basePersonality, riskTolerance: 11 },
      }),
    ).toThrow('risk tolerance')
  })

  it('allows one global player to be assigned in multiple campaigns', () => {
    expect(() =>
      validatePlayerCharacterAssignment(assignment({ campaignId: 'campaign-2' }), [assignment()]),
    ).not.toThrow()
  })

  it('rejects duplicate player or character assignments within one campaign', () => {
    expect(() =>
      validatePlayerCharacterAssignment(assignment(), [assignment({ id: 'other' })]),
    ).toThrow()
    expect(() =>
      validatePlayerCharacterAssignment(assignment({ id: 'other', aiPlayerId: 'player-2' }), [
        assignment(),
      ]),
    ).toThrow()
  })

  it('resolves full-table, subset, and private audiences', () => {
    const active = ['player-1', 'player-2', 'player-3']
    expect(getAudiencePlayerIds({ kind: 'full_table' }, active)).toEqual(active)
    expect(
      getAudiencePlayerIds(
        { kind: 'player_subset', aiPlayerIds: ['player-2', 'player-2'] },
        active,
      ),
    ).toEqual(['player-2'])
    expect(
      getAudiencePlayerIds({ kind: 'private_player', aiPlayerId: 'player-3' }, active),
    ).toEqual(['player-3'])
  })

  it('rejects audiences outside the active player table', () => {
    expect(() =>
      getAudiencePlayerIds({ kind: 'private_player', aiPlayerId: 'player-9' }, ['player-1']),
    ).toThrow()
    expect(() =>
      getAudiencePlayerIds({ kind: 'player_subset', aiPlayerIds: [] }, ['player-1']),
    ).toThrow()
  })
})

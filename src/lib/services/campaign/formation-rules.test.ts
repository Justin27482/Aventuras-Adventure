import { describe, expect, it } from 'vitest'
import type { CampaignFormationState, CampaignSetupSession } from '$lib/types'
import {
  assertCanActivateSetupSession,
  assertCanStartNormalSession,
  setupSessionDisplayLabel,
  validateSetupSessionDefinition,
} from './formation-rules'

function setup(overrides: Partial<CampaignSetupSession> = {}): CampaignSetupSession {
  return {
    id: 'setup-1', campaignId: 'campaign-1', sequence: 1, title: 'Meet Mara',
    kind: 'private_character_creation', phase: 'character_creation', status: 'planned',
    audience: { kind: 'private_player', aiPlayerId: 'ai-1' }, createdAt: 1,
    startedAt: null, completedAt: null, updatedAt: 1, ...overrides,
  }
}

describe('campaign formation rules', () => {
  it('allows repeated private character creation sessions for one player', () => {
    expect(
      validateSetupSessionDefinition(
        'private_character_creation',
        'character_creation',
        { kind: 'private_player', aiPlayerId: 'ai-1' },
        ['ai-1'],
      ),
    ).toEqual(['ai-1'])
  })

  it('rejects private sessions with mismatched or multiple participants', () => {
    expect(() =>
      validateSetupSessionDefinition(
        'private_prologue',
        'free_table',
        { kind: 'private_player', aiPlayerId: 'ai-1' },
        ['ai-1', 'ai-2'],
      ),
    ).toThrow(/exactly one/)
  })

  it('allows group subset setup while rejecting non-participants', () => {
    expect(
      validateSetupSessionDefinition(
        'group_session_zero',
        'premises',
        { kind: 'player_subset', aiPlayerIds: ['ai-1', 'ai-2'] },
        ['ai-1', 'ai-2', 'ai-3'],
      ),
    ).toHaveLength(3)
    expect(() =>
      validateSetupSessionDefinition(
        'table_bonding',
        'bonding',
        { kind: 'player_subset', aiPlayerIds: ['missing'] },
        ['ai-1'],
      ),
    ).toThrow(/non-participant/)
  })

  it('enforces one active setup session per campaign', () => {
    expect(() =>
      assertCanActivateSetupSession([setup({ status: 'active' })], 'setup-2'),
    ).toThrow(/active setup session/)
  })

  it('blocks normal sessions while party formation is pending', () => {
    const formation: CampaignFormationState = {
      campaignId: 'campaign-1', status: 'party_pending', requiredAIPlayerIds: ['ai-1'],
      source: 'created_pending', createdAt: 1, updatedAt: 1,
    }
    expect(() => assertCanStartNormalSession(formation, 1, 'character-1')).toThrow(
      /Complete party formation/,
    )
    expect(() => assertCanStartNormalSession(null, 1, 'character-1')).not.toThrow()
  })

  it('labels Session 0.5 without changing setup sequence semantics', () => {
    expect(
      setupSessionDisplayLabel(
        setup({ kind: 'table_bonding', phase: 'bonding', title: 'First Campfire', sequence: 8 }),
      ),
    ).toBe('Session 0.5 · First Campfire')
  })
})
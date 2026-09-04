import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockDatabase } = vi.hoisted(() => ({
  mockDatabase: {
    saveGMCharacterSheetEdit: vi.fn(),
    approveCharacterSheetProposal: vi.fn(),
    upsertCharacterSheetProposal: vi.fn(),
  },
}))
vi.mock('$lib/services/database', () => ({ database: mockDatabase }))

import type { CharacterSheetDraft, FullRuleset } from '$lib/types'
import { characterSheetEditorService, validateCharacterSheetDraft } from './character-sheet-editor'

const ruleset = {
  ruleset: { id: 'ruleset-1' },
  stats: [{ key: 'strength', label: 'Strength', minValue: 1, maxValue: 20 }],
  resources: [{ key: 'health' }],
  conditions: [{ key: 'poisoned' }],
  skills: [], slots: [], abilities: [], spells: [], creatures: [], levels: [], checkRules: [],
} as unknown as FullRuleset

function draft(): CharacterSheetDraft {
  return {
    name: 'Mara', description: 'A careful scout.', traits: ['patient'], visualDescriptors: { hair: 'black' },
    sheet: {
      rulesetId: 'ruleset-1', statValues: { strength: 12 },
      resourceValues: { health: { current: 20, max: 20 } },
      conditionStates: { poisoned: { active: false, note: null } }, level: 1, xp: 0,
    },
  }
}

describe('character sheet editor', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects out-of-range and unknown ruleset fields', () => {
    expect(() => validateCharacterSheetDraft({ ...draft(), sheet: { ...draft().sheet, statValues: { strength: 30 } } }, ruleset)).toThrow(/between 1 and 20/)
    expect(() => validateCharacterSheetDraft({ ...draft(), sheet: { ...draft().sheet, resourceValues: { mana: { current: 1, max: 2 } } } }, ruleset)).toThrow(/Unknown resource/)
  })

  it('delegates approved AI drafts to one atomic database operation', async () => {
    mockDatabase.approveCharacterSheetProposal.mockResolvedValue({ characterId: 'char-1', revisionId: 'rev-1' })
    const proposal = {
      id: 'proposal-1', campaignId: 'campaign-1', setupSessionId: 'setup-1', aiPlayerId: 'ai-1',
      characterId: null, proposalType: 'create', payload: draft(), status: 'pending',
      reviewNotes: null, createdAt: 1, reviewedAt: null,
    } as const

    const result = await characterSheetEditorService.approveProposal({ proposal, editedDraft: draft(), storyId: 'story-1', ruleset })

    expect(result).toEqual({ characterId: 'char-1', revisionId: 'rev-1' })
    expect(mockDatabase.approveCharacterSheetProposal).toHaveBeenCalledTimes(1)
    expect(mockDatabase.saveGMCharacterSheetEdit).not.toHaveBeenCalled()
  })

  it('declining a proposal never applies a sheet mutation', async () => {
    const proposal = {
      id: 'proposal-1', campaignId: 'campaign-1', setupSessionId: null, aiPlayerId: 'ai-1',
      characterId: null, proposalType: 'create', payload: draft(), status: 'pending',
      reviewNotes: null, createdAt: 1, reviewedAt: null,
    } as const

    await characterSheetEditorService.declineProposal(proposal, 'Revise the concept')

    expect(mockDatabase.upsertCharacterSheetProposal).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'declined', reviewNotes: 'Revise the concept' }),
    )
    expect(mockDatabase.approveCharacterSheetProposal).not.toHaveBeenCalled()
  })
})

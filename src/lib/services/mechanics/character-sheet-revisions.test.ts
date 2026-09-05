import { describe, expect, it } from 'vitest'
import type { CharacterSheet } from '$lib/types'
import { createCharacterSheetRevisionSnapshot } from './character-sheet-revisions'

function sheet(): CharacterSheet {
  return {
    characterId: 'character-1',
    rulesetId: 'ruleset-1',
    statValues: { strength: 12 },
    resourceValues: { health: { current: 20, max: 20 } },
    conditionStates: {},
    level: 1,
    xp: 0,
    createdAt: 1,
    updatedAt: 2,
  }
}

describe('createCharacterSheetRevisionSnapshot', () => {
  it('creates an isolated GM-authored snapshot', () => {
    const activeSheet = sheet()
    const revision = createCharacterSheetRevisionSnapshot({
      id: 'revision-1',
      sheet: activeSheet,
      authorType: 'gm',
      source: 'session-zero-direct-edit',
      createdAt: 10,
    })

    activeSheet.statValues.strength = 18
    expect(revision.snapshot.statValues.strength).toBe(12)
    expect(revision).toMatchObject({
      id: 'revision-1',
      characterId: 'character-1',
      authorType: 'gm',
      authorAIPlayerId: null,
      parentRevisionId: null,
      source: 'session-zero-direct-edit',
      createdAt: 10,
    })
  })

  it('requires an AI Player ID for AI-authored revisions', () => {
    expect(() =>
      createCharacterSheetRevisionSnapshot({
        sheet: sheet(),
        authorType: 'ai_player',
        source: 'approved-proposal',
      }),
    ).toThrow(/author metadata/)
  })

  it('retains parent linkage for append-only restore history', () => {
    const revision = createCharacterSheetRevisionSnapshot({
      sheet: sheet(),
      parentRevisionId: 'revision-1',
      authorType: 'ai_player',
      authorAIPlayerId: 'ai-player-1',
      source: 'approved-proposal',
    })

    expect(revision.parentRevisionId).toBe('revision-1')
    expect(revision.authorAIPlayerId).toBe('ai-player-1')
  })
})

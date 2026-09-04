import { describe, expect, it, vi } from 'vitest'
import type { AIPlayer, PlayerCharacter } from '$lib/types'

vi.mock('$lib/stores/settings.svelte', () => ({
  settings: { getServicePresetId: () => 'test-preset' },
}))

import {
  PersonalityService,
  renderAIPlayerVoiceProfile,
  resolveCharacterKnowledge,
} from './personality-service'

const player: AIPlayer = {
  id: 'player-1',
  name: 'Mara',
  basePersonality: {
    coreMotivation: 'Protect the vulnerable',
    primaryPlaystyle: 'roleplay',
    riskTolerance: 4,
    humorStyle: 'dry',
    decisionSpeed: 'cautious',
    combatApproach: 'defensive',
    socialPriorities: ['trust', 'mercy'],
    redLines: ['betrayal'],
  },
  basePromptProfile: null,
  archivedAt: null,
  createdAt: 1,
  updatedAt: 1,
}

const assignment: PlayerCharacter = {
  id: 'assignment-1',
  campaignId: 'campaign-1',
  aiPlayerId: player.id,
  characterId: 'character-1',
  roleplayNotes: 'Speaks softly when frightened.',
  characterSecrets: [],
  interPlayerRelationshipOverrides: {},
  joinedAt: 1,
  leftAt: null,
}

const secret = (overrides: Record<string, unknown> = {}) => ({
  id: 'secret-1',
  campaignId: 'campaign-1',
  sessionId: null,
  targetAIPlayerId: 'player-2',
  secretContent: 'The north gate is compromised.',
  revealedToAIPlayerIds: [],
  visibilityScope: 'specific_ai_player' as const,
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
})

describe('PersonalityService', () => {
  it('includes the authored prompt profile in the distinct voice context', () => {
    const profile = renderAIPlayerVoiceProfile({
      ...player,
      basePromptProfile: 'Uses clipped sentences, precise verbs, and understated sarcasm.',
    })

    expect(profile).toContain('Uses clipped sentences, precise verbs, and understated sarcasm.')
    expect(profile).toContain('Humor style: dry')
    expect(profile).toContain('Decision speed: cautious')
  })

  it('resolves character knowledge only for allowed AI Players', () => {
    expect(
      resolveCharacterKnowledge(
        [
          { content: 'Known by Mara.', knownByAIPlayerIds: ['player-1'] },
          { content: 'Known by another player.', knownByAIPlayerIds: ['player-2'] },
          { content: 'Unscoped character fact.' },
        ],
        'player-1',
      ),
    ).toEqual(['Known by Mara.', 'Unscoped character fact.'])
  })

  it('renders persistent personality and campaign assignment context', () => {
    const result = new PersonalityService().renderDynamicPrompt(player, assignment, {
      campaignTitle: 'Ashfall',
      sceneMode: 'settlement',
      sceneSummary: 'The party reaches a guarded town.',
      contentIntensity: 4,
      characterName: 'Ilyra',
      characterDescription: 'A retired scout.',
      otherPlayers: [{ name: 'Jon', relationship: 'trusted ally' }],
      characterSecrets: [],
      playerLevelSecrets: [],
      relationships: [],
    })

    expect(result.systemPrompt).toContain('Mara')
    expect(result.systemPrompt).toContain('Protect the vulnerable')
    expect(result.systemPrompt).toContain('Speaks softly when frightened.')
    expect(result.systemPrompt).toContain('The party reaches a guarded town.')
    expect(result.systemPrompt).not.toContain('## Decision Contract')
  })

  it('includes only secrets visible to the current AI Player', () => {
    const result = new PersonalityService().renderDynamicPrompt(player, assignment, {
      campaignTitle: 'Ashfall',
      sceneMode: 'social',
      sceneSummary: '',
      characterName: 'Ilyra',
      characterDescription: '',
      otherPlayers: [],
      characterSecrets: [],
      playerLevelSecrets: [
        secret(),
        secret({ id: 'secret-2', targetAIPlayerId: player.id, secretContent: 'Private warning.' }),
        secret({
          id: 'secret-3',
          targetAIPlayerId: 'player-3',
          secretContent: 'Shared clue.',
          visibilityScope: 'all_ai_players',
        }),
      ],
      relationships: [],
    })

    expect(result.visibleSecrets).toEqual(['Private warning.', 'Shared clue.'])
    expect(result.systemPrompt).not.toContain('north gate is compromised')
    expect(result.systemPrompt).toContain('Private warning.')
    expect(result.systemPrompt).toContain('Shared clue.')
  })

  it('renders only relationships involving the current AI Player', () => {
    const result = new PersonalityService().renderDynamicPrompt(player, assignment, {
      campaignTitle: 'Ashfall',
      sceneMode: 'combat',
      sceneSummary: '',
      characterName: 'Ilyra',
      characterDescription: '',
      otherPlayers: [],
      characterSecrets: [],
      playerLevelSecrets: [],
      relationships: [
        {
          id: 'relationship-1',
          aiPlayerIdA: player.id,
          aiPlayerIdB: 'player-2',
          dynamic: 'frienemy',
          history: 'They argued over the map.',
          friction: 6,
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'relationship-2',
          aiPlayerIdA: 'player-2',
          aiPlayerIdB: 'player-3',
          dynamic: 'rivals',
          history: '',
          friction: 9,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    })

    expect(result.systemPrompt).toContain('frienemy')
    expect(result.systemPrompt).not.toContain('rivals')
  })
})

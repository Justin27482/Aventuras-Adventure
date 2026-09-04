import { describe, expect, it, vi } from 'vitest'
import type { AIPlayer, PlayerCharacter, PlayerLevelSecret, AIPlayerRelationship } from '$lib/types'

vi.mock('$lib/stores/settings.svelte', () => ({
  settings: { getServicePresetId: () => 'test-preset' },
}))

import { PersonalityService, resolveCharacterKnowledge } from './personality-service'

describe('PersonalityService — Personality Reuse & Knowledge Isolation (B.10, B.11)', () => {
  const globalPlayer: AIPlayer = {
    id: 'global-mara',
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
    createdAt: 1000,
    updatedAt: 1000,
  }

  it('preserves base personality across multiple campaign assignments (B.10)', () => {
    const service = new PersonalityService()

    // Assignment 1: Campaign A
    const campaignAAssignment: PlayerCharacter = {
      id: 'assignment-1',
      campaignId: 'campaign-a',
      aiPlayerId: globalPlayer.id,
      characterId: 'character-ilyra',
      roleplayNotes: 'Mara-as-Ilyra is cautious about trusting strangers.',
      characterSecrets: [],
      interPlayerRelationshipOverrides: { 'global-jon': 'Ilyra respects Jon as a mentor.' },
      joinedAt: 2000,
      leftAt: null,
    }

    // Assignment 2: Campaign B (same AI Player, different campaign)
    const campaignBAssignment: PlayerCharacter = {
      id: 'assignment-2',
      campaignId: 'campaign-b',
      aiPlayerId: globalPlayer.id,
      characterId: 'character-kael',
      roleplayNotes: 'Mara-as-Kael is brash and protective of the party.',
      characterSecrets: [],
      interPlayerRelationshipOverrides: { 'global-rowan': 'Kael follows Rowan\'s lead.' },
      joinedAt: 3000,
      leftAt: null,
    }

    // Render context for both assignments with relationships
    const campaign1Relationships = [
      {
        id: 'rel-1',
        aiPlayerIdA: globalPlayer.id,
        aiPlayerIdB: 'global-jon',
        dynamic: 'Ilyra respects Jon as a mentor.',
        history: 'Fought together before.',
        friction: 2,
        createdAt: 1000,
        updatedAt: 1000,
      },
    ]

    const campaign2Relationships = [
      {
        id: 'rel-2',
        aiPlayerIdA: globalPlayer.id,
        aiPlayerIdB: 'global-rowan',
        dynamic: 'Kael follows Rowan\'s lead.',
        history: 'Unknown history.',
        friction: 8,
        createdAt: 2000,
        updatedAt: 2000,
      },
    ]

    const contextA = service.renderDynamicPrompt(globalPlayer, campaignAAssignment, {
      campaignTitle: 'Ashfall',
      sceneMode: 'social',
      sceneSummary: 'A tense negotiation.',
      characterName: 'Ilyra',
      characterDescription: 'A retired scout.',
      otherPlayers: [],
      characterSecrets: [],
      playerLevelSecrets: [],
      relationships: campaign1Relationships,
    })

    const contextB = service.renderDynamicPrompt(globalPlayer, campaignBAssignment, {
      campaignTitle: 'Skyholm',
      sceneMode: 'combat',
      sceneSummary: 'A dragon approaches.',
      characterName: 'Kael',
      characterDescription: 'A warrior from the north.',
      otherPlayers: [],
      characterSecrets: [],
      playerLevelSecrets: [],
      relationships: campaign2Relationships,
    })

    // Both contain the base personality
    expect(contextA.systemPrompt).toContain('Protect the vulnerable')
    expect(contextB.systemPrompt).toContain('Protect the vulnerable')
    expect(contextA.systemPrompt).toContain('Mara')
    expect(contextB.systemPrompt).toContain('Mara')

    // But campaign-specific roleplay notes are isolated
    expect(contextA.systemPrompt).toContain('cautious about trusting strangers')
    expect(contextB.systemPrompt).toContain('brash and protective')
    expect(contextB.systemPrompt).not.toContain('cautious about trusting strangers')
    expect(contextA.systemPrompt).not.toContain('brash and protective')

    // And relationships are campaign-isolated
    expect(contextA.systemPrompt).toContain('Jon')
    expect(contextB.systemPrompt).not.toContain('Jon')
    expect(contextB.systemPrompt).toContain('Rowan')
    expect(contextA.systemPrompt).not.toContain('Rowan')
  })

  it('character-level secrets remain invisible to other AI players (B.11)', () => {
    // Scenario: Ilyra knows a secret that Kael does NOT know
    const ilyraSecrets = [
      {
        content: 'Ilyra suspects the innkeeper is a spy.',
        knownByAIPlayerIds: ['global-mara'], // Only Ilyra (via Mara) knows this
      },
    ]

    // Resolve for Mara (playing Ilyra) — should see the secret
    const ilyraKnowledge = resolveCharacterKnowledge(ilyraSecrets, 'global-mara')
    expect(ilyraKnowledge).toContain('Ilyra suspects the innkeeper is a spy.')

    // Resolve for a different player (e.g., Jon's character controlled by another AI player) — should NOT see it
    const jonKnowledge = resolveCharacterKnowledge(ilyraSecrets, 'global-jon')
    expect(jonKnowledge).not.toContain('Ilyra suspects the innkeeper is a spy.')
  })

  it('player-level secrets are only visible when explicitly targeted or broadcast (B.11)', () => {
    const playerSecrets: PlayerLevelSecret[] = [
      {
        id: 'secret-1',
        campaignId: 'campaign-a',
        sessionId: null,
        targetAIPlayerId: 'global-mara',
        secretContent: 'Mara received a secret letter from an old contact.',
        revealedToAIPlayerIds: ['global-mara'],
        visibilityScope: 'specific_ai_player',
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        id: 'secret-2',
        campaignId: 'campaign-a',
        sessionId: null,
        targetAIPlayerId: 'global-mara',
        secretContent: 'Everyone knows the rebellion is planning something.',
        revealedToAIPlayerIds: ['global-mara', 'global-jon', 'global-rowan'],
        visibilityScope: 'all_ai_players',
        createdAt: 1100,
        updatedAt: 1100,
      },
    ]

    // Mara's prompt should include both player-level secrets targeted to her
    const maraSecrets = playerSecrets.filter(
      (s) => s.targetAIPlayerId === 'global-mara' || s.visibilityScope === 'all_ai_players',
    )
    expect(maraSecrets).toHaveLength(2)

    // But a player not targeted or included should not see the specific secret
    const jonSpecificSecret = playerSecrets.filter(
      (s) => s.targetAIPlayerId === 'global-jon' || s.revealedToAIPlayerIds.includes('global-jon'),
    )
    // Jon is included in secret-2 (broadcast), but not secret-1 (Mara-specific)
    expect(jonSpecificSecret.map((s) => s.id)).toEqual(['secret-2'])
  })

  it('relationship overrides remain isolated per campaign and never mutate the global personality (B.11)', () => {
    const service = new PersonalityService()
    const initialBasePersonality = { ...globalPlayer.basePersonality }

    // Create two campaigns with different relationship overrides
    const campaign1Relationships: AIPlayerRelationship[] = [
      {
        id: 'rel-1',
        aiPlayerIdA: 'global-mara',
        aiPlayerIdB: 'global-jon',
        dynamic: 'Mara trusts Jon implicitly.',
        history: 'Fought together before.',
        friction: 2,
        createdAt: 1000,
        updatedAt: 1000,
      },
    ]

    const campaign2Relationships: AIPlayerRelationship[] = [
      {
        id: 'rel-2',
        aiPlayerIdA: 'global-mara',
        aiPlayerIdB: 'global-rowan',
        dynamic: 'Mara is wary of Rowan.',
        history: 'Unknown history.',
        friction: 8,
        createdAt: 2000,
        updatedAt: 2000,
      },
    ]

    const assignment1: PlayerCharacter = {
      id: 'assign-1',
      campaignId: 'campaign-1',
      aiPlayerId: 'global-mara',
      characterId: 'character-1',
      roleplayNotes: 'Notes for campaign 1',
      characterSecrets: [],
      interPlayerRelationshipOverrides: {},
      joinedAt: 1000,
      leftAt: null,
    }

    const assignment2: PlayerCharacter = {
      id: 'assign-2',
      campaignId: 'campaign-2',
      aiPlayerId: 'global-mara',
      characterId: 'character-2',
      roleplayNotes: 'Notes for campaign 2',
      characterSecrets: [],
      interPlayerRelationshipOverrides: {},
      joinedAt: 2000,
      leftAt: null,
    }

    // Render for campaign 1
    const context1 = service.renderDynamicPrompt(globalPlayer, assignment1, {
      campaignTitle: 'Campaign 1',
      sceneMode: 'social',
      sceneSummary: '',
      characterName: 'Character 1',
      characterDescription: '',
      otherPlayers: [],
      characterSecrets: [],
      playerLevelSecrets: [],
      relationships: campaign1Relationships,
    })

    // Render for campaign 2
    const context2 = service.renderDynamicPrompt(globalPlayer, assignment2, {
      campaignTitle: 'Campaign 2',
      sceneMode: 'social',
      sceneSummary: '',
      characterName: 'Character 2',
      characterDescription: '',
      otherPlayers: [],
      characterSecrets: [],
      playerLevelSecrets: [],
      relationships: campaign2Relationships,
    })

    // Context 1 should have Jon relationship, not Rowan
    expect(context1.systemPrompt).toContain('Jon')
    expect(context1.systemPrompt).not.toContain('Rowan')

    // Context 2 should have Rowan relationship, not Jon
    expect(context2.systemPrompt).toContain('Rowan')
    expect(context2.systemPrompt).not.toContain('Jon')

    // Global personality must remain unmodified
    expect(globalPlayer.basePersonality).toEqual(initialBasePersonality)
  })
})

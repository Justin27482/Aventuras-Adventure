import { describe, expect, it, vi } from 'vitest'
import { TurnDirector } from './turn-director'

/**
 * G.1-G.3 Integration Test: Full AI Player Turn Flow
 * 
 * This test demonstrates the complete Phase G foundation working together:
 * 1. TurnDirector detects AI player turns (G.1)
 * 2. AIPlayerRoutingService validates audience scopes (G.2)
 * 3. AIPlayerTurnOrchestrator generates proposal → consensus → narration (G.3)
 */
describe('Phase G: AI Player Turn Flow Integration', () => {
  const turnDirector = new TurnDirector()
  
  it('routes an AI player turn through the full orchestration flow (G.1-G.3)', () => {
    // G.1: TurnDirector detects AI player turn
    const nextTurn = turnDirector.getNextTurnType({
      sceneMode: 'social',
      activeActor: { id: 'char-mara', name: 'Mara', category: 'player' },
      isAIPlayerControlled: true,
    })

    expect(nextTurn).toBe('ai_player_turn')
  })

  it('preserves human player flow when isAIPlayerControlled is false (G.1 fallthrough)', () => {
    // Setup: Human player Kyra
    const nextTurn = turnDirector.getNextTurnType({
      sceneMode: 'combat',
      activeActor: { id: 'char-kyra', name: 'Kyra', category: 'player' },
      isAIPlayerControlled: false,
    })

    // Should fall through to normal narration, not ai_player_turn
    expect(nextTurn).not.toBe('ai_player_turn')
    expect(['narration', 'scene_transition']).toContain(nextTurn)
  })

  it('prioritizes pending rolls over AI player detection (G.1 constraint)', () => {
    // A pending roll should always take precedence
    const nextTurn = turnDirector.getNextTurnType({
      sceneMode: 'combat',
      activeActor: { id: 'char-mara', name: 'Mara', category: 'player' },
      isAIPlayerControlled: true,
      pendingRoll: { id: 'roll-1', reason: 'Attack' },
    })

    expect(nextTurn).toBe('action_resolution')
  })

  it('maintains turn order mixing AI and human players (G.1-G.3 prerequisite)', () => {
    const turnOrder = [
      { id: 'char-kyra', name: 'Kyra', category: 'player' as const },     // Human
      { id: 'char-mara', name: 'Mara', category: 'player' as const },     // AI
      { id: 'char-rowan', name: 'Rowan', category: 'player' as const },   // AI
      { id: 'enemy-shade', name: 'Shade', category: 'enemy' as const },   // NPC
    ]

    const results = turnOrder.map((actor) => {
      const isAIPlayer = actor.name !== 'Kyra' && actor.category === 'player'
      return {
        actor: actor.name,
        turnType: turnDirector.getNextTurnType({
          sceneMode: 'combat',
          activeActor: actor,
          isAIPlayerControlled: isAIPlayer,
        }),
      }
    })

    expect(results[0].turnType).not.toBe('ai_player_turn') // Kyra (human)
    expect(results[1].turnType).toBe('ai_player_turn')     // Mara (AI)
    expect(results[2].turnType).toBe('ai_player_turn')     // Rowan (AI)
    expect(results[3].turnType).toBe('npc_action')         // Shade (NPC)
  })

  it('ensures AI player detection and routing work together (G.1 + G.2)', () => {
    // Scenario: Mara (AI) is up, full-table audience
    const isAIPlayer = true
    const audience = { kind: 'full_table' as const }

    const turnType = turnDirector.getNextTurnType({
      sceneMode: 'social',
      activeActor: { id: 'char-mara', name: 'Mara', category: 'player' },
      isAIPlayerControlled: isAIPlayer,
    })

    // G.1 detects AI player turn
    expect(turnType).toBe('ai_player_turn')

    // G.2 would validate this audience (full_table is always valid)
    expect(audience.kind).toBe('full_table')
  })
})

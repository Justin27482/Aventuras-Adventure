import { describe, expect, it } from 'vitest'
import { TurnDirector } from './turn-director'

describe('TurnDirector', () => {
  it('forces action resolution while a roll is pending', () => {
    const director = new TurnDirector()

    expect(
      director.getNextTurnType({
        sceneMode: 'combat',
        pendingRoll: { id: 'roll-1', reason: 'Attack', actorId: 'pc-1' },
        activeActor: { id: 'pc-1', name: 'Kyra', category: 'player' },
        previousSceneMode: 'combat',
      }),
    ).toBe('action_resolution')
  })

  it('uses NPC action when a non-player actor is currently up', () => {
    const director = new TurnDirector()

    expect(
      director.getNextTurnType({
        sceneMode: 'combat',
        activeActor: { id: 'enemy-1', name: 'Shade', category: 'enemy' },
        previousSceneMode: 'combat',
      }),
    ).toBe('npc_action')
  })

  it('narrates scene transitions without a pending roll or NPC turn', () => {
    const director = new TurnDirector()

    expect(
      director.getNextTurnType({
        sceneMode: 'combat',
        activeActor: { id: 'pc-1', name: 'Kyra', category: 'player' },
        previousSceneMode: 'exploration',
      }),
    ).toBe('scene_transition')

    expect(director.describeSceneTransition('exploration', 'combat')).toContain('combat')
  })
})

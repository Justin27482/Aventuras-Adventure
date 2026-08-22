import { describe, expect, it } from 'vitest'
import { TurnOrderService } from './turn-order-service'

describe('TurnOrderService', () => {
  it('tracks the active actor and rotates free turn order', () => {
    const service = new TurnOrderService({
      actors: [
        { id: 'pc', name: 'Kyra', category: 'player' },
        { id: 'ally', name: 'Mira', category: 'ally' },
        { id: 'enemy', name: 'Shade', category: 'enemy' },
      ],
      sceneMode: 'combat',
      turnOrderMode: 'round_robin',
    })

    expect(service.getActiveActor()?.id).toBe('pc')
    service.advance()
    expect(service.getActiveActor()?.id).toBe('ally')
    service.advance()
    expect(service.getActiveActor()?.id).toBe('enemy')
    service.advance()
    expect(service.getActiveActor()?.id).toBe('pc')
  })

  it('allows explicit set, insert, and removal behaviors', () => {
    const service = new TurnOrderService({
      actors: [
        { id: 'a', name: 'A', category: 'player' },
        { id: 'b', name: 'B', category: 'ally' },
      ],
      sceneMode: 'combat',
      turnOrderMode: 'initiative',
      activeActorId: 'b',
    })

    service.setActiveActor('a')
    expect(service.getActiveActor()?.id).toBe('a')

    service.insertActor({ id: 'c', name: 'C', category: 'enemy' }, 1)
    expect(service.getActor('c')?.name).toBe('C')

    service.removeActor('b')
    expect(service.getActor('b')).toBeNull()

    service.rebuild([
      { id: 'a', name: 'A', category: 'player' },
      { id: 'c', name: 'C', category: 'enemy' },
    ])
    expect(service.getActiveActor()?.id).toBe('a')
  })

  it('round-trips scene and turn state while ignoring actors no longer present', () => {
    const service = new TurnOrderService({
      actors: [
        { id: 'pc', name: 'Kyra', category: 'player' },
        { id: 'ally', name: 'Mira', category: 'ally' },
      ],
      sceneMode: 'social',
      turnOrderMode: 'spotlight',
      activeActorId: 'ally',
    })

    const snapshot = service.snapshot()
    service.restore(snapshot, [
      { id: 'pc', name: 'Kyra', category: 'player' },
      { id: 'new', name: 'New Ally', category: 'ally' },
    ])

    expect(service.getSceneMode()).toBe('social')
    expect(service.getTurnOrderMode()).toBe('spotlight')
    expect(service.getActors().map((actor) => actor.id)).toEqual(['pc'])
    expect(service.getActiveActor()?.id).toBe('pc')
  })
})

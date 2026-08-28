export type TurnOrderActorCategory = 'player' | 'ally' | 'enemy' | 'npc'

export interface TurnOrderActor {
  id: string
  name: string
  category: TurnOrderActorCategory
}

export type SceneMode =
  | 'free'
  | 'exploration'
  | 'travel'
  | 'camp'
  | 'settlement'
  | 'combat'
  | 'social'
  | 'downtime'

export type TurnOrderMode = 'free' | 'round_robin' | 'initiative' | 'spotlight' | 'gm_directed'

export interface TurnOrderServiceOptions {
  actors?: TurnOrderActor[]
  sceneMode?: SceneMode
  turnOrderMode?: TurnOrderMode
  activeActorId?: string | null
}

export interface TurnOrderSnapshot {
  sceneMode: SceneMode
  turnOrderMode: TurnOrderMode
  actorIds: string[]
  activeActorId: string | null
}

export class TurnOrderService {
  private actors: TurnOrderActor[] = []
  private activeActorId: string | null = null
  private sceneMode: SceneMode = 'free'
  private turnOrderMode: TurnOrderMode = 'free'

  constructor(options: TurnOrderServiceOptions = {}) {
    this.sceneMode = options.sceneMode ?? 'free'
    this.turnOrderMode = options.turnOrderMode ?? 'free'
    this.actors = [...(options.actors ?? [])]
    this.activeActorId = options.activeActorId ?? this.actors[0]?.id ?? null
  }

  getSceneMode(): SceneMode {
    return this.sceneMode
  }

  setSceneMode(mode: SceneMode): void {
    this.sceneMode = mode
  }

  getTurnOrderMode(): TurnOrderMode {
    return this.turnOrderMode
  }

  setTurnOrderMode(mode: TurnOrderMode): void {
    this.turnOrderMode = mode
  }

  getActors(): TurnOrderActor[] {
    return [...this.actors]
  }

  snapshot(): TurnOrderSnapshot {
    return {
      sceneMode: this.sceneMode,
      turnOrderMode: this.turnOrderMode,
      actorIds: this.actors.map((actor) => actor.id),
      activeActorId: this.activeActorId,
    }
  }

  restore(snapshot: TurnOrderSnapshot, actors: TurnOrderActor[]): void {
    const actorsById = new Map(actors.map((actor) => [actor.id, actor]))
    this.sceneMode = snapshot.sceneMode
    this.turnOrderMode = snapshot.turnOrderMode
    this.actors = snapshot.actorIds
      .map((actorId) => actorsById.get(actorId))
      .filter((actor): actor is TurnOrderActor => actor !== undefined)
    this.activeActorId =
      snapshot.activeActorId && actorsById.has(snapshot.activeActorId)
        ? snapshot.activeActorId
        : (this.actors[0]?.id ?? null)
  }

  getActor(actorId: string): TurnOrderActor | null {
    return this.actors.find((actor) => actor.id === actorId) ?? null
  }

  getActiveActor(): TurnOrderActor | null {
    if (!this.activeActorId) return null
    return this.getActor(this.activeActorId)
  }

  setActiveActor(actorId: string | null): void {
    if (actorId === null) {
      this.activeActorId = null
      return
    }
    if (!this.getActor(actorId)) {
      throw new Error(`Actor not in turn order: ${actorId}`)
    }
    this.activeActorId = actorId
  }

  insertActor(actor: TurnOrderActor, index: number): void {
    const safeIndex = Math.max(0, Math.min(index, this.actors.length))
    this.actors.splice(safeIndex, 0, actor)
    if (!this.activeActorId && this.actors.length > 0) {
      this.activeActorId = this.actors[0].id
    }
  }

  removeActor(actorId: string): void {
    this.actors = this.actors.filter((actor) => actor.id !== actorId)
    if (this.activeActorId === actorId) {
      this.activeActorId = this.actors[0]?.id ?? null
    }
  }

  rebuild(actors: TurnOrderActor[]): void {
    this.actors = [...actors]
    this.activeActorId = this.actors[0]?.id ?? null
  }

  advance(): void {
    if (this.actors.length === 0) {
      this.activeActorId = null
      return
    }

    const currentIndex = this.actors.findIndex((actor) => actor.id === this.activeActorId)
    const startIndex = currentIndex >= 0 ? currentIndex : 0
    const nextIndex = (startIndex + 1) % this.actors.length
    this.activeActorId = this.actors[nextIndex].id
  }
}

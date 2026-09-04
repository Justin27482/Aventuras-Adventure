import type { TurnOrderActor, SceneMode, TurnOrderMode } from './turn-order-service'

export type TurnType =
  | 'narration'
  | 'npc_action'
  | 'roll_request'
  | 'action_resolution'
  | 'qa'
  | 'scene_transition'
  | 'montage'
  | 'ai_player_turn'

export interface PendingRollLike {
  id: string
  actorId?: string | null
  reason?: string | null
}

export interface TurnDirectorInput {
  sceneMode: SceneMode
  previousSceneMode?: SceneMode | null
  activeActor?: TurnOrderActor | null
  pendingRoll?: PendingRollLike | null
  turnOrderMode?: TurnOrderMode
  isAIPlayerControlled?: boolean
}

export class TurnDirector {
  getNextTurnType(input: TurnDirectorInput): TurnType {
    if (input.pendingRoll) {
      return 'action_resolution'
    }

    // AI player turns take precedence over NPC actions (same category, but different orchestration)
    const actor = input.activeActor
    if (input.isAIPlayerControlled && actor?.category === 'player') {
      return 'ai_player_turn'
    }

    if (actor && actor.category !== 'player') {
      return 'npc_action'
    }

    if (input.previousSceneMode && input.previousSceneMode !== input.sceneMode) {
      return 'scene_transition'
    }

    return 'narration'
  }

  describeSceneTransition(fromScene: SceneMode, toScene: SceneMode): string {
    const labelFrom = fromScene.replace(/[_-]+/g, ' ')
    const labelTo = toScene.replace(/[_-]+/g, ' ')
    return `The scene shifts from ${labelFrom} to ${labelTo}, and the tone changes to match the new pace.`
  }
}

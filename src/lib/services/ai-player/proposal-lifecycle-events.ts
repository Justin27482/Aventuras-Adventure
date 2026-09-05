import { eventBus } from '$lib/services/events'

export type AIPlayerProposalLifecycleEventType =
  | 'AIPlayerProposalProposed'
  | 'AIPlayerProposalConsensusStarted'
  | 'AIPlayerProposalConsensusEnded'
  | 'AIPlayerProposalAccepted'

export interface AIPlayerProposalProposedEvent {
  type: 'AIPlayerProposalProposed'
  proposalId: string
  aiPlayerId: string
  campaignId: string
  characterId: string
  sceneMode: string
  action: string
}

export interface AIPlayerProposalConsensusStartedEvent {
  type: 'AIPlayerProposalConsensusStarted'
  campaignId: string
  sessionId: string | null
  audienceKind: 'full_table' | 'player_subset' | 'private_player'
  proposalIds: string[]
}

export interface AIPlayerProposalConsensusEndedEvent {
  type: 'AIPlayerProposalConsensusEnded'
  campaignId: string
  sessionId: string | null
  audienceKind: 'full_table' | 'player_subset' | 'private_player'
  proposalIds: string[]
  interrupted: boolean
  timedOut: boolean
}

export interface AIPlayerProposalAcceptedEvent {
  type: 'AIPlayerProposalAccepted'
  proposalId: string
  campaignId: string
  sessionId: string | null
  aiPlayerId: string
  characterId: string
  action: string
}

export type AIPlayerProposalLifecycleEvent =
  | AIPlayerProposalProposedEvent
  | AIPlayerProposalConsensusStartedEvent
  | AIPlayerProposalConsensusEndedEvent
  | AIPlayerProposalAcceptedEvent

export function emitAIPlayerProposalProposed(
  event: Omit<AIPlayerProposalProposedEvent, 'type'>,
): void {
  eventBus.emit<AIPlayerProposalProposedEvent>({
    type: 'AIPlayerProposalProposed',
    ...event,
  })
}

export function emitAIPlayerProposalConsensusStarted(
  event: Omit<AIPlayerProposalConsensusStartedEvent, 'type'>,
): void {
  eventBus.emit<AIPlayerProposalConsensusStartedEvent>({
    type: 'AIPlayerProposalConsensusStarted',
    ...event,
  })
}

export function emitAIPlayerProposalConsensusEnded(
  event: Omit<AIPlayerProposalConsensusEndedEvent, 'type'>,
): void {
  eventBus.emit<AIPlayerProposalConsensusEndedEvent>({
    type: 'AIPlayerProposalConsensusEnded',
    ...event,
  })
}

export function emitAIPlayerProposalAccepted(
  event: Omit<AIPlayerProposalAcceptedEvent, 'type'>,
): void {
  eventBus.emit<AIPlayerProposalAcceptedEvent>({
    type: 'AIPlayerProposalAccepted',
    ...event,
  })
}

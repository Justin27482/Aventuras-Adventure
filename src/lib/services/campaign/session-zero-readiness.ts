import type { ChatMessage } from '$lib/services/campaign/chat-types'
import { SESSION_ZERO_START_MESSAGE } from './session-zero-reset'

export type SessionZeroPhase =
  | 'introductions'
  | 'premises'
  | 'character_creation'
  | 'bonding'
  | 'secrets'

export interface SessionZeroReadiness {
  ready: boolean
  criteria: Array<{ label: string; complete: boolean; required: boolean }>
  blockedReason: string | null
}

export function getSessionZeroReadiness(
  phase: SessionZeroPhase,
  messages: ChatMessage[],
  activePlayerNames: string[],
): SessionZeroReadiness {
  if (phase === 'introductions') {
    const sessionStartedAt =
      messages.find(
        (message) => message.type === 'system' && message.content === SESSION_ZERO_START_MESSAGE,
      )?.timestamp ?? 0
    const introducedNames = new Set(
      messages
        .filter(
          (message) =>
            message.type === 'table_talk' &&
            message.actorName !== 'GM' &&
            message.timestamp >= sessionStartedAt,
        )
        .map((message) => message.actorName),
    )
    const allIntroduced =
      activePlayerNames.length > 0 && activePlayerNames.every((name) => introducedNames.has(name))
    return {
      ready: allIntroduced,
      criteria: [
        {
          label: 'Every rostered AI Player has introduced themselves',
          complete: allIntroduced,
          required: true,
        },
        {
          label: 'Any desired follow-up Table Talk is complete',
          complete: false,
          required: false,
        },
      ],
      blockedReason: allIntroduced ? null : 'Wait for every rostered AI Player introduction.',
    }
  }

  if (phase === 'premises') {
    const premiseMessage = messages.findLast(
      (message) => message.type === 'system' && message.content.startsWith('Campaign premise:'),
    )
    const premiseShared = Boolean(premiseMessage)
    const playerQuestions = new Set(
      messages
        .filter(
          (message) =>
            message.type === 'table_talk' &&
            message.actorName !== 'GM' &&
            message.timestamp >= (premiseMessage?.timestamp ?? Number.POSITIVE_INFINITY),
        )
        .map((message) => message.actorName),
    )
    const allPlayersAsked =
      activePlayerNames.length > 0 && activePlayerNames.every((name) => playerQuestions.has(name))
    return {
      ready: premiseShared && allPlayersAsked,
      criteria: [
        { label: 'Campaign premise has been shared', complete: premiseShared, required: true },
        {
          label: 'Every rostered AI Player has had a chance to ask a question',
          complete: allPlayersAsked,
          required: true,
        },
        {
          label: 'The GM has answered the questions that matter',
          complete: false,
          required: false,
        },
      ],
      blockedReason: !premiseShared
        ? 'Share the campaign premise with the table.'
        : !allPlayersAsked
          ? 'Wait for each rostered AI Player question.'
          : null,
    }
  }

  const plannedCriteria: Record<Exclude<SessionZeroPhase, 'introductions' | 'premises'>, string> = {
    character_creation:
      'Create, review, and approve a character sheet for each participating AI Player',
    bonding: 'Run the party bonding scene and record relationship outcomes',
    secrets: 'Review optional private hooks and persist approved secrets',
  }
  return {
    ready: false,
    criteria: [{ label: plannedCriteria[phase], complete: false, required: true }],
    blockedReason: 'This phase workflow is not implemented yet.',
  }
}

import type { ChatMessage } from './chat-types'

export const SESSION_ZERO_START_MESSAGE =
  'Session Zero has begun. Meet the table before the first scene.'

export function getSessionZeroAttempt(
  messages: ChatMessage[],
): { startedAt: number; messageIds: string[] } | null {
  const startMarker = messages.findLast(
    (message) => message.type === 'system' && message.content === SESSION_ZERO_START_MESSAGE,
  )
  if (!startMarker) return null

  return {
    startedAt: startMarker.timestamp,
    messageIds: messages
      .filter(
        (message) => message.sessionId === null && message.timestamp >= startMarker.timestamp,
      )
      .map((message) => message.id),
  }
}
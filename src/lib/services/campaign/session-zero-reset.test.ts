import { describe, expect, it } from 'vitest'
import type { ChatMessage } from './chat-types'
import { getSessionZeroAttempt, SESSION_ZERO_START_MESSAGE } from './session-zero-reset'

function message(
  id: string,
  timestamp: number,
  sessionId: string | null,
  type: 'system' | 'table_talk' = 'table_talk',
  content = id,
): ChatMessage {
  return {
    id,
    type,
    campaignId: 'campaign-1',
    sessionId,
    timestamp,
    audience: 'full_table',
    visibility: 'player_safe',
    actorId: null,
    actorName: type === 'system' ? 'SYSTEM' : 'GM',
    content,
    ...(type === 'system'
      ? { severity: 'info' as const }
      : { intensity: 4, sentiment: 'neutral' as const }),
  } as ChatMessage
}

describe('getSessionZeroAttempt', () => {
  it('selects only sessionless messages from the latest Session Zero start onward', () => {
    const attempt = getSessionZeroAttempt([
      message('earlier-table-talk', 5, null),
      message('old-start', 10, null, 'system', SESSION_ZERO_START_MESSAGE),
      message('old-intro', 11, null),
      message('latest-start', 20, null, 'system', SESSION_ZERO_START_MESSAGE),
      message('latest-intro', 21, null),
      message('normal-session-message', 22, 'session-1'),
    ])

    expect(attempt).toEqual({
      startedAt: 20,
      messageIds: ['latest-start', 'latest-intro'],
    })
  })

  it('returns null when no attempt marker exists', () => {
    expect(getSessionZeroAttempt([message('table-talk', 1, null)])).toBeNull()
  })
})
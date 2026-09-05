import { describe, expect, it } from 'vitest'
import type { ChatMessage } from './chat-types'
import { getSessionZeroReadiness } from './session-zero-readiness'

function message(
  type: 'system' | 'table_talk',
  actorName: string,
  content: string,
  timestamp: number,
): ChatMessage {
  return {
    id: `${type}-${actorName}-${timestamp}`,
    type,
    campaignId: 'campaign-1',
    sessionId: null,
    timestamp,
    audience: 'full_table',
    visibility: 'player_safe',
    actorId: null,
    actorName,
    content,
    ...(type === 'system'
      ? { severity: 'info' as const, icon: 'test' }
      : { intensity: 4, sentiment: 'neutral' as const, emoji: '' }),
  } as ChatMessage
}

describe('getSessionZeroReadiness', () => {
  it('unlocks introductions only after every rostered player introduces themselves', () => {
    const messages = [
      message(
        'system',
        'SYSTEM',
        'Session Zero has begun. Meet the table before the first scene.',
        10,
      ),
      message('table_talk', 'Mara', 'I enjoy tactical mysteries.', 11),
      message('table_talk', 'Rowan', 'I keep the group moving.', 12),
    ]

    expect(getSessionZeroReadiness('introductions', messages, ['Mara', 'Rowan']).ready).toBe(true)
    expect(
      getSessionZeroReadiness('introductions', messages, ['Mara', 'Rowan', 'Tamsin']).ready,
    ).toBe(false)
  })

  it('counts premise questions only after the premise was shared', () => {
    const messages = [
      message('table_talk', 'Mara', 'My introduction.', 10),
      message('system', 'SYSTEM', 'Campaign premise: The old city is waking.', 20),
      message('table_talk', 'Rowan', 'Who controls the gates?', 21),
    ]

    expect(getSessionZeroReadiness('premises', messages, ['Mara', 'Rowan']).ready).toBe(false)
    messages.push(message('table_talk', 'Mara', 'What does the city remember?', 22))
    expect(getSessionZeroReadiness('premises', messages, ['Mara', 'Rowan']).ready).toBe(true)
  })

  it('blocks phases whose owning workflows are not implemented', () => {
    const readiness = getSessionZeroReadiness('character_creation', [], ['Mara'])

    expect(readiness.ready).toBe(false)
    expect(readiness.blockedReason).toContain('not implemented')
    expect(readiness.criteria[0].label).toContain('character sheet')
  })
})

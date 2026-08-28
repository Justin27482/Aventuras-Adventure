import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockDatabase } = vi.hoisted(() => ({
  mockDatabase: {
    addRollLedgerEntry: vi.fn(),
    getSceneTurnState: vi.fn(),
  },
}))

vi.mock('$lib/services/database', () => ({
  database: mockDatabase,
}))

import type { RulesetCheckRule } from '$lib/types'
import { roll, replayRoll } from './dice-service'

const CHECK_RULE: RulesetCheckRule = {
  id: 'rule-1',
  rulesetId: 'd20-classic',
  key: 'standard-check',
  label: 'Standard Check',
  notation: '1d20',
  // No critical thresholds here: this suite tests DC/margin band resolution in
  // isolation. Natural-roll critical thresholds are covered in outcome-bands.test.ts.
  criticalSuccessThreshold: null,
  criticalFailureThreshold: null,
  outcomeBands: [
    { label: 'success', minMargin: 0, maxMargin: null },
    { label: 'failure', minMargin: null, maxMargin: -1 },
  ],
  sortOrder: 0,
}

describe('roll()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDatabase.getSceneTurnState.mockResolvedValue(null)
  })

  it('persists a ledger entry for every roll', async () => {
    const { entry } = await roll({ campaignId: 'campaign-1', notation: '1d20+5' })

    expect(mockDatabase.addRollLedgerEntry).toHaveBeenCalledTimes(1)
    expect(mockDatabase.addRollLedgerEntry).toHaveBeenCalledWith(entry)
    expect(entry.campaignId).toBe('campaign-1')
    expect(entry.notation).toBe('1d20+5')
    expect(entry.modifier).toBe(5)
  })

  it('is reproducible: replaying a logged roll yields the same total', async () => {
    const { entry } = await roll({ campaignId: 'campaign-1', notation: '4d6kh3' })
    const replayed = replayRoll(entry)
    // Ledger total includes any bias; replay reproduces the raw dice evaluation only.
    expect(replayed.total).toBe(entry.total - (entry.biasApplied?.amount ?? 0))
  })

  it('applies an explicit bias to the total and always logs it', async () => {
    const { entry } = await roll({
      campaignId: 'campaign-1',
      notation: '1d20',
      bias: { type: 'fudge', amount: 3, note: 'story pacing nudge' },
    })

    const replayed = replayRoll(entry)
    expect(entry.total).toBe(replayed.total + 3)
    expect(entry.biasApplied).toEqual({ type: 'fudge', amount: 3, note: 'story pacing nudge' })
  })

  it('resolves outcome bands using the provided check rule and DC', async () => {
    const successResult = await roll({
      campaignId: 'campaign-1',
      notation: '1d20+100', // guaranteed to beat any reasonable DC
      dc: 10,
      checkRule: CHECK_RULE,
    })
    expect(successResult.outcome).toBe('success')

    const failureResult = await roll({
      campaignId: 'campaign-1',
      notation: '1d20-100', // guaranteed to fail
      dc: 10,
      checkRule: CHECK_RULE,
    })
    expect(failureResult.outcome).toBe('failure')
  })

  it('resolves plain success or failure when a DC is provided without a check rule', async () => {
    const successResult = await roll({
      campaignId: 'campaign-1',
      notation: '1d20+100',
      dc: 10,
    })
    expect(successResult.outcome).toBe('success')

    const failureResult = await roll({
      campaignId: 'campaign-1',
      notation: '1d20-100',
      dc: 10,
    })
    expect(failureResult.outcome).toBe('failure')
  })

  it('records optional metadata (session, actor, reason, visibility)', async () => {
    const { entry } = await roll({
      campaignId: 'campaign-1',
      sessionId: 'session-1',
      actorId: 'character-1',
      notation: '1d20',
      reason: 'Stealth check past the guard',
      visibility: 'director_only',
    })

    expect(entry.sessionId).toBe('session-1')
    expect(entry.actorId).toBe('character-1')
    expect(entry.reason).toBe('Stealth check past the guard')
    expect(entry.visibility).toBe('director_only')
  })

  it('uses active actor from scene turn state when actorId is omitted', async () => {
    mockDatabase.getSceneTurnState.mockResolvedValue({
      id: 'state-1',
      campaignId: 'campaign-1',
      entryId: null,
      sceneMode: 'combat',
      turnOrderMode: 'round_robin',
      activeActorId: 'character-active',
      actorOrder: ['character-active', 'character-other'],
      turnNumber: 2,
      createdAt: 1,
      updatedAt: 1,
    })

    const { entry } = await roll({
      campaignId: 'campaign-1',
      notation: '1d20+3',
      reason: 'Perception check',
    })

    expect(entry.actorId).toBe('character-active')
    expect(mockDatabase.getSceneTurnState).toHaveBeenCalledWith('campaign-1', null)
  })
})

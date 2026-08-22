import { describe, expect, it } from 'vitest'
import { resolveOutcome } from './outcome-bands'
import type { RulesetCheckRule } from '$lib/types'

const D20_RULE: RulesetCheckRule = {
  id: 'rule-1',
  rulesetId: 'd20-classic',
  key: 'standard-check',
  label: 'Standard Check',
  notation: '1d20',
  criticalSuccessThreshold: 20,
  criticalFailureThreshold: 1,
  outcomeBands: [
    { label: 'success', minMargin: 0, maxMargin: null },
    { label: 'failure', minMargin: null, maxMargin: -1 },
  ],
  sortOrder: 0,
}

const NARRATIVE_2D6_RULE: RulesetCheckRule = {
  id: 'rule-2',
  rulesetId: 'narrative-2d6',
  key: 'narrative-check',
  label: 'Narrative Check',
  notation: '2d6',
  criticalSuccessThreshold: null,
  criticalFailureThreshold: null,
  outcomeBands: [
    { label: 'full_success', minMargin: 10, maxMargin: null },
    { label: 'partial_success', minMargin: 7, maxMargin: 9 },
    { label: 'failure', minMargin: null, maxMargin: 6 },
  ],
  sortOrder: 0,
}

describe('resolveOutcome', () => {
  it('returns null when no check rule is provided', () => {
    expect(resolveOutcome({ total: 15, effectiveValues: [15] }, 10, null)).toBeNull()
  })

  it('returns null when no DC is provided and no crit threshold is hit', () => {
    expect(resolveOutcome({ total: 15, effectiveValues: [10] }, null, D20_RULE)).toBeNull()
  })

  it('flags a natural roll at/above the critical success threshold', () => {
    const outcome = resolveOutcome({ total: 25, effectiveValues: [20] }, 10, D20_RULE)
    expect(outcome).toBe('critical_success')
  })

  it('flags a natural roll at/below the critical failure threshold, even with a high total', () => {
    const outcome = resolveOutcome({ total: 101, effectiveValues: [1] }, 10, D20_RULE)
    expect(outcome).toBe('critical_failure')
  })

  it('resolves success/failure by margin against DC', () => {
    expect(resolveOutcome({ total: 15, effectiveValues: [10] }, 10, D20_RULE)).toBe('success')
    expect(resolveOutcome({ total: 9, effectiveValues: [4] }, 10, D20_RULE)).toBe('failure')
  })

  it('resolves custom outcome-band labels (narrative 2d6 full/partial/failure)', () => {
    // Convention: narrative 2d6 checks pass dc: 0 so margin equals the raw total.
    expect(resolveOutcome({ total: 11, effectiveValues: [6, 5] }, 0, NARRATIVE_2D6_RULE)).toBe(
      'full_success',
    )
    expect(resolveOutcome({ total: 8, effectiveValues: [5, 3] }, 0, NARRATIVE_2D6_RULE)).toBe(
      'partial_success',
    )
    expect(resolveOutcome({ total: 4, effectiveValues: [2, 2] }, 0, NARRATIVE_2D6_RULE)).toBe(
      'failure',
    )
  })

  it('falls back to a plain success/failure if no band matches', () => {
    const misconfigured: RulesetCheckRule = { ...D20_RULE, outcomeBands: [] }
    expect(resolveOutcome({ total: 15, effectiveValues: [10] }, 10, misconfigured)).toBe('success')
    expect(resolveOutcome({ total: 5, effectiveValues: [10] }, 10, misconfigured)).toBe('failure')
  })
})

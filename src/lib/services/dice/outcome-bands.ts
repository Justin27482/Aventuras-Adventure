/**
 * Check-rule outcome resolution: turns a roll total (and optional DC) into a
 * ruleset-defined outcome label using its critical thresholds and outcome bands.
 */

import type { RulesetCheckRule, RollOutcome } from '$lib/types'
import { STANDARD_ROLL_OUTCOMES } from '$lib/types'

export function resolveOutcome(
  evaluation: { total: number; effectiveValues: number[] },
  dc: number | null,
  checkRule: RulesetCheckRule | null,
): RollOutcome {
  if (!checkRule) return null

  // Critical thresholds are checked against the natural (pre-modifier) roll of
  // the first die, matching standard "natural 20 / natural 1" semantics.
  const naturalRoll = evaluation.effectiveValues[0]
  if (
    checkRule.criticalSuccessThreshold !== null &&
    naturalRoll !== undefined &&
    naturalRoll >= checkRule.criticalSuccessThreshold
  ) {
    return STANDARD_ROLL_OUTCOMES.criticalSuccess
  }
  if (
    checkRule.criticalFailureThreshold !== null &&
    naturalRoll !== undefined &&
    naturalRoll <= checkRule.criticalFailureThreshold
  ) {
    return STANDARD_ROLL_OUTCOMES.criticalFailure
  }

  if (dc === null) return null

  const margin = evaluation.total - dc
  for (const band of checkRule.outcomeBands) {
    const withinMin = band.minMargin === null || margin >= band.minMargin
    const withinMax = band.maxMargin === null || margin <= band.maxMargin
    if (withinMin && withinMax) return band.label
  }

  // No configured band matched (misconfigured ruleset) - fall back to a plain pass/fail.
  return margin >= 0 ? STANDARD_ROLL_OUTCOMES.success : STANDARD_ROLL_OUTCOMES.failure
}

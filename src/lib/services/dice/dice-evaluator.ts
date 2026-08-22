/**
 * Pure evaluator for parsed dice notation. Deterministic given the same RNG sequence.
 */

import type { ParsedDiceNotation } from './notation-parser'
import { rollDie } from './seeded-rng'

export interface DiceEvaluationResult {
  /** Every individual die rolled, in roll order, including rerolls/explosions (audit log). */
  rolls: number[]
  /** Per-position die values used for the kept/summed total (after reroll, before explosion bonus). */
  effectiveValues: number[]
  /** Values actually kept toward the sum after kh/kl selection. */
  kept: number[]
  /** Extra total contributed by exploding dice (already excluded from `kept`). */
  explosionBonus: number
  modifier: number
  total: number
}

// Safety cap so a misconfigured 100%-explode notation (e.g. 1d1!) can't hang the app.
const MAX_EXPLOSIONS_PER_DIE = 100

export function evaluateDiceNotation(
  parsed: ParsedDiceNotation,
  rng: () => number,
): DiceEvaluationResult {
  const { count, sides, keep, reroll, exploding, modifier, clampMin, clampMax } = parsed

  const rolls: number[] = []
  const effectiveValues: number[] = []
  let explosionBonus = 0

  for (let i = 0; i < count; i++) {
    let value = rollDie(rng, sides)
    rolls.push(value)

    // Reroll once if this face is in the reroll set; the new value replaces it.
    if (reroll.includes(value)) {
      value = rollDie(rng, sides)
      rolls.push(value)
    }
    effectiveValues.push(value)

    if (exploding && value === sides) {
      let explosions = 0
      let bonusRoll = value
      while (bonusRoll === sides && explosions < MAX_EXPLOSIONS_PER_DIE) {
        bonusRoll = rollDie(rng, sides)
        rolls.push(bonusRoll)
        explosionBonus += bonusRoll
        explosions++
      }
    }
  }

  let kept: number[]
  if (keep) {
    const sorted = [...effectiveValues].sort((a, b) => (keep.mode === 'kh' ? b - a : a - b))
    kept = sorted.slice(0, keep.count)
  } else {
    kept = effectiveValues
  }

  const keptSum = kept.reduce((sum, value) => sum + value, 0)
  let total = keptSum + explosionBonus + modifier

  if (clampMin !== null) total = Math.max(clampMin, total)
  if (clampMax !== null) total = Math.min(clampMax, total)

  return { rolls, effectiveValues, kept, explosionBonus, modifier, total }
}

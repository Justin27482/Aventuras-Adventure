import { describe, expect, it } from 'vitest'
import { evaluateDiceNotation } from './dice-evaluator'
import { parseDiceNotation } from './notation-parser'

/** Returns an RNG that yields the given [0,1) values in order, then repeats the last one. */
function fakeRng(values: number[]): () => number {
  let i = 0
  return () => values[Math.min(i++, values.length - 1)]
}

describe('evaluateDiceNotation', () => {
  it('sums a basic NdX with a flat modifier', () => {
    // 1d20+5, rng -> 0.5 maps to floor(0.5*20)+1 = 11
    const parsed = parseDiceNotation('1d20+5')
    const result = evaluateDiceNotation(parsed, fakeRng([0.5]))
    expect(result.effectiveValues).toEqual([11])
    expect(result.total).toBe(16)
  })

  it('keeps the highest N dice', () => {
    // 4d6kh3 with rolls 1,6,3,6 -> keep top 3: 6,6,3 = 15
    const parsed = parseDiceNotation('4d6kh3')
    const rng = fakeRng([0.0, 0.9, 0.4, 0.9])
    const result = evaluateDiceNotation(parsed, rng)
    expect(result.effectiveValues).toEqual([1, 6, 3, 6])
    expect(result.kept.sort((a, b) => b - a)).toEqual([6, 6, 3])
    expect(result.total).toBe(15)
  })

  it('keeps the lowest N dice', () => {
    const parsed = parseDiceNotation('2d20kl1')
    const rng = fakeRng([0.9, 0.1]) // -> 19, 3
    const result = evaluateDiceNotation(parsed, rng)
    expect(result.total).toBe(3)
  })

  it('rerolls a matching face exactly once', () => {
    // 1d6r1: first roll is a 1 (0/6), reroll gives 4 (3/6)
    const parsed = parseDiceNotation('1d6r1')
    const rng = fakeRng([0 / 6, 3 / 6])
    const result = evaluateDiceNotation(parsed, rng)
    expect(result.rolls).toEqual([1, 4])
    expect(result.effectiveValues).toEqual([4])
    expect(result.total).toBe(4)
  })

  it('explodes on max face and adds the bonus to the total', () => {
    // 1d6!: first roll max (6), explosion rolls a 3, stops (not max)
    const parsed = parseDiceNotation('1d6!')
    const rng = fakeRng([0.9, 0.4])
    const result = evaluateDiceNotation(parsed, rng)
    expect(result.rolls).toEqual([6, 3])
    expect(result.explosionBonus).toBe(3)
    expect(result.total).toBe(9) // kept 6 + explosion 3
  })

  it('applies clampMin and clampMax after modifiers', () => {
    const parsed = parseDiceNotation('1d20-10 clamp(1,20)')
    const result = evaluateDiceNotation(parsed, fakeRng([0])) // roll 1, -10 => -9, clamp to 1
    expect(result.total).toBe(1)
  })
})

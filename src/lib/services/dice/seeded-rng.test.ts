import { describe, expect, it } from 'vitest'
import { createSeededRng, rollDie } from './seeded-rng'

describe('createSeededRng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = createSeededRng('campaign-1:roll-42')
    const b = createSeededRng('campaign-1:roll-42')
    const sequenceA = Array.from({ length: 10 }, () => a())
    const sequenceB = Array.from({ length: 10 }, () => b())
    expect(sequenceA).toEqual(sequenceB)
  })

  it('produces a different sequence for a different seed', () => {
    const a = createSeededRng('seed-a')
    const b = createSeededRng('seed-b')
    const sequenceA = Array.from({ length: 10 }, () => a())
    const sequenceB = Array.from({ length: 10 }, () => b())
    expect(sequenceA).not.toEqual(sequenceB)
  })

  it('always yields values in [0, 1)', () => {
    const rng = createSeededRng('range-check')
    for (let i = 0; i < 1000; i++) {
      const value = rng()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('rollDie stays within [1, sides] and is reproducible for a seed', () => {
    const rollWith = (seed: string) => {
      const rng = createSeededRng(seed)
      return Array.from({ length: 20 }, () => rollDie(rng, 6))
    }
    const first = rollWith('dice-seed')
    const second = rollWith('dice-seed')
    expect(first).toEqual(second)
    for (const value of first) {
      expect(value).toBeGreaterThanOrEqual(1)
      expect(value).toBeLessThanOrEqual(6)
    }
  })
})

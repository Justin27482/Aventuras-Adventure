import { describe, expect, it } from 'vitest'
import { parseDiceNotation } from './notation-parser'

describe('parseDiceNotation', () => {
  it('parses a basic NdX', () => {
    expect(parseDiceNotation('1d20')).toEqual({
      count: 1,
      sides: 20,
      keep: null,
      reroll: [],
      exploding: false,
      modifier: 0,
      clampMin: null,
      clampMax: null,
    })
  })

  it('defaults count to 1 when omitted', () => {
    expect(parseDiceNotation('d6').count).toBe(1)
  })

  it('parses flat modifiers, including multiple chained terms', () => {
    const parsed = parseDiceNotation('1d20+5-2')
    expect(parsed.modifier).toBe(3)
  })

  it('parses keep-highest and keep-lowest', () => {
    expect(parseDiceNotation('4d6kh3').keep).toEqual({ mode: 'kh', count: 3 })
    expect(parseDiceNotation('2d20kl1').keep).toEqual({ mode: 'kl', count: 1 })
  })

  it('rejects a keep count larger than the dice pool', () => {
    expect(() => parseDiceNotation('2d6kh3')).toThrow()
  })

  it('expands advantage/disadvantage shorthand to 2d20', () => {
    const adv = parseDiceNotation('adv+2')
    expect(adv.count).toBe(2)
    expect(adv.sides).toBe(20)
    expect(adv.keep).toEqual({ mode: 'kh', count: 1 })
    expect(adv.modifier).toBe(2)

    const dis = parseDiceNotation('dis')
    expect(dis.keep).toEqual({ mode: 'kl', count: 1 })
  })

  it('parses reroll and exploding markers', () => {
    const parsed = parseDiceNotation('1d20r1!')
    expect(parsed.reroll).toEqual([1])
    expect(parsed.exploding).toBe(true)
  })

  it('parses a clamp suffix regardless of position', () => {
    const parsed = parseDiceNotation('1d20+5 clamp(1,20)')
    expect(parsed.clampMin).toBe(1)
    expect(parsed.clampMax).toBe(20)
    expect(parsed.modifier).toBe(5)
  })

  it('is whitespace tolerant', () => {
    expect(parseDiceNotation('  1 d20 + 5  ')).toEqual(parseDiceNotation('1d20+5'))
  })

  it('throws on empty notation', () => {
    expect(() => parseDiceNotation('')).toThrow()
    expect(() => parseDiceNotation('   ')).toThrow()
  })

  it('throws on invalid notation', () => {
    expect(() => parseDiceNotation('not-dice')).toThrow()
  })

  it('throws on unrecognized trailing content', () => {
    expect(() => parseDiceNotation('1d20xyz')).toThrow()
  })
})

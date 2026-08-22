import { describe, expect, it } from 'vitest'
import { evaluateFormula } from './resource-formulas'

describe('evaluateFormula', () => {
  it('evaluates a plain number', () => {
    expect(evaluateFormula('42', {})).toBe(42)
  })

  it('resolves identifiers from the context', () => {
    expect(evaluateFormula('constitution', { constitution: 14 })).toBe(14)
  })

  it('applies operator precedence (multiplication before addition)', () => {
    expect(evaluateFormula('10 + constitution + level * 5', { constitution: 14, level: 3 })).toBe(
      10 + 14 + 3 * 5,
    )
  })

  it('supports parentheses', () => {
    expect(evaluateFormula('(10 + constitution) * level', { constitution: 4, level: 2 })).toBe(28)
  })

  it('supports subtraction and division', () => {
    expect(evaluateFormula('20 - 8 / 2', {})).toBe(16)
  })

  it('supports unary minus', () => {
    expect(evaluateFormula('-5 + 10', {})).toBe(5)
  })

  it('is whitespace tolerant', () => {
    expect(evaluateFormula('  10   +   constitution  ', { constitution: 2 })).toBe(12)
  })

  it('throws on an unknown identifier', () => {
    expect(() => evaluateFormula('strength', {})).toThrow(/Unknown identifier/)
  })

  it('throws on an invalid character', () => {
    expect(() => evaluateFormula('10 + @', {})).toThrow()
  })

  it('throws on mismatched parentheses', () => {
    expect(() => evaluateFormula('(10 + 5', {})).toThrow()
  })

  it('throws on unexpected trailing tokens', () => {
    expect(() => evaluateFormula('10 5', {})).toThrow()
  })
})

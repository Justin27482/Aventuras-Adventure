import { describe, expect, it } from 'vitest'
import { extractInlineOOC } from './extractInlineOOC'

describe('extractInlineOOC', () => {
  it('splits a double-parenthesis aside out of in-character prose', () => {
    const result = extractInlineOOC(
      'She steps forward. ((not sure this fits the scene)) Then she draws her sword.',
    )

    expect(result.ic).toBe('She steps forward. Then she draws her sword.')
    expect(result.oocSegments).toEqual(['not sure this fits the scene'])
  })

  it('splits an explicit "(OOC: ...)" marker', () => {
    const result = extractInlineOOC('I hand over the letter. (OOC: skipping ahead a bit)')

    expect(result.ic).toBe('I hand over the letter.')
    expect(result.oocSegments).toEqual(['skipping ahead a bit'])
  })

  it('splits a bracketed "[OOC: ...]" marker', () => {
    const result = extractInlineOOC('[OOC: quick question] I nod and step back.')

    expect(result.ic).toBe('I nod and step back.')
    expect(result.oocSegments).toEqual(['quick question'])
  })

  it('collects multiple OOC asides in order', () => {
    const result = extractInlineOOC('One. ((first aside)) Two. (OOC: second aside) Three.')

    expect(result.ic).toBe('One. Two. Three.')
    expect(result.oocSegments).toEqual(['first aside', 'second aside'])
  })

  it('leaves plain parentheticals without an OOC marker untouched', () => {
    const result = extractInlineOOC('She whispers (quietly) so no one else hears.')

    expect(result.ic).toBe('She whispers (quietly) so no one else hears.')
    expect(result.oocSegments).toEqual([])
  })

  it('returns the original text unchanged when there is no OOC aside', () => {
    const result = extractInlineOOC('The door creaks open.')

    expect(result.ic).toBe('The door creaks open.')
    expect(result.oocSegments).toEqual([])
  })
})

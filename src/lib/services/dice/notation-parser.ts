/**
 * Dice notation parser.
 *
 * Supports: NdX, flat +/- modifiers, keep-highest/lowest (khN/klN),
 * advantage/disadvantage shorthand (adv/dis -> 2d20kh1/kl1), reroll-once
 * (rN, repeatable), exploding dice (!), and a clamp(min,max) suffix.
 *
 * Examples: "1d20+5", "4d6kh3", "adv+2", "1d6!", "1d20r1 clamp(1,20)"
 */

export interface ParsedDiceNotation {
  count: number
  sides: number
  keep: { mode: 'kh' | 'kl'; count: number } | null
  /** Face values that trigger a single reroll for that die. */
  reroll: number[]
  exploding: boolean
  modifier: number
  clampMin: number | null
  clampMax: number | null
}

const CLAMP_RE = /clamp\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/i
const ADV_DIS_RE = /\b(adv|dis)\b/i
const DICE_TERM_RE = /^(\d*)d(\d+)/i
const KEEP_RE = /^(kh|kl)(\d+)/i
const REROLL_RE = /^r(\d+)/i
const EXPLODE_RE = /^!/
const MODIFIER_RE = /^([+-]\d+)/

export function parseDiceNotation(notation: string): ParsedDiceNotation {
  if (!notation || !notation.trim()) {
    throw new Error('Dice notation cannot be empty')
  }

  let working = notation.replace(/\s+/g, '')

  let clampMin: number | null = null
  let clampMax: number | null = null
  const clampMatch = working.match(CLAMP_RE)
  if (clampMatch) {
    clampMin = Number(clampMatch[1])
    clampMax = Number(clampMatch[2])
    working = working.slice(0, clampMatch.index) + working.slice(clampMatch.index! + clampMatch[0].length)
  }

  let advantage: 'adv' | 'dis' | null = null
  const advMatch = working.match(ADV_DIS_RE)
  if (advMatch) {
    advantage = advMatch[1].toLowerCase() as 'adv' | 'dis'
    working = working.slice(0, advMatch.index) + working.slice(advMatch.index! + advMatch[0].length)
  }

  let count: number
  let sides: number
  let keep: ParsedDiceNotation['keep'] = null

  if (advantage) {
    count = 2
    sides = 20
    keep = { mode: advantage === 'adv' ? 'kh' : 'kl', count: 1 }
  } else {
    const diceMatch = working.match(DICE_TERM_RE)
    if (!diceMatch) {
      throw new Error(`Invalid dice notation: "${notation}"`)
    }
    count = diceMatch[1] ? Number(diceMatch[1]) : 1
    sides = Number(diceMatch[2])
    working = working.slice(diceMatch[0].length)

    const keepMatch = working.match(KEEP_RE)
    if (keepMatch) {
      keep = { mode: keepMatch[1].toLowerCase() as 'kh' | 'kl', count: Number(keepMatch[2]) }
      working = working.slice(keepMatch[0].length)
    }
  }

  if (count < 1 || sides < 2) {
    throw new Error(`Invalid dice notation: "${notation}"`)
  }
  if (keep && (keep.count < 1 || keep.count > count)) {
    throw new Error(`Invalid keep count in notation: "${notation}"`)
  }

  const reroll: number[] = []
  let rerollMatch: RegExpMatchArray | null
  while ((rerollMatch = working.match(REROLL_RE))) {
    reroll.push(Number(rerollMatch[1]))
    working = working.slice(rerollMatch[0].length)
  }

  let exploding = false
  if (EXPLODE_RE.test(working)) {
    exploding = true
    working = working.replace(EXPLODE_RE, '')
  }

  let modifier = 0
  let modMatch: RegExpMatchArray | null
  while ((modMatch = working.match(MODIFIER_RE))) {
    modifier += Number(modMatch[1])
    working = working.slice(modMatch[0].length)
  }

  if (working.length > 0) {
    throw new Error(`Unrecognized trailing notation in "${notation}": "${working}"`)
  }

  return { count, sides, keep, reroll, exploding, modifier, clampMin, clampMax }
}

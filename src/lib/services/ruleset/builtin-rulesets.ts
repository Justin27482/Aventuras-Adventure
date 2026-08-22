/**
 * Built-in ruleset seed data (Phase 2, task 2.3).
 *
 * These are generic, non-proprietary mechanical structures inspired by common
 * tabletop patterns (ability scores, d20 checks, 2d6 narrative bands, dice
 * ladders). No copyrighted rules text, tables, or trademarked mechanic names
 * are reproduced here — only structural stat/skill/check scaffolding that a
 * GM can freely customize per campaign.
 */

import type { OutcomeBand } from '$lib/types'

export interface BuiltinRulesetSeed {
  id: string
  name: string
  description: string
  diceSystem: string
  defaultCheckRuleKey: string
  stats: Array<{
    key: string
    label: string
    defaultValue: number
    minValue: number | null
    maxValue: number | null
  }>
  skills: Array<{ key: string; label: string; governingStatKey: string | null }>
  checkRules: Array<{
    key: string
    label: string
    notation: string
    criticalSuccessThreshold: number | null
    criticalFailureThreshold: number | null
    outcomeBands: OutcomeBand[]
  }>
  conditions: Array<{ key: string; label: string; description: string | null }>
  slots: Array<{ key: string; label: string }>
  abilities: Array<{
    key: string
    label: string
    description: string | null
    resourceKey: string | null
    resourceCost: number
  }>
  levels: Array<{ level: number; label: string | null; xpThreshold: number | null }>
  /** Derived resources (health, mana, etc). See resource-formulas.ts for the expression grammar. */
  resources: Array<{ key: string; label: string; maxFormula: string; minValue: number }>
}

const SIX_STATS = [
  { key: 'strength', label: 'Strength' },
  { key: 'dexterity', label: 'Dexterity' },
  { key: 'constitution', label: 'Constitution' },
  { key: 'intelligence', label: 'Intelligence' },
  { key: 'wisdom', label: 'Wisdom' },
  { key: 'charisma', label: 'Charisma' },
].map((s) => ({ ...s, defaultValue: 10, minValue: 1, maxValue: 20 }))

const STANDARD_SLOTS = [
  { key: 'head', label: 'Head' },
  { key: 'body', label: 'Body' },
  { key: 'hands', label: 'Hands' },
  { key: 'feet', label: 'Feet' },
  { key: 'weapon', label: 'Weapon' },
  { key: 'offhand', label: 'Off-Hand' },
  { key: 'accessory', label: 'Accessory' },
]

const STANDARD_CONDITIONS = [
  { key: 'prone', label: 'Prone', description: 'Knocked down; movement and attacks are hampered.' },
  { key: 'restrained', label: 'Restrained', description: 'Movement is prevented.' },
  { key: 'stunned', label: 'Stunned', description: 'Unable to act for a short duration.' },
  { key: 'poisoned', label: 'Poisoned', description: 'Suffering from a harmful toxin.' },
  { key: 'frightened', label: 'Frightened', description: 'Gripped by fear of a source.' },
  { key: 'invisible', label: 'Invisible', description: 'Unseen by normal vision.' },
]

const D20_SUCCESS_FAILURE_BANDS: OutcomeBand[] = [
  { label: 'success', minMargin: 0, maxMargin: null },
  { label: 'failure', minMargin: null, maxMargin: -1 },
]

export const BUILTIN_RULESETS: BuiltinRulesetSeed[] = [
  {
    id: 'd20-classic',
    name: 'd20 Classic',
    description: 'A standard six-stat, d20-vs-DC system for general fantasy adventures.',
    diceSystem: 'd20',
    defaultCheckRuleKey: 'standard-check',
    stats: SIX_STATS,
    skills: [
      { key: 'athletics', label: 'Athletics', governingStatKey: 'strength' },
      { key: 'acrobatics', label: 'Acrobatics', governingStatKey: 'dexterity' },
      { key: 'stealth', label: 'Stealth', governingStatKey: 'dexterity' },
      { key: 'perception', label: 'Perception', governingStatKey: 'wisdom' },
      { key: 'insight', label: 'Insight', governingStatKey: 'wisdom' },
      { key: 'survival', label: 'Survival', governingStatKey: 'wisdom' },
      { key: 'arcana', label: 'Arcana', governingStatKey: 'intelligence' },
      { key: 'investigation', label: 'Investigation', governingStatKey: 'intelligence' },
      { key: 'persuasion', label: 'Persuasion', governingStatKey: 'charisma' },
      { key: 'deception', label: 'Deception', governingStatKey: 'charisma' },
    ],
    checkRules: [
      {
        key: 'standard-check',
        label: 'Standard Check',
        notation: '1d20',
        criticalSuccessThreshold: 20,
        criticalFailureThreshold: 1,
        outcomeBands: D20_SUCCESS_FAILURE_BANDS,
      },
    ],
    conditions: STANDARD_CONDITIONS,
    slots: STANDARD_SLOTS,
    abilities: [
      {
        key: 'signature-maneuver',
        label: 'Signature Maneuver',
        description: 'A customizable combat technique unique to the character.',
        resourceKey: 'stamina',
        resourceCost: 1,
      },
    ],
    levels: Array.from({ length: 10 }, (_, i) => ({
      level: i + 1,
      label: null,
      xpThreshold: i === 0 ? 0 : i * 1000,
    })),
    resources: [
      { key: 'health', label: 'Health', maxFormula: '10 + constitution + level * 5', minValue: 0 },
      { key: 'stamina', label: 'Stamina', maxFormula: '5 + strength', minValue: 0 },
    ],
  },
  {
    id: 'shadowdark',
    name: 'Shadowdark',
    description:
      'A grim dungeon-crawling system using roll-under-stat checks alongside standard d20 combat rolls.',
    diceSystem: 'd20',
    defaultCheckRuleKey: 'roll-under-stat',
    stats: SIX_STATS,
    skills: [],
    checkRules: [
      {
        key: 'roll-under-stat',
        label: 'Roll Under Stat',
        notation: '1d20',
        criticalSuccessThreshold: 1,
        criticalFailureThreshold: 20,
        // Here "dc" is conventionally passed as the governing stat value; margin = stat - roll.
        outcomeBands: D20_SUCCESS_FAILURE_BANDS,
      },
      {
        key: 'standard-check',
        label: 'Standard Check',
        notation: '1d20',
        criticalSuccessThreshold: 20,
        criticalFailureThreshold: 1,
        outcomeBands: D20_SUCCESS_FAILURE_BANDS,
      },
    ],
    conditions: STANDARD_CONDITIONS,
    slots: STANDARD_SLOTS,
    abilities: [],
    levels: Array.from({ length: 10 }, (_, i) => ({
      level: i + 1,
      label: null,
      xpThreshold: null,
    })),
    resources: [
      { key: 'health', label: 'Health', maxFormula: '8 + constitution + level * 4', minValue: 0 },
    ],
  },
  {
    id: 'narrative-2d6',
    name: 'Narrative 2d6',
    description:
      'A narrative-first system resolving actions on 2d6 + stat, with full/partial/failure bands.',
    diceSystem: '2d6',
    defaultCheckRuleKey: 'narrative-check',
    stats: [
      { key: 'body', label: 'Body', defaultValue: 0, minValue: -2, maxValue: 3 },
      { key: 'mind', label: 'Mind', defaultValue: 0, minValue: -2, maxValue: 3 },
      { key: 'spirit', label: 'Spirit', defaultValue: 0, minValue: -2, maxValue: 3 },
      { key: 'charm', label: 'Charm', defaultValue: 0, minValue: -2, maxValue: 3 },
      { key: 'grit', label: 'Grit', defaultValue: 0, minValue: -2, maxValue: 3 },
    ],
    skills: [],
    checkRules: [
      {
        key: 'narrative-check',
        label: 'Narrative Check',
        notation: '2d6',
        criticalSuccessThreshold: null,
        criticalFailureThreshold: null,
        // Convention: pass dc: 0 for this check; margin equals the raw total.
        outcomeBands: [
          { label: 'full_success', minMargin: 10, maxMargin: null },
          { label: 'partial_success', minMargin: 7, maxMargin: 9 },
          { label: 'failure', minMargin: null, maxMargin: 6 },
        ],
      },
    ],
    conditions: STANDARD_CONDITIONS,
    slots: STANDARD_SLOTS,
    abilities: [],
    levels: [],
    resources: [],
  },
  {
    id: 'freeform-lite',
    name: 'Freeform Lite',
    description: 'A minimal system for GMs who want narrative freedom with an occasional d20 check.',
    diceSystem: 'd20',
    defaultCheckRuleKey: 'simple-check',
    stats: [{ key: 'aptitude', label: 'Aptitude', defaultValue: 0, minValue: null, maxValue: null }],
    skills: [],
    checkRules: [
      {
        key: 'simple-check',
        label: 'Simple Check',
        notation: '1d20',
        criticalSuccessThreshold: null,
        criticalFailureThreshold: null,
        outcomeBands: D20_SUCCESS_FAILURE_BANDS,
      },
    ],
    conditions: [],
    slots: [],
    abilities: [],
    levels: [],
    resources: [],
  },
  {
    id: 'savage-worlds-style',
    name: 'Savage Worlds Style',
    description: 'A dice-ladder inspired system using exploding checks against a fixed target number.',
    diceSystem: 'd20',
    defaultCheckRuleKey: 'exploding-check',
    stats: SIX_STATS,
    skills: [
      { key: 'fighting', label: 'Fighting', governingStatKey: 'strength' },
      { key: 'shooting', label: 'Shooting', governingStatKey: 'dexterity' },
      { key: 'notice', label: 'Notice', governingStatKey: 'wisdom' },
      { key: 'persuasion', label: 'Persuasion', governingStatKey: 'charisma' },
    ],
    checkRules: [
      {
        key: 'exploding-check',
        label: 'Exploding Check',
        notation: '1d6!',
        criticalSuccessThreshold: null,
        criticalFailureThreshold: null,
        outcomeBands: D20_SUCCESS_FAILURE_BANDS,
      },
    ],
    conditions: STANDARD_CONDITIONS,
    slots: STANDARD_SLOTS,
    abilities: [
      {
        key: 'fate-point-reroll',
        label: 'Fate Point Reroll',
        description: 'Spend a fate point to reroll a single failed check.',
        resourceKey: 'fate_points',
        resourceCost: 1,
      },
    ],
    levels: [],
    resources: [
      { key: 'health', label: 'Health', maxFormula: '10 + constitution + level * 5', minValue: 0 },
      { key: 'fate_points', label: 'Fate Points', maxFormula: '3', minValue: 0 },
    ],
  },
  {
    id: 'fifth-edition-compatible',
    name: 'D&D 5th Ed',
    description:
      'A structural scaffold compatible with fifth-edition-style play: six ability scores, proficiency-based skills, and a standard d20 check.',
    diceSystem: 'd20',
    defaultCheckRuleKey: 'standard-check',
    stats: SIX_STATS,
    skills: [
      { key: 'athletics', label: 'Athletics', governingStatKey: 'strength' },
      { key: 'acrobatics', label: 'Acrobatics', governingStatKey: 'dexterity' },
      { key: 'sleight-of-hand', label: 'Sleight of Hand', governingStatKey: 'dexterity' },
      { key: 'stealth', label: 'Stealth', governingStatKey: 'dexterity' },
      { key: 'arcana', label: 'Arcana', governingStatKey: 'intelligence' },
      { key: 'history', label: 'History', governingStatKey: 'intelligence' },
      { key: 'investigation', label: 'Investigation', governingStatKey: 'intelligence' },
      { key: 'nature', label: 'Nature', governingStatKey: 'intelligence' },
      { key: 'religion', label: 'Religion', governingStatKey: 'intelligence' },
      { key: 'animal-handling', label: 'Animal Handling', governingStatKey: 'wisdom' },
      { key: 'insight', label: 'Insight', governingStatKey: 'wisdom' },
      { key: 'medicine', label: 'Medicine', governingStatKey: 'wisdom' },
      { key: 'perception', label: 'Perception', governingStatKey: 'wisdom' },
      { key: 'survival', label: 'Survival', governingStatKey: 'wisdom' },
      { key: 'deception', label: 'Deception', governingStatKey: 'charisma' },
      { key: 'intimidation', label: 'Intimidation', governingStatKey: 'charisma' },
      { key: 'performance', label: 'Performance', governingStatKey: 'charisma' },
      { key: 'persuasion', label: 'Persuasion', governingStatKey: 'charisma' },
    ],
    checkRules: [
      {
        key: 'standard-check',
        label: 'Standard Check',
        notation: '1d20',
        criticalSuccessThreshold: 20,
        criticalFailureThreshold: 1,
        outcomeBands: D20_SUCCESS_FAILURE_BANDS,
      },
    ],
    conditions: STANDARD_CONDITIONS,
    slots: STANDARD_SLOTS,
    abilities: [],
    levels: Array.from({ length: 20 }, (_, i) => ({
      level: i + 1,
      label: null,
      xpThreshold: null,
    })),
    resources: [
      { key: 'health', label: 'Health', maxFormula: '10 + constitution + level * 6', minValue: 0 },
    ],
  },
]

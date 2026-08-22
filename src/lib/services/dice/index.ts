/**
 * Dice engine module (Phase 2): notation parsing, seeded evaluation,
 * outcome-band resolution, and the `roll()` ledger contract.
 */

export { parseDiceNotation, type ParsedDiceNotation } from './notation-parser'
export { createSeededRng, rollDie, generateRollSeed } from './seeded-rng'
export { evaluateDiceNotation, type DiceEvaluationResult } from './dice-evaluator'
export { resolveOutcome } from './outcome-bands'
export { roll, replayRoll, type RollRequest, type RollResult } from './dice-service'

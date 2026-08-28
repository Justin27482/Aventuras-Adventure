/**
 * Dice service: the `roll()` contract used everywhere a check is made.
 * Combines notation parsing, seeded evaluation, outcome resolution, and
 * ledger persistence into a single reproducible, auditable call.
 */

import { database } from '$lib/services/database'
import type { RollLedgerEntry, RollBias, RollVisibility, RulesetCheckRule } from '$lib/types'
import { parseDiceNotation } from './notation-parser'
import { createSeededRng, generateRollSeed } from './seeded-rng'
import { evaluateDiceNotation } from './dice-evaluator'
import { resolveOutcome } from './outcome-bands'

export interface RollRequest {
  campaignId: string
  sessionId?: string | null
  actorId?: string | null
  notation: string
  dc?: number | null
  reason?: string | null
  visibility?: RollVisibility
  /** Ruleset check rule providing critical thresholds and outcome bands, if any. */
  checkRule?: RulesetCheckRule | null
  /**
   * GUARDRAIL: karma/fudge bias must be an explicit, caller-declared nudge.
   * It is always recorded on the ledger entry — never applied silently.
   */
  bias?: RollBias | null
}

export interface RollResult {
  entry: RollLedgerEntry
  outcome: RollLedgerEntry['outcome']
}

export async function roll(request: RollRequest): Promise<RollResult> {
  const parsed = parseDiceNotation(request.notation)
  const seed = generateRollSeed()
  const rng = createSeededRng(seed)
  const evaluation = evaluateDiceNotation(parsed, rng)

  const total = evaluation.total + (request.bias?.amount ?? 0)

  const resolvedOutcome = resolveOutcome(
    { total, effectiveValues: evaluation.effectiveValues },
    request.dc ?? null,
    request.checkRule ?? null,
  )
  const outcome =
    resolvedOutcome ??
    (request.dc === null || request.dc === undefined
      ? null
      : total >= request.dc
        ? 'success'
        : 'failure')

  // Phase 4.9 attribution: if caller omitted actorId, fall back to the
  // campaign's currently active actor from persisted turn state.
  let actorId = request.actorId ?? null
  if (!actorId) {
    const sceneTurnState = await database.getSceneTurnState(request.campaignId, null)
    actorId = sceneTurnState?.activeActorId ?? null
  }

  const entry: RollLedgerEntry = {
    id: crypto.randomUUID(),
    campaignId: request.campaignId,
    sessionId: request.sessionId ?? null,
    actorId,
    notation: request.notation,
    seed,
    rolls: evaluation.rolls,
    modifier: parsed.modifier,
    total,
    dc: request.dc ?? null,
    outcome,
    reason: request.reason ?? null,
    visibility: request.visibility ?? 'player_safe',
    biasApplied: request.bias ?? null,
    createdAt: Date.now(),
  }

  await database.addRollLedgerEntry(entry)

  return { entry, outcome }
}

/** Replays a previously logged roll's seed to verify/reproduce its result. */
export function replayRoll(entry: Pick<RollLedgerEntry, 'notation' | 'seed'>) {
  const parsed = parseDiceNotation(entry.notation)
  const rng = createSeededRng(entry.seed)
  return evaluateDiceNotation(parsed, rng)
}

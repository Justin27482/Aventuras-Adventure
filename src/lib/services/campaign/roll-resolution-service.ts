/**
 * G.4-G.7: Roll Resolution Service
 *
 * Executes rolls based on detected patterns and formats results for chat display.
 * Integrates with the existing DiceService for reproducible, ledger-tracked rolls.
 */

import { roll, type RollRequest, type RollResult } from '$lib/services/dice'
import type { RollLedgerEntry } from '$lib/types'
import { RollDetectionService, type DetectedRoll } from './roll-detection-service'

export interface FormattedRollResult {
  displayLabel: string
  formattedResult: string
  rollEntry: RollLedgerEntry
  outcome: RollResult['outcome']
  succeeded: boolean
  isCritical: boolean
}

export class RollResolutionService {
  /**
   * Execute a detected roll and return formatted result
   */
  static async executeDetectedRoll(
    detected: DetectedRoll,
    request: Omit<RollRequest, 'notation'>,
  ): Promise<FormattedRollResult> {
    if (!detected.found) {
      throw new Error('Cannot execute roll: no roll detected')
    }

    const notation = RollDetectionService.toNotation(detected)
    if (!notation) {
      throw new Error('Could not generate notation from detected roll')
    }

    const rollResult = await roll({
      ...request,
      notation,
      dc: detected.dc ?? request.dc ?? null,
      reason: detected.narrativeContext,
    })

    const displayLabel = RollDetectionService.toLabel(detected)
    const formatted = this.formatRoll(rollResult.entry, displayLabel)

    return {
      ...formatted,
      rollEntry: rollResult.entry,
      outcome: rollResult.outcome,
      succeeded: rollResult.outcome === 'success' || rollResult.outcome === 'critical_success',
      isCritical:
        rollResult.outcome === 'critical_success' || rollResult.outcome === 'critical_failure',
    }
  }

  /**
   * Format roll entry for chat display
   */
  static formatRoll(entry: RollLedgerEntry, label: string): FormattedRollResult {
    let formattedResult = ''

    if (entry.rolls && entry.rolls.length > 0) {
      const rollDetails = entry.rolls.join(', ')
      formattedResult = `[${rollDetails}]`

      if (entry.modifier) {
        formattedResult += ` ${entry.modifier > 0 ? '+' : ''}${entry.modifier}`
      }

      formattedResult += ` = **${entry.total}**`
    } else {
      formattedResult = `**${entry.total}**`
    }

    if (entry.dc !== null && entry.dc !== undefined) {
      formattedResult += ` (vs DC ${entry.dc})`
      if (entry.outcome) {
        const outcomeLabel =
          entry.outcome === 'critical_success'
            ? '🎉 Critical Success!'
            : entry.outcome === 'critical_failure'
              ? '💀 Critical Failure!'
              : entry.outcome === 'success'
                ? '✓ Success'
                : entry.outcome === 'failure'
                  ? '✗ Failure'
                  : ''
        if (outcomeLabel) {
          formattedResult += ` ${outcomeLabel}`
        }
      }
    }

    return {
      displayLabel: label,
      formattedResult,
      rollEntry: entry,
      outcome: entry.outcome,
      succeeded: entry.outcome === 'success' || entry.outcome === 'critical_success',
      isCritical: entry.outcome === 'critical_success' || entry.outcome === 'critical_failure',
    }
  }

  /**
   * Parse DC from narrative context (e.g., "vs DC 15")
   */
  static extractDC(text: string): number | null {
    const match = text.match(/vs\s+dc\s+(\d+)/i)
    return match ? parseInt(match[1], 10) : null
  }

  /**
   * Execute a simple d20 check with optional DC
   */
  static async d20Check(
    campaignId: string,
    actorId: string | null,
    label: string,
    dc?: number | null,
    reason?: string,
  ): Promise<FormattedRollResult> {
    const rollResult = await roll({
      campaignId,
      actorId,
      notation: 'd20',
      dc: dc ?? null,
      reason,
      visibility: 'player_safe',
    })

    return this.formatRoll(rollResult.entry, label)
  }

  /**
   * Execute multiple rolls (e.g., for initiative by all party members)
   */
  static async executeBatch(
    campaignId: string,
    rolls: Array<{
      actorId: string
      label: string
      notation: string
      dc?: number | null
    }>,
  ): Promise<FormattedRollResult[]> {
    return Promise.all(
      rolls.map((r) =>
        roll({
          campaignId,
          actorId: r.actorId,
          notation: r.notation,
          dc: r.dc ?? null,
          visibility: 'player_safe',
        }).then((result) => this.formatRoll(result.entry, r.label)),
      ),
    )
  }
}

export const rollResolutionService = new RollResolutionService()

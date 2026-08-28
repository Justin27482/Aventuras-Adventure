/**
 * RulesValidatorService (Phase 8, task 8.9)
 *
 * Provides contradiction and consistency checks across character sheets,
 * inventory ownership, money balances, party limits, and content safety guardrails.
 */

import type { CampaignPartyMember, CharacterSheet } from '$lib/types'
import { assertNoCoercedConsentMutation, validateMoneyAmount } from './mechanics-rules'

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export class RulesValidatorService {
  /** Validates character sheet stat/resource/level consistency. */
  validateSheet(sheet: CharacterSheet): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    if (sheet.level < 1) errors.push('Level must be at least 1')
    if (sheet.xp < 0) errors.push('XP cannot be negative')

    for (const [key, resource] of Object.entries(sheet.resourceValues)) {
      if (resource.current < 0) {
        errors.push(`Resource "${key}" current value (${resource.current}) cannot be negative`)
      }
      if (resource.max < 0) {
        errors.push(`Resource "${key}" max value (${resource.max}) cannot be negative`)
      }
      if (resource.current > resource.max) {
        warnings.push(
          `Resource "${key}" current (${resource.current}) exceeds max (${resource.max})`,
        )
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    }
  }

  /** Validates money amount and raises an error if negative. */
  validateMoney(amount: number): ValidationResult {
    try {
      validateMoneyAmount(amount)
      return { valid: true, errors: [], warnings: [] }
    } catch (error) {
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : String(error)],
        warnings: [],
      }
    }
  }

  /** Validates party limit constraints. */
  validatePartyLimit(members: CampaignPartyMember[], maxPartySize: number): ValidationResult {
    const activeCount = members.filter((m) => m.active && m.eligibilityStatus === 'eligible').length
    if (activeCount > maxPartySize) {
      return {
        valid: false,
        errors: [`Active party size (${activeCount}) exceeds maximum capacity (${maxPartySize})`],
        warnings: [],
      }
    }
    return { valid: true, errors: [], warnings: [] }
  }

  /** Validates safety hard ban boundaries. */
  validateContentSafety(mutationKind: string, note?: string): ValidationResult {
    try {
      assertNoCoercedConsentMutation({ kind: mutationKind, note })
      return { valid: true, errors: [], warnings: [] }
    } catch (error) {
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : String(error)],
        warnings: [],
      }
    }
  }
}

export const rulesValidatorService = new RulesValidatorService()

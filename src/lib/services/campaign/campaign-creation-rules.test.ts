import { describe, expect, it } from 'vitest'
import {
  canProceedWithoutProtagonist,
  isPartyPendingCreation,
  validatePartyPendingRoster,
} from './campaign-creation-rules'

describe('party-pending campaign creation rules', () => {
  it('allows no protagonist only for Human GM with AI Players deferred creation', () => {
    expect(canProceedWithoutProtagonist('human_gm_ai_players', true)).toBe(true)
    expect(canProceedWithoutProtagonist('human_gm_ai_players', false)).toBe(false)
    expect(canProceedWithoutProtagonist('human_gm_solo', true)).toBe(false)
    expect(canProceedWithoutProtagonist('ai_gm', true)).toBe(false)
  })

  it('requires at least one AI Player in a party-pending roster', () => {
    expect(validatePartyPendingRoster('human_gm_ai_players', true, [])).toBe(false)
    expect(validatePartyPendingRoster('human_gm_ai_players', true, ['ai-1'])).toBe(true)
    expect(validatePartyPendingRoster('human_gm_solo', false, [])).toBe(true)
  })

  it('never treats other campaign modes as party pending', () => {
    expect(isPartyPendingCreation('human_gm_solo', true)).toBe(false)
    expect(isPartyPendingCreation('human_player', true)).toBe(false)
  })
})
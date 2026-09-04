import type { CampaignType } from '$lib/types'

export function isPartyPendingCreation(
  campaignType: CampaignType,
  createPartyDuringSessionZero: boolean,
): boolean {
  return campaignType === 'human_gm_ai_players' && createPartyDuringSessionZero
}

export function canProceedWithoutProtagonist(
  campaignType: CampaignType,
  createPartyDuringSessionZero: boolean,
): boolean {
  return isPartyPendingCreation(campaignType, createPartyDuringSessionZero)
}

export function validatePartyPendingRoster(
  campaignType: CampaignType,
  createPartyDuringSessionZero: boolean,
  rosterIds: string[],
): boolean {
  return !isPartyPendingCreation(campaignType, createPartyDuringSessionZero) || rosterIds.length > 0
}
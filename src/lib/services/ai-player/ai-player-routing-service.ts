import type { CampaignAIPlayer, InteractionAudience } from '$lib/types'
import { database } from '$lib/services/database'

/**
 * AIPlayerRoutingService provides utilities for Phase G turn loop integration:
 * - Detecting if a character is AI-controlled (G.1)
 * - Retrieving AI player information for a campaign (G.2)
 * - Managing interaction audience selection
 */
export class AIPlayerRoutingService {
  /**
   * Check if a character is controlled by an AI player in the given campaign.
   * (G.1: Detect AI player turns)
   */
  async isCharacterAIControlled(campaignId: string, characterId: string): Promise<boolean> {
    try {
      const assignments = await database.getPlayerCharactersForCampaign(campaignId)
      return assignments.some((a) => a.characterId === characterId && !a.leftAt)
    } catch {
      return false
    }
  }

  /**
   * Get the AI player controlling a character, if any.
   * Returns null if the character is not AI-controlled.
   */
  async getAIPlayerForCharacter(
    campaignId: string,
    characterId: string,
  ): Promise<{ aiPlayerId: string; playerCharacterId: string } | null> {
    try {
      const assignments = await database.getPlayerCharactersForCampaign(campaignId)
      const assignment = assignments.find((a) => a.characterId === characterId && !a.leftAt)
      return assignment
        ? { aiPlayerId: assignment.aiPlayerId, playerCharacterId: assignment.id }
        : null
    } catch {
      return null
    }
  }

  /**
   * Get all active AI player assignments for a campaign.
   * Used for G.2: Interaction audience selection.
   */
  async getActiveAIPlayersForCampaign(campaignId: string): Promise<CampaignAIPlayer[]> {
    try {
      const roster = await database.getCampaignAIPlayers(campaignId)
      return roster.filter((member) => !member.leftAt)
    } catch {
      return []
    }
  }

  /**
   * Validate an interaction audience against the active AI players.
   * Returns true if the audience is valid for the campaign.
   */
  async isValidAudience(
    campaignId: string,
    audience: InteractionAudience,
  ): Promise<{ valid: boolean; invalidReason?: string }> {
    try {
      const activeAssignments = await this.getActiveAIPlayersForCampaign(campaignId)
      const activePlayerIds = activeAssignments.map((member) => member.aiPlayerId)

      if (audience.kind === 'full_table') {
        return { valid: true }
      }

      if (audience.kind === 'private_player') {
        if (!activePlayerIds.includes(audience.aiPlayerId)) {
          return {
            valid: false,
            invalidReason: 'Private audience target is not an active AI player',
          }
        }
        return { valid: true }
      }

      if (audience.kind === 'player_subset') {
        if (audience.aiPlayerIds.length === 0) {
          return { valid: false, invalidReason: 'Player subset cannot be empty' }
        }
        const invalid = audience.aiPlayerIds.filter((id) => !activePlayerIds.includes(id))
        if (invalid.length > 0) {
          return { valid: false, invalidReason: `Invalid AI players in subset: ${invalid.join(', ')}` }
        }
        return { valid: true }
      }

      return { valid: false, invalidReason: 'Unknown audience type' }
    } catch (error) {
      return {
        valid: false,
        invalidReason: error instanceof Error ? error.message : 'Error validating audience',
      }
    }
  }
}

export const aiPlayerRoutingService = new AIPlayerRoutingService()

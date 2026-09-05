import type { Campaign, CampaignType } from '$lib/types'

/**
 * G.9-G.10: Campaign Type Service
 *
 * Detects campaign type and routes to appropriate UX:
 * - 'human_gm_ai_players' → GMCampaignScreen (chat-first game running UI)
 * - 'human_gm_solo' → GMCampaignScreen (simpler version, no AI panels)
 * - 'ai_gm' → Existing AI GM flow (unchanged)
 * - 'human_player' → Player join flow (out of scope)
 */

export class CampaignTypeService {
  /**
   * Get campaign type, with default for legacy campaigns
   */
  static getCampaignType(campaign: Campaign | null): CampaignType {
    if (!campaign) return 'human_gm_solo'
    return campaign.campaignType ?? 'human_gm_solo'
  }

  /**
   * Check if this campaign uses the GM Campaign UI (chat-first interface)
   * Returns true for:
   * - 'human_gm_ai_players' (GM with AI players)
   *
   * Returns false for:
   * - 'human_gm_solo' (uses existing single player story UI)
   * - 'ai_gm' (uses existing AI GM flow)
   * - 'human_player' (uses join flow, not campaign UI)
   */
  static usesGMCampaignUI(type: CampaignType): boolean {
    return type === 'human_gm_ai_players'
  }

  /**
   * Check if this campaign has AI player support enabled
   */
  static hasAIPlayers(type: CampaignType): boolean {
    return type === 'human_gm_ai_players'
  }

  /**
   * Get the route/screen name for this campaign type
   */
  static getScreenRoute(type: CampaignType): string {
    switch (type) {
      case 'human_gm_ai_players':
      case 'human_gm_solo':
        return '/campaign/gm'
      case 'ai_gm':
        return '/campaign/ai-gm'
      case 'human_player':
        return '/campaign/player'
      default:
        return '/campaign/gm'
    }
  }

  /**
   * Get human-readable label for campaign type
   */
  static getLabel(type: CampaignType): string {
    switch (type) {
      case 'human_gm_ai_players':
        return "I'm the GM with AI Players"
      case 'human_gm_solo':
        return "I'm the GM with Human Party"
      case 'ai_gm':
        return "AI GM, I'm Playing"
      case 'human_player':
        return "I'm a Player"
      default:
        return 'Standard Campaign'
    }
  }
}

export const campaignTypeService = new CampaignTypeService()

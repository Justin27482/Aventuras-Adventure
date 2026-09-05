import type { CharacterStats } from '$lib/types'
import type {
  SessionZeroPhaseContent,
  SessionZeroPhase,
} from '$lib/services/campaign/session-zero-orchestrator'
import { SessionZeroOrchestrator } from '$lib/services/campaign/session-zero-orchestrator'

/**
 * Session Zero State Manager
 *
 * Tracks current phase and coordinates phase transitions.
 * Used by: Player Chat pane, GMCampaignScreen
 */
export class SessionZeroManager {
  private currentPhase: SessionZeroPhase = null
  private phaseContent: SessionZeroPhaseContent[] = []
  private contentIndex: number = 0

  // Public getters
  get phase(): SessionZeroPhase {
    return this.currentPhase
  }

  get isSessionZero(): boolean {
    return this.currentPhase !== null && this.currentPhase !== 'complete'
  }

  get currentContent(): SessionZeroPhaseContent | null {
    return this.phaseContent[this.contentIndex] ?? null
  }

  get hasMore(): boolean {
    return this.contentIndex < this.phaseContent.length - 1
  }

  /**
   * Initialize Session Zero
   */
  async startSessionZero(aiPlayers: CharacterStats[]): Promise<void> {
    if (aiPlayers.length === 0) {
      this.currentPhase = 'complete'
      return
    }

    // Start Phase 1: Introductions
    this.currentPhase = 'introductions'
    this.phaseContent = await SessionZeroOrchestrator.startIntroductions(aiPlayers)
    this.contentIndex = 0
  }

  /**
   * Advance to next content item within phase
   */
  nextContent(): void {
    if (this.hasMore) {
      this.contentIndex++
    }
  }

  /**
   * Transition to next phase
   */
  async nextPhase(allAIPlayers: CharacterStats[]): Promise<void> {
    switch (this.currentPhase) {
      case 'introductions':
        // Transition to Premises phase
        this.currentPhase = 'premises'
        // Note: premises phase requires GM description input
        // This is handled by GMCampaignScreen (GM writes setting description in chat)
        break

      case 'premises':
        // Transition to Character Creation
        this.currentPhase = 'character_creation'
        this.phaseContent = await SessionZeroOrchestrator.startCharacterCreation(allAIPlayers)
        this.contentIndex = 0
        break

      case 'character_creation':
        // Transition to Party Bonding
        this.currentPhase = 'bonding'
        this.phaseContent = await SessionZeroOrchestrator.startPartyBonding(allAIPlayers)
        this.contentIndex = 0
        break

      case 'bonding':
        // Transition to Establish Secrets
        this.currentPhase = 'secrets'
        this.phaseContent = await SessionZeroOrchestrator.startSecrets(allAIPlayers)
        this.contentIndex = 0
        break

      case 'secrets':
        // Session Zero complete
        this.currentPhase = 'complete'
        this.phaseContent = []
        this.contentIndex = 0
        break

      default:
        this.currentPhase = 'complete'
    }
  }

  /**
   * Reset session zero state (used if starting over)
   */
  reset(): void {
    this.currentPhase = null
    this.phaseContent = []
    this.contentIndex = 0
  }
}

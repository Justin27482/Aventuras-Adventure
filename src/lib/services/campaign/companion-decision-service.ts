import type {
  CampaignActorCategory,
  CampaignControlMode,
  CompanionDecisionProposal,
  CompanionDecisionSource,
} from '$lib/types'
import { eventBus } from '$lib/services/events'

export interface CompanionDecisionInput {
  campaignId: string
  sessionId?: string | null
  characterId: string
  actorCategory: CampaignActorCategory
  controlMode: CampaignControlMode
  sceneMode: string
  source: CompanionDecisionSource
  intent: string
  proposedAction: string
  rationale: string
}

/**
 * Companion decisions are proposals until the turn/mechanics phases accept them.
 * This boundary prevents narrative generation from silently mutating numeric state.
 */
export class CompanionDecisionService {
  private proposals: CompanionDecisionProposal[] = []

  propose(input: CompanionDecisionInput): CompanionDecisionProposal {
    if (input.source !== 'gm' && input.actorCategory !== 'active_companion') {
      throw new Error('Only active companions may receive non-GM companion decisions')
    }
    if (input.controlMode === 'tactical_player' && input.actorCategory !== 'active_companion') {
      throw new Error('Enemies and ordinary NPCs cannot receive player tactical control')
    }

    const proposal: CompanionDecisionProposal = {
      id: crypto.randomUUID(),
      campaignId: input.campaignId,
      sessionId: input.sessionId ?? null,
      characterId: input.characterId,
      actorCategory: input.actorCategory,
      source: input.source,
      controlMode: input.controlMode,
      sceneMode: input.sceneMode,
      intent: input.intent,
      proposedAction: input.proposedAction,
      rationale: input.rationale,
      accepted: null,
      createdAt: Date.now(),
    }
    this.proposals = [...this.proposals, proposal]
    eventBus.emit({
      type: 'CompanionDecisionProposed',
      proposalId: proposal.id,
      campaignId: proposal.campaignId,
      sessionId: proposal.sessionId,
      characterId: proposal.characterId,
      actorCategory: proposal.actorCategory,
      controlMode: proposal.controlMode,
      sceneMode: proposal.sceneMode,
      proposedAction: proposal.proposedAction,
    })
    return proposal
  }

  decide(proposalId: string, accepted: boolean): CompanionDecisionProposal {
    const proposal = this.proposals.find((candidate) => candidate.id === proposalId)
    if (!proposal) throw new Error(`Companion decision proposal not found: ${proposalId}`)

    const updated = { ...proposal, accepted }
    this.proposals = this.proposals.map((candidate) =>
      candidate.id === proposalId ? updated : candidate,
    )
    eventBus.emit({
      type: 'CompanionDecisionResolved',
      proposalId: updated.id,
      campaignId: updated.campaignId,
      sessionId: updated.sessionId,
      characterId: updated.characterId,
      accepted,
    })
    return updated
  }

  list(campaignId: string, sessionId?: string | null): CompanionDecisionProposal[] {
    return this.proposals.filter(
      (proposal) =>
        proposal.campaignId === campaignId &&
        (sessionId === undefined || proposal.sessionId === (sessionId ?? null)),
    )
  }

  listPending(campaignId: string, sessionId?: string | null): CompanionDecisionProposal[] {
    return this.list(campaignId, sessionId).filter((proposal) => proposal.accepted === null)
  }

  listResolved(campaignId: string, sessionId?: string | null): CompanionDecisionProposal[] {
    return this.list(campaignId, sessionId).filter((proposal) => proposal.accepted !== null)
  }

  clear(): void {
    this.proposals = []
  }
}

export const companionDecisionService = new CompanionDecisionService()

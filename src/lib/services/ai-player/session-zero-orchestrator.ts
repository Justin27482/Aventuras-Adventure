import type { AIPlayerInteraction, InteractionAudience, PlayerCharacter, PlayerLevelSecret } from '$lib/types'

export type SessionZeroPhase =
  | 'introductions'
  | 'campaign-premises'
  | 'character-creation'
  | 'bonding-scene'
  | 'secrets'

export interface SessionZeroPhaseRecord {
  phase: SessionZeroPhase
  playerIds: string[]
  relationshipOverrides: Record<string, string>
  secrets: PlayerLevelSecret[]
  interaction?: AIPlayerInteraction | null
  recordedAt: number
}

export interface SessionZeroSecretInput {
  id: string
  campaignId: string
  sessionId: string | null
  targetAIPlayerId: string
  secretContent: string
  revealedToAIPlayerIds?: string[]
  visibilityScope?: PlayerLevelSecret['visibilityScope']
  createdAt?: number
  updatedAt?: number
}

export class SessionZeroOrchestrator {
  readonly phaseOrder: SessionZeroPhase[] = [
    'introductions',
    'campaign-premises',
    'character-creation',
    'bonding-scene',
    'secrets',
  ]

  private readonly phaseHistory: SessionZeroPhaseRecord[] = []

  recordPhase(
    phase: SessionZeroPhase,
    payload: {
      playerIds?: string[]
      relationshipNotes?: Record<string, string>
      secrets?: PlayerLevelSecret[]
      interaction?: AIPlayerInteraction | null
    } = {},
  ): SessionZeroPhaseRecord {
    const current: SessionZeroPhaseRecord = {
      phase,
      playerIds: [...new Set(payload.playerIds ?? [])],
      relationshipOverrides: { ...(payload.relationshipNotes ?? {}) },
      secrets: payload.secrets ? [...payload.secrets] : [],
      interaction: payload.interaction ?? null,
      recordedAt: Date.now(),
    }

    this.phaseHistory.push(current)
    return current
  }

  addSecret(input: SessionZeroSecretInput): PlayerLevelSecret[] {
    const secret: PlayerLevelSecret = {
      id: input.id,
      campaignId: input.campaignId,
      sessionId: input.sessionId,
      targetAIPlayerId: input.targetAIPlayerId,
      secretContent: input.secretContent,
      revealedToAIPlayerIds: input.revealedToAIPlayerIds ?? [],
      visibilityScope: input.visibilityScope ?? 'specific_ai_player',
      createdAt: input.createdAt ?? Date.now(),
      updatedAt: input.updatedAt ?? Date.now(),
    }

    const latest = this.phaseHistory.at(-1)
    if (latest) {
      latest.secrets = [...latest.secrets, secret]
    }

    return latest ? latest.secrets : [secret]
  }

  getPhaseHistory(): SessionZeroPhaseRecord[] {
    return [...this.phaseHistory]
  }

  getAudienceScope(audience: InteractionAudience, activeAIPlayerIds: string[]): string[] {
    if (audience.kind === 'full_table') return [...activeAIPlayerIds]
    if (audience.kind === 'private_player') {
      if (!activeAIPlayerIds.includes(audience.aiPlayerId)) {
        throw new Error('Private interaction target must be an active AI Player')
      }
      return [audience.aiPlayerId]
    }

    const uniqueIds = [...new Set(audience.aiPlayerIds)]
    if (uniqueIds.length === 0) throw new Error('Player subset interaction requires at least one player')
    if (uniqueIds.some((id) => !activeAIPlayerIds.includes(id))) {
      throw new Error('Player subset interaction contains an inactive AI Player')
    }
    return uniqueIds
  }

  getExcludedAudience(audience: InteractionAudience, activeAIPlayerIds: string[]): string[] {
    const scope = this.getAudienceScope(audience, activeAIPlayerIds)
    return activeAIPlayerIds.filter((id) => !scope.includes(id))
  }

  hasPrivateAudienceRestriction(audience: InteractionAudience, activeAIPlayerIds: string[]): boolean {
    if (audience.kind !== 'private_player') return false
    return this.getExcludedAudience(audience, activeAIPlayerIds).length > 0
  }

  buildRelationshipOverridesForCharacter(characterId: string, notes: Record<string, string>): Record<string, string> {
    return Object.fromEntries(
      Object.entries(notes).filter(([key]) => key !== characterId),
    )
  }

  buildSessionZeroSummary(): string {
    const entries = this.phaseHistory.map((phase) => {
      const secrets = phase.secrets.length > 0 ? `Secrets: ${phase.secrets.map((secret) => secret.secretContent).join(' | ')}` : 'Secrets: none'
      const relationshipNotes = Object.keys(phase.relationshipOverrides).length
        ? `Relationship notes: ${Object.values(phase.relationshipOverrides).join(' | ')}`
        : 'Relationship notes: none'
      return `- ${phase.phase}: ${relationshipNotes}; ${secrets}`
    })
    return entries.join('\n') || 'No session zero activity recorded.'
  }
}

export const sessionZeroOrchestrator = new SessionZeroOrchestrator()

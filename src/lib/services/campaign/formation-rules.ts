import type {
  CampaignFormationState,
  CampaignSetupPhase,
  CampaignSetupSession,
  CampaignSetupSessionKind,
  InteractionAudience,
} from '$lib/types'

const ALLOWED_PHASES: Record<CampaignSetupSessionKind, CampaignSetupPhase[]> = {
  private_character_creation: ['character_creation'],
  private_prologue: ['free_table'],
  group_session_zero: ['introductions', 'premises', 'character_creation', 'bonding', 'secrets'],
  table_bonding: ['bonding', 'free_table'],
}

export function validateSetupSessionDefinition(
  kind: CampaignSetupSessionKind,
  phase: CampaignSetupPhase,
  audience: InteractionAudience,
  participantIds: string[],
): string[] {
  const participants = [...new Set(participantIds)]
  if (participants.length === 0) throw new Error('A setup session requires at least one AI Player')
  if (!ALLOWED_PHASES[kind].includes(phase)) {
    throw new Error(`Setup phase ${phase} is not valid for ${kind}`)
  }

  if (kind === 'private_character_creation' || kind === 'private_prologue') {
    if (audience.kind !== 'private_player' || participants.length !== 1) {
      throw new Error('Private setup sessions require exactly one private AI Player')
    }
    if (audience.aiPlayerId !== participants[0]) {
      throw new Error('Private setup-session audience must match its participant')
    }
  } else if (audience.kind === 'private_player') {
    throw new Error('Group setup sessions cannot use a private audience')
  }

  const audienceIds =
    audience.kind === 'full_table'
      ? participants
      : audience.kind === 'private_player'
        ? [audience.aiPlayerId]
        : [...new Set(audience.aiPlayerIds)]
  if (audienceIds.some((id) => !participants.includes(id))) {
    throw new Error('Setup-session audience contains a non-participant')
  }
  if (audience.kind === 'player_subset' && audienceIds.length === 0) {
    throw new Error('A setup-session subset requires at least one AI Player')
  }
  return participants
}

export function assertCanActivateSetupSession(
  sessions: CampaignSetupSession[],
  sessionId: string,
): void {
  const active = sessions.find(
    (session) => session.status === 'active' && session.id !== sessionId,
  )
  if (active) throw new Error('Complete or abandon the active setup session first')
}

export function assertCanStartNormalSession(
  formation: CampaignFormationState | null,
  activeEligiblePartyCount: number,
  primaryCharacterId: string | null,
): void {
  if (formation?.status === 'party_pending') {
    throw new Error('Complete party formation before starting Session 1')
  }
  if (activeEligiblePartyCount < 1) throw new Error('An active eligible party is required')
  if (!primaryCharacterId) throw new Error('Select a spotlight or primary character')
}

export function setupSessionDisplayLabel(session: CampaignSetupSession): string {
  if (session.kind === 'table_bonding') return `Session 0.5 · ${session.title}`
  if (session.kind === 'private_character_creation') return `Private Character Creation · ${session.title}`
  if (session.kind === 'private_prologue') return `Private Prologue · ${session.title}`
  return `Session Zero · ${session.title}`
}
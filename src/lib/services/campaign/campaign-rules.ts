import type {
  CampaignControlMode,
  CampaignPartyMember,
  CampaignSession,
  Item,
  SessionPartyMember,
} from '$lib/types'

export function countActiveEligibleMembers(members: CampaignPartyMember[]): number {
  return members.filter((member) => member.active && member.eligibilityStatus === 'eligible').length
}

export function canActivatePartyMember(
  members: CampaignPartyMember[],
  member: CampaignPartyMember,
  maxPartySize: number,
): boolean {
  const alreadyActive = members.some(
    (candidate) =>
      candidate.characterId === member.characterId &&
      candidate.active &&
      candidate.eligibilityStatus === 'eligible',
  )
  if (alreadyActive) return true
  return countActiveEligibleMembers(members) < maxPartySize
}

export function validateSpotlightCharacter(
  members: CampaignPartyMember[],
  characterId: string | null,
): void {
  if (characterId === null) return
  const member = members.find((candidate) => candidate.characterId === characterId)
  if (!member || !member.active || member.eligibilityStatus !== 'eligible') {
    throw new Error('Spotlight character must be an active eligible party member')
  }
}

export function validateItemOwnership(
  item: Item,
  campaignStoryId: string | null,
  members: CampaignPartyMember[],
  ownership: { ownerCharacterId: string | null; containerItemId?: string | null },
): void {
  if (item.storyId !== campaignStoryId) {
    throw new Error('Item does not belong to the active campaign')
  }

  if (ownership.ownerCharacterId !== null) {
    const owner = members.find(
      (member) =>
        member.characterId === ownership.ownerCharacterId &&
        member.eligibilityStatus !== 'deceased',
    )
    if (!owner) throw new Error('Item owner must be an eligible campaign character')
  }

  if (ownership.containerItemId === item.id) {
    throw new Error('An item cannot contain itself')
  }
}

export function buildSessionPartySnapshot(
  session: Pick<CampaignSession, 'id' | 'combatControlPolicy'>,
  activeParty: CampaignPartyMember[],
  primaryCharacterId: string,
  joinedAt: number,
): SessionPartyMember[] {
  const primary = activeParty.find((member) => member.characterId === primaryCharacterId)
  if (!primary) throw new Error('Primary character must be an active eligible party member')

  const companionCombatMode: CampaignControlMode =
    session.combatControlPolicy === 'tactical_delegate'
      ? 'tactical_delegate'
      : session.combatControlPolicy === 'tactical_player'
        ? 'tactical_player'
        : 'autonomous'

  return activeParty.map((member, index) => ({
    id: crypto.randomUUID(),
    sessionId: session.id,
    characterId: member.characterId,
    partyOrder: index,
    actorCategory:
      member.characterId === primaryCharacterId
        ? ('primary_player_character' as const)
        : ('active_companion' as const),
    narrativeControlMode:
      member.characterId === primaryCharacterId ? 'player_narrative' : member.narrativeControlMode,
    combatControlMode:
      member.characterId === primaryCharacterId ? 'player_narrative' : companionCombatMode,
    joinedAt,
    leftAt: null,
  }))
}

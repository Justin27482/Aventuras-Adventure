import type { AIPlayer, InteractionAudience, PlayerCharacter } from '$lib/types'

export function validateAIPlayerProfile(player: AIPlayer): void {
  if (!player.id.trim()) throw new Error('AI Player must have an id')
  if (!player.name.trim()) throw new Error('AI Player must have a name')
  if (player.basePersonality.riskTolerance < 0 || player.basePersonality.riskTolerance > 10) {
    throw new Error('AI Player risk tolerance must be between 0 and 10')
  }
  if (player.basePersonality.immersion < 0 || player.basePersonality.immersion > 10) {
    throw new Error('AI Player immersion must be between 0 and 10')
  }
  if (player.basePersonality.arousal < 0 || player.basePersonality.arousal > 10) {
    throw new Error('AI Player arousal must be between 0 and 10')
  }
}

export function validatePlayerCharacterAssignment(
  assignment: PlayerCharacter,
  existing: PlayerCharacter[],
): void {
  if (!assignment.campaignId.trim()) throw new Error('AI Player assignment must have a campaign')
  if (!assignment.aiPlayerId.trim()) throw new Error('AI Player assignment must have an AI Player')
  if (!assignment.characterId.trim()) throw new Error('AI Player assignment must have a character')

  const conflicting = existing.find(
    (candidate) =>
      candidate.id !== assignment.id &&
      candidate.campaignId === assignment.campaignId &&
      (candidate.aiPlayerId === assignment.aiPlayerId ||
        candidate.characterId === assignment.characterId),
  )
  if (conflicting) {
    throw new Error('A campaign cannot assign an AI Player or character more than once')
  }
}

export function getAudiencePlayerIds(
  audience: InteractionAudience,
  activeAIPlayerIds: string[],
): string[] {
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

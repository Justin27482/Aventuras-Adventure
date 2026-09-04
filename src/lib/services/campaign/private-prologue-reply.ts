import { database } from '$lib/services/database'
import { aiPlayerTurnOrchestrator } from '$lib/services/ai-player/ai-player-turn-orchestrator'
import type { InteractionAudience, PlayerCharacter, AIPlayer, Character } from '$lib/types'
import type { ChatProposal } from './chat-types'

interface PrivatePrologueReplyRequest {
  storyId: string
  campaignId: string
  aiPlayerId: string
  narration: string
  sceneMode: string
  recentActions: string[]
}

interface AIPlayerAssignmentContext {
  assignment: PlayerCharacter
  aiPlayer: AIPlayer | null
  character: Character
}

export async function resolveAssignedCharacter(
  storyId: string,
  campaignId: string,
  aiPlayerId: string,
): Promise<AIPlayerAssignmentContext | null> {
  const [assignments, aiPlayer, characters] = await Promise.all([
    database.getPlayerCharactersForCampaign(campaignId),
    database.getAIPlayer(aiPlayerId),
    database.getCharacters(storyId),
  ])
  const assignment = assignments.find(
    (candidate) => candidate.aiPlayerId === aiPlayerId && candidate.leftAt === null,
  )
  if (!assignment) return null
  const character = characters.find((candidate) => candidate.id === assignment.characterId)
  if (!character) return null
  return { assignment, aiPlayer, character }
}

export async function generateInCharacterReply(input: {
  storyId: string
  campaignId: string
  aiPlayerId: string
  character: Character
  aiPlayer: AIPlayer | null
  narration: string
  sceneMode: string
  recentActions: string[]
  goal: string
  targetLength?: string
  audience: InteractionAudience
  chatAudience: ChatProposal['audience']
  sessionId: string | null
}): Promise<ChatProposal> {
  const generated = await aiPlayerTurnOrchestrator.generateProposal({
    storyId: input.storyId,
    campaignId: input.campaignId,
    aiPlayerId: input.aiPlayerId,
    characterId: input.character.id,
    sceneMode: input.sceneMode,
    sceneSummary: input.narration,
    goal: input.goal,
    targetLength: input.targetLength,
    recentActions: input.recentActions,
    audience: input.audience,
  })
  const now = Date.now()
  const proposal: ChatProposal['proposal'] = {
    id: generated.proposalId,
    campaignId: input.campaignId,
    aiPlayerId: input.aiPlayerId,
    characterId: input.character.id,
    sceneId: null,
    sceneMode: input.sceneMode,
    action: generated.action,
    reasoning: generated.reasoning,
    confidence: generated.confidence,
    reviewStatus: 'pending',
    createdAt: now,
    updatedAt: now,
  }
  await database.upsertAIPlayerProposal(proposal, input.sessionId)

  return {
    id: `proposal:${proposal.id}`,
    type: 'proposal',
    campaignId: input.campaignId,
    sessionId: input.sessionId,
    timestamp: now,
    audience: input.chatAudience,
    visibility: 'player_safe',
    actorId: input.character.id,
    actorName: `${input.aiPlayer?.name ?? 'AI Player'} (${input.character.name})`,
    proposal,
    confidence: proposal.confidence,
    reasoning: proposal.reasoning,
    reviewStatus: 'pending',
  }
}

export async function generatePrivatePrologueReply(
  request: PrivatePrologueReplyRequest,
): Promise<ChatProposal> {
  const resolved = await resolveAssignedCharacter(request.storyId, request.campaignId, request.aiPlayerId)
  if (!resolved) {
    throw new Error('The private prologue AI Player does not have an assigned character.')
  }

  return generateInCharacterReply({
    storyId: request.storyId,
    campaignId: request.campaignId,
    aiPlayerId: request.aiPlayerId,
    character: resolved.character,
    aiPlayer: resolved.aiPlayer,
    narration: request.narration,
    sceneMode: request.sceneMode,
    recentActions: request.recentActions,
    goal: 'Reply in character to the GM narration and continue the private prologue.',
    audience: { kind: 'private_player', aiPlayerId: request.aiPlayerId },
    chatAudience: 'private_player',
    sessionId: null,
  })
}

interface GroupSetupReplyRequest {
  storyId: string
  campaignId: string
  setupSessionId: string
  aiPlayerIds: string[]
  narration: string
  sceneMode: string
  recentActions: string[]
  /** Called right before generating each participant's reply, for a chat typing indicator. */
  onTypingStart?: (aiPlayerId: string) => void
  /** Called as soon as each reply is ready, so the UI can show it immediately instead of waiting for the batch. */
  onReply?: (reply: ChatProposal) => void
}

function randomChatDelayMs(): number {
  // Simulates a person reading/typing between speakers in a group scene.
  return 800 + Math.random() * 1400
}

/**
 * Generates one in-character reply per bonding-session participant so a group
 * setup session (e.g. Session 0.5) responds as their characters, not just OOC banter.
 * A participant missing an assigned character is skipped rather than failing the batch.
 * Replies are generated one at a time with a short delay so multiple AI Players don't
 * all appear to speak at once.
 */
export async function generateGroupSetupReplies(
  request: GroupSetupReplyRequest,
): Promise<ChatProposal[]> {
  const replies: ChatProposal[] = []
  for (const aiPlayerId of request.aiPlayerIds) {
    const resolved = await resolveAssignedCharacter(request.storyId, request.campaignId, aiPlayerId)
    if (!resolved) continue
    request.onTypingStart?.(aiPlayerId)
    await new Promise<void>((resolve) => setTimeout(resolve, randomChatDelayMs()))
    const reply = await generateInCharacterReply({
      storyId: request.storyId,
      campaignId: request.campaignId,
      aiPlayerId,
      character: resolved.character,
      aiPlayer: resolved.aiPlayer,
      narration: request.narration,
      sceneMode: request.sceneMode,
      recentActions: request.recentActions,
      goal: 'Reply in character to the GM narration and continue this bonding scene with the other participants.',
      audience: { kind: 'full_table' },
      chatAudience: 'full_table',
      sessionId: null,
    })
    replies.push(reply)
    request.onReply?.(reply)
  }
  return replies
}

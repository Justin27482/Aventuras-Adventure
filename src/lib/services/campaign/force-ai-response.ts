import { TableTalkOrchestrator } from './table-talk-orchestrator'
import { resolveAssignedCharacter, generateInCharacterReply } from './private-prologue-reply'
import type { InteractionAudience } from '$lib/types'
import type { ChatMessage } from './chat-types'

export interface ForceAIResponseInput {
  storyId: string
  campaignId: string
  aiPlayerId: string
  mode: 'ic' | 'ooc'
  /** Optional GM steer for what the AI Player should focus on; not a scripted line. */
  guidance?: string
  sceneMode: string
  recentActions: string[]
  /** Other characters present in the scene, for OOC awareness of who else is at the table. */
  otherCharacters?: Array<{ name: string; playerName?: string }>
  audience: InteractionAudience
  tableTalkIntensity: number
  /** 1 (single sentence) to 10 (full page). 3 is the baseline with no explicit length instruction. */
  responseLength?: number
}

function toChatAudience(
  audience: InteractionAudience,
): 'full_table' | 'private_subset' | 'private_player' {
  if (audience.kind === 'player_subset') return 'private_subset'
  if (audience.kind === 'private_player') return 'private_player'
  return 'full_table'
}

const RESPONSE_LENGTH_INSTRUCTIONS: Record<number, string> = {
  1: 'Respond in a single sentence.',
  2: 'Respond in one or two short sentences.',
  3: '',
  4: 'Respond in about one short paragraph.',
  5: 'Respond in one full paragraph.',
  6: 'Respond in two paragraphs.',
  7: 'Respond in three to four paragraphs.',
  8: 'Respond in five to six paragraphs.',
  9: 'Respond in seven to eight paragraphs.',
  10: 'Respond with a full page of prose (about ten to twelve paragraphs).',
}

/** Level 3 is the baseline (no explicit instruction), matching prior default behavior. */
function lengthInstructionForLevel(level: number): string {
  const clamped = Math.min(10, Math.max(1, Math.round(level)))
  return RESPONSE_LENGTH_INSTRUCTIONS[clamped] ?? ''
}

// IC responses are a single string field inside structured JSON output with a fixed
// token budget. Longer levels take noticeably more time to generate and can occasionally
// need a JSON repair pass; the UI surfaces this as a warning rather than capping length.
export const IC_MAX_SAFE_LENGTH_LEVEL = 7

/** Short human-readable labels for the GM's response-length slider (1-10). */
export const RESPONSE_LENGTH_LABELS: Record<number, string> = {
  1: 'Single sentence',
  2: 'One-two sentences',
  3: 'A few sentences (default)',
  4: 'Short paragraph',
  5: 'One paragraph',
  6: 'Two paragraphs',
  7: 'Three-four paragraphs',
  8: 'Five-six paragraphs',
  9: 'Seven-eight paragraphs',
  10: 'Full page (10-12 paragraphs)',
}

/**
 * GM utility to force a single AI Player to speak now, either in character or
 * as out-of-character table talk, optionally steered by a short GM note.
 */
export async function forceAIResponse(input: ForceAIResponseInput): Promise<ChatMessage> {
  const resolved = await resolveAssignedCharacter(input.storyId, input.campaignId, input.aiPlayerId)
  if (!resolved) {
    throw new Error('This AI Player does not have an assigned character.')
  }

  const guidance = input.guidance?.trim() || ''
  const lastAction = input.recentActions.at(-1) ?? 'Continue the current scene.'
  const requestedLength = input.responseLength ?? 3
  const lengthInstruction = lengthInstructionForLevel(requestedLength)

  const goal = guidance
    ? `GM guidance: ${guidance}`
    : 'Take an in-character turn appropriate to the current scene.'

  if (input.mode === 'ic') {
    return generateInCharacterReply({
      storyId: input.storyId,
      campaignId: input.campaignId,
      aiPlayerId: input.aiPlayerId,
      character: resolved.character,
      aiPlayer: resolved.aiPlayer,
      narration: lastAction,
      sceneMode: input.sceneMode,
      recentActions: input.recentActions,
      goal,
      targetLength: lengthInstruction,
      audience: input.audience,
      chatAudience: toChatAudience(input.audience),
      sessionId: null,
    })
  }

  const reaction = await TableTalkOrchestrator.generateReaction({
    storyId: input.storyId,
    campaignId: input.campaignId,
    aiPlayerId: input.aiPlayerId,
    character: { name: resolved.character.name, playerName: resolved.aiPlayer?.name },
    recentAction: lastAction,
    otherCharacters: input.otherCharacters ?? [],
    sceneContext: [
      guidance ? `${input.sceneMode} — GM guidance: ${guidance}` : input.sceneMode,
      lengthInstruction,
    ]
      .filter(Boolean)
      .join(' '),
    tableTalkIntensity: input.tableTalkIntensity,
    recentTranscript: input.recentActions,
    forceResponse: true,
  })

  return {
    id: reaction.id,
    type: 'table_talk',
    campaignId: input.campaignId,
    sessionId: null,
    timestamp: Date.now(),
    audience: toChatAudience(input.audience),
    visibility: 'player_safe',
    actorName: reaction.characterName,
    content: reaction.content,
    sentiment: reaction.sentiment,
    emoji: reaction.emoji,
    intensity: reaction.intensity,
  }
}

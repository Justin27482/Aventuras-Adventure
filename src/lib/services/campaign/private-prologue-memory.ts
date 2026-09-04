import { database } from '$lib/services/database'
import { generatePlainText } from '$lib/services/ai/sdk'
import { renderStoryPrompt } from '$lib/services/prompts/render-story-prompt'
import type { AIPlayerMemory } from '$lib/types'
import type { ChatMessage } from './chat-types'

export interface StorePrivatePrologueMemoryInput {
  storyId: string
  campaignId: string
  aiPlayerId: string
  setupSessionId: string
  messages: ChatMessage[]
}

function buildTranscript(messages: ChatMessage[]): string {
  return messages
    .filter(
      (message): message is Extract<ChatMessage, { type: 'narration' | 'table_talk' | 'proposal' }> =>
        message.type === 'narration' || message.type === 'table_talk' || message.type === 'proposal',
    )
    .map((message) => `${message.actorName}: ${message.type === 'proposal' ? message.proposal.action : message.content}`)
    .join('\n')
}

/** Distinctive words the memory can later be recalled by, mirroring lorebook keywords. */
function deriveKeywords(transcript: string, characterName: string | null): string[] {
  const stopWords = new Set([
    'the', 'and', 'that', 'this', 'with', 'from', 'they', 'them', 'their', 'have', 'has', 'was',
    'were', 'what', 'when', 'where', 'which', 'would', 'could', 'should', 'about', 'into', 'your',
    'you', 'her', 'his', 'she', 'him', 'for', 'not', 'but', 'are', 'its', 'said', 'says',
  ])
  const counts = new Map<string, number>()
  for (const word of transcript.toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? []) {
    if (stopWords.has(word)) continue
    counts.set(word, (counts.get(word) ?? 0) + 1)
  }
  const derived = [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([word]) => word)
  return characterName ? [...new Set([characterName.toLowerCase(), ...derived])] : derived
}

/**
 * Summarizes a private prologue (completed or stopped) into a memory owned by the
 * AI Player's global profile. Replaces any prior memory for the same setup session,
 * since a stopped session can be restarted and continued before being completed.
 */
export async function storePrivatePrologueMemory(
  input: StorePrivatePrologueMemoryInput,
): Promise<void> {
  const transcript = buildTranscript(input.messages)
  if (!transcript.trim()) return

  const [assignments, characters, campaign] = await Promise.all([
    database.getPlayerCharactersForCampaign(input.campaignId),
    database.getCharacters(input.storyId).catch(() => []),
    database.getCampaignByStoryId(input.storyId).catch(() => null),
  ])
  const assignment = assignments.find(
    (candidate) => candidate.aiPlayerId === input.aiPlayerId && candidate.leftAt === null,
  )
  if (!assignment) return
  const character = characters.find((candidate) => candidate.id === assignment.characterId) ?? null

  const prompt = await renderStoryPrompt(input.storyId, 'private-prologue-memory', {
    privatePrologueTranscript: transcript,
  })
  const summary = await generatePlainText(
    { presetId: 'agentic', system: prompt.system, prompt: prompt.user },
    'privatePrologueMemory',
  )
  if (!summary.trim()) return

  const existing = await database
    .getAIPlayerMemories(input.aiPlayerId)
    .then((memories) =>
      memories.find((memory) => memory.originSetupSessionId === input.setupSessionId),
    )
    .catch(() => undefined)

  const now = Date.now()
  const memory: AIPlayerMemory = {
    id: existing?.id ?? crypto.randomUUID(),
    aiPlayerId: input.aiPlayerId,
    originCampaignId: input.campaignId,
    originCampaignTitle: campaign?.title ?? null,
    originSetupSessionId: input.setupSessionId,
    originSessionId: null,
    characterId: character?.id ?? assignment.characterId,
    characterName: character?.name ?? null,
    source: 'private_prologue',
    title: 'Private prologue',
    content: summary.trim(),
    keywords: deriveKeywords(transcript, character?.name ?? null),
    scope: existing?.scope ?? 'campaign',
    injectionMode: existing?.injectionMode ?? 'keyword',
    priority: existing?.priority ?? 7,
    pinned: existing?.pinned ?? false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  await database.upsertAIPlayerMemory(memory)
}

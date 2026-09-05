import { database } from '$lib/services/database'
import type { AIPlayerMemory } from '$lib/types'

export interface SelectMemoriesOptions {
  /** Campaign the AI Player is currently acting in. */
  campaignId: string
  /** Recent chat/scene text used for keyword relevance. */
  query: string
  maxMemories?: number
}

const DEFAULT_MAX_MEMORIES = 8

function memoryTerms(memory: AIPlayerMemory): string[] {
  return [memory.title, ...memory.keywords].map((term) => term.trim().toLowerCase()).filter(Boolean)
}

/**
 * Chooses which of an AI Player's memories are relevant right now, mirroring the
 * lorebook injection rules (always / keyword / never plus priority ordering).
 *
 * Campaign gating: a memory formed in another campaign is only eligible when the
 * player explicitly marked it `cross_campaign`, so AI Players do not blur events
 * between separate games.
 */
export function selectRelevantMemories(
  memories: AIPlayerMemory[],
  options: SelectMemoriesOptions,
): AIPlayerMemory[] {
  const normalizedQuery = options.query.toLowerCase()
  return memories
    .filter((memory) => {
      if (memory.scope === 'never' || memory.injectionMode === 'never') return false
      const sameCampaign = memory.originCampaignId === options.campaignId
      if (!sameCampaign && memory.scope !== 'cross_campaign') return false
      if (memory.pinned || memory.injectionMode === 'always') return true
      const terms = memoryTerms(memory)
      if (terms.length === 0) return false
      return terms.some((term) => normalizedQuery.includes(term))
    })
    .sort(
      (left, right) =>
        Number(right.pinned) - Number(left.pinned) ||
        right.priority - left.priority ||
        right.createdAt - left.createdAt,
    )
    .slice(0, options.maxMemories ?? DEFAULT_MAX_MEMORIES)
}

/**
 * Renders memories for prompt injection, labelling out-of-campaign recall so the
 * AI Player can reference it as prior life experience without treating it as
 * something that happened in the current game.
 */
export function renderMemoriesForPrompt(memories: AIPlayerMemory[], campaignId: string): string {
  if (memories.length === 0) return ''
  return memories
    .map((memory) => {
      const label = memory.title.trim() || 'Memory'
      if (memory.originCampaignId === campaignId) {
        return `- [this campaign] ${label}: ${memory.content}`
      }
      const origin = memory.originCampaignTitle?.trim() || 'a previous campaign'
      return `- [from ${origin} — do not treat as events of this campaign] ${label}: ${memory.content}`
    })
    .join('\n')
}

export async function loadRelevantMemories(
  aiPlayerId: string,
  options: SelectMemoriesOptions,
): Promise<AIPlayerMemory[]> {
  const memories = await database
    .getRecallableAIPlayerMemories(aiPlayerId, options.campaignId)
    .catch(() => [])
  return selectRelevantMemories(memories, options)
}

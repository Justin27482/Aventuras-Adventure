/**
 * G.7.1: Table Talk Orchestrator
 *
 * Generates out-of-character banter and reactions from AI players
 * based on the intensity slider (0-8) setting.
 *
 * Intensity levels:
 * 0 = Silent (no OOC reactions)
 * 1-2 = Minimal (occasional brief reactions)
 * 3-4 = Moderate (regular friendly banter)
 * 5-6 = High (active engagement, jokes, strategizing)
 * 7-8 = Very High (constant chatter, memes, roleplay)
 */

import { generatePlainText, generateStructured } from '$lib/services/ai/sdk'
import type { AIPlayerPersonality } from '$lib/types'
import { z } from 'zod'
import { renderStoryPrompt } from '$lib/services/prompts/render-story-prompt'
import { ContextBuilder } from '$lib/services/context/context-builder'
import { packService } from '$lib/services/packs/pack-service'
import { database } from '$lib/services/database'
import type { Entry } from '$lib/types'

const responderSelectionSchema = z.object({
  responderIds: z.array(z.string()).max(3),
  conversationEnded: z.boolean(),
})

export interface TableTalkParticipant {
  name: string
  playerName?: string
  personality?: AIPlayerPersonality | null
}

export interface TableTalkRequest {
  storyId: string
  campaignId: string
  aiPlayerId: string
  character: TableTalkParticipant
  recentAction: string
  otherCharacters: TableTalkParticipant[]
  sceneContext: string
  tableTalkIntensity: number // 0-8
  recentTranscript?: string[]
  forceResponse?: boolean
}

export interface TableTalkReaction {
  id: string
  aiPlayerId: string
  characterName: string
  content: string
  sentiment: 'positive' | 'neutral' | 'negative' | 'humorous'
  emoji: string
  intensity: number
}

export interface TableTalkResponderCandidate {
  id: string
  name: string
}

export function selectTableTalkLore(entries: Entry[], query: string, characterName: string): Entry[] {
  const normalizedQuery = query.toLowerCase()
  const normalizedCharacterName = characterName.toLowerCase()
  return entries
    .filter((entry) => {
      if (entry.deleted || entry.injection.mode === 'never') return false
      if (entry.injection.mode === 'always') return true
      const terms = [entry.name, ...entry.aliases, ...entry.injection.keywords]
        .map((term) => term.trim().toLowerCase())
        .filter(Boolean)
      return terms.some(
        (term) =>
          normalizedQuery.includes(term) ||
          term.includes(normalizedCharacterName) ||
          normalizedCharacterName.includes(term),
      )
    })
    .sort((left, right) => right.injection.priority - left.injection.priority)
    .slice(0, 12)
}

export class TableTalkOrchestrator {
  private static buildPlayerProfileContext(participant: TableTalkParticipant): string {
    const personality = participant.personality
    if (!personality) return '## Persistent Player Personality\nNo profile details recorded.'
    return [
      '## Persistent Player Personality',
      `Core motivation: ${personality.coreMotivation}`,
      `Playstyle: ${personality.primaryPlaystyle}`,
      `Risk tolerance: ${personality.riskTolerance}/10`,
      `Humor style: ${personality.humorStyle || 'none specified'}`,
      `Decision speed: ${personality.decisionSpeed}`,
      `Combat approach: ${personality.combatApproach || 'not specified'}`,
      `Social priorities: ${(personality.socialPriorities ?? []).join(', ') || 'none recorded'}`,
      `Red lines: ${(personality.redLines ?? []).join(', ') || 'none recorded'}`,
    ].join('\n')
  }

  private static async buildWorldContext(request: TableTalkRequest): Promise<string> {
    const story = await database.getStory(request.storyId)
    const entries = story
      ? await database.getEntriesForBranch(request.storyId, story.currentBranchId)
      : []
    const query = [request.recentAction, ...(request.recentTranscript ?? [])].join('\n')
    const relevantEntries = selectTableTalkLore(entries, query, request.character.name)
    return relevantEntries.length
      ? [
          '## Relevant Public World and Lorebook Context',
          ...relevantEntries.map(
            (entry) => `- [${entry.type}] ${entry.name}: ${entry.description}`,
          ),
        ].join('\n')
      : '## Relevant Public World and Lorebook Context\n- No matching public lorebook entries.'
  }

  static async selectResponders(request: {
    storyId: string
    gmMessage: string
    candidates: TableTalkResponderCandidate[]
    recentTranscript?: string[]
    maximumResponders: number
  }): Promise<string[]> {
    if (request.candidates.length === 0 || request.maximumResponders <= 0) return []

    const prompt = await renderStoryPrompt(request.storyId, 'ai-player-table-talk-routing', {
      gmTableMessage: request.gmMessage,
      tableTalkCandidates: request.candidates
        .map((candidate) => `- ${candidate.id}: ${candidate.name}`)
        .join('\n'),
      recentTableTalkTranscript: request.recentTranscript?.join('\n') || '(none)',
      maximumResponders: Math.min(request.maximumResponders, request.candidates.length),
    })
    const result = await generateStructured(
      {
        presetId: 'suggestions',
        schema: responderSelectionSchema,
        system: prompt.system,
        prompt: prompt.user,
      },
      'tableTalkResponderSelection',
    )

    if (result.conversationEnded) return []
    const validIds = new Set(request.candidates.map((candidate) => candidate.id))
    return [...new Set(result.responderIds)]
      .filter((id) => validIds.has(id))
      .slice(0, request.maximumResponders)
  }

  /**
   * Generate a table talk reaction based on intensity and scene
   */
  static async generateReaction(request: TableTalkRequest): Promise<TableTalkReaction> {
    if (request.tableTalkIntensity === 0) {
      return {
        id: crypto.randomUUID(),
        aiPlayerId: request.aiPlayerId,
        characterName: request.character.name,
        content: '',
        sentiment: 'neutral',
        emoji: '',
        intensity: 0,
      }
    }

    const intensityLabel = this.getIntensityLabel(request.tableTalkIntensity)
    const shouldReact = request.forceResponse || this.shouldGenerateReaction(request.tableTalkIntensity)

    if (!shouldReact) {
      return {
        id: crypto.randomUUID(),
        aiPlayerId: request.aiPlayerId,
        characterName: request.character.name,
        content: '',
        sentiment: 'neutral',
        emoji: '',
        intensity: request.tableTalkIntensity,
      }
    }

    const aiPlayerName = request.character.playerName ?? request.character.name
    const decisionContext = await ContextBuilder.forAIPlayer(
      request.storyId,
      request.aiPlayerId,
      undefined,
      { kind: 'full_table' },
      request.recentTranscript,
    )
    const existingContext = decisionContext.getContext()
    const profileContext =
      typeof existingContext.aiPlayerProfileContext === 'string' &&
      existingContext.aiPlayerProfileContext.trim()
        ? existingContext.aiPlayerProfileContext
        : this.buildPlayerProfileContext(request.character)
    const worldContext = await this.buildWorldContext(request)
    decisionContext.add({
      aiPlayerName,
      aiPlayerCharacterName: request.character.playerName ? request.character.name : '',
      aiPlayerProfileContext: `${profileContext}\n\n${worldContext}`,
    })
    await packService.ensurePromptTemplateComplete(decisionContext.getPackId(), 'ai-player-decision')
    const decisionPrompt = await decisionContext.render('ai-player-decision')
    if (!decisionPrompt.system.trim()) {
      throw new Error('Prompt pack is missing required system content for ai-player-decision')
    }
    const prompt = await renderStoryPrompt(request.storyId, 'ai-player-table-talk-reaction', {
      aiPlayerDecisionPrompt: decisionPrompt.system,
      tableTalkPlayerName: request.character.playerName ?? request.character.name,
      tableTalkCharacterName: request.character.name,
      tableTalkPlaystyle: request.character.personality?.primaryPlaystyle || 'balanced',
      recentAction: request.recentAction,
      sceneMode: request.sceneContext,
      otherTableParticipants: request.otherCharacters.map((character) => character.name).join(', '),
      recentTableTalkTranscript: request.recentTranscript?.join('\n') || '(none)',
      tableTalkIntensityLabel: intensityLabel,
      tableTalkIntensity: request.tableTalkIntensity,
    })
    const systemPrompt = prompt.system.includes(decisionPrompt.system)
      ? prompt.system
      : `${decisionPrompt.system}\n\n${prompt.system}`

    const content = await generatePlainText(
      {
        presetId: 'agentic',
        system: systemPrompt,
        prompt: prompt.user,
      },
      'tableTalkReaction',
    )

    const sentiment = this.detectSentiment(content)
    const emoji = this.selectEmoji(sentiment, request.tableTalkIntensity)

    return {
      id: crypto.randomUUID(),
      aiPlayerId: request.aiPlayerId,
      characterName: request.character.playerName
        ? `${request.character.playerName} (${request.character.name})`
        : request.character.name,
      content: content.trim(),
      sentiment,
      emoji,
      intensity: request.tableTalkIntensity,
    }
  }

  /**
   * Determine if we should generate a reaction at this intensity level
   * Lower intensities skip some reactions to avoid spam
   */
  private static shouldGenerateReaction(intensity: number): boolean {
    if (intensity === 0) return false
    if (intensity <= 2) return Math.random() < 0.3 // 30% chance
    if (intensity <= 4) return Math.random() < 0.6 // 60% chance
    return true // 100% for 5+
  }

  /**
   * Get human-readable intensity label
   */
  private static getIntensityLabel(intensity: number): string {
    switch (true) {
      case intensity === 0:
        return 'Silent'
      case intensity <= 2:
        return 'Minimal'
      case intensity <= 4:
        return 'Moderate'
      case intensity <= 6:
        return 'High'
      default:
        return 'Very High'
    }
  }

  /**
   * Detect sentiment from generated text
   */
  private static detectSentiment(
    text: string,
  ): 'positive' | 'neutral' | 'negative' | 'humorous' {
    const lower = text.toLowerCase()

    // Check for humor indicators
    if (lower.match(/😂|lol|haha|rofl|💀|dead|that's hilarious/i)) {
      return 'humorous'
    }

    // Check for positive indicators
    if (lower.match(/great|nice|awesome|excellent|love|👍|nice one/i)) {
      return 'positive'
    }

    // Check for negative indicators
    if (lower.match(/oh no|nope|terrible|bad|fail|rip|that sucks/i)) {
      return 'negative'
    }

    return 'neutral'
  }

  /**
   * Select emoji based on sentiment and intensity
   */
  private static selectEmoji(
    sentiment: 'positive' | 'neutral' | 'negative' | 'humorous',
    intensity: number,
  ): string {
    if (intensity === 0) return ''

    switch (sentiment) {
      case 'positive':
        return intensity >= 5 ? '🎉' : '👍'
      case 'negative':
        return intensity >= 5 ? '💀' : '😬'
      case 'humorous':
        return '😂'
      default:
        return intensity >= 5 ? '💬' : ''
    }
  }

  /**
   * Generate table talk reactions for multiple AI players
   */
  static async generateReactionsForTable(
    requests: TableTalkRequest[],
  ): Promise<TableTalkReaction[]> {
    return Promise.all(requests.map((r) => this.generateReaction(r)))
  }

  /**
   * Calculate delay before generating reactions
   * Higher intensity = faster reactions
   */
  static getReactionDelayMs(intensity: number): number {
    switch (true) {
      case intensity === 0:
        return 0 // Never react
      case intensity <= 2:
        return 3000 + Math.random() * 3000 // 3-6 seconds
      case intensity <= 4:
        return 1500 + Math.random() * 2000 // 1.5-3.5 seconds
      case intensity <= 6:
        return 500 + Math.random() * 1500 // 0.5-2 seconds
      default:
        return Math.random() * 1000 // 0-1 second
    }
  }
}

export const tableTalkOrchestrator = new TableTalkOrchestrator()

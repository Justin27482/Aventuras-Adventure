import type { AIPlayer, AIPlayerRelationship, PlayerCharacter, PlayerLevelSecret } from '$lib/types'
import { filterAbilitiesForScene } from './scene-ability-filter'

export interface AIPlayerPromptContext {
  campaignTitle: string
  sceneMode: string
  sceneSummary: string
  contentIntensity?: number
  abilities?: import('$lib/types').RulesetAbility[]
  characterName: string
  characterDescription: string
  characterTraits?: string[]
  otherPlayers: Array<{ name: string; relationship: string }>
  characterSecrets: Record<string, unknown>[]
  playerLevelSecrets: PlayerLevelSecret[]
  relationships: AIPlayerRelationship[]
  /** Pre-rendered, campaign-gated recall of this player's own past experiences. */
  memories?: string
}

export interface RenderedAIPlayerPrompt {
  systemPrompt: string
  visibleSecrets: string[]
}

function clamp0To10(value: number): number {
  return Math.max(0, Math.min(10, Math.round(value)))
}

export function deriveEffectiveAIPlayerTraits(
  player: AIPlayer,
  sceneText: string = '',
  recentTranscript: string[] = [],
): { immersion: number; arousal: number } {
  const base = player.basePersonality
  const text = `${sceneText}\n${recentTranscript.join('\n')}`.toLowerCase()
  const immersionBase = base.immersion ?? 5
  const arousalBase = base.arousal ?? 0

  let immersion = immersionBase
  let arousal = arousalBase

  if (
    /atmosphere|detailed|sensory|terrain|weather|location|environment|investigate|explore|observe|focus|setting|ambience|texture|mood/.test(
      text,
    )
  ) {
    immersion += 1
  }
  if (
    /romance|flirt|kiss|touch|seductive|intimate|tease|desire|lust|passion|heat|embrace|bed|sultry/.test(
      text,
    )
  ) {
    arousal += 1
  }
  if (
    /cold|dismissive|boring|flat|awkward|distance|disinterest|fear|banter|joke|sarcasm/.test(text)
  ) {
    immersion = Math.max(0, immersion - 1)
  }
  if (/rejection|refusal|deny|stop|no|turn away|push away/.test(text)) {
    arousal = Math.max(0, arousal - 1)
  }

  return {
    immersion: clamp0To10(immersion),
    arousal: clamp0To10(arousal),
  }
}

export function renderAIPlayerVoiceProfile(player: AIPlayer): string {
  const personality = player.basePersonality
  const effective = deriveEffectiveAIPlayerTraits(player)
  const socialPriorities = personality.socialPriorities ?? []
  const redLines = personality.redLines ?? []

  return [
    `AI Player: ${player.name}`,
    `Authored voice profile: ${player.basePromptProfile?.trim() || 'None recorded'}`,
    `Core motivation: ${personality.coreMotivation || 'not specified'}`,
    `Playstyle: ${personality.primaryPlaystyle}`,
    `Risk tolerance: ${personality.riskTolerance ?? 5}/10`,
    `Immersion: ${effective.immersion}/10 (base ${personality.immersion ?? 5}/10)`,
    `Arousal: ${effective.arousal}/10 (base ${personality.arousal ?? 0}/10)`,
    `Humor style: ${personality.humorStyle || 'none specified'}`,
    `Decision speed: ${personality.decisionSpeed || 'balanced'}`,
    `Combat approach: ${personality.combatApproach || 'not specified'}`,
    `Social priorities: ${socialPriorities.join(', ') || 'none recorded'}`,
    `Red lines: ${redLines.join(', ') || 'none recorded'}`,
  ].join('\n')
}

export function resolveCharacterKnowledge(
  secrets: Record<string, unknown>[],
  aiPlayerId: string,
): string[] {
  return secrets
    .filter((secret) => {
      const knownBy = secret.knownByAIPlayerIds ?? secret.knownByAiPlayerIds
      return !Array.isArray(knownBy) || knownBy.includes(aiPlayerId)
    })
    .map((secret) => {
      if (typeof secret.content === 'string') return secret.content
      if (typeof secret.secretContent === 'string') return secret.secretContent
      return null
    })
    .filter((secret): secret is string => Boolean(secret))
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.map((value) => `- ${value}`).join('\n') : '- None recorded'
}

function relationshipForPlayer(relationship: AIPlayerRelationship, aiPlayerId: string): string {
  const otherPlayerId =
    relationship.aiPlayerIdA === aiPlayerId ? relationship.aiPlayerIdB : relationship.aiPlayerIdA
  const direction = relationship.aiPlayerIdA === aiPlayerId ? 'toward' : 'from'
  return `${direction} ${otherPlayerId}: ${relationship.dynamic || 'unsettled dynamic'} (friction ${relationship.friction}/10)${relationship.history ? `; history: ${relationship.history}` : ''}`
}

export class PersonalityService {
  renderDynamicPrompt(
    player: AIPlayer,
    assignment: PlayerCharacter,
    context: AIPlayerPromptContext,
  ): RenderedAIPlayerPrompt {
    const assignmentSecrets = resolveCharacterKnowledge(context.characterSecrets, player.id)
    const visibleSecrets = [
      ...assignmentSecrets,
      ...context.playerLevelSecrets
        .filter(
          (secret) =>
            secret.targetAIPlayerId === player.id ||
            secret.visibilityScope === 'all_ai_players' ||
            secret.revealedToAIPlayerIds.includes(player.id),
        )
        .map((secret) => secret.secretContent),
    ]

    const relationshipLines = context.relationships
      .filter(
        (relationship) =>
          relationship.aiPlayerIdA === player.id || relationship.aiPlayerIdB === player.id,
      )
      .map((relationship) => relationshipForPlayer(relationship, player.id))

    const assignmentNotes = assignment.roleplayNotes?.trim() || 'None recorded'
    const systemPrompt = [
      '## Persistent Player Personality',
      renderAIPlayerVoiceProfile(player),
      '',
      '## Campaign Character Assignment',
      `Character: ${context.characterName}`,
      `Character description: ${context.characterDescription || 'None recorded'}`,
      `Character traits: ${formatList(context.characterTraits ?? [])}`,
      `Campaign roleplay notes: ${assignmentNotes}`,
      '',
      '## Current Scene',
      `Scene mode: ${context.sceneMode || 'unspecified'}`,
      `Scene summary: ${context.sceneSummary || 'None provided'}`,
      'Scene-relevant abilities:',
      formatList(
        filterAbilitiesForScene(context.abilities ?? [], context.sceneMode).map(
          (ability) => `${ability.label}: ${ability.description || 'No description'}`,
        ),
      ),
      '',
      '## Inter-Player Dynamics',
      formatList(context.otherPlayers.map((other) => `${other.name}: ${other.relationship}`)),
      formatList(relationshipLines),
      '',
      '## Private Knowledge',
      formatList(visibleSecrets),
      '',
      '## Your Own Memories',
      context.memories?.trim() || '- No relevant memories recalled.',
    ].join('\n')

    return { systemPrompt, visibleSecrets }
  }
}

export const personalityService = new PersonalityService()

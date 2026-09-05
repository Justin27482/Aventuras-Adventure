import { generateText } from '$lib/services/ai/sdk'
import { TableTalkOrchestrator } from '$lib/services/campaign/table-talk-orchestrator'
import type { CharacterStats } from '$lib/types'

export type SessionZeroPhase =
  | 'introductions'
  | 'premises'
  | 'character_creation'
  | 'bonding'
  | 'secrets'
  | 'complete'
  | null

/**
 * Session Zero Phase content returned to UI
 */
export interface SessionZeroPhaseContent {
  phase: SessionZeroPhase
  type: 'narration' | 'interaction' | 'character_sheet_modal' | 'complete'
  content?: string
  characterToAdjust?: CharacterStats | null
  proposedAdjustments?: Record<string, string | number | null>
  nextAction?: string
  estimatedDuration?: string
}

/**
 * AI Player introduction for Introductions phase
 */
export interface AIPlayerIntroduction {
  characterId: string
  characterName: string
  introduction: string
  personality: string
  initialTableTalk?: string
}

/**
 * World premise description for Premises phase
 */
export interface WorldPremise {
  settingDescription: string
  toneExpectation: string
  aiGeneratedQuestions: string[]
}

/**
 * Session Zero Orchestrator
 *
 * Coordinates the 5-phase onboarding for AI player campaigns:
 * 1. Introductions - AI characters introduce themselves
 * 2. Premises - GM describes world, AI players ask questions
 * 3. Character Creation - AI stats proposed, GM approves
 * 4. Party Bonding - IC dialogue between AI characters
 * 5. Establish Secrets - GM assigns secrets to characters
 *
 * All phases run in the main Player Chat UI, with Character Sheet modal
 * overlaying for stat review/approval.
 */
export class SessionZeroOrchestrator {
  /**
   * Start Session Zero - Phase 1: Introductions
   * AI characters introduce themselves with personality
   */
  static async startIntroductions(aiPlayers: CharacterStats[]): Promise<SessionZeroPhaseContent[]> {
    const phases: SessionZeroPhaseContent[] = []

    // System message: Session Zero starting
    phases.push({
      phase: 'introductions',
      type: 'narration',
      content: '🎭 **Session Zero: Introductions**\n\nMeet your party members!',
      nextAction: 'ai_introduce',
      estimatedDuration: '3-5 minutes',
    })

    // Generate introduction for each AI player
    for (const player of aiPlayers) {
      const intro = await this.generateCharacterIntroduction(player)
      phases.push({
        phase: 'introductions',
        type: 'interaction',
        content: intro.introduction,
        nextAction: 'table_talk',
      })

      // Optional: Table talk reaction from other players
      if (Math.random() < 0.6) {
        const reaction = await this.generateTableTalkReaction(
          aiPlayers.filter((p) => p.id !== player.id),
          `${player.name} just introduced themselves as "${player.background}".`,
          4, // moderate intensity
        )
        if (reaction) {
          phases.push({
            phase: 'introductions',
            type: 'interaction',
            content: reaction,
            nextAction: 'continue',
          })
        }
      }
    }

    return phases
  }

  /**
   * Phase 2: Premises
   * GM describes world/setting, AI players ask clarifying questions
   */
  static async startPremises(
    premiseDescription: string,
    aiPlayers: CharacterStats[],
  ): Promise<SessionZeroPhaseContent[]> {
    const phases: SessionZeroPhaseContent[] = []

    // System message
    phases.push({
      phase: 'premises',
      type: 'narration',
      content: `📍 **Session Zero: Campaign Premises**\n\n${premiseDescription}`,
      nextAction: 'ai_questions',
      estimatedDuration: '5-10 minutes',
    })

    // Generate 1-2 questions per AI player
    for (const player of aiPlayers) {
      const questions = await this.generateCharacterQuestions(player, premiseDescription, 2)
      for (const question of questions) {
        phases.push({
          phase: 'premises',
          type: 'interaction',
          content: `💭 ${player.name}: "${question}"`,
          nextAction: 'gm_answer',
        })
      }
    }

    // System message: ready to move on
    phases.push({
      phase: 'premises',
      type: 'narration',
      content: '✓ Questions answered. Ready for Character Creation?',
      nextAction: 'proceed',
    })

    return phases
  }

  /**
   * Phase 3: Character Creation
   * AI proposes character stats, GM approves/edits
   */
  static async startCharacterCreation(
    aiPlayers: CharacterStats[],
  ): Promise<SessionZeroPhaseContent[]> {
    const phases: SessionZeroPhaseContent[] = []

    // System message
    phases.push({
      phase: 'character_creation',
      type: 'narration',
      content:
        '⚔️ **Session Zero: Character Creation**\n\nAI characters will suggest their starting stats.',
      nextAction: 'sheet_modal',
      estimatedDuration: '5-10 minutes',
    })

    // For each AI player, show character sheet modal
    for (const player of aiPlayers) {
      const proposedStats = await this.generateCharacterStats(player)
      phases.push({
        phase: 'character_creation',
        type: 'character_sheet_modal',
        characterToAdjust: player,
        proposedAdjustments: proposedStats,
        nextAction: 'gm_approve',
      })

      // Brief intro message after approval
      phases.push({
        phase: 'character_creation',
        type: 'narration',
        content: `✓ ${player.name} is ready to adventure!`,
        nextAction: 'continue',
      })
    }

    return phases
  }

  /**
   * Phase 4: Party Bonding
   * AI characters interact IC with brief bonding dialogue
   */
  static async startPartyBonding(aiPlayers: CharacterStats[]): Promise<SessionZeroPhaseContent[]> {
    const phases: SessionZeroPhaseContent[] = []

    // System message
    phases.push({
      phase: 'bonding',
      type: 'narration',
      content: '💝 **Session Zero: Party Bonding**\n\nThe party members get to know each other.',
      nextAction: 'ic_dialogue',
      estimatedDuration: '3-5 minutes',
    })

    // Generate 2-3 rounds of IC dialogue
    for (let round = 0; round < 3; round++) {
      const actor = aiPlayers[round % aiPlayers.length]
      const targets = aiPlayers.filter((p) => p.id !== actor.id)

      if (targets.length === 0) continue

      const dialogue = await this.generateBondingDialogue(actor, targets)
      phases.push({
        phase: 'bonding',
        type: 'interaction',
        content: `${actor.name}: "${dialogue}"`,
        nextAction: 'ic_response',
      })

      // Optional table talk reaction
      if (Math.random() < 0.5) {
        const reaction = await this.generateTableTalkReaction(
          targets,
          dialogue,
          5, // higher intensity for bonding
        )
        if (reaction) {
          phases.push({
            phase: 'bonding',
            type: 'interaction',
            content: reaction,
            nextAction: 'continue',
          })
        }
      }
    }

    return phases
  }

  /**
   * Phase 5: Establish Secrets
   * GM assigns secrets to AI characters (which other players know)
   */
  static async startSecrets(aiPlayers: CharacterStats[]): Promise<SessionZeroPhaseContent[]> {
    const phases: SessionZeroPhaseContent[] = []

    // System message
    phases.push({
      phase: 'secrets',
      type: 'narration',
      content:
        '🔐 **Session Zero: Establish Secrets**\n\nEach character has a secret others might uncover.',
      nextAction: 'secret_assignment',
      estimatedDuration: '3-5 minutes',
    })

    // For each character, allow secret assignment
    for (const player of aiPlayers) {
      const suggestedSecrets = await this.generateCharacterSecrets(player, aiPlayers)
      phases.push({
        phase: 'secrets',
        type: 'interaction',
        content: `💭 ${player.name} might have secret: "${suggestedSecrets[0]}"`,
        nextAction: 'gm_decide',
      })
    }

    // Complete
    phases.push({
      phase: 'complete',
      type: 'narration',
      content: '✅ **Session Zero Complete!**\n\nYour party is ready. Campaign begins now.',
      nextAction: 'start_campaign',
    })

    return phases
  }

  // ==================== Private Helper Methods ====================

  /**
   * Generate a character introduction (name, personality, background)
   */
  private static async generateCharacterIntroduction(
    character: CharacterStats,
  ): Promise<AIPlayerIntroduction> {
    const prompt = `Generate a brief, charming introduction for a TTRPG character.

Character: ${character.name}
Background: ${character.background}
Personality: ${character.personality}

Write a 1-2 sentence introduction they would say about themselves, in first person.
Include their role/class and something memorable about them.`

    const introText = await generateText(prompt, {
      model: 'gpt-4o-mini',
      presetId: 'narrative',
      maxTokens: 150,
    })

    return {
      characterId: character.id,
      characterName: character.name,
      introduction: `🎭 **${character.name}**: "${introText}"`,
      personality: character.personality ?? 'Unknown personality',
    }
  }

  /**
   * Generate clarifying questions about the world premise
   */
  private static async generateCharacterQuestions(
    character: CharacterStats,
    premiseDescription: string,
    count: number = 2,
  ): Promise<string[]> {
    const prompt = `As the character ${character.name} (${character.personality}), 
generate ${count} natural, curious questions about this campaign setting:

${premiseDescription}

Questions should be:
- In character (reflect their personality and background)
- Practical (about the world, not game mechanics)
- Open-ended (invite GM response)

Return ONLY the questions, one per line, without numbering.`

    const response = await generateText(prompt, {
      model: 'gpt-4o-mini',
      presetId: 'narrative',
      maxTokens: 200,
    })

    return response
      .split('\n')
      .map((q) => q.trim())
      .filter((q) => q.length > 0)
      .slice(0, count)
  }

  /**
   * Generate proposed character stats for Session Zero
   */
  private static async generateCharacterStats(
    _character: CharacterStats,
  ): Promise<Record<string, string | number>> {
    // Simplified proposal - in real system, would call full character generation
    return {
      healthMax: Math.floor(Math.random() * 8) + 12, // 12-20
      energyMax: Math.floor(Math.random() * 4) + 6, // 6-10
      health: Math.floor(Math.random() * 8) + 12,
      energy: Math.floor(Math.random() * 4) + 6,
    }
  }

  /**
   * Generate bonding dialogue between characters
   */
  private static async generateBondingDialogue(
    actor: CharacterStats,
    targets: CharacterStats[],
  ): Promise<string> {
    const targetNames = targets.map((t) => t.name).join(', ')
    const prompt = `As ${actor.name} (${actor.personality}), 
generate one line of bonding dialogue directed at your companions: ${targetNames}.

Make it:
- In character (reflect personality and background)
- Warm and party-building
- 1 sentence max
- Natural (as if spoken at a table)

Return ONLY the dialogue, no character name or quotation marks.`

    return await generateText(prompt, {
      model: 'gpt-4o-mini',
      presetId: 'narrative',
      maxTokens: 100,
    })
  }

  /**
   * Generate table talk reaction to an event
   */
  private static async generateTableTalkReaction(
    players: CharacterStats[],
    event: string,
    intensity: number,
  ): Promise<string | null> {
    // Determine if reaction happens at this intensity
    const reactionChance = intensity / 8
    if (Math.random() > reactionChance) return null

    const actor = players[Math.floor(Math.random() * players.length)]
    if (!actor) return null

    return await TableTalkOrchestrator.generateReaction({
      storyId: 'session-zero',
      campaignId: 'session-zero',
      aiPlayerId: actor.id,
      character: { name: actor.name },
      recentAction: event,
      otherCharacters: players.map((player) => ({ name: player.name })),
      sceneContext: 'Session Zero bonding',
      tableTalkIntensity: intensity,
    }).then((r) => `💬 ${r.characterName} (OOC): "${r.content}"`)
  }

  /**
   * Generate suggested secrets for character
   */
  private static async generateCharacterSecrets(
    character: CharacterStats,
    otherPlayers: CharacterStats[],
  ): Promise<string[]> {
    const others = otherPlayers
      .filter((p) => p.id !== character.id)
      .map((p) => p.name)
      .join(', ')

    const prompt = `Generate 2-3 interesting character secrets for ${character.name} 
in a TTRPG setting. Secrets should involve:
- A hidden motivation or loyalty
- A connection to other party members: ${others}
- Something that could create interesting dramatic moments

Return ONLY the secrets, one per line, without numbering or quotes.`

    const response = await generateText(prompt, {
      model: 'gpt-4o-mini',
      presetId: 'narrative',
      maxTokens: 200,
    })

    return response
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 3)
  }
}

import { describe, expect, it } from 'vitest'
import { get } from 'svelte/store'
import { CampaignTypeService } from './campaign-type-service'
import { TurnDirector } from './turn-director'
import { TableTalkOrchestrator } from './table-talk-orchestrator'
import { initializeChatStore } from '$lib/stores/chat-store.svelte'
import type { Campaign, ChatMessage } from '$lib/types'

const campaign: Campaign = {
  id: 'campaign-gm-ai',
  storyId: 'story-gm-ai',
  title: 'The Gilded Cage',
  description: null,
  rulesetId: 'd20-classic',
  spotlightCharacterId: 'emily-star',
  status: 'active',
  campaignType: 'human_gm_ai_players',
  createdAt: 1,
  updatedAt: 1,
}

describe('GM campaign flow integration', () => {
  it('routes a Human GM with AI Players campaign to the chat-first GM screen', () => {
    const type = CampaignTypeService.getCampaignType(campaign)

    expect(type).toBe('human_gm_ai_players')
    expect(CampaignTypeService.usesGMCampaignUI(type)).toBe(true)
    expect(CampaignTypeService.hasAIPlayers(type)).toBe(true)
  })

  it('routes a human-controlled active actor to an AI player turn', () => {
    const director = new TurnDirector()

    const turnType = director.getNextTurnType({
      sceneMode: 'social',
      activeActor: { id: 'emily-star', name: 'Emily Star', category: 'player' },
      isAIPlayerControlled: true,
    })

    expect(turnType).toBe('ai_player_turn')
  })

  it('keeps private messages scoped while retaining full-table narration', () => {
    const chat = initializeChatStore(campaign.id, 'session-1')
    const messages: ChatMessage[] = [
      {
        id: 'private-proposal',
        type: 'proposal',
        campaignId: campaign.id,
        sessionId: 'session-1',
        timestamp: 1,
        audience: 'private_player',
        visibility: 'director_only',
        actorId: 'emily-star',
        actorName: 'Emily Star',
        proposal: {
          id: 'proposal-1',
          campaignId: campaign.id,
          aiPlayerId: 'ai-emily',
          characterId: 'emily-star',
          sceneId: null,
          action: 'Quietly inspect the tablet before answering.',
          reasoning: 'It could contain useful evidence.',
          confidence: 8,
          reviewStatus: 'pending',
          createdAt: 1,
          updatedAt: 1,
        },
        confidence: 8,
        reasoning: 'It could contain useful evidence.',
        reviewStatus: 'pending',
      },
      {
        id: 'gm-narration',
        type: 'narration',
        campaignId: campaign.id,
        sessionId: 'session-1',
        timestamp: 2,
        audience: 'full_table',
        visibility: 'player_safe',
        actorId: null,
        actorName: 'GM',
        content: 'The tablet vibrates against the linoleum floor.',
        narrativeWeight: 'normal',
        canPromoteToLog: true,
      },
    ]

    chat.addMessages(messages)

    expect(get(chat.getVisibleMessages('private_player')).map((message) => message.id)).toEqual([
      'private-proposal',
      'gm-narration',
    ])
    expect(get(chat.getVisibleMessages('private_subset')).map((message) => message.id)).toEqual([
      'gm-narration',
    ])
  })

  it('uses silent table-talk timing at intensity zero and bounded timing when enabled', () => {
    expect(TableTalkOrchestrator.getReactionDelayMs(0)).toBe(0)

    const enabledDelay = TableTalkOrchestrator.getReactionDelayMs(4)
    expect(enabledDelay).toBeGreaterThanOrEqual(1500)
    expect(enabledDelay).toBeLessThanOrEqual(3500)
  })
})

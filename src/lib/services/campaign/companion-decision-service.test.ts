import { beforeEach, describe, expect, it } from 'vitest'
import { CompanionDecisionService } from './companion-decision-service'

describe('CompanionDecisionService', () => {
  let service: CompanionDecisionService

  beforeEach(() => {
    service = new CompanionDecisionService()
  })

  it('creates a pending companion-owned proposal with session attribution', () => {
    const proposal = service.propose({
      campaignId: 'campaign-1',
      sessionId: 'session-2',
      characterId: 'companion-1',
      actorCategory: 'active_companion',
      controlMode: 'autonomous',
      sceneMode: 'combat',
      source: 'companion_ai',
      intent: 'Protect the primary character',
      proposedAction: 'Move between the primary character and the ogre',
      rationale: 'The companion considers the primary character vulnerable.',
    })

    expect(proposal).toMatchObject({
      campaignId: 'campaign-1',
      sessionId: 'session-2',
      characterId: 'companion-1',
      actorCategory: 'active_companion',
      controlMode: 'autonomous',
      source: 'companion_ai',
      accepted: null,
    })
    expect(service.list('campaign-1', 'session-2')).toEqual([proposal])
  })

  it('records accepted and rejected outcomes without changing the proposal owner', () => {
    const proposal = service.propose({
      campaignId: 'campaign-1',
      characterId: 'companion-1',
      actorCategory: 'active_companion',
      controlMode: 'tactical_delegate',
      sceneMode: 'combat',
      source: 'player_request',
      intent: 'Focus the injured enemy',
      proposedAction: 'Attack the injured enemy',
      rationale: 'The request aligns with the companion tactical preference.',
    })

    const accepted = service.decide(proposal.id, true)
    expect(accepted.accepted).toBe(true)
    expect(accepted.characterId).toBe('companion-1')
    expect(accepted.controlMode).toBe('tactical_delegate')

    const rejected = service.decide(proposal.id, false)
    expect(rejected.accepted).toBe(false)
    expect(service.list('campaign-1')).toEqual([rejected])
  })

  it('filters proposals by campaign and session', () => {
    service.propose({
      campaignId: 'campaign-1',
      sessionId: 'session-1',
      characterId: 'companion-1',
      actorCategory: 'active_companion',
      controlMode: 'autonomous',
      sceneMode: 'camp',
      source: 'companion_ai',
      intent: 'Speak privately',
      proposedAction: 'Ask to speak with the primary character',
      rationale: 'The companion has a private concern.',
    })
    service.propose({
      campaignId: 'campaign-1',
      sessionId: 'session-2',
      characterId: 'companion-2',
      actorCategory: 'active_companion',
      controlMode: 'autonomous',
      sceneMode: 'travel',
      source: 'companion_ai',
      intent: 'Scout ahead',
      proposedAction: 'Scout the next ridge',
      rationale: 'The companion is cautious about an ambush.',
    })
    service.propose({
      campaignId: 'campaign-2',
      sessionId: 'session-1',
      characterId: 'companion-3',
      actorCategory: 'friendly_npc',
      controlMode: 'gm_directed',
      sceneMode: 'settlement',
      source: 'gm',
      intent: 'Deliver a warning',
      proposedAction: 'Warn the party about the gate guards',
      rationale: 'The GM is directing this actor.',
    })

    expect(service.list('campaign-1', 'session-2')).toHaveLength(1)
    expect(service.list('campaign-1')).toHaveLength(2)
    expect(service.list('campaign-2')).toHaveLength(1)
  })

  it('lists pending proposals separately for runtime and UI consumption', () => {
    const pending = service.propose({
      campaignId: 'campaign-1',
      sessionId: 'session-1',
      characterId: 'companion-1',
      actorCategory: 'active_companion',
      controlMode: 'autonomous',
      sceneMode: 'combat',
      source: 'companion_ai',
      intent: 'Protect the primary character',
      proposedAction: 'Step between the party and the ogre',
      rationale: 'The companion wants to shield the primary character.',
    })
    const accepted = service.propose({
      campaignId: 'campaign-1',
      sessionId: 'session-1',
      characterId: 'companion-2',
      actorCategory: 'active_companion',
      controlMode: 'tactical_delegate',
      sceneMode: 'combat',
      source: 'player_request',
      intent: 'Focus the wounded enemy',
      proposedAction: 'Strike the wounded enemy',
      rationale: 'The player requested a tactical focus on the wounded foe.',
    })

    const resolved = service.decide(accepted.id, true)

    expect(service.listPending('campaign-1', 'session-1')).toEqual([pending])
    expect(service.listResolved('campaign-1', 'session-1')).toEqual([
      { ...resolved, accepted: true },
    ])
  })

  it('rejects decisions for unknown proposals', () => {
    expect(() => service.decide('missing-proposal', true)).toThrow(
      'Companion decision proposal not found: missing-proposal',
    )
  })

  it('rejects non-GM decisions for NPC and enemy actor categories', () => {
    expect(() =>
      service.propose({
        campaignId: 'campaign-1',
        characterId: 'npc-1',
        actorCategory: 'friendly_npc',
        controlMode: 'tactical_player',
        sceneMode: 'combat',
        source: 'player_request',
        intent: 'Control the NPC',
        proposedAction: 'Attack the guard',
        rationale: 'Invalid player-control path.',
      }),
    ).toThrow('Only active companions may receive non-GM companion decisions')

    expect(() =>
      service.propose({
        campaignId: 'campaign-1',
        characterId: 'enemy-1',
        actorCategory: 'enemy',
        controlMode: 'tactical_player',
        sceneMode: 'combat',
        source: 'tactical_delegate',
        intent: 'Control the enemy',
        proposedAction: 'Attack the party',
        rationale: 'Invalid enemy-control path.',
      }),
    ).toThrow('Only active companions may receive non-GM companion decisions')
  })
})

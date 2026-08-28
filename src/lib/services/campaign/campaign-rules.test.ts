import { describe, expect, it } from 'vitest'
import type { CampaignPartyMember, Item } from '$lib/types'
import {
  buildSessionPartySnapshot,
  canActivatePartyMember,
  countActiveEligibleMembers,
  validateItemOwnership,
  validateSpotlightCharacter,
} from './campaign-rules'

function member(
  characterId: string,
  overrides: Partial<CampaignPartyMember> = {},
): CampaignPartyMember {
  return {
    id: `member-${characterId}`,
    campaignId: 'campaign-1',
    characterId,
    eligibilityStatus: 'eligible',
    actorCategory: 'active_companion',
    active: true,
    narrativeControlMode: 'autonomous',
    combatControlMode: 'autonomous',
    displayOrder: 0,
    joinedAt: 1,
    leftAt: null,
    ...overrides,
  }
}

function item(overrides: Partial<Item> = {}): Item {
  return {
    id: 'item-1',
    storyId: 'story-1',
    name: 'Lantern',
    description: null,
    quantity: 1,
    equipped: false,
    location: 'inventory',
    metadata: null,
    branchId: null,
    ...overrides,
  }
}

describe('campaign rules', () => {
  it('counts only active eligible party members', () => {
    expect(
      countActiveEligibleMembers([
        member('a'),
        member('b', { active: false }),
        member('c', { eligibilityStatus: 'deceased' }),
      ]),
    ).toBe(1)
  })

  it('enforces the active party maximum while allowing existing active members', () => {
    const current = [member('a'), member('b')]
    expect(canActivatePartyMember(current, member('c'), 2)).toBe(false)
    expect(canActivatePartyMember(current, member('a'), 2)).toBe(true)
  })

  it('allows spotlight only for active eligible members', () => {
    expect(() => validateSpotlightCharacter([member('a')], 'a')).not.toThrow()
    expect(() => validateSpotlightCharacter([member('a', { active: false })], 'a')).toThrow(
      'Spotlight character must be an active eligible party member',
    )
  })

  it('supports character ownership and shared stash ownership', () => {
    expect(() =>
      validateItemOwnership(item(), 'story-1', [member('a')], { ownerCharacterId: 'a' }),
    ).not.toThrow()
    expect(() =>
      validateItemOwnership(item(), 'story-1', [member('a')], { ownerCharacterId: null }),
    ).not.toThrow()
    expect(() =>
      validateItemOwnership(item(), 'story-1', [member('a')], { ownerCharacterId: 'missing' }),
    ).toThrow('Item owner must be an eligible campaign character')
  })

  it('rejects cross-story and self-container assignments', () => {
    expect(() =>
      validateItemOwnership(item(), 'other-story', [member('a')], { ownerCharacterId: null }),
    ).toThrow('Item does not belong to the active campaign')
    expect(() =>
      validateItemOwnership(item(), 'story-1', [member('a')], {
        ownerCharacterId: 'a',
        containerItemId: 'item-1',
      }),
    ).toThrow('An item cannot contain itself')
  })

  it('builds an ordered session snapshot with primary and autonomous companions', () => {
    const snapshot = buildSessionPartySnapshot(
      { id: 'session-1', combatControlPolicy: 'companions_autonomous' },
      [member('primary', { actorCategory: 'primary_player_character' }), member('ally')],
      'primary',
      100,
    )

    expect(snapshot.map((entry) => [entry.characterId, entry.partyOrder])).toEqual([
      ['primary', 0],
      ['ally', 1],
    ])
    expect(snapshot[0]).toMatchObject({
      actorCategory: 'primary_player_character',
      narrativeControlMode: 'player_narrative',
      combatControlMode: 'player_narrative',
    })
    expect(snapshot[1]).toMatchObject({
      actorCategory: 'active_companion',
      narrativeControlMode: 'autonomous',
      combatControlMode: 'autonomous',
    })
  })

  it('maps tactical delegation and direct tactical control to companions only', () => {
    const party = [member('primary'), member('ally')]
    const delegated = buildSessionPartySnapshot(
      { id: 'session-delegate', combatControlPolicy: 'tactical_delegate' },
      party,
      'primary',
      100,
    )
    const direct = buildSessionPartySnapshot(
      { id: 'session-direct', combatControlPolicy: 'tactical_player' },
      party,
      'primary',
      100,
    )

    expect(delegated[0].combatControlMode).toBe('player_narrative')
    expect(delegated[1].combatControlMode).toBe('tactical_delegate')
    expect(delegated[1].narrativeControlMode).toBe('autonomous')
    expect(direct[0].combatControlMode).toBe('player_narrative')
    expect(direct[1].combatControlMode).toBe('tactical_player')
    expect(direct[1].narrativeControlMode).toBe('autonomous')
  })

  it('requires the primary character to be in the active party snapshot', () => {
    expect(() =>
      buildSessionPartySnapshot(
        { id: 'session-1', combatControlPolicy: 'companions_autonomous' },
        [member('ally')],
        'missing',
        100,
      ),
    ).toThrow('Primary character must be an active eligible party member')
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockDatabase } = vi.hoisted(() => ({
  mockDatabase: {
    getCampaignSetupSessions: vi.fn(),
    getCampaignSetupSession: vi.fn(),
    getCampaignSetupSessionPlayers: vi.fn(),
    getCampaignSetupChatMessages: vi.fn(),
    createCampaignSetupSession: vi.fn(),
    updateCampaignSetupSession: vi.fn(),
    addCampaignSetupChatMessage: vi.fn(),
    deleteCampaignSetupChatMessages: vi.fn(),
    getCampaignChatMessages: vi.fn(),
    getCampaignAIPlayers: vi.fn(),
    deleteCampaignChatMessagesFrom: vi.fn(),
  },
}))

vi.mock('$lib/services/database', () => ({ database: mockDatabase }))

import { SetupSessionStore } from './setup-session.svelte'

describe('SetupSessionStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDatabase.getCampaignSetupSessions.mockResolvedValue([])
    mockDatabase.getCampaignSetupSessionPlayers.mockResolvedValue([])
    mockDatabase.getCampaignSetupChatMessages.mockResolvedValue([])
  })

  it('creates repeated private setup sessions with independent sequence numbers', async () => {
    const store = new SetupSessionStore()
    await store.load('campaign-1')
    const first = await store.create({
      title: 'Mara concept',
      kind: 'private_character_creation',
      audience: { kind: 'private_player', aiPlayerId: 'ai-1' },
      participantIds: ['ai-1'],
    })
    const second = await store.create({
      title: 'Mara revision',
      kind: 'private_character_creation',
      audience: { kind: 'private_player', aiPlayerId: 'ai-1' },
      participantIds: ['ai-1'],
    })

    expect([first.sequence, second.sequence]).toEqual([1, 2])
    expect(mockDatabase.createCampaignSetupSession).toHaveBeenCalledTimes(2)
  })

  it('prevents a second setup session becoming active', async () => {
    const store = new SetupSessionStore()
    await store.load('campaign-1')
    const first = await store.create({
      title: 'First',
      kind: 'private_character_creation',
      audience: { kind: 'private_player', aiPlayerId: 'ai-1' },
      participantIds: ['ai-1'],
    })
    await store.start(first.id)
    const second = await store.create({
      title: 'Second',
      kind: 'private_character_creation',
      audience: { kind: 'private_player', aiPlayerId: 'ai-1' },
      participantIds: ['ai-1'],
    })

    await expect(store.start(second.id)).rejects.toThrow(/active setup session/)
  })

  it('restarts a stopped setup session without losing its timeline', async () => {
    const session = {
      id: 'setup-1',
      campaignId: 'campaign-1',
      sequence: 1,
      title: 'Private prologue',
      kind: 'private_prologue',
      phase: 'free_table',
      status: 'abandoned',
      audience: { kind: 'private_player', aiPlayerId: 'ai-1' },
      createdAt: 1,
      startedAt: 2,
      completedAt: 3,
      updatedAt: 3,
    }
    mockDatabase.getCampaignSetupSessions.mockResolvedValue([session])
    mockDatabase.getCampaignSetupSessionPlayers.mockResolvedValue([
      { setupSessionId: 'setup-1', aiPlayerId: 'ai-1', joinedAt: 1 },
    ])
    mockDatabase.getCampaignSetupChatMessages.mockResolvedValue([{ id: 'message-1' }])
    const store = new SetupSessionStore()
    await store.load('campaign-1')

    await store.start('setup-1')

    expect(store.selected).toMatchObject({
      status: 'active',
      startedAt: 2,
      completedAt: null,
    })
    expect(store.participants[0].aiPlayerId).toBe('ai-1')
    expect(store.messages[0].id).toBe('message-1')
    expect(mockDatabase.updateCampaignSetupSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'setup-1', status: 'active', startedAt: 2, completedAt: null }),
    )
  })

  it('does not restart a completed setup session', async () => {
    const session = {
      id: 'setup-1',
      campaignId: 'campaign-1',
      sequence: 1,
      title: 'Complete setup',
      kind: 'table_bonding',
      phase: 'bonding',
      status: 'completed',
      audience: { kind: 'full_table' },
      createdAt: 1,
      startedAt: 2,
      completedAt: 3,
      updatedAt: 3,
    }
    mockDatabase.getCampaignSetupSessions.mockResolvedValue([session])
    const store = new SetupSessionStore()
    await store.load('campaign-1')

    await expect(store.start('setup-1')).rejects.toThrow(/planned or stopped/)
  })

  it('restores participant and chat snapshots when selecting history', async () => {
    const session = {
      id: 'setup-1',
      campaignId: 'campaign-1',
      sequence: 1,
      title: 'Session 0.5',
      kind: 'table_bonding',
      phase: 'bonding',
      status: 'completed',
      audience: { kind: 'full_table' },
      createdAt: 1,
      startedAt: 2,
      completedAt: 3,
      updatedAt: 3,
    }
    mockDatabase.getCampaignSetupSessions.mockResolvedValue([session])
    mockDatabase.getCampaignSetupSessionPlayers.mockResolvedValue([
      { setupSessionId: 'setup-1', aiPlayerId: 'ai-1', joinedAt: 1 },
    ])
    mockDatabase.getCampaignSetupChatMessages.mockResolvedValue([{ id: 'message-1' }])
    const store = new SetupSessionStore()

    await store.load('campaign-1')

    expect(store.selected?.id).toBe('setup-1')
    expect(store.participants[0].aiPlayerId).toBe('ai-1')
    expect(store.messages[0].id).toBe('message-1')
  })

  it('imports legacy Session Zero once into isolated setup chat', async () => {
    const store = new SetupSessionStore()
    await store.load('campaign-1')
    mockDatabase.getCampaignAIPlayers.mockResolvedValue([
      { id: 'roster-1', campaignId: 'campaign-1', aiPlayerId: 'ai-1', joinedAt: 1, leftAt: null },
    ])
    mockDatabase.getCampaignChatMessages.mockResolvedValue([
      {
        id: 'start',
        type: 'system',
        campaignId: 'campaign-1',
        sessionId: null,
        timestamp: 10,
        audience: 'full_table',
        visibility: 'player_safe',
        actorId: null,
        actorName: 'SYSTEM',
        content: 'Session Zero has begun. Meet the table before the first scene.',
        severity: 'info',
      },
    ])
    const settings = {
      campaignId: 'campaign-1',
      defaultPartySize: 4,
      maxPartySize: 6,
      sceneMode: 'free',
      turnOrderMode: 'free',
      diceEnforcement: 'guided',
      nsfwIntensity: 0,
      worldCharter: null,
      gmPersona: null,
      companionCombatPolicy: 'companions_autonomous',
      aiPlayersEnabled: true,
      defaultAIPlayerCount: 4,
      tableTalkIntensity: 4,
      sessionZeroPhase: 'introductions',
      sessionZeroStatus: 'in_progress',
      createdAt: 1,
      updatedAt: 1,
    } as const
    const imported = await store.importLegacySessionZero(settings)

    expect(imported).toMatchObject({ kind: 'group_session_zero', status: 'active' })
    expect(mockDatabase.addCampaignSetupChatMessage).toHaveBeenCalledTimes(1)
    expect(mockDatabase.deleteCampaignChatMessagesFrom).toHaveBeenCalledWith('campaign-1', null, 10)
    expect(await store.importLegacySessionZero(settings)).toBeNull()
  })
})

import { database } from '$lib/services/database'
import type {
  CampaignSetupPhase,
  CampaignSetupSession,
  CampaignSetupSessionKind,
  CampaignSetupSessionPlayer,
  InteractionAudience,
} from '$lib/types'
import type { ChatMessage } from '$lib/services/campaign/chat-types'
import {
  assertCanActivateSetupSession,
  setupSessionDisplayLabel,
  validateSetupSessionDefinition,
} from '$lib/services/campaign/formation-rules'
import { getSessionZeroAttempt } from '$lib/services/campaign/session-zero-reset'
import type { CampaignSettings } from '$lib/types'

const DEFAULT_PHASE: Record<CampaignSetupSessionKind, CampaignSetupPhase> = {
  private_character_creation: 'character_creation',
  private_prologue: 'free_table',
  group_session_zero: 'introductions',
  table_bonding: 'bonding',
}

const GROUP_PHASES: CampaignSetupPhase[] = [
  'introductions',
  'premises',
  'character_creation',
  'bonding',
  'secrets',
]

export class SetupSessionStore {
  campaignId = $state<string | null>(null)
  sessions = $state<CampaignSetupSession[]>([])
  selected = $state<CampaignSetupSession | null>(null)
  participants = $state<CampaignSetupSessionPlayer[]>([])
  messages = $state<ChatMessage[]>([])
  loading = $state(false)
  error = $state<string | null>(null)

  get active(): CampaignSetupSession | null {
    return this.sessions.find((session) => session.status === 'active') ?? null
  }

  async load(campaignId: string): Promise<void> {
    this.loading = true
    this.error = null
    try {
      this.campaignId = campaignId
      this.sessions = await database.getCampaignSetupSessions(campaignId)
      const target = this.active ?? this.sessions[0] ?? null
      await this.select(target?.id ?? null)
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Unable to load setup sessions'
      throw error
    } finally {
      this.loading = false
    }
  }

  async importLegacySessionZero(settings: CampaignSettings): Promise<CampaignSetupSession | null> {
    if (!this.campaignId || this.campaignId !== settings.campaignId) {
      throw new Error('Load the campaign before importing legacy Session Zero')
    }
    if (this.sessions.length > 0 || settings.sessionZeroStatus === 'not_started') return null
    const legacyMessages = await database.getCampaignChatMessages(settings.campaignId, null)
    const attempt = getSessionZeroAttempt(legacyMessages)
    if (!attempt) return null
    const roster = (await database.getCampaignAIPlayers(settings.campaignId)).filter(
      (member) => member.leftAt === null,
    )
    if (roster.length === 0) return null
    const phase = settings.sessionZeroPhase ?? 'free_table'
    const session = await this.create({
      title: 'Imported Session Zero',
      kind: 'group_session_zero',
      audience: { kind: 'full_table' },
      participantIds: roster.map((member) => member.aiPlayerId),
    })
    const now = Date.now()
    const imported: CampaignSetupSession = {
      ...session,
      phase,
      status: settings.sessionZeroStatus === 'completed' ? 'completed' : 'active',
      startedAt: attempt.startedAt,
      completedAt: settings.sessionZeroStatus === 'completed' ? now : null,
      updatedAt: now,
    }
    await database.updateCampaignSetupSession(imported)
    for (const message of legacyMessages.filter((item) => attempt.messageIds.includes(item.id))) {
      await database.addCampaignSetupChatMessage(imported.id, message)
    }
    await database.deleteCampaignChatMessagesFrom(settings.campaignId, null, attempt.startedAt)
    this.replace(imported)
    this.messages = legacyMessages.filter((item) => attempt.messageIds.includes(item.id))
    return imported
  }

  async create(input: {
    title: string
    kind: CampaignSetupSessionKind
    audience: InteractionAudience
    participantIds: string[]
  }): Promise<CampaignSetupSession> {
    if (!this.campaignId) throw new Error('No campaign loaded')
    const participantIds = validateSetupSessionDefinition(
      input.kind,
      DEFAULT_PHASE[input.kind],
      input.audience,
      input.participantIds,
    )
    const now = Date.now()
    const session: CampaignSetupSession = {
      id: crypto.randomUUID(),
      campaignId: this.campaignId,
      sequence: Math.max(0, ...this.sessions.map((item) => item.sequence)) + 1,
      title: input.title.trim() || `Setup ${this.sessions.length + 1}`,
      kind: input.kind,
      phase: DEFAULT_PHASE[input.kind],
      status: 'planned',
      audience: input.audience,
      createdAt: now,
      startedAt: null,
      completedAt: null,
      updatedAt: now,
    }
    const participants = participantIds.map((aiPlayerId) => ({
      setupSessionId: session.id,
      aiPlayerId,
      joinedAt: now,
    }))
    await database.createCampaignSetupSession(session, participants)
    this.sessions = [session, ...this.sessions]
    this.selected = session
    this.participants = participants
    this.messages = []
    return session
  }

  async select(id: string | null): Promise<void> {
    if (!id) {
      this.selected = null
      this.participants = []
      this.messages = []
      return
    }
    const session = this.sessions.find((item) => item.id === id) ??
      (await database.getCampaignSetupSession(id))
    if (!session) throw new Error('Setup session not found')
    const [participants, messages] = await Promise.all([
      database.getCampaignSetupSessionPlayers(id),
      database.getCampaignSetupChatMessages(id),
    ])
    this.selected = session
    this.participants = participants
    this.messages = messages
  }

  async start(id: string): Promise<void> {
    const session = this.sessions.find((item) => item.id === id)
    if (!session) throw new Error('Setup session not found')
    if (session.status !== 'planned' && session.status !== 'abandoned') {
      throw new Error('Only planned or stopped setup sessions can be started')
    }
    assertCanActivateSetupSession(this.sessions, id)
    const now = Date.now()
    const updated = {
      ...session,
      status: 'active' as const,
      startedAt: session.startedAt ?? now,
      completedAt: null,
      updatedAt: now,
    }
    await database.updateCampaignSetupSession(updated)
    this.replace(updated)
  }

  async finish(status: 'completed' | 'abandoned'): Promise<void> {
    if (!this.selected) throw new Error('No setup session selected')
    const now = Date.now()
    const updated = { ...this.selected, status, completedAt: now, updatedAt: now }
    await database.updateCampaignSetupSession(updated)
    this.replace(updated)
  }

  async advancePhase(): Promise<void> {
    if (!this.selected || this.selected.status !== 'active') {
      throw new Error('No active setup session selected')
    }
    if (this.selected.kind !== 'group_session_zero') return
    const index = GROUP_PHASES.indexOf(this.selected.phase)
    if (index < 0 || index === GROUP_PHASES.length - 1) {
      await this.finish('completed')
      return
    }
    const updated = {
      ...this.selected,
      phase: GROUP_PHASES[index + 1],
      updatedAt: Date.now(),
    }
    await database.updateCampaignSetupSession(updated)
    this.replace(updated)
  }

  async addMessage(message: ChatMessage): Promise<void> {
    if (!this.selected) throw new Error('No setup session selected')
    if (this.selected.status !== 'active') throw new Error('Setup session is read-only')
    await database.addCampaignSetupChatMessage(this.selected.id, message)
    this.messages = [...this.messages, message].sort(
      (left, right) => left.timestamp - right.timestamp || left.id.localeCompare(right.id),
    )
  }

  async resetActiveChat(): Promise<void> {
    if (!this.selected || this.selected.status !== 'active') {
      throw new Error('No active setup session selected')
    }
    await database.deleteCampaignSetupChatMessages(this.selected.id)
    this.messages = []
  }

  label(session: CampaignSetupSession): string {
    return setupSessionDisplayLabel(session)
  }

  private replace(session: CampaignSetupSession): void {
    this.sessions = this.sessions.map((item) => (item.id === session.id ? session : item))
    if (this.selected?.id === session.id) this.selected = session
  }
}

export const setupSessions = new SetupSessionStore()

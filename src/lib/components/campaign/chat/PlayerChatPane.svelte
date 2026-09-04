<script lang="ts">
  import { initializeChatStore, type ChatStore } from '$lib/stores/chat-store.svelte'
  import { RollDetectionService, type DetectedRoll } from '$lib/services/campaign/roll-detection-service'
  import { RollResolutionService } from '$lib/services/campaign/roll-resolution-service'
  import { TableTalkOrchestrator } from '$lib/services/campaign/table-talk-orchestrator'
  import { aiPlayerTurnOrchestrator } from '$lib/services/ai-player/ai-player-turn-orchestrator'
  import { narrativeHelperService } from '$lib/services/ai-player/narrative-helper-service'
  import { aiPlayerRoutingService } from '$lib/services/ai-player/ai-player-routing-service'
  import { database } from '$lib/services/database'
  import type {
    ChatMessage,
    ChatProposal,
    ChatRoll,
    ChatTableTalk,
    ChatNarration,
  } from '$lib/services/campaign/chat-types'
  import type { InteractionAudience } from '$lib/types'
  import type { CampaignSetupSessionKind } from '$lib/types'
  import { generatePrivatePrologueReply, generateGroupSetupReplies } from '$lib/services/campaign/private-prologue-reply'
  import { extractInlineOOC } from '$lib/utils/extractInlineOOC'
  import { campaign } from '$lib/stores/campaign.svelte'
  import { story } from '$lib/stores/story.svelte'
  import { tick } from 'svelte'

  interface Props {
    hasAIPlayers?: boolean
    tableTalkIntensity?: number
    audience?: InteractionAudience
    chatStore?: ChatStore
    allowSessionZeroChat?: boolean
    setupSessionId?: string | null
    setupSessionKind?: CampaignSetupSessionKind | null
    setupSessionActive?: boolean
    setupParticipantIds?: string[]
    onPromoteToLog?: (message: ChatNarration | ChatProposal) => Promise<void>
    promotedMessageIds?: Set<string>
  }

  let {
    hasAIPlayers = false,
    tableTalkIntensity = 4,
    audience = { kind: 'full_table' },
    chatStore = initializeChatStore(campaign.current?.id ?? '', campaign.activeSession?.id ?? null),
    allowSessionZeroChat = false,
    setupSessionId = null,
    setupSessionKind = null,
    setupSessionActive = false,
    setupParticipantIds = [],
    onPromoteToLog,
    promotedMessageIds = new Set(),
  }: Props = $props()

  let chatMessages = $derived($chatStore)
  let inputText = $state('')
  // Compose mode only controls how a plain message is tagged (IC narration vs OOC);
  // dice rolls are detected automatically from the text regardless of mode.
  let composeMode = $state<'narration' | 'table_talk'>('narration')
  let isPolishingNarration = $state(false)
  let isGeneratingSetupReply = $state(false)
  let narrationHelperError = $state<string | null>(null)
  let isGeneratingProposal = $state(false)
  let proposalError = $state<string | null>(null)
  let isExecutingRoll = $state(false)
  let rollError = $state<string | null>(null)
  let promotingMessageId = $state<string | null>(null)
  let isPromotingAll = $state(false)
  let promotionError = $state<string | null>(null)
  let hydratedCampaignId = $state<string | null>(null)
  let hydratedSessionKey = $state<string | null>(null)
  let chatFeed = $state<HTMLDivElement | null>(null)
  let editingMessageId = $state<string | null>(null)
  let editMessageText = $state('')
  let continuityError = $state<string | null>(null)
  let tableTalkRotationIndex = $state(0)
  let typingResponders = $state<Array<{ id: string; label: string }>>([])

  const currentTurn = $derived(campaign.getCurrentTurnActor())
  const isAIPlayerTurn = $derived(campaign.getCurrentTurnType() === 'ai_player_turn')
  const isSessionZero = $derived(campaign.settings?.sessionZeroPhase !== null || setupSessionId !== null)
  const setupSessionReadOnly = $derived(setupSessionId !== null && !setupSessionActive)
  // Combined IC/OOC feed: every message type renders together, tagged by type, in one timeline.
  const visibleMessages = $derived(chatMessages.messages)
  const newestVisibleMessageId = $derived(visibleMessages.at(-1)?.id ?? null)
  const detectedRoll = $derived(RollDetectionService.detectRoll(inputText))
  const remainingLogMessages = $derived(
    chatMessages.messages.filter(
      (message): message is ChatNarration | ChatProposal =>
        !promotedMessageIds.has(message.id) &&
        ((message.type === 'proposal' && message.reviewStatus !== 'declined') ||
          (message.type === 'narration' && message.canPromoteToLog)),
    ),
  )

  function scrollChatToEnd(behavior: ScrollBehavior = 'smooth') {
    void tick().then(() => {
      chatFeed?.scrollTo({ top: chatFeed.scrollHeight, behavior })
    })
  }

  async function restoreChatPosition(scrollTop: number | null) {
    if (scrollTop === null) return
    await tick()
    chatFeed?.scrollTo({ top: scrollTop, behavior: 'auto' })
  }

  function toggleComposeMode() {
    composeMode = composeMode === 'table_talk' ? 'narration' : 'table_talk'
    scrollChatToEnd('auto')
  }

  $effect(() => {
    void newestVisibleMessageId
    scrollChatToEnd()
  })

  $effect(() => {
    void typingResponders.length
    scrollChatToEnd()
  })

  const storyNarrationMessages = $derived.by((): ChatNarration[] => {
    const campaignId = campaign.current?.id
    const sessionId = campaign.activeSession?.id
    // Session Zero has its own sessionless chat timeline. Do not replay the campaign's
    // historical story prose into it, because those entries are not setup conversation.
    if (!campaignId || !sessionId || isSessionZero) return []
    return story.entries
      .filter((entry) => entry.type === 'narration')
      .map((entry, index) => ({
        id:
          typeof (entry.metadata as Record<string, unknown> | null)?.chatMessageId === 'string'
            ? ((entry.metadata as Record<string, unknown>).chatMessageId as string)
            : `story:${entry.id}`,
        type: 'narration',
        campaignId,
        sessionId: sessionId ?? null,
        timestamp: entry.createdAt,
        audience: 'full_table',
        visibility: 'player_safe',
        actorId: null,
        actorName: 'GM',
        content: entry.content,
        narrativeWeight: index === 0 ? 'heavy' : 'normal',
        canPromoteToLog: false,
      }))
  })

  // Story entries load after the campaign runtime. Reconcile them separately so the
  // opening narration cannot be missed by the one-time native chat-history request.
  // Session Zero and between-session chat never replay old narrative history.
  $effect(() => {
    if (campaign.activeSession && !isSessionZero) chatStore.addMessages(storyNarrationMessages)
  })

  $effect(() => {
    const campaignId = campaign.current?.id
    const sessionId = campaign.activeSession?.id ?? null
    const sessionZero = campaign.settings?.sessionZeroPhase !== null
    const sessionKey = campaignId ? `${campaignId}:${setupSessionId ?? sessionId ?? (sessionZero ? 'session-zero' : 'none')}` : null
    if (!campaignId || !story.currentStory || hydratedSessionKey === sessionKey) return

    if (setupSessionId) {
      hydratedSessionKey = sessionKey
      hydratedCampaignId = campaignId
      return
    }

    // Sessions are distinct chat chapters. Completed-session records remain in SQLite,
    // while the active pane starts empty until a new session begins.
    chatStore.clearMessages()
    hydratedSessionKey = sessionKey
    hydratedCampaignId = campaignId
    // Campaign-wide table talk remains available between sessions. Narrative history
    // stays empty because it is loaded only for an active session or Session Zero.
    void hydrateChat(campaignId, sessionId)
  })

  async function hydrateChat(campaignId: string, sessionId: string | null) {
    try {
      const sessionMessages = await database
        .getCampaignChatMessages(campaignId, sessionId)
        .catch((error) => {
          console.warn('[PlayerChatPane] Native chat history is unavailable; rebuilding history.', error)
          return []
        })
      const tableTalkMessages = sessionId
        ? await database
            .getCampaignChatMessages(campaignId, null)
            .then((messages) => messages.filter((message) => message.type === 'table_talk'))
            .catch((error) => {
              console.warn('[PlayerChatPane] Campaign-wide table talk is unavailable.', error)
              return []
            })
        : []
      const [savedProposals, aiPlayers] = await Promise.all([
        sessionId ? database.getAIPlayerProposals(campaignId, sessionId) : Promise.resolve([]),
        database.listAIPlayers(),
      ])
      const aiPlayerNames = new Map(aiPlayers.map((player) => [player.id, player.name]))
      const proposalMessages: ChatProposal[] = savedProposals.map((proposal) => ({
        id: `proposal:${proposal.id}`,
        type: 'proposal',
        campaignId,
        sessionId,
        // A proposal belongs at the instant it was first made. Review edits update
        // proposal.updatedAt, but must never reorder the chat timeline.
        timestamp: proposal.createdAt,
        audience: 'full_table',
        visibility: 'player_safe',
        actorId: proposal.characterId,
        actorName: `${aiPlayerNames.get(proposal.aiPlayerId) ?? 'AI Player'} (${story.characters.find((character) => character.id === proposal.characterId)?.name ?? 'Character'})`,
        proposal,
        confidence: proposal.confidence,
        reasoning: proposal.reasoning,
        reviewStatus: proposal.reviewStatus === 'accepted' ? 'approved' : proposal.reviewStatus,
      }))
      const persistedMessages = [...sessionMessages, ...tableTalkMessages]
      const seenSessionZeroStart = new Set<string>()
      const deDuplicatedMessages = persistedMessages.filter((message) => {
        if (
          message.type !== 'system' ||
          message.content !== 'Session Zero has begun. Meet the table before the first scene.'
        ) {
          return true
        }
        if (seenSessionZeroStart.has(message.content)) return false
        seenSessionZeroStart.add(message.content)
        return true
      })
      const persistedIds = new Set(deDuplicatedMessages.map((message) => message.id))
      const reconstructedMessages = [...storyNarrationMessages, ...proposalMessages].filter(
        (message) => !persistedIds.has(message.id),
      )
      chatStore.addMessages(
        [...deDuplicatedMessages, ...reconstructedMessages].sort(
          (left, right) => left.timestamp - right.timestamp,
        ),
      )
    } catch (error) {
      proposalError = error instanceof Error ? error.message : 'Unable to restore campaign chat.'
    }
  }

  function toChatAudience(
    interactionAudience: InteractionAudience,
  ): 'full_table' | 'private_subset' | 'private_player' {
    if (interactionAudience.kind === 'player_subset') return 'private_subset'
    if (interactionAudience.kind === 'private_player') return 'private_player'
    return 'full_table'
  }

  async function handleGenerateProposal() {
    if (
      !campaign.current ||
      !story.currentStory ||
      !currentTurn ||
      !isAIPlayerTurn ||
      isGeneratingProposal
    ) {
      return
    }

    isGeneratingProposal = true
    proposalError = null
    let typingAIPlayerId: string | null = null
    try {
      const assignment = await aiPlayerRoutingService.getAIPlayerForCharacter(
        campaign.current.id,
        currentTurn.id,
      )
      if (!assignment) {
        throw new Error('The active character is not assigned to an AI Player.')
      }
      typingAIPlayerId = assignment.aiPlayerId
      const audienceValidity = await aiPlayerRoutingService.isValidAudience(
        campaign.current.id,
        audience,
      )
      if (!audienceValidity.valid) {
        throw new Error(audienceValidity.invalidReason ?? 'The selected audience is invalid.')
      }

      const sceneMode = campaign.sceneTurnState?.sceneMode ?? campaign.settings?.sceneMode ?? 'free'
      const recentEntries = story.entries.slice(-5)
      typingResponders = [
        ...typingResponders.filter((responder) => responder.id !== assignment.aiPlayerId),
        { id: assignment.aiPlayerId, label: currentTurn.name },
      ]
      const result = await aiPlayerTurnOrchestrator.generateProposal({
        storyId: story.currentStory.id,
        campaignId: campaign.current.id,
        aiPlayerId: assignment.aiPlayerId,
        characterId: currentTurn.id,
        sceneMode,
        sceneSummary: recentEntries.at(-1)?.content ?? '',
        recentActions: recentEntries.map((entry) => entry.content),
        audience,
      })
      const aiPlayer = await database.getAIPlayer(assignment.aiPlayerId)
      const characterName =
        story.characters.find((character) => character.id === currentTurn.id)?.name ??
        currentTurn.name

      const now = Date.now()
      const proposal: ChatProposal['proposal'] = {
        id: result.proposalId,
        campaignId: campaign.current.id,
        aiPlayerId: assignment.aiPlayerId,
        characterId: currentTurn.id,
        sceneId: null,
        sceneMode,
        action: result.action,
        reasoning: result.reasoning,
        confidence: result.confidence,
        reviewStatus: 'pending',
        createdAt: now,
        updatedAt: now,
      }
      await database.upsertAIPlayerProposal(proposal, campaign.activeSession?.id)

      chatStore.addMessage({
        id: `proposal:${proposal.id}`,
        type: 'proposal',
        campaignId: campaign.current.id,
        sessionId: campaign.activeSession?.id ?? null,
        timestamp: now,
        audience: toChatAudience(audience),
        visibility: 'player_safe',
        actorId: currentTurn.id,
        actorName: `${aiPlayer?.name ?? 'AI Player'} (${characterName})`,
        proposal,
        confidence: result.confidence,
        reasoning: result.reasoning,
        reviewStatus: 'pending',
      })
      void addTableTalkAfterEvent(result.action, currentTurn.id).catch((error) => {
        console.error('[PlayerChatPane] Failed to generate table talk:', error)
      })
    } catch (error) {
      proposalError = error instanceof Error ? error.message : 'Unable to generate an AI proposal.'
    } finally {
      isGeneratingProposal = false
      if (typingAIPlayerId) {
        typingResponders = typingResponders.filter((responder) => responder.id !== typingAIPlayerId)
      }
    }
  }

  async function handlePolishNarration() {
    if (!inputText.trim() || !campaign.current || !story.currentStory || isPolishingNarration) return

    isPolishingNarration = true
    narrationHelperError = null
    try {
      inputText = await narrativeHelperService.expandSummary({
        storyId: story.currentStory.id,
        summary: inputText,
        sceneSummary: story.entries.at(-1)?.content ?? undefined,
        audience: 'full_table',
      })
    } catch (error) {
      narrationHelperError = error instanceof Error ? error.message : 'Unable to polish narration'
    } finally {
      isPolishingNarration = false
    }
  }

  async function handlePromoteToLog(message: ChatNarration | ChatProposal) {
    if (!onPromoteToLog || promotingMessageId || promotedMessageIds.has(message.id)) return
    promotingMessageId = message.id
    promotionError = null
    try {
      await onPromoteToLog(message)
    } catch (error) {
      promotionError = error instanceof Error ? error.message : 'Unable to add message to Story Log.'
    } finally {
      promotingMessageId = null
    }
  }

  async function handlePromoteAllToLog() {
    if (isPromotingAll || remainingLogMessages.length === 0) return
    const previousScrollTop = chatFeed?.scrollTop ?? null
    isPromotingAll = true
    promotionError = null
    try {
      for (const message of remainingLogMessages) {
        if (message.type === 'proposal' && message.reviewStatus !== 'approved') {
          await approveProposal(message)
        } else {
          await handlePromoteToLog(message)
        }
      }
    } finally {
      isPromotingAll = false
      await restoreChatPosition(previousScrollTop)
    }
  }

  function linkedStoryEntry(messageId: string) {
    return story.entries.find(
      (entry) =>
        entry.id === messageId.replace(/^story:/, '') ||
        (entry.metadata as Record<string, unknown> | null)?.chatMessageId === messageId,
    )
  }

  function startEditingMessage(message: ChatNarration | ChatProposal | ChatTableTalk) {
    editingMessageId = message.id
    editMessageText =
      message.type === 'proposal' ? message.proposal.action : message.content
    continuityError = null
  }

  function cancelEditingMessage() {
    editingMessageId = null
    editMessageText = ''
  }

  async function updatePersistedChatMessage(message: ChatMessage) {
    if (setupSessionId) {
      await database.updateCampaignSetupChatMessage(setupSessionId, message)
    } else {
      await database.updateCampaignChatMessage(message)
    }
  }

  async function deletePersistedChatMessage(messageId: string) {
    if (setupSessionId) {
      await database.deleteCampaignSetupChatMessage(setupSessionId, messageId)
    } else {
      await database.deleteCampaignChatMessage(messageId)
    }
  }

  async function saveMessageEdit(message: ChatNarration | ChatProposal | ChatTableTalk) {
    const nextText = editMessageText.trim()
    if (!nextText) return
    continuityError = null
    try {
      if (message.type === 'narration') {
        const updated = { ...message, content: nextText }
        const entry = linkedStoryEntry(message.id)
        if (entry) await story.updateEntry(entry.id, nextText)
        if (!message.id.startsWith('story:')) await updatePersistedChatMessage(updated)
        chatStore.updateMessage(updated)
      } else if (message.type === 'proposal') {
        const now = Date.now()
        const proposal = { ...message.proposal, action: nextText, updatedAt: now }
        const updated = { ...message, proposal, reviewStatus: 'approved' as const }
        const entry = linkedStoryEntry(message.id)
        if (entry) await story.updateEntry(entry.id, nextText)
        await database.updateAIPlayerProposalReview(proposal.id, 'accepted', nextText)
        await updatePersistedChatMessage(updated)
        chatStore.updateMessage(updated)
        await handlePromoteToLog(updated)
      } else {
        const updated = { ...message, content: nextText }
        await updatePersistedChatMessage(updated)
        chatStore.updateMessage(updated)
      }
      cancelEditingMessage()
    } catch (error) {
      continuityError = error instanceof Error ? error.message : 'Unable to save continuity correction.'
    }
  }

  async function approveProposal(message: ChatProposal) {
    const previousScrollTop = chatFeed?.scrollTop ?? null
    continuityError = null
    try {
      const now = Date.now()
      const proposal = { ...message.proposal, reviewStatus: 'accepted' as const, updatedAt: now }
      const updated = { ...message, proposal, reviewStatus: 'approved' as const }
      await database.updateAIPlayerProposalReview(proposal.id, 'accepted')
      await updatePersistedChatMessage(updated)
      chatStore.updateMessage(updated)
      await handlePromoteToLog(updated)
    } catch (error) {
      continuityError = error instanceof Error ? error.message : 'Unable to approve AI proposal.'
    } finally {
      await restoreChatPosition(previousScrollTop)
    }
  }

  /**
   * Mark a proposal that breaks continuity as declined. It stays visible for
   * the audit trail but is excluded from Story Log promotion until reconsidered.
   */
  async function rejectProposal(message: ChatProposal) {
    continuityError = null
    try {
      const now = Date.now()
      const proposal = { ...message.proposal, reviewStatus: 'declined' as const, updatedAt: now }
      const updated = { ...message, proposal, reviewStatus: 'declined' as const }
      await database.updateAIPlayerProposalReview(proposal.id, 'declined')
      await updatePersistedChatMessage(updated)
      chatStore.updateMessage(updated)
    } catch (error) {
      continuityError = error instanceof Error ? error.message : 'Unable to reject AI proposal.'
    }
  }

  async function deleteContinuityMessage(message: ChatNarration | ChatProposal) {
    continuityError = null
    try {
      if (message.type === 'proposal') {
        const entry = linkedStoryEntry(message.id)
        if (entry) await story.deleteEntry(entry.id)
        await database.deleteAIPlayerProposal(message.proposal.id)
        await deletePersistedChatMessage(message.id)
      } else {
        const entry = linkedStoryEntry(message.id)
        if (entry) await story.deleteEntry(entry.id)
        if (!message.id.startsWith('story:')) await deletePersistedChatMessage(message.id)
      }
      chatStore.removeMessage(message.id)
    } catch (error) {
      continuityError = error instanceof Error ? error.message : 'Unable to delete continuity message.'
    }
  }

  async function deleteTableTalkMessage(message: ChatTableTalk) {
    continuityError = null
    try {
      await deletePersistedChatMessage(message.id)
      chatStore.removeMessage(message.id)
    } catch (error) {
      continuityError = error instanceof Error ? error.message : 'Unable to delete table talk.'
    }
  }

  async function deleteRollMessage(message: ChatRoll) {
    continuityError = null
    try {
      await deletePersistedChatMessage(message.id)
      await database.deleteRollLedgerEntry(message.rollEntry.id)
      chatStore.removeMessage(message.id)
    } catch (error) {
      continuityError = error instanceof Error ? error.message : 'Unable to delete the roll.'
    }
  }

  async function addTableTalkAfterEvent(
    recentAction: string,
    excludedCharacterId: string | null,
    options?: { honorMentions?: boolean },
  ) {
    if (!campaign.current || !story.currentStory || tableTalkIntensity <= 0) return

    const [roster, assignments, aiPlayers] = await Promise.all([
      database.getCampaignAIPlayers(campaign.current.id),
      database.getPlayerCharactersForCampaign(campaign.current.id),
      database.listAIPlayers(),
    ])
    const playerById = new Map(
      aiPlayers.map((player) => [player.id, player]),
    )
    const assignmentByPlayerId = new Map(
      assignments
        .filter((assignment) => assignment.leftAt === null)
        .map((assignment) => [assignment.aiPlayerId, assignment]),
    )
    const participants = roster
      .filter((member) => member.leftAt === null)
      .filter(
        (member) => setupParticipantIds.length === 0 || setupParticipantIds.includes(member.aiPlayerId),
      )
      .map((member) => {
        const player = playerById.get(member.aiPlayerId)
        if (!player) return null
        const assignment = assignmentByPlayerId.get(member.aiPlayerId)
        if (assignment && excludedCharacterId === assignment.characterId) return null
        const character = assignment
          ? story.characters.find((candidate) => candidate.id === assignment.characterId)
          : null
        return {
          aiPlayerId: member.aiPlayerId,
          participant: {
            name: character?.name ?? player.name,
            playerName: character ? player.name : undefined,
            personality: player.basePersonality,
          },
        }
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

    const normalizedAction = recentAction.toLowerCase()
    const mentioned = options?.honorMentions
      ? participants.filter(({ participant }) =>
          [participant.name, participant.playerName]
            .filter((name): name is string => Boolean(name))
            .some((name) => normalizedAction.includes(name.toLowerCase())),
        )
      : []
    const unmentioned = participants.filter((entry) => !mentioned.includes(entry))
    const rotatingParticipants = unmentioned.length
      ? [
          ...unmentioned.slice(tableTalkRotationIndex % unmentioned.length),
          ...unmentioned.slice(0, tableTalkRotationIndex % unmentioned.length),
        ]
      : []
    const maximumResponders = Math.min(tableTalkIntensity >= 6 ? 3 : 2, participants.length)
    const transcript = chatMessages.messages
      .slice(-6)
      .map((message) => `${message.actorName}: ${message.type === 'proposal' ? message.proposal.action : message.content ?? ''}`)
    let responders = [...mentioned, ...rotatingParticipants].slice(0, maximumResponders)
    if (options?.honorMentions) {
      try {
        const selectedIds = await TableTalkOrchestrator.selectResponders({
          storyId: story.currentStory.id,
          gmMessage: recentAction,
          candidates: participants.map(({ aiPlayerId, participant }) => ({
            id: aiPlayerId,
            name: participant.playerName
              ? `${participant.playerName} (${participant.name})`
              : participant.name,
          })),
          recentTranscript: transcript,
          maximumResponders,
        })
        responders = selectedIds
          .map((id) => participants.find((entry) => entry.aiPlayerId === id))
          .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined)
      } catch (error) {
        console.warn('[PlayerChatPane] Responder selection failed; using local routing.', error)
        responders = mentioned.length ? mentioned.slice(0, maximumResponders) : []
      }
    }
    if (unmentioned.length) {
      tableTalkRotationIndex = (tableTalkRotationIndex + 1) % unmentioned.length
    }

    for (const { aiPlayerId, participant } of responders) {
      const responderLabel = participant.playerName
        ? `${participant.playerName} (${participant.name})`
        : participant.name
      typingResponders = [
        ...typingResponders.filter((responder) => responder.id !== aiPlayerId),
        { id: aiPlayerId, label: responderLabel },
      ]
      try {
        const delay = TableTalkOrchestrator.getReactionDelayMs(tableTalkIntensity)
        if (delay > 0) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, delay))
        }

        const reaction = await TableTalkOrchestrator.generateReaction({
          storyId: story.currentStory.id,
          campaignId: campaign.current.id,
          aiPlayerId,
          character: participant,
          recentAction,
          otherCharacters: participants
            .filter((entry) => entry.aiPlayerId !== aiPlayerId)
            .map((entry) => entry.participant),
          sceneContext: campaign.sceneTurnState?.sceneMode ?? 'free',
          tableTalkIntensity,
          recentTranscript: transcript,
          forceResponse:
            options?.honorMentions || mentioned.some((entry) => entry.aiPlayerId === aiPlayerId),
        })
        if (!reaction.content) continue

        chatStore.addMessage({
          id: reaction.id,
          type: 'table_talk',
          campaignId: campaign.current.id,
          // Table talk is campaign-wide OOC history, not part of one session narrative.
          sessionId: null,
          timestamp: Date.now(),
          audience: toChatAudience(audience),
          visibility: 'player_safe',
          actorName: reaction.characterName,
          content: reaction.content,
          sentiment: reaction.sentiment,
          emoji: reaction.emoji,
          intensity: reaction.intensity,
        })
      } finally {
        typingResponders = typingResponders.filter(
          (responder) => responder.id !== aiPlayerId,
        )
      }
    }
  }

  /**
   * Handle sending narration
   */
  async function handleSendNarration() {
    if (
      !inputText.trim() ||
      !campaign.current ||
      isGeneratingSetupReply ||
      (!campaign.activeSession && !allowSessionZeroChat && !setupSessionActive)
    ) {
      narrationHelperError = 'Start a session before sending chat narration.'
      return
    }

    const message: ChatNarration = {
      id: crypto.randomUUID(),
      type: 'narration',
      campaignId: campaign.current.id,
      sessionId: campaign.activeSession?.id ?? null,
      timestamp: Date.now(),
      audience: toChatAudience(audience),
      visibility: 'player_safe',
      actorId: null,
      actorName: 'GM',
      content: inputText.trim(),
      narrativeWeight: 'normal',
      canPromoteToLog: true,
    }

    chatStore.addMessage(message)
    inputText = ''

    if (
      setupSessionKind === 'private_prologue' &&
      setupSessionActive &&
      story.currentStory &&
      audience.kind === 'private_player'
    ) {
      isGeneratingSetupReply = true
      proposalError = null
      typingResponders = [
        ...typingResponders.filter((responder) => responder.id !== audience.aiPlayerId),
        { id: audience.aiPlayerId, label: 'AI Player' },
      ]
      try {
        const reply = await generatePrivatePrologueReply({
          storyId: story.currentStory.id,
          campaignId: campaign.current.id,
          aiPlayerId: audience.aiPlayerId,
          narration: message.content,
          sceneMode: campaign.sceneTurnState?.sceneMode ?? campaign.settings?.sceneMode ?? 'free',
          recentActions: chatMessages.messages.slice(-6).map((item) =>
            `${item.actorName}: ${item.type === 'proposal' ? item.proposal.action : item.content ?? ''}`,
          ),
        })
        chatStore.addMessage(reply)
      } catch (error) {
        proposalError =
          error instanceof Error ? error.message : 'Unable to generate the private prologue reply.'
      } finally {
        isGeneratingSetupReply = false
        typingResponders = typingResponders.filter(
          (responder) => responder.id !== audience.aiPlayerId,
        )
      }
    } else if (
      setupSessionKind === 'table_bonding' &&
      setupSessionActive &&
      story.currentStory &&
      setupParticipantIds.length > 0
    ) {
      // Session 0.5 exists for characters to bond in character; generate an IC reply per participant,
      // one at a time, so responses appear staggered like a real conversation instead of all at once.
      isGeneratingSetupReply = true
      proposalError = null
      try {
        await generateGroupSetupReplies({
          storyId: story.currentStory.id,
          campaignId: campaign.current.id,
          setupSessionId: setupSessionId!,
          aiPlayerIds: setupParticipantIds,
          narration: message.content,
          sceneMode: campaign.sceneTurnState?.sceneMode ?? campaign.settings?.sceneMode ?? 'free',
          recentActions: chatMessages.messages.slice(-6).map((item) =>
            `${item.actorName}: ${item.type === 'proposal' ? item.proposal.action : item.content ?? ''}`,
          ),
          onTypingStart: (aiPlayerId) => {
            typingResponders = [
              ...typingResponders.filter((responder) => responder.id !== aiPlayerId),
              { id: aiPlayerId, label: 'AI Player' },
            ]
          },
          onReply: (reply) => {
            typingResponders = typingResponders.filter((responder) => responder.id !== reply.proposal.aiPlayerId)
            chatStore.addMessage(reply)
          },
        })
      } catch (error) {
        proposalError =
          error instanceof Error ? error.message : 'Unable to generate bonding-scene replies.'
      } finally {
        isGeneratingSetupReply = false
        typingResponders = []
      }
    } else {
      void addTableTalkAfterEvent(message.content, null, { honorMentions: true }).catch((error) => {
        console.error('[PlayerChatPane] Failed to generate table talk after narration:', error)
      })
    }
  }

  function handleSendTableTalk() {
    narrationHelperError = null
    if (!inputText.trim() || !campaign.current || (!campaign.activeSession && !allowSessionZeroChat && !setupSessionActive)) {
      narrationHelperError = 'Start a session before sending table talk.'
      return
    }

    const content = inputText.trim()
    chatStore.addMessage({
      id: crypto.randomUUID(),
      type: 'table_talk',
      campaignId: campaign.current.id,
      sessionId: null,
      timestamp: Date.now(),
      audience: toChatAudience(audience),
      visibility: 'player_safe',
      actorId: null,
      actorName: 'GM',
      content,
      intensity: tableTalkIntensity,
      sentiment: 'neutral',
      emoji: '🎙️',
    })
    inputText = ''
    void addTableTalkAfterEvent(content, null, { honorMentions: true }).catch((error) => {
      console.error('[PlayerChatPane] Failed to generate GM table-talk replies:', error)
    })
  }

  /**
   * Send whatever is composed: auto-detected dice rolls take precedence,
   * otherwise the message is sent as narration or table talk per composeMode.
   */
  async function handleSend() {
    if (detectedRoll.found) {
      await executeRoll(detectedRoll)
      return
    }
    if (composeMode === 'table_talk') {
      handleSendTableTalk()
    } else {
      await handleSendNarration()
    }
  }

  /**
   * Execute an already-detected dice roll and post the result.
   */
  async function executeRoll(detected: DetectedRoll) {
    if (
      !campaign.current ||
      (!campaign.activeSession && !allowSessionZeroChat && !setupSessionActive) ||
      isExecutingRoll
    ) {
      if (!campaign.activeSession && !allowSessionZeroChat && !setupSessionActive) rollError = 'Start a session before rolling dice.'
      return
    }

    const actorId = campaign.sceneTurnState?.activeActorId ?? null
    if (!actorId) {
      rollError = 'Choose an active turn actor before rolling.'
      return
    }

    isExecutingRoll = true
    rollError = null
    try {
      const result = await RollResolutionService.executeDetectedRoll(detected, {
        campaignId: campaign.current.id,
        sessionId: campaign.activeSession?.id ?? null,
        actorId,
        visibility: 'player_safe',
      })
      const actorName =
        story.characters.find((character) => character.id === actorId)?.name ?? currentTurn?.name ?? 'Actor'

      chatStore.addMessage({
        id: crypto.randomUUID(),
        type: 'roll',
        campaignId: campaign.current.id,
        sessionId: campaign.activeSession?.id ?? null,
        timestamp: Date.now(),
        audience: 'full_table',
        visibility: 'player_safe',
        actorId,
        actorName,
        rollEntry: result.rollEntry,
        displayLabel: result.displayLabel,
        formattedResult: result.formattedResult,
        outcome: result.outcome,
        narrativeContext: detected.narrativeContext,
      })
      void addTableTalkAfterEvent(result.formattedResult, actorId).catch((error) => {
        console.error('[PlayerChatPane] Failed to generate table talk:', error)
      })
      inputText = ''
    } catch (error) {
      rollError = error instanceof Error ? error.message : 'Unable to execute roll.'
    } finally {
      isExecutingRoll = false
    }
  }

  /**
   * Format timestamp for display
   */
  function formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  }
</script>

<div class="player-chat-pane">
  <!-- Chat Feed -->
  <div class="chat-feed" bind:this={chatFeed}>
    {#if visibleMessages.length > 0}
      {#each visibleMessages as message (message.id)}
        <div class="chat-message {message.type}" class:declined={message.type === 'proposal' && message.reviewStatus === 'declined'}>
          {#if message.type === 'proposal'}
            {@const m = message as ChatProposal}
            <div class="message-header">
              <span class="actor">🎭 {m.actorName}</span>
              <span class="type-badge">IC</span>
              <span class="confidence">{m.confidence}/10</span>
            </div>
            {#if editingMessageId === m.id}
              <div class="message-content">
                <textarea class="message-editor" bind:value={editMessageText}></textarea>
              </div>
            {:else}
              {#if m.reasoning}
                <details class="reasoning-details">
                  <summary>OOC Reasoning</summary>
                  <p>{m.reasoning}</p>
                </details>
              {/if}
              {@const parsed = extractInlineOOC(m.proposal.action)}
              <div class="message-content">{parsed.ic}</div>
              {#each parsed.oocSegments as segment, index (index)}
                <div class="message-content ooc-comment">
                  <span class="type-badge ooc">OOC</span>
                  {segment}
                </div>
              {/each}
            {/if}
            <div class="message-actions">
              {#if editingMessageId === m.id}
                <button class="btn-small" onclick={() => saveMessageEdit(m)}>Save</button>
                <button class="btn-small" onclick={cancelEditingMessage}>Cancel</button>
              {:else if m.reviewStatus === 'approved'}
                <button
                  class="btn-small"
                  disabled={promotingMessageId === m.id || promotedMessageIds.has(m.id)}
                  onclick={() => handlePromoteToLog(m)}
                >
                  {promotingMessageId === m.id
                    ? 'Adding...'
                    : promotedMessageIds.has(m.id)
                      ? 'Added to Story Log'
                      : 'Add to Story Log'}
                </button>
                <button class="btn-small" onclick={() => startEditingMessage(m)}>Edit</button>
                <button class="btn-small" onclick={() => deleteContinuityMessage(m)}>Delete</button>
              {:else if m.reviewStatus === 'declined'}
                <span class="declined-label">Declined — excluded from continuity</span>
                <button class="btn-small" onclick={() => approveProposal(m)}>Reconsider</button>
                <button class="btn-small" onclick={() => deleteContinuityMessage(m)}>Delete</button>
              {:else}
                <button class="btn-small" onclick={() => approveProposal(m)}>Approve to Story Log</button>
                <button class="btn-small" onclick={() => rejectProposal(m)}>Reject</button>
                <button class="btn-small" onclick={() => startEditingMessage(m)}>Edit</button>
                <button class="btn-small" onclick={() => deleteContinuityMessage(m)}>Delete</button>
              {/if}
            </div>
          {:else if message.type === 'roll'}
            {@const m = message as ChatRoll}
            <div class="message-header">
              <span class="actor">🎲 {m.actorName}</span>
              <span class="type-badge roll">{m.displayLabel}</span>
            </div>
            <div class="message-content roll-result">
              {m.formattedResult}
            </div>
            <div class="message-actions">
              <button class="btn-small" onclick={() => deleteRollMessage(m)}>Delete Roll</button>
            </div>
          {:else if message.type === 'table_talk'}
            {@const m = message as ChatTableTalk}
            <div class="message-header">
              <span class="actor">{m.emoji || '💬'} {m.actorName}</span>
              <span class="type-badge ooc">OOC</span>
            </div>
            <div class="message-content ooc-comment">
              {#if editingMessageId === m.id}
                <textarea class="message-editor" bind:value={editMessageText}></textarea>
              {:else}
                {m.content}
              {/if}
            </div>
            <div class="message-actions">
              {#if editingMessageId === m.id}
                <button class="btn-small" onclick={() => saveMessageEdit(m)}>Save</button>
                <button class="btn-small" onclick={cancelEditingMessage}>Cancel</button>
              {:else}
                <button class="btn-small" onclick={() => startEditingMessage(m)}>Edit</button>
                <button class="btn-small" onclick={() => deleteTableTalkMessage(m)}>Delete</button>
              {/if}
            </div>
          {:else if message.type === 'narration'}
            {@const m = message as ChatNarration}
            <div class="message-header">
              <span class="actor">📖 GM</span>
              <span class="type-badge">IC</span>
              {#if m.narrativeWeight === 'heavy'}
                <span class="type-badge heavy">Important</span>
              {/if}
            </div>
            {#if editingMessageId === m.id}
              <div class="message-content narration">
                <textarea class="message-editor" bind:value={editMessageText}></textarea>
              </div>
            {:else}
              {@const parsed = extractInlineOOC(m.content)}
              <div class="message-content narration">{parsed.ic}</div>
              {#each parsed.oocSegments as segment, index (index)}
                <div class="message-content ooc-comment">
                  <span class="type-badge ooc">OOC</span>
                  {segment}
                </div>
              {/each}
            {/if}
            <div class="message-actions">
              {#if editingMessageId === m.id}
                <button class="btn-small" onclick={() => saveMessageEdit(m)}>Save</button>
                <button class="btn-small" onclick={cancelEditingMessage}>Cancel</button>
              {:else}
                {#if m.canPromoteToLog}
                <button
                  class="btn-small"
                  disabled={promotingMessageId === m.id || promotedMessageIds.has(m.id)}
                  onclick={() => handlePromoteToLog(m)}
                >
                  {promotingMessageId === m.id
                    ? 'Adding...'
                    : promotedMessageIds.has(m.id)
                      ? 'Added to Story Log'
                      : 'Add to Story Log'}
                </button>
                {/if}
                <button class="btn-small" onclick={() => startEditingMessage(m)}>Edit</button>
                <button class="btn-small" onclick={() => deleteContinuityMessage(m)}>Delete</button>
              {/if}
              </div>
          {:else if message.type === 'system'}
            <div class="message-content system">
              {message.icon || '📋'} {message.content}
            </div>
          {/if}
          <div class="message-time">{formatTime(message.timestamp)}</div>
        </div>
      {/each}
    {:else}
      <div class="empty-state">
        <p>📖 Game started. Waiting for turn...</p>
        <p class="hint">The first message will appear here when action begins.</p>
      </div>
    {/if}
    {#if typingResponders.length > 0}
      <div class="typing-indicator" aria-live="polite">
        {#each typingResponders as responder (responder.id)}
          <span>{responder.label} is typing</span>
        {/each}
        <span class="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span>
      </div>
    {/if}
  </div>

  <!-- Input Area -->
  <div class="chat-input-area">
    {#if isAIPlayerTurn}
      <div class="turn-action">
        <span>AI player turn: {currentTurn?.name ?? 'active character'}</span>
        <button
          class="btn-secondary"
          disabled={isGeneratingProposal}
          onclick={handleGenerateProposal}
        >
          {isGeneratingProposal ? 'Generating Proposal...' : 'Generate AI Proposal'}
        </button>
      </div>
    {/if}
    <div class="compose-toolbar">
      <button
        type="button"
        class="ooc-toggle"
        class:active={composeMode === 'table_talk'}
        aria-pressed={composeMode === 'table_talk'}
        disabled={setupSessionReadOnly}
        onclick={toggleComposeMode}
      >
        💬 OOC
      </button>
      {#if detectedRoll.found}
        <span class="type-badge roll">🎲 Roll detected</span>
      {/if}
    </div>
    <textarea
      class="chat-input"
      disabled={setupSessionReadOnly}
      placeholder={composeMode === 'table_talk'
        ? 'Ask the table a question or make an OOC comment...'
        : 'Write narration, dialogue, or type a roll like "Roll for Persuasion vs DC 13"...'}
      rows="3"
      bind:value={inputText}
    ></textarea>
    {#if narrationHelperError}
      <p class="helper-error">{narrationHelperError}</p>
    {/if}
    {#if proposalError}
      <p class="helper-error">{proposalError}</p>
    {/if}
    {#if isGeneratingSetupReply}
      <p class="reply-status" aria-live="polite">The AI player is replying in character...</p>
    {/if}
    {#if rollError}
      <p class="helper-error">{rollError}</p>
    {/if}
    {#if promotionError}
      <p class="helper-error">{promotionError}</p>
    {/if}
    {#if continuityError}
      <p class="helper-error">{continuityError}</p>
    {/if}
    <div class="input-actions">
      <button
        class="btn-primary"
        disabled={setupSessionReadOnly || isGeneratingSetupReply || isExecutingRoll}
        onclick={handleSend}
      >
        {isExecutingRoll
          ? 'Rolling...'
          : isGeneratingSetupReply
            ? 'Waiting for Reply...'
            : detectedRoll.found
              ? 'Roll Dice'
              : composeMode === 'table_talk'
                ? 'Send to Table'
                : 'Send Narration'}
      </button>
      {#if composeMode === 'narration'}
        <button
          class="btn-secondary"
          disabled={!inputText.trim() || isPolishingNarration || setupSessionReadOnly}
          onclick={handlePolishNarration}
        >
          {isPolishingNarration ? 'Polishing...' : 'Polish with AI'}
        </button>
      {/if}
      <button
        class="btn-secondary"
        disabled={remainingLogMessages.length === 0 || isPromotingAll || promotingMessageId !== null}
        onclick={handlePromoteAllToLog}
      >
        {isPromotingAll
          ? 'Adding Remaining...'
          : `Add All Remaining to Story Log (${remainingLogMessages.length})`}
      </button>
      <button class="btn-secondary" onclick={() => (inputText = '')}>Clear</button>
    </div>
  </div>
</div>

<style>
  .player-chat-pane {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: var(--color-bg, #ffffff);
  }

  .chat-feed {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--color-text-secondary, #999);
    text-align: center;
  }

  .empty-state p {
    margin: 0 0 8px 0;
    font-size: 0.875rem;
  }

  .empty-state .hint {
    font-size: 0.75rem;
    color: var(--color-text-secondary, #bbb);
  }

  .typing-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: auto;
    padding: 8px 10px;
    color: var(--color-text-secondary, #666);
    font-size: 0.75rem;
    font-style: italic;
  }

  .typing-dots {
    display: inline-flex;
    gap: 3px;
  }

  .typing-dots i {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: currentColor;
    animation: typing-bounce 0.9s infinite ease-in-out;
  }

  .typing-dots i:nth-child(2) { animation-delay: 0.15s; }
  .typing-dots i:nth-child(3) { animation-delay: 0.3s; }

  @keyframes typing-bounce {
    0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
    30% { transform: translateY(-3px); opacity: 1; }
  }

  .chat-message {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px;
    background: var(--color-panel-bg, #f9f9f9);
    border: 1px solid var(--color-border, #e0e0e0);
    border-radius: 4px;
    font-size: 0.8125rem;
  }

  .chat-message.proposal {
    border-left: 4px solid var(--accent);
    background: color-mix(in srgb, var(--accent), var(--card) 88%);
  }

  .chat-message.proposal.declined {
    border-left-color: var(--destructive, #b91c1c);
    background: var(--muted);
    opacity: 0.75;
  }

  .declined-label {
    font-size: 0.75rem;
    color: var(--destructive, #b91c1c);
    font-style: italic;
    margin-right: 4px;
  }

  .chat-message.roll {
    border-left: 4px solid var(--primary);
    background: color-mix(in srgb, var(--primary), var(--card) 88%);
  }

  .chat-message.table_talk {
    border-left: 4px solid var(--primary);
    background: color-mix(in srgb, var(--primary), var(--card) 93%);
    padding: 8px 12px;
  }

  .chat-message.narration {
    border-left: 4px solid var(--primary);
    background: color-mix(in srgb, var(--primary), var(--background) 94%);
  }

  .chat-message.system {
    border-left: 4px solid var(--muted-foreground);
    background: var(--muted);
    padding: 8px 12px;
  }

  .message-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
  }

  .actor {
    color: var(--color-text, #333);
  }

  .type-badge {
    display: inline-block;
    padding: 2px 6px;
    background: rgba(0, 0, 0, 0.1);
    border-radius: 2px;
    font-size: 0.6875rem;
    font-weight: 500;
    color: var(--color-text-secondary, #666);
  }

  .type-badge.ooc {
    background: #2196f3;
    color: white;
  }

  .type-badge.roll {
    background: #ff9800;
    color: white;
  }

  .type-badge.heavy {
    background: #4caf50;
    color: white;
  }

  .confidence {
    font-size: 0.6875rem;
    color: var(--color-text-secondary, #666);
    margin-left: auto;
  }

  .message-content {
    color: var(--color-text, #333);
    line-height: 1.4;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .message-content.roll-result {
    font-family: 'Courier New', monospace;
    font-size: 0.75rem;
    background: rgba(0, 0, 0, 0.03);
    padding: 6px;
    border-radius: 2px;
  }

  .message-content.ooc-comment {
    font-style: italic;
    color: var(--color-text-secondary, #666);
    font-size: 0.875rem;
  }

  .message-content.system {
    color: var(--color-text-secondary, #666);
    font-size: 0.75rem;
  }

  .reasoning-details {
    font-size: 0.75rem;
    color: var(--color-text-secondary, #999);
  }

  .reasoning-details summary {
    cursor: pointer;
    font-style: italic;
    font-weight: 500;
  }

  .reasoning-details p {
    margin: 4px 0 0;
    font-style: italic;
  }

  .message-time {
    font-size: 0.6875rem;
    color: var(--color-text-secondary, #bbb);
    text-align: right;
  }

  .message-actions {
    display: flex;
    gap: 6px;
    margin-top: 4px;
  }

  .message-editor {
    width: 100%;
    min-height: 5rem;
    resize: vertical;
    padding: 8px;
    border: 1px solid var(--color-border, #e0e0e0);
    border-radius: 3px;
    background: var(--color-bg, #ffffff);
    color: var(--color-text, #333);
    font: inherit;
  }

  .btn-small {
    padding: 4px 8px;
    font-size: 0.6875rem;
    background: var(--color-primary, #007acc);
    color: white;
    border: none;
    border-radius: 2px;
    cursor: pointer;
    font-weight: 500;
  }

  .btn-small:hover {
    background: var(--color-primary-hover, #005a9e);
  }

  .chat-input-area {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border-top: 1px solid var(--color-border, #e0e0e0);
    background: var(--color-panel-bg, #f9f9f9);
  }

  .compose-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .turn-action {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    color: var(--color-text-secondary, #666);
    font-size: 0.75rem;
  }

  .ooc-toggle {
    padding: 6px 12px;
    font-size: 0.75rem;
    background: transparent;
    border: 1px solid var(--color-border, #e0e0e0);
    border-radius: 3px;
    cursor: pointer;
    color: var(--color-text-secondary, #666);
  }

  .ooc-toggle.active {
    background: #2196f3;
    color: white;
    border-color: #2196f3;
    font-weight: 600;
  }

  .chat-input {
    padding: 8px;
    font-size: 0.8125rem;
    border: 1px solid var(--color-border, #e0e0e0);
    border-radius: 3px;
    font-family: inherit;
    resize: vertical;
  }

  .input-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .helper-error {
    margin: 0;
    color: var(--destructive, #b91c1c);
    font-size: 0.75rem;
  }

  .reply-status {
    margin: 0;
    color: var(--color-text-muted, #666);
    font-size: 0.75rem;
  }

  .btn-primary,
  .btn-secondary {
    padding: 6px 12px;
    font-size: 0.75rem;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    font-weight: 500;
  }

  .btn-primary {
    background: var(--color-primary, #007acc);
    color: white;
    flex: 1;
  }

  .btn-primary:hover {
    background: var(--color-primary-hover, #005a9e);
  }

  .btn-secondary {
    background: var(--color-border, #e0e0e0);
    color: var(--color-text, #333);
  }

  .btn-secondary:hover {
    background: var(--color-border-hover, #d0d0d0);
  }

  .btn-secondary:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
</style>

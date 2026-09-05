<script lang="ts">
  import {
    Check,
    ChevronRight,
    Circle,
    CircleCheck,
    Loader2,
    RotateCcw,
    UsersRound,
    X,
  } from 'lucide-svelte'
  import { database } from '$lib/services/database'
  import { generatePlainText } from '$lib/services/ai/sdk'
  import { renderStoryPrompt } from '$lib/services/prompts'
  import type { AIPlayer, CampaignAIPlayer } from '$lib/types'
  import type { ChatStore } from '$lib/stores/chat-store.svelte'
  import { campaign } from '$lib/stores/campaign.svelte'
  import { story } from '$lib/stores/story.svelte'
  import { getSessionZeroReadiness } from '$lib/services/campaign/session-zero-readiness'
  import { renderAIPlayerVoiceProfile } from '$lib/services/ai-player/personality-service'
  import {
    getSessionZeroAttempt,
    SESSION_ZERO_START_MESSAGE,
  } from '$lib/services/campaign/session-zero-reset'

  type Phase = 'introductions' | 'premises' | 'character_creation' | 'bonding' | 'secrets'

  interface Props {
    chatStore: ChatStore
    onSessionZeroStateChange?: (
      status: 'not_started' | 'in_progress' | 'completed',
      phase: Phase | null,
    ) => Promise<void>
  }

  let { chatStore, onSessionZeroStateChange }: Props = $props()

  const phases: Array<{ id: Phase; label: string; prompt: string }> = [
    {
      id: 'introductions',
      label: 'Introductions',
      prompt: 'Each AI player introduces how they approach the table.',
    },
    {
      id: 'premises',
      label: 'Premises',
      prompt: 'Share the campaign premise and answer the party’s questions.',
    },
    {
      id: 'character_creation',
      label: 'Characters',
      prompt: 'Review character sheets and starting details before play begins.',
    },
    {
      id: 'bonding',
      label: 'Bonding',
      prompt: 'Establish the party’s first shared connection.',
    },
    {
      id: 'secrets',
      label: 'Secrets',
      prompt: 'Establish optional private hooks and what the table knows.',
    },
  ]

  let activePhaseIndex = $state<number | null>(null)
  let tableRoster = $state<CampaignAIPlayer[]>([])
  let players = $state<AIPlayer[]>([])
  let isStarting = $state(false)
  let error = $state<string | null>(null)
  let premiseDraft = $state('')
  let isAskingPremiseQuestions = $state(false)
  let confirmingAdvance = $state(false)
  let confirmingStop = $state(false)
  let isStopping = $state(false)
  let generationController: AbortController | null = null
  let chatState = $derived($chatStore)

  const activePhase = $derived(activePhaseIndex === null ? null : phases[activePhaseIndex])
  const activeRoster = $derived(tableRoster.filter((member) => member.leftAt === null))
  const sessionZeroStatus = $derived(campaign.settings?.sessionZeroStatus ?? 'not_started')
  const activePlayerNames = $derived(
    activeRoster
      .map((member) => players.find((player) => player.id === member.aiPlayerId)?.name)
      .filter((name): name is string => Boolean(name)),
  )
  const phaseReadiness = $derived(
    activePhase
      ? getSessionZeroReadiness(activePhase.id, chatState.messages, activePlayerNames)
      : null,
  )

  $effect(() => {
    const persistedPhase = campaign.settings?.sessionZeroPhase ?? null
    const persistedStatus = campaign.settings?.sessionZeroStatus ?? 'not_started'
    if (persistedPhase && persistedStatus === 'not_started') {
      void onSessionZeroStateChange?.('in_progress', persistedPhase)
    }
    if (persistedStatus === 'completed') {
      activePhaseIndex = null
      return
    }
    if (!persistedPhase) {
      activePhaseIndex = null
      return
    }
    activePhaseIndex = phases.findIndex((phase) => phase.id === persistedPhase)
    confirmingAdvance = false
    if (campaign.current) void loadParticipants(campaign.current.id)
  })

  async function loadParticipants(campaignId: string) {
    const [nextAssignments, nextPlayers] = await Promise.all([
      database.getCampaignAIPlayers(campaignId),
      database.listAIPlayers(),
    ])
    tableRoster = nextAssignments
    players = nextPlayers
  }

  function addSystemMessage(content: string, icon = '🎲') {
    if (!campaign.current) return
    chatStore.addMessage({
      id: crypto.randomUUID(),
      type: 'system',
      campaignId: campaign.current.id,
      sessionId: campaign.activeSession?.id ?? null,
      timestamp: Date.now(),
      audience: 'full_table',
      visibility: 'player_safe',
      actorId: null,
      actorName: 'SYSTEM',
      content,
      severity: 'info',
      icon,
    })
  }

  async function start() {
    if (!campaign.current || isStarting || sessionZeroStatus !== 'not_started') return
    isStarting = true
    error = null
    const controller = new AbortController()
    generationController = controller
    try {
      await loadParticipants(campaign.current.id)
      const roster = tableRoster.filter((member) => member.leftAt === null)
      if (roster.length === 0) {
        throw new Error('Assign at least one AI Player before starting Session Zero.')
      }

      await onSessionZeroStateChange?.('in_progress', 'introductions')
      activePhaseIndex = 0
      addSystemMessage(SESSION_ZERO_START_MESSAGE, '🎭')
      await publishIntroductions(roster, players, controller.signal)
    } catch (cause) {
      if (!controller.signal.aborted) {
        error = cause instanceof Error ? cause.message : 'Unable to start Session Zero.'
      }
    } finally {
      if (generationController === controller) generationController = null
      isStarting = false
    }
  }

  async function stopAndReset() {
    if (!campaign.current || isStopping) return
    const attempt = getSessionZeroAttempt(chatState.messages)
    if (!attempt) {
      error = 'Unable to locate the start of this Session Zero attempt.'
      return
    }

    isStopping = true
    error = null
    try {
      generationController?.abort()
      generationController = null
      await database.deleteCampaignChatMessagesFrom(campaign.current.id, null, attempt.startedAt)
      for (const messageId of attempt.messageIds) chatStore.removeMessage(messageId)
      await onSessionZeroStateChange?.('not_started', null)
      activePhaseIndex = null
      premiseDraft = ''
      confirmingAdvance = false
      confirmingStop = false
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Unable to reset Session Zero.'
    } finally {
      isStopping = false
    }
  }

  async function publishIntroductions(
    activeRoster: CampaignAIPlayer[],
    availablePlayers: AIPlayer[],
    signal: AbortSignal,
  ) {
    const activePlayers = activeRoster
      .map((member) => availablePlayers.find((candidate) => candidate.id === member.aiPlayerId))
      .filter((player): player is AIPlayer => Boolean(player))
    const priorIntroductions: string[] = []
    for (const member of activeRoster) {
      if (signal.aborted) return
      const player = availablePlayers.find((candidate) => candidate.id === member.aiPlayerId)
      if (!player || !campaign.current) continue
      if (!story.currentStory) continue
      const voicePrompt = await renderStoryPrompt(
        story.currentStory.id,
        'ai-player-voice',
        {
          aiPlayerVoiceProfile: renderAIPlayerVoiceProfile(player),
          otherAIPlayerVoices:
            activePlayers
              .filter((candidate) => candidate.id !== player.id)
              .map((candidate) => renderAIPlayerVoiceProfile(candidate))
              .join('\n\n') || 'No other AI Players are present.',
          priorAIPlayerMessages: priorIntroductions.join('\n\n') || 'No earlier introductions.',
        },
        { requireUser: false },
      )
      const introductionPrompt = await renderStoryPrompt(
        story.currentStory.id,
        'ai-player-session-zero-introduction',
        {
          aiPlayerName: player.name,
          aiPlayerCoreMotivation: player.basePersonality.coreMotivation,
          aiPlayerPlaystyle: player.basePersonality.primaryPlaystyle,
          aiPlayerDecisionSpeed: player.basePersonality.decisionSpeed,
          aiPlayerHumorStyle: player.basePersonality.humorStyle,
          aiPlayerVoicePrompt: voicePrompt.system,
        },
      )
      const introductionSystem = introductionPrompt.system.includes(voicePrompt.system)
        ? introductionPrompt.system
        : `${voicePrompt.system}\n\n${introductionPrompt.system}`
      const introduction = await generatePlainText(
        {
          presetId: 'agentic',
          system: introductionSystem,
          prompt: introductionPrompt.user,
          signal,
        },
        'sessionZeroIntroduction',
      )
      priorIntroductions.push(`${player.name}: ${introduction.trim()}`)
      chatStore.addMessage({
        id: crypto.randomUUID(),
        type: 'table_talk',
        campaignId: campaign.current.id,
        sessionId: campaign.activeSession?.id ?? null,
        timestamp: Date.now(),
        audience: 'full_table',
        visibility: 'player_safe',
        actorId: null,
        actorName: player.name,
        content: introduction,
        intensity: campaign.settings?.tableTalkIntensity ?? 4,
        sentiment: 'neutral',
        emoji: '🎭',
      })
    }
  }

  async function advance() {
    if (activePhaseIndex === null) return
    confirmingAdvance = false
    if (activePhaseIndex === phases.length - 1) {
      addSystemMessage('Session Zero is complete. The table is ready to begin play.', '✓')
      activePhaseIndex = null
      await onSessionZeroStateChange?.('completed', null)
      return
    }

    activePhaseIndex += 1
    const next = phases[activePhaseIndex]
    await onSessionZeroStateChange?.('in_progress', next.id)
    addSystemMessage(`Session Zero: ${next.label}. ${next.prompt}`, '📍')
  }

  async function sharePremise() {
    const premise = premiseDraft.trim()
    if (!campaign.current || !premise || isAskingPremiseQuestions) return

    isAskingPremiseQuestions = true
    error = null
    const controller = new AbortController()
    generationController = controller
    try {
      addSystemMessage(`Campaign premise: ${premise}`, '📍')
      for (const member of activeRoster) {
        if (controller.signal.aborted) return
        const player = players.find((candidate) => candidate.id === member.aiPlayerId)
        if (!player) continue
        if (!story.currentStory) continue
        const questionPrompt = await renderStoryPrompt(
          story.currentStory.id,
          'ai-player-session-zero-question',
          {
            aiPlayerName: player.name,
            aiPlayerPlaystyle: player.basePersonality.primaryPlaystyle,
            campaignPremise: premise,
          },
        )
        const question = await generatePlainText(
          {
            presetId: 'agentic',
            system: questionPrompt.system,
            prompt: questionPrompt.user,
            signal: controller.signal,
          },
          'sessionZeroPremisesQuestion',
        )
        chatStore.addMessage({
          id: crypto.randomUUID(),
          type: 'table_talk',
          campaignId: campaign.current.id,
          sessionId: campaign.activeSession?.id ?? null,
          timestamp: Date.now(),
          audience: 'full_table',
          visibility: 'player_safe',
          actorId: null,
          actorName: player.name,
          content: question.trim(),
          intensity: campaign.settings?.tableTalkIntensity ?? 4,
          sentiment: 'neutral',
          emoji: '💭',
        })
      }
      premiseDraft = ''
    } catch (cause) {
      if (!controller.signal.aborted) {
        error = cause instanceof Error ? cause.message : 'Unable to generate premise questions.'
      }
    } finally {
      if (generationController === controller) generationController = null
      isAskingPremiseQuestions = false
    }
  }
</script>

<div class="border-border bg-card flex shrink-0 flex-wrap items-center gap-3 border-b px-3 py-2">
  <div class="flex min-w-0 items-center gap-2">
    <UsersRound class="text-primary h-4 w-4" />
    <div class="min-w-0">
      <p class="text-foreground text-xs font-semibold">Session Zero</p>
      <p class="text-muted-foreground truncate text-[11px]">
        {activePhase
          ? `${activePhase.label}: ${activePhase.prompt}`
          : 'Build the AI player table before play.'}
      </p>
    </div>
  </div>

  <div class="ml-auto flex items-center gap-2">
    {#if activePhase}
      <span class="text-muted-foreground text-xs">{activePhaseIndex! + 1}/{phases.length}</span>
      {#if confirmingAdvance}
        <span class="text-muted-foreground text-xs">
          {activePhaseIndex === null
            ? 'Complete Session Zero?'
            : activePhaseIndex === phases.length - 1
              ? 'Complete Session Zero?'
              : `Move to ${phases[activePhaseIndex + 1].label}?`}
        </span>
        <button
          class="session-zero-secondary"
          aria-label="Cancel phase advance"
          onclick={() => (confirmingAdvance = false)}
        >
          <X class="h-3.5 w-3.5" />
        </button>
        <button class="session-zero-action" onclick={() => void advance()}>
          Confirm <Check class="h-3.5 w-3.5" />
        </button>
      {:else}
        {#if confirmingStop}
          <span class="text-destructive text-xs">Clear this Session Zero attempt?</span>
          <button
            class="session-zero-secondary"
            aria-label="Cancel Session Zero reset"
            onclick={() => (confirmingStop = false)}
          >
            <X class="h-3.5 w-3.5" />
          </button>
          <button
            class="session-zero-danger"
            disabled={isStopping}
            onclick={() => void stopAndReset()}
          >
            {#if isStopping}<Loader2 class="h-3.5 w-3.5 animate-spin" />{:else}<RotateCcw
                class="h-3.5 w-3.5"
              />{/if}
            {isStopping ? 'Resetting...' : 'Reset'}
          </button>
        {:else}
          <button
            class="session-zero-secondary"
            title="Stop and restart Session Zero"
            onclick={() => (confirmingStop = true)}
          >
            <RotateCcw class="h-3.5 w-3.5" />
          </button>
        {/if}
        <button
          class="session-zero-action"
          disabled={!phaseReadiness?.ready}
          title={phaseReadiness?.blockedReason ?? undefined}
          onclick={() => (confirmingAdvance = true)}
        >
          {activePhaseIndex === phases.length - 1 ? 'Complete' : 'Next Phase'}
          {#if activePhaseIndex === phases.length - 1}<Check
              class="h-3.5 w-3.5"
            />{:else}<ChevronRight class="h-3.5 w-3.5" />{/if}
        </button>
      {/if}
    {:else if sessionZeroStatus === 'not_started'}
      <button class="session-zero-action" disabled={isStarting} onclick={start}>
        {#if isStarting}<Loader2 class="h-3.5 w-3.5 animate-spin" />{/if}
        {isStarting ? 'Starting...' : 'Start Session Zero'}
      </button>
    {:else}
      <span class="text-muted-foreground text-xs">Session Zero complete</span>
    {/if}
  </div>

  {#if error}<p class="text-destructive w-full text-xs">{error}</p>{/if}
  {#if activePhase && phaseReadiness}
    <div class="border-border/70 flex w-full flex-wrap items-center gap-x-4 gap-y-1 border-t pt-2">
      <span
        class={phaseReadiness.ready
          ? 'text-xs font-medium text-emerald-500'
          : 'text-xs font-medium text-amber-500'}
      >
        {phaseReadiness.ready ? 'Ready to advance' : 'Not ready'}
      </span>
      {#each phaseReadiness.criteria as criterion (criterion.label)}
        <span class="text-muted-foreground inline-flex items-center gap-1 text-xs">
          {#if criterion.complete}
            <CircleCheck class="h-3.5 w-3.5 text-emerald-500" />
          {:else}
            <Circle class="h-3.5 w-3.5" />
          {/if}
          {criterion.label}{criterion.required ? '' : ' (optional)'}
        </span>
      {/each}
      {#if phaseReadiness.blockedReason}
        <span class="text-xs text-amber-500">{phaseReadiness.blockedReason}</span>
      {/if}
    </div>
  {/if}
</div>

{#if activePhase?.id === 'premises'}
  <div class="border-border bg-card flex shrink-0 gap-2 border-b px-3 py-2">
    <input
      class="session-zero-premise"
      bind:value={premiseDraft}
      placeholder="Share the campaign premise with the AI Players..."
    />
    <button
      class="session-zero-action"
      disabled={!premiseDraft.trim() || isAskingPremiseQuestions}
      onclick={sharePremise}
    >
      {isAskingPremiseQuestions ? 'Asking...' : 'Ask Table'}
    </button>
  </div>
{/if}

<style>
  .session-zero-action {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    border: 0;
    border-radius: var(--radius-sm, 0.25rem);
    padding: 0.4rem 0.6rem;
    background: var(--primary);
    color: var(--primary-foreground);
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
  }

  .session-zero-action:disabled {
    cursor: not-allowed;
    opacity: 0.65;
  }

  .session-zero-secondary {
    display: inline-flex;
    width: 1.75rem;
    height: 1.75rem;
    align-items: center;
    justify-content: center;
    padding: 0;
    color: var(--muted-foreground);
    background: transparent;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm, 0.25rem);
    cursor: pointer;
  }

  .session-zero-danger {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.4rem 0.6rem;
    color: var(--destructive-foreground, white);
    background: var(--destructive);
    border: 0;
    border-radius: var(--radius-sm, 0.25rem);
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
  }

  .session-zero-premise {
    min-width: 0;
    flex: 1;
    border: 1px solid var(--input);
    border-radius: var(--radius-sm, 0.25rem);
    padding: 0.4rem 0.6rem;
    background: var(--background);
    color: var(--foreground);
    font: inherit;
    font-size: 0.8rem;
  }
</style>

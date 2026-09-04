<script lang="ts">
  import { story } from '$lib/stores/story.svelte'
  import { campaign } from '$lib/stores/campaign.svelte'
  import { CampaignTypeService } from '$lib/services/campaign/campaign-type-service'
  import type { CampaignSettings, CampaignSetupSession, InteractionAudience } from '$lib/types'
  import { initializeChatStore, type ChatStore } from '$lib/stores/chat-store.svelte'
  import type { ChatMessage, ChatNarration, ChatProposal } from '$lib/services/campaign/chat-types'
  import { database } from '$lib/services/database'
  import GMControlPanel from './panels/GMControlPanel.svelte'
  import SessionZeroPanel from './SessionZeroPanel.svelte'
  import SetupSessionPanel from './SetupSessionPanel.svelte'
  import PlayerChatPane from './chat/PlayerChatPane.svelte'
  import StoryLogPane from './sidebar/StoryLogPane.svelte'
  import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-svelte'

  /**
   * G.9-G.10: GM Campaign Screen
   *
   * Main interface for running campaigns with AI players (chat-first game-running UI).
   * Three-pane layout:
   * - Left: GM Controls (turn state, audience, pre-rolls, world charter)
   * - Center: Player Chat (proposals, rolls, table talk, narration)
   * - Right: Story Log (prose entries extracted from chat)
   */

  let campaignType = $derived(CampaignTypeService.getCampaignType(campaign.current))
  let hasAIPlayers = $derived(CampaignTypeService.hasAIPlayers(campaignType))
  let tableTalkIntensity = $derived(campaign.settings?.tableTalkIntensity ?? 4)
  let confirmedAudience = $state<InteractionAudience>({ kind: 'full_table' })
  let promotedMessageIds = $state<Set<string>>(new Set())
  let sessionZeroActive = $derived(campaign.settings?.sessionZeroPhase !== null)
  let gmControlsCollapsed = $state(false)
  // Collapsed by default: undecided whether these setup sessions become standalone narrative.
  let storyLogCollapsed = $state(true)

  async function setSessionZeroState(
    sessionZeroStatus: 'not_started' | 'in_progress' | 'completed',
    sessionZeroPhase: CampaignSettings['sessionZeroPhase'],
  ) {
    await campaign.updateSettings({ sessionZeroStatus, sessionZeroPhase })
  }
  const campaignChatStore: ChatStore = initializeChatStore(
    campaign.current?.id ?? '',
    campaign.activeSession?.id ?? null,
    async (message: ChatMessage) => database.addCampaignChatMessage(message),
  )
  let chatStore = $state<ChatStore>(campaignChatStore)
  let loadedSetupSessionId = $state<string | null>(null)
  let selectedSetupSession = $state<CampaignSetupSession | null>(null)
  let setupParticipantIds = $state<string[]>([])
  let hasSetupSessions = $state(false)

  function handleSetupSessionChanged(state: {
    session: CampaignSetupSession | null
    participantIds: string[]
    messages: ChatMessage[]
    hasSessions: boolean
  }) {
    selectedSetupSession = state.session
    setupParticipantIds = state.participantIds
    hasSetupSessions = state.hasSessions
    if (!state.session) {
      loadedSetupSessionId = null
      chatStore = campaignChatStore
      return
    }
    if (loadedSetupSessionId !== state.session.id) {
      loadedSetupSessionId = state.session.id
      const setupChatStore = initializeChatStore(campaign.current?.id ?? '', null, async (message) =>
        database.addCampaignSetupChatMessage(state.session!.id, message),
      )
      setupChatStore.addMessages(state.messages)
      chatStore = setupChatStore
    }
    confirmedAudience = state.session.audience
  }

  async function promoteToLog(message: ChatNarration | ChatProposal): Promise<void> {
    if (promotedMessageIds.has(message.id)) return
    await story.addEntry('narration', message.type === 'proposal' ? message.proposal.action : message.content, {
      source: 'gm-campaign-chat',
      chatMessageId: message.id,
      chatMessageType: message.type,
    })
    promotedMessageIds = new Set([...promotedMessageIds, message.id])
  }

  $effect(() => {
    promotedMessageIds = new Set(
      story.entries.flatMap((entry) => {
        const chatMessageId = (entry.metadata as Record<string, unknown> | null)?.chatMessageId
        return typeof chatMessageId === 'string' ? [chatMessageId] : []
      }),
    )
  })

  $effect(() => {
    // Log campaign type for debugging
    console.log('[GMCampaignScreen] Loaded campaign:', {
      campaignId: campaign.current?.id,
      campaignType,
      hasAIPlayers,
      tableTalkIntensity,
    })
  })
</script>

<div
  class="gm-campaign-screen"
  class:controls-collapsed={gmControlsCollapsed}
  class:log-collapsed={storyLogCollapsed}
>
  <!-- Left: GM Control Panel -->
  <aside class="gm-controls" class:collapsed={gmControlsCollapsed}>
    <div class="sidebar-toolbar left-toolbar">
      <button
        class="sidebar-toggle"
        title={gmControlsCollapsed ? 'Expand GM controls' : 'Collapse GM controls'}
        aria-label={gmControlsCollapsed ? 'Expand GM controls' : 'Collapse GM controls'}
        onclick={() => (gmControlsCollapsed = !gmControlsCollapsed)}
      >
        {#if gmControlsCollapsed}<PanelLeftOpen size={18} />{:else}<PanelLeftClose size={18} />{/if}
      </button>
    </div>
    {#if !gmControlsCollapsed}
      <GMControlPanel
        {hasAIPlayers}
        {tableTalkIntensity}
        {chatStore}
        onAudienceConfirmed={(audience) => (confirmedAudience = audience)}
        onForceMessage={(message) => chatStore.addMessage(message)}
      />
    {/if}
  </aside>

  <!-- Center: Player Chat Pane (Primary Game Interface) -->
  <main class="player-chat">
    <SetupSessionPanel onSessionChanged={handleSetupSessionChanged} />
    {#if !hasSetupSessions}
      <SessionZeroPanel {chatStore} onSessionZeroStateChange={setSessionZeroState} />
    {/if}
    <PlayerChatPane
      {hasAIPlayers}
      {tableTalkIntensity}
      {chatStore}
      audience={confirmedAudience}
      allowSessionZeroChat={sessionZeroActive}
      setupSessionId={selectedSetupSession?.id ?? null}
      setupSessionKind={selectedSetupSession?.kind ?? null}
      setupSessionActive={selectedSetupSession?.status === 'active'}
      {setupParticipantIds}
      onPromoteToLog={promoteToLog}
      {promotedMessageIds}
    />
  </main>

  <!-- Right: Story Log Pane (Secondary Narrative Artifact) -->
  <aside class="story-log" class:collapsed={storyLogCollapsed}>
    <div class="sidebar-toolbar right-toolbar">
      <button
        class="sidebar-toggle"
        title={storyLogCollapsed ? 'Expand Story Log' : 'Collapse Story Log'}
        aria-label={storyLogCollapsed ? 'Expand Story Log' : 'Collapse Story Log'}
        onclick={() => (storyLogCollapsed = !storyLogCollapsed)}
      >
        {#if storyLogCollapsed}<PanelRightOpen size={18} />{:else}<PanelRightClose size={18} />{/if}
      </button>
    </div>
    {#if !storyLogCollapsed}
      <StoryLogPane {chatStore} {promotedMessageIds} />
    {/if}
  </aside>
</div>

<style>
  .gm-campaign-screen {
    /* Bridge the existing campaign controls to the app-wide theme tokens. */
    --color-bg: var(--background);
    --color-panel-bg: var(--card);
    --color-text: var(--foreground);
    --color-text-secondary: var(--muted-foreground);
    --color-border: var(--border);
    --color-primary: var(--primary);
    --color-primary-hover: color-mix(in srgb, var(--primary), black 15%);
    --color-border-hover: var(--muted);
    --color-info-bg: var(--secondary);
    --color-info: var(--primary);
    display: grid;
    grid-template-columns: minmax(13rem, 18rem) minmax(0, 1fr) minmax(14rem, 20rem);
    gap: 1px;
    min-height: 0;
    height: 100%;
    background: var(--border);
  }

  .gm-campaign-screen.controls-collapsed {
    grid-template-columns: 2.75rem minmax(0, 1fr) minmax(14rem, 20rem);
  }

  .gm-campaign-screen.log-collapsed {
    grid-template-columns: minmax(13rem, 18rem) minmax(0, 1fr) 2.75rem;
  }

  .gm-campaign-screen.controls-collapsed.log-collapsed {
    grid-template-columns: 2.75rem minmax(0, 1fr) 2.75rem;
  }

  .gm-controls {
    min-width: 0;
    background: var(--card);
    border-right: 1px solid var(--border);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  .sidebar-toolbar {
    display: flex;
    flex: 0 0 auto;
    padding: 0.4rem;
    background: var(--card);
  }

  .left-toolbar {
    justify-content: flex-end;
  }

  .right-toolbar {
    justify-content: flex-start;
  }

  .sidebar-toggle {
    display: inline-flex;
    width: 2rem;
    height: 2rem;
    align-items: center;
    justify-content: center;
    padding: 0;
    color: var(--muted-foreground);
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    cursor: pointer;
  }

  .sidebar-toggle:hover {
    color: var(--foreground);
    background: var(--muted);
    border-color: var(--border);
  }

  .collapsed .sidebar-toolbar {
    justify-content: center;
  }

  .player-chat {
    min-width: 0;
    background: var(--background);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .story-log {
    min-width: 0;
    min-height: 0;
    background: var(--card);
    border-left: 1px solid var(--border);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  @media (max-width: 1100px) {
    .gm-campaign-screen,
    .gm-campaign-screen.log-collapsed {
      grid-template-columns: minmax(12rem, 15rem) minmax(0, 1fr);
    }

    .gm-campaign-screen.controls-collapsed,
    .gm-campaign-screen.controls-collapsed.log-collapsed {
      grid-template-columns: 2.75rem minmax(0, 1fr);
    }

    .story-log {
      display: none;
    }
  }

  @media (max-width: 760px) {
    .gm-campaign-screen,
    .gm-campaign-screen.controls-collapsed,
    .gm-campaign-screen.log-collapsed,
    .gm-campaign-screen.controls-collapsed.log-collapsed {
      grid-template-columns: minmax(0, 1fr);
    }

    .gm-controls {
      display: none;
    }
  }
</style>

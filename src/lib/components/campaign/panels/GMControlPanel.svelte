<script lang="ts">
  import { campaign } from '$lib/stores/campaign.svelte'
  import { story } from '$lib/stores/story.svelte'
  import { database } from '$lib/services/database'
  import { forceAIResponse, RESPONSE_LENGTH_LABELS, IC_MAX_SAFE_LENGTH_LEVEL } from '$lib/services/campaign/force-ai-response'
  import type { AIPlayer, CampaignAIPlayer, PlayerCharacter, InteractionAudience } from '$lib/types'
  import type { ChatMessage } from '$lib/services/campaign/chat-types'
  import type { ChatStore } from '$lib/stores/chat-store.svelte'
  import PrerollMenuPanel from './PrerollMenuPanel.svelte'
  import * as Tooltip from '$lib/components/ui/tooltip'
  import { TriangleAlert } from 'lucide-svelte'
  import { deriveEffectiveAIPlayerTraits } from '$lib/services/ai-player/personality-service'

  interface Props {
    hasAIPlayers?: boolean
    tableTalkIntensity?: number
    chatStore?: ChatStore | null
    onAudienceConfirmed?: (audience: InteractionAudience) => void
    onForceMessage?: (message: ChatMessage) => void
  }

  let {
    hasAIPlayers = false,
    tableTalkIntensity = 4,
    chatStore = null,
    onAudienceConfirmed,
    onForceMessage,
  }: Props = $props()

  let activeRoster = $state<CampaignAIPlayer[]>([])
  let aiPlayers = $state<AIPlayer[]>([])
  let assignments = $state<PlayerCharacter[]>([])
  let selectedAudienceKind = $state<InteractionAudience['kind']>('full_table')
  let selectedAIPlayerIds = $state<string[]>([])
  let audienceError = $state<string | null>(null)
  let forceAIPlayerId = $state('')
  let forceMode = $state<'ic' | 'ooc'>('ic')
  let forceGuidance = $state('')
  let forceLengthLevel = $state(3)
  let isForcingResponse = $state(false)
  let forceError = $state<string | null>(null)
  let chatMessages = $state<ChatMessage[]>([])

  const selectedForceAIPlayer = $derived(
    aiPlayers.find((player) => player.id === forceAIPlayerId) ?? null,
  )
  const forceAIPlayerTraits = $derived.by(() => {
    if (!selectedForceAIPlayer) return null
    return deriveEffectiveAIPlayerTraits(
      selectedForceAIPlayer,
      campaign.sceneTurnState?.sceneMode ?? campaign.settings?.sceneMode ?? 'free',
      liveTranscript,
    )
  })

  $effect(() => {
    if (!chatStore) {
      chatMessages = []
      return
    }
    return chatStore.subscribe((state) => {
      chatMessages = state.messages
    })
  })

  /**
   * Panel 1: Turn State
   */
  const currentTurn = $derived(campaign.getCurrentTurnActor())
  const currentTurnType = $derived(campaign.getCurrentTurnType())
  const currentTurnName = $derived(
    currentTurn
      ? (story.characters.find((character) => character.id === currentTurn.id)?.name ??
          currentTurn.name)
      : null,
  )
  const audienceOptions = $derived(
    activeRoster.map((member) => {
      const aiPlayerName = aiPlayers.find((player) => player.id === member.aiPlayerId)?.name ?? 'AI Player'
      const characterName = story.characters.find(
        (character) =>
          character.id ===
          assignments.find((assignment) => assignment.aiPlayerId === member.aiPlayerId && assignment.leftAt === null)
            ?.characterId,
      )?.name
      return {
        aiPlayerId: member.aiPlayerId,
        aiPlayerName,
        characterName: characterName ?? null,
        // Matches the "Player (Character)" convention used in the chat pane.
        label: characterName ? `${aiPlayerName} (${characterName})` : aiPlayerName,
      }
    }),
  )
  // Chronological IC + OOC lines the AI hasn't otherwise seen, since the Story Log
  // only holds prose the GM chose to promote, not the live proposal/table-talk feed.
  const liveTranscript = $derived(
    chatMessages
      .filter((message) => message.type === 'narration' || message.type === 'proposal' || message.type === 'table_talk')
      .slice(-8)
      .map(
        (message) =>
          `${message.actorName}: ${message.type === 'proposal' ? message.proposal.action : (message.content ?? '')}`,
      ),
  )

  $effect(() => {
    const campaignId = campaign.current?.id
    if (!campaignId) {
      activeRoster = []
      return
    }
    void Promise.all([
      database.getCampaignAIPlayers(campaignId),
      database.listAIPlayers(),
      database.getPlayerCharactersForCampaign(campaignId),
    ])
      .then(([roster, players, playerCharacters]) => {
        activeRoster = roster.filter((member) => member.leftAt === null)
        aiPlayers = players
        assignments = playerCharacters
        selectedAIPlayerIds = activeRoster.map((member) => member.aiPlayerId)
      })
      .catch((error) => {
        audienceError = error instanceof Error ? error.message : 'Unable to load AI Player assignments.'
      })
  })

  function toggleAudiencePlayer(aiPlayerId: string, selected: boolean) {
    selectedAIPlayerIds = selected
      ? [...new Set([...selectedAIPlayerIds, aiPlayerId])]
      : selectedAIPlayerIds.filter((candidate) => candidate !== aiPlayerId)
  }

  function confirmAudience() {
    let audience: InteractionAudience
    if (selectedAudienceKind === 'full_table') {
      audience = { kind: 'full_table' }
    } else if (selectedAudienceKind === 'private_player') {
      const aiPlayerId = selectedAIPlayerIds[0]
      if (!aiPlayerId) {
        audienceError = 'Choose one AI Player for a private interaction.'
        return
      }
      audience = { kind: 'private_player', aiPlayerId }
    } else {
      if (selectedAIPlayerIds.length === 0) {
        audienceError = 'Choose at least one AI Player for a private subset.'
        return
      }
      audience = { kind: 'player_subset', aiPlayerIds: selectedAIPlayerIds }
    }

    audienceError = null
    onAudienceConfirmed?.(audience)
  }

  async function generateForcedResponse() {
    if (!campaign.current || !story.currentStory || !forceAIPlayerId || isForcingResponse) return
    isForcingResponse = true
    forceError = null
    try {
      const recentActions =
        liveTranscript.length > 0 ? liveTranscript : story.entries.slice(-5).map((entry) => entry.content)
      const otherCharacters = audienceOptions
        .filter((option) => option.aiPlayerId !== forceAIPlayerId)
        .map((option) => ({
          name: option.characterName ?? option.aiPlayerName,
          playerName: option.characterName ? option.aiPlayerName : undefined,
        }))
      const message = await forceAIResponse({
        storyId: story.currentStory.id,
        campaignId: campaign.current.id,
        aiPlayerId: forceAIPlayerId,
        mode: forceMode,
        guidance: forceGuidance,
        sceneMode: campaign.sceneTurnState?.sceneMode ?? campaign.settings?.sceneMode ?? 'free',
        recentActions,
        otherCharacters,
        audience: { kind: 'full_table' },
        tableTalkIntensity,
        responseLength: forceLengthLevel,
      })
      onForceMessage?.(message)
      forceGuidance = ''
    } catch (error) {
      forceError = error instanceof Error ? error.message : 'Unable to generate a forced AI response.'
    } finally {
      isForcingResponse = false
    }
  }
</script>

<div class="gm-control-panel">
  <!-- Panel 1: Turn State -->
  <section class="panel turn-state-panel">
    <h3>Current Turn</h3>
    <div class="turn-info">
      {#if currentTurn}
        <div class="actor-name">{currentTurnName}</div>
        <div class="actor-category">{currentTurn.category}</div>
      {:else}
        <div class="placeholder">No active turn</div>
      {/if}

      {#if currentTurnType === 'ai_player_turn'}
        <div class="ai-player-indicator">🤖 AI Player Turn</div>
      {/if}
    </div>
  </section>

  <!-- Panel 2: Audience Selection (shown for AI player turns) -->
  {#if currentTurnType === 'ai_player_turn' && hasAIPlayers}
    <section class="panel audience-selection-panel">
      <h3>Select Audience</h3>
      <div class="audience-options">
        <label>
          <input type="radio" name="audience" value="full_table" bind:group={selectedAudienceKind} />
          Full Table (all players see/hear)
        </label>
        <label>
          <input type="radio" name="audience" value="player_subset" bind:group={selectedAudienceKind} />
          Private Subset (select players)
        </label>
        <label>
          <input type="radio" name="audience" value="private_player" bind:group={selectedAudienceKind} />
          Private 1:1 (single AI player)
        </label>
      </div>

      {#if selectedAudienceKind !== 'full_table'}
        <div class="audience-player-list">
          {#each audienceOptions as option (option.aiPlayerId)}
            <label>
              <input
                type={selectedAudienceKind === 'private_player' ? 'radio' : 'checkbox'}
                name="audience-player"
                checked={selectedAIPlayerIds.includes(option.aiPlayerId)}
                onchange={(event) => {
                  if (selectedAudienceKind === 'private_player') {
                    selectedAIPlayerIds = event.currentTarget.checked ? [option.aiPlayerId] : []
                  } else {
                    toggleAudiencePlayer(option.aiPlayerId, event.currentTarget.checked)
                  }
                }}
              />
              {option.label}
            </label>
          {/each}
        </div>
      {/if}

      <div class="table-talk-intensity">
        <label for="intensity">Table Talk Intensity</label>
        <input
          id="intensity"
          type="range"
          min="0"
          max="8"
          value={tableTalkIntensity}
          disabled
        />
        <span class="intensity-label">{tableTalkIntensity}/8</span>
      </div>

      {#if audienceError}<p class="audience-error">{audienceError}</p>{/if}
      <button class="btn-primary" onclick={confirmAudience}>Confirm Audience</button>
    </section>
  {/if}

  <!-- Panel 3: Pre-Roll Menus -->
  {#if campaign.current?.id}
    <PrerollMenuPanel
      campaignId={campaign.current.id}
      encounterDifficulty="moderate"
      showEncounters={true}
      showLoot={false}
      on:selectEncounter={(e) => console.log('Selected encounter:', e.detail)}
      on:selectLoot={(e) => console.log('Selected loot:', e.detail)}
    />
  {/if}

  <!-- Panel 4: Force AI Response -->
  {#if hasAIPlayers && audienceOptions.length > 0}
    <section class="panel force-response-panel">
      <h3>Force AI Response</h3>
      <select class="force-select" bind:value={forceAIPlayerId} disabled={isForcingResponse}>
        <option value="" disabled>Choose an AI Player</option>
        {#each audienceOptions as option (option.aiPlayerId)}
          <option value={option.aiPlayerId}>{option.label}</option>
        {/each}
      </select>
      {#if selectedForceAIPlayer && forceAIPlayerTraits}
        <div class="force-traits">
          <div class="force-trait-row">
            <span>Immersion</span>
            <strong>{forceAIPlayerTraits.immersion}/10</strong>
          </div>
          <div class="force-trait-row">
            <span>Arousal</span>
            <strong>{forceAIPlayerTraits.arousal}/10</strong>
          </div>
        </div>
      {/if}
      <div class="force-mode-toggle">
        <label>
          <input type="radio" name="force-mode" value="ic" bind:group={forceMode} disabled={isForcingResponse} />
          IC
        </label>
        <label>
          <input type="radio" name="force-mode" value="ooc" bind:group={forceMode} disabled={isForcingResponse} />
          OOC
        </label>
      </div>
      <div class="force-length">
        <label for="force-length-slider">Response Length</label>
        <input
          id="force-length-slider"
          type="range"
          min="1"
          max="10"
          step="1"
          bind:value={forceLengthLevel}
          disabled={isForcingResponse}
        />
        <span class="force-length-label">{RESPONSE_LENGTH_LABELS[forceLengthLevel]}</span>
        {#if forceMode === 'ic' && forceLengthLevel > IC_MAX_SAFE_LENGTH_LEVEL}
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <span {...props} class="force-length-warning" aria-label="Longer generation warning">
                  <TriangleAlert size={14} />
                </span>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content>
              Due to LLM limitations, longer IC generations may take longer and occasionally need a retry.
            </Tooltip.Content>
          </Tooltip.Root>
        {/if}
      </div>
      <textarea
        class="force-guidance"
        rows="2"
        placeholder="Optional guidance for what to focus on..."
        bind:value={forceGuidance}
        disabled={isForcingResponse}
      ></textarea>
      {#if forceError}<p class="audience-error">{forceError}</p>{/if}
      <button
        class="btn-primary"
        disabled={!forceAIPlayerId || isForcingResponse}
        onclick={generateForcedResponse}
      >
        {isForcingResponse ? 'Generating...' : 'Generate Response'}
      </button>
    </section>
  {/if}

</div>

<style>
  .gm-control-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    height: 100%;
    overflow-y: auto;
  }

  .panel {
    background: var(--color-bg, #ffffff);
    border: 1px solid var(--color-border, #e0e0e0);
    border-radius: 4px;
    padding: 12px;
  }

  .panel h3 {
    margin: 0 0 8px 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text, #333);
  }

  .turn-state-panel {
    border-left: 4px solid var(--color-accent, #007acc);
  }

  .turn-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.8125rem;
  }

  .actor-name {
    font-weight: 600;
    color: var(--color-text, #333);
  }

  .actor-category {
    color: var(--color-text-secondary, #666);
    font-size: 0.75rem;
  }

  .ai-player-indicator {
    margin-top: 4px;
    padding: 4px 8px;
    background: var(--color-info-bg, #e3f2fd);
    border-radius: 3px;
    font-size: 0.75rem;
    color: var(--color-info, #1976d2);
  }

  .placeholder {
    color: var(--color-text-secondary, #999);
    font-size: 0.8125rem;
  }

  .audience-options {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 12px;
  }

  .audience-options label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8125rem;
    cursor: pointer;
  }

  .audience-options input[type='radio'] {
    cursor: pointer;
  }

  .audience-player-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: -4px 0 12px 20px;
  }

  .audience-player-list label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.75rem;
  }

  .audience-error {
    margin: -4px 0 8px;
    color: var(--destructive, #b91c1c);
    font-size: 0.75rem;
  }

  .force-select {
    width: 100%;
    padding: 6px;
    margin-bottom: 8px;
    font-size: 0.8125rem;
    border: 1px solid var(--color-border, #e0e0e0);
    border-radius: 3px;
    background: var(--color-bg, #ffffff);
    color: var(--color-text, #333);
  }

  .force-traits {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin: 0 0 8px;
    padding: 8px;
    border: 1px solid var(--color-border, #e0e0e0);
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.015);
  }

  .force-trait-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    font-size: 0.75rem;
    color: var(--color-text-secondary, #666);
  }

  .force-trait-row strong {
    color: var(--color-text, #333);
  }

  .force-mode-toggle {
    display: flex;
    gap: 12px;
    margin-bottom: 8px;
  }

  .force-mode-toggle label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.75rem;
  }

  .force-length {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 8px;
  }

  .force-length label {
    font-size: 0.75rem;
    font-weight: 600;
  }

  .force-length input[type='range'] {
    width: 100%;
    cursor: pointer;
  }

  .force-length-label {
    font-size: 0.75rem;
    color: var(--color-text-secondary, #666);
  }

  .force-length-warning {
    display: inline-flex;
    align-items: center;
    color: var(--warning, #b45309);
    cursor: help;
  }

  .force-guidance {
    width: 100%;
    padding: 6px;
    margin-bottom: 8px;
    font-size: 0.8125rem;
    font-family: inherit;
    resize: vertical;
    border: 1px solid var(--color-border, #e0e0e0);
    border-radius: 3px;
    background: var(--color-bg, #ffffff);
    color: var(--color-text, #333);
  }

  .table-talk-intensity {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 12px;
  }

  .table-talk-intensity label {
    font-size: 0.75rem;
    font-weight: 600;
  }

  .table-talk-intensity input[type='range'] {
    width: 100%;
    cursor: pointer;
  }

  .intensity-label {
    font-size: 0.75rem;
    color: var(--color-text-secondary, #666);
  }

  .btn-primary,
  .btn-secondary {
    padding: 6px 12px;
    font-size: 0.8125rem;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    font-weight: 500;
  }

  .btn-primary {
    background: var(--color-primary, #007acc);
    color: white;
    margin-bottom: 4px;
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

  .placeholder-text {
    font-size: 0.75rem;
    color: var(--color-text-secondary, #999);
    margin: 0;
  }
</style>

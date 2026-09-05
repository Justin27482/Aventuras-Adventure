<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { campaign } from '$lib/stores/campaign.svelte'
  import { prerollService } from '$lib/services/ai-player/preroll-service'
  import type { CampaignSettings } from '$lib/types'
  import type { PrerolledEncounter, PrerolledLoot } from '$lib/services/ai-player/preroll-service'

  interface Props {
    campaignId: string
    encounterDifficulty?: 'easy' | 'moderate' | 'hard' | 'deadly'
    showEncounters?: boolean
    showLoot?: boolean
  }

  const dispatch = createEventDispatcher<{
    selectEncounter: { encounter: PrerolledEncounter }
    selectLoot: { loot: PrerolledLoot }
    refreshEncounters: void
    refreshLoot: void
  }>()

  let {
    campaignId: _campaignId = '',
    encounterDifficulty = 'moderate',
    showEncounters = true,
    showLoot = false,
  }: Props = $props()

  let encounters = $state<PrerolledEncounter[]>([])
  let loot = $state<PrerolledLoot[]>([])
  let isLoadingEncounters = $state(false)
  let isLoadingLoot = $state(false)
  let selectedEncounterId = $state<string | null>(null)
  let selectedLootId = $state<string | null>(null)
  let expandedPanel = $state<'encounters' | 'loot' | null>('encounters')

  async function loadEncounters(): Promise<void> {
    if (!campaign.current) return

    isLoadingEncounters = true
    try {
      const settings: CampaignSettings = campaign.current.settings ?? {
        campaignId: campaign.current.id,
        defaultPartySize: 4,
        maxPartySize: 6,
        sceneMode: 'free',
        turnOrderMode: 'free',
        diceEnforcement: 'guided',
        nsfwIntensity: 0,
        worldCharter: null,
        gmPersona: null,
        companionCombatPolicy: 'companions_autonomous',
        aiPlayersEnabled: false,
        defaultAIPlayerCount: 4,
        tableTalkIntensity: 3,
        sessionZeroPhase: null,
        sessionZeroStatus: 'not_started',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      const generated = await prerollService.prerollEncountersForSession(
        campaign.current,
        settings,
        'combat',
        3,
      )
      encounters = generated
    } catch (error) {
      console.error('Error loading encounters:', error)
      encounters = []
    } finally {
      isLoadingEncounters = false
    }
  }

  async function loadLoot(): Promise<void> {
    if (!campaign.current) return

    isLoadingLoot = true
    try {
      const settings: CampaignSettings = campaign.current.settings ?? {
        campaignId: campaign.current.id,
        defaultPartySize: 4,
        maxPartySize: 6,
        sceneMode: 'free',
        turnOrderMode: 'free',
        diceEnforcement: 'guided',
        nsfwIntensity: 0,
        worldCharter: null,
        gmPersona: null,
        companionCombatPolicy: 'companions_autonomous',
        aiPlayersEnabled: false,
        defaultAIPlayerCount: 4,
        tableTalkIntensity: 3,
        sessionZeroPhase: null,
        sessionZeroStatus: 'not_started',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      const generated = await prerollService.prerollLootForSession(campaign.current, settings, 3)
      loot = generated
    } catch (error) {
      console.error('Error loading loot:', error)
      loot = []
    } finally {
      isLoadingLoot = false
    }
  }

  function handleRefreshEncounters(): void {
    void loadEncounters()
    dispatch('refreshEncounters')
  }

  function handleRefreshLoot(): void {
    void loadLoot()
    dispatch('refreshLoot')
  }

  function handleSelectEncounter(encounter: PrerolledEncounter): void {
    selectedEncounterId = encounter.id
    dispatch('selectEncounter', { encounter })
  }

  function handleSelectLoot(lootItem: PrerolledLoot): void {
    selectedLootId = lootItem.id
    dispatch('selectLoot', { loot: lootItem })
  }

  function handlePanelHeaderKeydown(event: KeyboardEvent, panel: 'encounters' | 'loot'): void {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    expandedPanel = expandedPanel === panel ? null : panel
  }

  function getDifficultyColor(difficulty: string): string {
    switch (difficulty) {
      case 'trivial':
      case 'easy':
        return '#4caf50'
      case 'moderate':
        return '#2196f3'
      case 'hard':
        return '#ff9800'
      case 'deadly':
        return '#f44336'
      default:
        return '#999999'
    }
  }
</script>

<div class="preroll-menu">
  {#if showEncounters}
    <div class="preroll-panel encounters-panel">
      <div
        class="panel-header"
        role="button"
        tabindex="0"
        aria-expanded={expandedPanel === 'encounters'}
        onclick={() => (expandedPanel = expandedPanel === 'encounters' ? null : 'encounters')}
        onkeydown={(event) => handlePanelHeaderKeydown(event, 'encounters')}
      >
        <div class="header-title">
          <span class="icon">⚔️</span>
          <span>Encounters</span>
          <span
            class="difficulty-badge"
            style="background-color: {getDifficultyColor(encounterDifficulty)}"
          >
            {encounterDifficulty}
          </span>
        </div>
        <button
          class="refresh-btn"
          title="Refresh encounters"
          onclick={(e) => {
            e.stopPropagation()
            handleRefreshEncounters()
          }}
        >
          🔄
        </button>
      </div>

      {#if expandedPanel === 'encounters'}
        <div class="panel-content">
          {#if isLoadingEncounters}
            <div class="loading">Loading encounters...</div>
          {:else if encounters.length === 0}
            <div class="empty-state">No pre-rolled encounters. Click refresh to generate.</div>
          {:else}
            <div class="encounter-list">
              {#each encounters as encounter (encounter.id)}
                <button
                  type="button"
                  class="encounter-item {selectedEncounterId === encounter.id ? 'selected' : ''}"
                  aria-pressed={selectedEncounterId === encounter.id}
                  onclick={() => handleSelectEncounter(encounter)}
                >
                  <div class="encounter-header">
                    <span class="encounter-name">{encounter.name}</span>
                  </div>
                  <div class="encounter-details">
                    <span class="enemies">{encounter.enemies}</span>
                    <span class="difficulty difficulty-{encounter.difficulty}">
                      {encounter.difficulty}
                    </span>
                  </div>
                  <div class="encounter-description">
                    {encounter.description}
                  </div>
                  {#if encounter.environmentalHazards}
                    <div class="encounter-hazards">
                      ⚠️ {encounter.environmentalHazards}
                    </div>
                  {/if}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}

  {#if showLoot}
    <div class="preroll-panel loot-panel">
      <div
        class="panel-header"
        role="button"
        tabindex="0"
        aria-expanded={expandedPanel === 'loot'}
        onclick={() => (expandedPanel = expandedPanel === 'loot' ? null : 'loot')}
        onkeydown={(event) => handlePanelHeaderKeydown(event, 'loot')}
      >
        <div class="header-title">
          <span class="icon">💎</span>
          <span>Treasure</span>
        </div>
        <button
          class="refresh-btn"
          title="Refresh loot"
          onclick={(e) => {
            e.stopPropagation()
            handleRefreshLoot()
          }}
        >
          🔄
        </button>
      </div>

      {#if expandedPanel === 'loot'}
        <div class="panel-content">
          {#if isLoadingLoot}
            <div class="loading">Loading loot...</div>
          {:else if loot.length === 0}
            <div class="empty-state">No pre-rolled loot. Click refresh to generate.</div>
          {:else}
            <div class="loot-list">
              {#each loot as lootItem (lootItem.id)}
                <button
                  type="button"
                  class="loot-item {selectedLootId === lootItem.id ? 'selected' : ''}"
                  aria-pressed={selectedLootId === lootItem.id}
                  onclick={() => handleSelectLoot(lootItem)}
                >
                  <div class="loot-header">
                    <span class="loot-name">{lootItem.itemName}</span>
                    <span
                      class="loot-rarity"
                      class:common={lootItem.rarity === 'common'}
                      class:uncommon={lootItem.rarity === 'uncommon'}
                      class:rare={lootItem.rarity === 'rare'}
                      class:legendary={lootItem.rarity === 'legendary' ||
                        lootItem.rarity === 'very_rare'}
                    >
                      {lootItem.rarity}
                    </span>
                  </div>
                  <div class="loot-details">
                    <span class="loot-type">{lootItem.type}</span>
                    {#if lootItem.estimatedGold}
                      <span class="loot-value">{lootItem.estimatedGold} gold</span>
                    {/if}
                  </div>
                  {#if lootItem.description}
                    <div class="loot-description">
                      {lootItem.description}
                    </div>
                  {/if}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .preroll-menu {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .preroll-panel {
    border: 1px solid var(--color-border, #e0e0e0);
    border-radius: 4px;
    background: var(--color-panel-bg, #f9f9f9);
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    background: var(--color-primary, #007acc);
    color: white;
    cursor: pointer;
    border-radius: 4px 4px 0 0;
    font-weight: 600;
    font-size: 12px;
    user-select: none;
  }

  .panel-header:hover {
    background: var(--color-primary-hover, #005a9e);
  }

  .header-title {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .icon {
    font-size: 14px;
  }

  .difficulty-badge {
    display: inline-block;
    padding: 2px 6px;
    border-radius: 2px;
    color: white;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
  }

  .refresh-btn {
    background: transparent;
    border: none;
    color: white;
    cursor: pointer;
    font-size: 14px;
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .refresh-btn:hover {
    opacity: 0.8;
  }

  .panel-content {
    padding: 8px;
    max-height: 300px;
    overflow-y: auto;
  }

  .loading,
  .empty-state {
    padding: 12px;
    text-align: center;
    color: var(--color-text-secondary, #666);
    font-size: 12px;
  }

  .encounter-list,
  .loot-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .encounter-item,
  .loot-item {
    padding: 8px;
    background: var(--color-bg, #ffffff);
    border: 1px solid var(--color-border, #e0e0e0);
    border-radius: 2px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .encounter-item:hover,
  .loot-item:hover {
    background: var(--color-panel-bg, #f5f5f5);
    border-color: var(--color-primary, #007acc);
  }

  .encounter-item.selected,
  .loot-item.selected {
    background: #e3f2fd;
    border-color: var(--color-primary, #007acc);
    border-width: 2px;
  }

  .encounter-header,
  .loot-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }

  .encounter-name,
  .loot-name {
    font-weight: 600;
    font-size: 12px;
    color: var(--color-text, #333);
  }

  .encounter-cr {
    font-size: 10px;
    background: rgba(0, 0, 0, 0.1);
    padding: 2px 4px;
    border-radius: 2px;
    color: var(--color-text-secondary, #666);
    display: none; /* Hidden - field not available */
  }

  .encounter-hazards {
    font-size: 11px;
    color: #ff9800;
    margin-top: 4px;
    padding-top: 4px;
    border-top: 1px solid rgba(255, 152, 0, 0.2);
  }

  .loot-rarity {
    font-size: 10px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 2px;
    text-transform: uppercase;
  }

  .loot-rarity.common {
    background: #d0d0d0;
    color: #333;
  }

  .loot-rarity.uncommon {
    background: #4caf50;
    color: white;
  }

  .loot-rarity.rare {
    background: #2196f3;
    color: white;
  }

  .loot-rarity.legendary {
    background: #ff9800;
    color: white;
  }

  .encounter-details,
  .loot-details {
    display: flex;
    gap: 8px;
    margin-bottom: 4px;
    font-size: 11px;
  }

  .enemies,
  .loot-type,
  .loot-value {
    color: var(--color-text-secondary, #666);
  }

  .difficulty {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    padding: 2px 4px;
    border-radius: 2px;
  }

  .difficulty-easy {
    background: rgba(76, 175, 80, 0.2);
    color: #2e7d32;
  }

  .difficulty-moderate {
    background: rgba(33, 150, 243, 0.2);
    color: #1565c0;
  }

  .difficulty-hard {
    background: rgba(255, 152, 0, 0.2);
    color: #e65100;
  }

  .difficulty-deadly {
    background: rgba(244, 67, 54, 0.2);
    color: #c62828;
  }

  .encounter-description,
  .loot-description {
    font-size: 11px;
    color: var(--color-text-secondary, #666);
    line-height: 1.3;
    margin-top: 4px;
  }
</style>

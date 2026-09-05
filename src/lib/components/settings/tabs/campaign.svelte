<script lang="ts">
  import { campaign } from '$lib/stores/campaign.svelte'
  import { story } from '$lib/stores/story.svelte'
  import { database } from '$lib/services/database'
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card'
  import { Label } from '$lib/components/ui/label'
  import { Input } from '$lib/components/ui/input'
  import { Textarea } from '$lib/components/ui/textarea'
  import { Button } from '$lib/components/ui/button'
  import * as Select from '$lib/components/ui/select'
  import {
    buildWorldCharterDraft,
    expandWorldCharterDraft,
  } from '$lib/services/campaign/world-charter-service'
  import { BookOpenText, Bot, Crown, Unlink, Users, Swords, Flame } from 'lucide-svelte'
  import { Slider } from '$lib/components/ui/slider'
  import { Badge } from '$lib/components/ui/badge'
  import { Switch } from '$lib/components/ui/switch'
  import { CONTENT_INTENSITY_LEVELS, MAX_CONTENT_INTENSITY } from '$lib/services/content-intensity'
  import { ruleset } from '$lib/stores/ruleset.svelte'
  import type {
    AIPlayer,
    CampaignAIPlayer,
    CampaignFormationBackup,
    PartyPendingConversionPreview,
    PlayerCharacter,
  } from '$lib/types'
  import { packService } from '$lib/services/packs/pack-service'
  import type { PresetPack } from '$lib/services/packs/types'
  import { Package } from 'lucide-svelte'

  interface Props {
    onSaveStatus?: (status: 'saving' | 'saved' | 'error') => void
  }

  let { onSaveStatus }: Props = $props()

  const combatPolicies = [
    {
      value: 'companions_autonomous',
      label: 'Autonomous companions',
      description: 'Companions choose sensible combat actions from their own priorities.',
    },
    {
      value: 'tactical_delegate',
      label: 'Tactical delegation',
      description: 'You give intent; the companion chooses the concrete action.',
    },
    {
      value: 'tactical_player',
      label: 'Direct tactical control',
      description: 'You choose companion combat actions directly when the session starts.',
    },
  ] as const

  let isLoadingCampaignSettings = $state(false)
  let isDraftingWorldCharter = $state(false)
  let isExpandingWorldCharter = $state(false)
  let campaignSettingsError = $state<string | null>(null)
  let worldCharterDraft = $state('')
  let gmPersonaDraft = $state('')
  let intensityValue = $state(0)
  let intensitySaveQueue: Promise<void> = Promise.resolve()
  let aiPlayers = $state<AIPlayer[]>([])
  let playerAssignments = $state<PlayerCharacter[]>([])
  let tableRoster = $state<CampaignAIPlayer[]>([])
  let isLoadingAIPlayers = $state(false)
  let aiPlayersLoadedForCampaign = $state<string | null>(null)
  let promptPacks = $state<PresetPack[]>([])
  let selectedPromptPackId = $state('default-pack')
  let promptPacksLoadedForStory = $state<string | null>(null)
  let isLoadingPromptPacks = $state(false)
  let conversionPreview = $state<PartyPendingConversionPreview | null>(null)
  let conversionConfirmation = $state('')
  let conversionBusy = $state(false)
  let formationBackups = $state<CampaignFormationBackup[]>([])

  $effect(() => {
    worldCharterDraft = campaign.settings?.worldCharter ?? ''
    gmPersonaDraft = campaign.settings?.gmPersona ?? ''
    intensityValue = campaign.settings?.nsfwIntensity ?? 0
  })

  $effect(() => {
    const storyId = story.currentStory?.id
    if (!storyId || promptPacksLoadedForStory === storyId) return
    promptPacksLoadedForStory = storyId
    isLoadingPromptPacks = true
    Promise.all([packService.initialize(), database.getStoryPackId(storyId)])
      .then(async ([, packId]) => {
        promptPacks = await packService.getAllPacks()
        selectedPromptPackId =
          packId && promptPacks.some((pack) => pack.id === packId) ? packId : 'default-pack'
      })
      .catch((error) => {
        campaignSettingsError =
          error instanceof Error ? error.message : 'Failed to load prompt packs'
      })
      .finally(() => {
        isLoadingPromptPacks = false
      })
  })

  $effect(() => {
    if (campaign.current && !ruleset.loaded) void ruleset.loadAll()
  })

  $effect(() => {
    const campaignId = campaign.current?.id
    if (!campaignId || !campaign.settings || aiPlayersLoadedForCampaign === campaignId) return
    aiPlayersLoadedForCampaign = campaignId
    isLoadingAIPlayers = true
    Promise.all([
      database.listAIPlayers(),
      database.getPlayerCharactersForCampaign(campaignId),
      database.getCampaignAIPlayers(campaignId),
    ])
      .then(([players, assignments, roster]) => {
        aiPlayers = players
        playerAssignments = assignments
        tableRoster = roster.filter((member) => member.leftAt === null)
      })
      .catch((error) => {
        campaignSettingsError = error instanceof Error ? error.message : 'Failed to load AI Players'
      })
      .finally(() => {
        isLoadingAIPlayers = false
      })
  })

  async function setCampaignRuleset(value: string | undefined) {
    if (!value || !campaign.current) return
    onSaveStatus?.('saving')
    try {
      await campaign.setRuleset(value)
      onSaveStatus?.('saved')
    } catch (error) {
      onSaveStatus?.('error')
      campaignSettingsError = error instanceof Error ? error.message : 'Failed to assign ruleset'
    }
  }

  async function setCampaignPromptPack(value: string | undefined) {
    if (!value || !story.currentStory || value === selectedPromptPackId) return
    onSaveStatus?.('saving')
    campaignSettingsError = null
    try {
      if (!promptPacks.some((pack) => pack.id === value)) {
        throw new Error('The selected prompt pack is no longer available')
      }
      await packService.ensurePackTemplatesComplete(value)
      await database.setStoryPack(story.currentStory.id, value)
      selectedPromptPackId = value
      onSaveStatus?.('saved')
    } catch (error) {
      onSaveStatus?.('error')
      campaignSettingsError =
        error instanceof Error ? error.message : 'Failed to assign prompt pack'
    }
  }

  async function loadConversionPreview() {
    if (!campaign.current?.storyId) return
    conversionBusy = true
    campaignSettingsError = null
    try {
      ;[conversionPreview, formationBackups] = await Promise.all([
        database.getPartyPendingConversionPreview(campaign.current.id, campaign.current.storyId),
        database.getCampaignFormationBackups(campaign.current.id),
      ])
    } catch (error) {
      campaignSettingsError =
        error instanceof Error ? error.message : 'Unable to inspect campaign conversion'
    } finally {
      conversionBusy = false
    }
  }

  async function convertToPartyPending() {
    if (
      !campaign.current?.storyId ||
      conversionConfirmation !== campaign.current.title ||
      conversionBusy
    )
      return
    conversionBusy = true
    campaignSettingsError = null
    try {
      await database.convertCampaignToPartyPending(
        campaign.current.id,
        campaign.current.storyId,
        tableRoster.map((member) => member.aiPlayerId),
      )
      conversionPreview = null
      conversionConfirmation = ''
      await story.loadStory(campaign.current.storyId)
      await campaign.loadForStory(campaign.current.storyId)
      onSaveStatus?.('saved')
    } catch (error) {
      campaignSettingsError = error instanceof Error ? error.message : 'Campaign conversion failed'
      onSaveStatus?.('error')
    } finally {
      conversionBusy = false
    }
  }

  async function restoreLatestFormationBackup() {
    const backup = formationBackups.find((item) => item.restoredAt === null)
    if (!backup || !campaign.current?.storyId || conversionBusy) return
    conversionBusy = true
    campaignSettingsError = null
    try {
      await database.restoreCampaignFormationBackup(backup.id)
      await story.loadStory(campaign.current.storyId)
      await campaign.loadForStory(campaign.current.storyId)
      conversionPreview = null
      formationBackups = await database.getCampaignFormationBackups(campaign.current.id)
      onSaveStatus?.('saved')
    } catch (error) {
      campaignSettingsError = error instanceof Error ? error.message : 'Campaign restore failed'
      onSaveStatus?.('error')
    } finally {
      conversionBusy = false
    }
  }

  async function handleSetCampaignType(value: string | undefined) {
    if (!value || !campaign.current) return
    onSaveStatus?.('saving')
    try {
      await campaign.setCampaignType(value as any)
      onSaveStatus?.('saved')
    } catch (error) {
      onSaveStatus?.('error')
      campaignSettingsError =
        error instanceof Error ? error.message : 'Failed to update campaign type'
      console.error('[CampaignSettings] Failed to set campaign type:', error)
    }
  }

  async function updatePartySize(value: string) {
    const parsed = Math.max(1, Math.min(12, Math.floor(Number(value))))
    if (!Number.isFinite(parsed) || !campaign.settings) return
    const maxPartySize = Math.max(parsed, campaign.settings.maxPartySize)
    await saveCampaignSettings({ defaultPartySize: parsed, maxPartySize })
  }

  async function updateMaxPartySize(value: string) {
    const parsed = Math.max(1, Math.min(12, Math.floor(Number(value))))
    if (!Number.isFinite(parsed) || !campaign.settings) return
    const defaultPartySize = Math.min(campaign.settings.defaultPartySize, parsed)
    await saveCampaignSettings({ defaultPartySize, maxPartySize: parsed })
  }

  async function saveCampaignSettings(updates: Parameters<typeof campaign.updateSettings>[0]) {
    onSaveStatus?.('saving')
    try {
      await campaign.updateSettings(updates)
      onSaveStatus?.('saved')
    } catch (error) {
      onSaveStatus?.('error')
      throw error
    }
  }

  function updateNsfwIntensity(val: number) {
    if (!campaign.settings) return
    const clamped = Math.max(0, Math.min(MAX_CONTENT_INTENSITY, Math.floor(val)))
    intensityValue = clamped
    campaignSettingsError = null
    intensitySaveQueue = intensitySaveQueue
      .then(async () => {
        await saveCampaignSettings({ nsfwIntensity: clamped })
      })
      .catch((error) => {
        campaignSettingsError =
          error instanceof Error ? error.message : 'Failed to save content intensity'
        console.error('[CampaignSettings] Failed to save content intensity:', error)
      })
      .finally(() => {})
  }

  async function saveWorldCharter() {
    if (!campaign.settings) return
    const nextWorldCharter = worldCharterDraft.trim() || null
    if ((campaign.settings.worldCharter ?? null) === nextWorldCharter) return
    await saveCampaignSettings({ worldCharter: nextWorldCharter })
  }

  async function saveGMPersona() {
    if (!campaign.settings) return
    const nextGMPersona = gmPersonaDraft.trim() || null
    if ((campaign.settings.gmPersona ?? null) === nextGMPersona) return
    await saveCampaignSettings({ gmPersona: nextGMPersona })
  }

  function getAssignment(characterId: string): PlayerCharacter | undefined {
    return playerAssignments.find((assignment) => assignment.characterId === characterId)
  }

  function canAssignToCharacter(aiPlayerId: string, characterId: string): boolean {
    return !playerAssignments.some(
      (assignment) =>
        assignment.aiPlayerId === aiPlayerId && assignment.characterId !== characterId,
    )
  }

  function isOnTableRoster(aiPlayerId: string): boolean {
    return tableRoster.some((member) => member.aiPlayerId === aiPlayerId)
  }

  async function setTableRosterMembership(aiPlayerId: string, participating: boolean) {
    if (!campaign.current) return
    try {
      if (participating) {
        const member: CampaignAIPlayer = {
          id: crypto.randomUUID(),
          campaignId: campaign.current.id,
          aiPlayerId,
          joinedAt: Date.now(),
          leftAt: null,
        }
        await database.upsertCampaignAIPlayer(member)
        tableRoster = [...tableRoster.filter((entry) => entry.aiPlayerId !== aiPlayerId), member]
      } else {
        if (
          playerAssignments.some(
            (assignment) => assignment.aiPlayerId === aiPlayerId && !assignment.leftAt,
          )
        ) {
          throw new Error(
            'Remove this AI Player’s character assignment before removing them from the table roster.',
          )
        }
        await database.removeCampaignAIPlayer(campaign.current.id, aiPlayerId)
        tableRoster = tableRoster.filter((member) => member.aiPlayerId !== aiPlayerId)
      }
    } catch (error) {
      campaignSettingsError =
        error instanceof Error ? error.message : 'Unable to update table roster'
    }
  }

  async function assignAIPlayer(characterId: string, aiPlayerId: string) {
    const existing = getAssignment(characterId)
    try {
      if (!aiPlayerId) {
        if (existing) await database.deletePlayerCharacter(existing.id)
        playerAssignments = playerAssignments.filter((assignment) => assignment.id !== existing?.id)
        return
      }
      if (!canAssignToCharacter(aiPlayerId, characterId)) {
        throw new Error('This AI Player is already assigned to another character in this campaign')
      }
      const now = Date.now()
      const next: PlayerCharacter = {
        id: existing?.id ?? crypto.randomUUID(),
        campaignId: campaign.current!.id,
        aiPlayerId,
        characterId,
        roleplayNotes: existing?.roleplayNotes ?? null,
        characterSecrets: existing?.characterSecrets ?? [],
        interPlayerRelationshipOverrides: existing?.interPlayerRelationshipOverrides ?? {},
        joinedAt: existing?.joinedAt ?? now,
        leftAt: null,
      }
      if (!isOnTableRoster(aiPlayerId)) {
        await setTableRosterMembership(aiPlayerId, true)
      }
      await database.upsertPlayerCharacter(next)
      playerAssignments = [
        ...playerAssignments.filter((assignment) => assignment.id !== next.id),
        next,
      ]
    } catch (error) {
      campaignSettingsError = error instanceof Error ? error.message : 'Failed to assign AI Player'
    }
  }

  function getWorldCharterInput() {
    if (!story.currentStory) return null
    return {
      story: story.currentStory,
      characters: story.characters,
      locations: story.locations,
      lorebookEntries: story.lorebookEntries,
      storyBeats: story.storyBeats,
      entries: story.entries,
      existingCharter: worldCharterDraft,
    }
  }

  async function draftWorldCharterFromCampaign() {
    const input = getWorldCharterInput()
    if (!input) return
    isDraftingWorldCharter = true
    campaignSettingsError = null
    try {
      worldCharterDraft = buildWorldCharterDraft(input)
      await saveWorldCharter()
    } catch (error) {
      campaignSettingsError =
        error instanceof Error ? error.message : 'Failed to draft world charter'
    } finally {
      isDraftingWorldCharter = false
    }
  }

  async function expandWorldCharterWithAI() {
    const input = getWorldCharterInput()
    if (!input) return
    isExpandingWorldCharter = true
    campaignSettingsError = null
    try {
      worldCharterDraft = await expandWorldCharterDraft(input)
    } catch (error) {
      campaignSettingsError =
        error instanceof Error ? error.message : 'Failed to expand world charter'
    } finally {
      isExpandingWorldCharter = false
    }
  }

  // The settings tab can be opened before campaign store hydration catches up.
  // Use the loaded story as the source of truth and backfill/load campaign settings here.
  $effect(() => {
    const currentStory = story.currentStory
    if (!currentStory || isLoadingCampaignSettings) return
    if (campaign.current?.storyId === currentStory.id && campaign.settings) return

    isLoadingCampaignSettings = true
    campaignSettingsError = null
    campaign
      .ensureForStory({
        id: currentStory.id,
        title: currentStory.title,
        description: currentStory.description,
        createdAt: currentStory.createdAt,
        updatedAt: currentStory.updatedAt,
        characters: story.characters,
      })
      .then(() => campaign.loadForStory(currentStory.id))
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'Failed to load campaign settings'
        campaignSettingsError = message
        console.error('[CampaignSettings] Failed to load campaign settings:', error)
      })
      .finally(() => {
        isLoadingCampaignSettings = false
      })
  })
</script>

{#if campaign.current && campaign.settings}
  <div class="space-y-6">
    <div>
      <h2 class="text-foreground text-xl font-semibold">Campaign Settings</h2>
      <p class="text-muted-foreground mt-1 text-sm">
        Configure party capacity and how autonomous companions behave in future sessions.
      </p>
    </div>

    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2 text-base">
          <Crown class="text-primary h-4 w-4" />
          Campaign Type & UI Routing
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="space-y-2">
          <Label for="campaign-type-select">Campaign Mode</Label>
          <Select.Root
            type="single"
            value={campaign.current.campaignType ?? 'human_gm_solo'}
            onValueChange={handleSetCampaignType}
          >
            <Select.Trigger id="campaign-type-select">
              {campaign.current.campaignType === 'human_gm_ai_players'
                ? 'Human GM with AI Players'
                : campaign.current.campaignType === 'ai_gm'
                  ? 'AI GM (Human Player)'
                  : campaign.current.campaignType === 'human_player'
                    ? 'Human Player'
                    : 'Human GM Solo'}
            </Select.Trigger>
            <Select.Content>
              <Select.Item
                value="human_gm_ai_players"
                label="Human GM with AI Players (Chat-First TTRPG Table)"
              >
                Human GM with AI Players (Chat-First TTRPG Table)
              </Select.Item>
              <Select.Item value="human_gm_solo" label="Human GM Solo (Human Party Control)">
                Human GM Solo (Human Party Control)
              </Select.Item>
              <Select.Item value="ai_gm" label="AI GM (Human Player)">
                AI GM (Human Player)
              </Select.Item>
            </Select.Content>
          </Select.Root>
          <p class="text-muted-foreground text-xs">
            Controls which campaign interface and turn-routing engine is used. Selecting "Human GM
            with AI Players" activates the unified GM Campaign Screen.
          </p>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2 text-base">
          <Users class="text-primary h-4 w-4" />
          Party Capacity
        </CardTitle>
      </CardHeader>
      <CardContent class="grid gap-4 sm:grid-cols-2">
        <div class="space-y-2">
          <Label for="default-party-size">Default party size</Label>
          <Input
            id="default-party-size"
            type="number"
            min="1"
            max="12"
            value={campaign.settings.defaultPartySize}
            oninput={(event) => updatePartySize(event.currentTarget.value)}
          />
          <p class="text-muted-foreground text-xs">Suggested size when starting a new session.</p>
        </div>
        <div class="space-y-2">
          <Label for="max-party-size">Maximum active party size</Label>
          <Input
            id="max-party-size"
            type="number"
            min="1"
            max="12"
            value={campaign.settings.maxPartySize}
            oninput={(event) => updateMaxPartySize(event.currentTarget.value)}
          />
          <p class="text-muted-foreground text-xs">The active party cannot exceed this limit.</p>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2 text-base">
          <Bot class="text-primary h-4 w-4" />
          AI Players
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="flex items-center justify-between gap-4">
          <div class="space-y-0.5">
            <Label for="ai-players-enabled">Enable AI Players</Label>
            <p class="text-muted-foreground text-xs">
              Use reusable global AI Player profiles in this campaign.
            </p>
          </div>
          <Switch
            id="ai-players-enabled"
            checked={campaign.settings.aiPlayersEnabled}
            onCheckedChange={(checked) => saveCampaignSettings({ aiPlayersEnabled: checked })}
          />
        </div>
        {#if campaign.settings.aiPlayersEnabled}
          <div class="space-y-3 border-t pt-3">
            <div class="flex items-center justify-between gap-3">
              <div>
                <Label>Table roster</Label>
                <p class="text-muted-foreground text-xs">
                  Rostered AI Players can join Table Talk even without a character.
                </p>
              </div>
              {#if isLoadingAIPlayers}<span class="text-muted-foreground text-xs">Loading...</span
                >{/if}
            </div>
            {#each aiPlayers.filter((player) => player.archivedAt === null) as player (player.id)}
              <label
                class="border-border flex items-center justify-between gap-3 rounded-md border p-3"
              >
                <span class="text-sm font-medium">{player.name}</span>
                <Switch
                  checked={isOnTableRoster(player.id)}
                  onCheckedChange={(checked) => setTableRosterMembership(player.id, checked)}
                  aria-label={`Include ${player.name} in the campaign table roster`}
                />
              </label>
            {/each}
          </div>
          <div class="space-y-3 border-t pt-3">
            <div>
              <Label>Character assignments</Label>
              <p class="text-muted-foreground text-xs">
                Optional. Only rostered AI Players with a character participate in narrative turns.
              </p>
            </div>
            {#each story.characters as character (character.id)}
              {@const assignment = getAssignment(character.id)}
              <div
                class="border-border grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-center"
              >
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium">{character.name}</p>
                  <p class="text-muted-foreground text-xs">
                    {assignment ? 'AI-controlled' : 'No AI Player assigned'}
                  </p>
                </div>
                <select
                  class="bg-background border-input text-foreground h-9 min-w-0 rounded-md border px-2 text-sm"
                  value={assignment?.aiPlayerId ?? ''}
                  onchange={(event) => assignAIPlayer(character.id, event.currentTarget.value)}
                >
                  <option value="">No AI Player</option>
                  {#each aiPlayers.filter((player) => player.archivedAt === null && isOnTableRoster(player.id) && (player.id === assignment?.aiPlayerId || canAssignToCharacter(player.id, character.id))) as player (player.id)}
                    <option value={player.id}>{player.name}</option>
                  {/each}
                </select>
                {#if assignment}
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Remove AI Player assignment"
                    onclick={() => assignAIPlayer(character.id, '')}
                  >
                    <Unlink class="h-4 w-4" />
                  </Button>
                {/if}
              </div>
            {/each}
            <p class="text-muted-foreground text-xs">
              Add an AI Player to the table roster first, then optionally assign them to a character
              for narrative participation.
            </p>
            {#if story.characters.length === 0}
              <p class="text-muted-foreground text-sm">
                Create a character before assigning an AI Player.
              </p>
            {/if}
          </div>
        {/if}
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle class="text-base">Ruleset</CardTitle>
      </CardHeader>
      <CardContent class="space-y-2">
        <Label for="campaign-ruleset">Ruleset used by this campaign</Label>
        <Select.Root
          type="single"
          value={campaign.current.rulesetId ?? undefined}
          onValueChange={setCampaignRuleset}
        >
          <Select.Trigger id="campaign-ruleset" class="w-full">
            {ruleset.all.find((candidate) => candidate.id === campaign.current?.rulesetId)?.name ??
              'Choose a ruleset'}
          </Select.Trigger>
          <Select.Content>
            {#each ruleset.all as candidate (candidate.id)}
              <Select.Item value={candidate.id} label={candidate.name}>
                <div class="flex items-center gap-2">
                  <span>{candidate.name}</span>
                  {#if candidate.isBuiltin}<span class="text-muted-foreground text-xs"
                      >Built-in</span
                    >{/if}
                </div>
              </Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
        <p class="text-muted-foreground text-xs">
          Rulesets are shared definitions. Changes to a custom ruleset are available to every
          campaign using it.
        </p>
      </CardContent>
    </Card>

    {#if campaign.current.campaignType === 'human_gm_ai_players' || campaign.current.campaignType === 'human_gm_solo'}
      <Card>
        <CardHeader>
          <CardTitle class="text-base">Party Formation Reset</CardTitle>
        </CardHeader>
        <CardContent class="space-y-3">
          <p class="text-muted-foreground text-xs">
            Convert this campaign to a characterless party-pending state. World data, campaign
            settings, prompt pack, and AI Player roster are preserved. A recovery backup is created
            first.
          </p>
          {#if !conversionPreview}
            <div class="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onclick={() => void loadConversionPreview()}
                disabled={conversionBusy}
              >
                {conversionBusy ? 'Inspecting...' : 'Inspect Conversion Impact'}
              </Button>
              {#if formationBackups.some((backup) => backup.restoredAt === null)}
                <Button
                  variant="outline"
                  onclick={() => void restoreLatestFormationBackup()}
                  disabled={conversionBusy}
                >
                  Restore Pre-Conversion State
                </Button>
              {/if}
            </div>
          {:else}
            <div class="grid grid-cols-2 gap-2 rounded-md border p-3 text-xs sm:grid-cols-4">
              {#each Object.entries(conversionPreview) as [label, count] (label)}
                <div><span class="text-muted-foreground">{label}:</span> {count}</div>
              {/each}
            </div>
            <p class="text-destructive text-xs">
              Live characters, sheets, assignments, party state, and normal sessions will be removed
              after the backup is verified. Existing story prose is retained and may mention the old
              cast.
            </p>
            <div class="space-y-1.5">
              <Label for="party-pending-confirmation"
                >Type “{campaign.current.title}” to confirm</Label
              >
              <Input id="party-pending-confirmation" bind:value={conversionConfirmation} />
            </div>
            <div class="flex gap-2">
              <Button
                variant="destructive"
                onclick={() => void convertToPartyPending()}
                disabled={conversionBusy || conversionConfirmation !== campaign.current.title}
              >
                {conversionBusy ? 'Converting...' : 'Convert to Party Pending'}
              </Button>
              <Button
                variant="outline"
                onclick={() => {
                  conversionPreview = null
                  conversionConfirmation = ''
                }}
                disabled={conversionBusy}>Cancel</Button
              >
            </div>
          {/if}
        </CardContent>
      </Card>
    {/if}

    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2 text-base">
          <Package class="text-primary h-4 w-4" />
          Prompt Pack
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-2">
        <Label for="campaign-prompt-pack">Prompt templates used by this campaign</Label>
        <Select.Root
          type="single"
          value={selectedPromptPackId}
          onValueChange={setCampaignPromptPack}
          disabled={isLoadingPromptPacks}
        >
          <Select.Trigger id="campaign-prompt-pack" class="w-full">
            {isLoadingPromptPacks
              ? 'Loading prompt packs...'
              : (promptPacks.find((pack) => pack.id === selectedPromptPackId)?.name ?? 'Default')}
          </Select.Trigger>
          <Select.Content>
            {#each promptPacks as pack (pack.id)}
              <Select.Item value={pack.id} label={pack.name}>
                <div class="flex items-center gap-2">
                  <span>{pack.name}</span>
                  {#if pack.isDefault}
                    <Badge variant="secondary" class="text-xs">Built-in</Badge>
                  {/if}
                </div>
              </Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
        <p class="text-muted-foreground text-xs">
          New AI generations use this pack. Custom packs and their variables are shared with the
          campaign story and remain editable in the Prompt Editor.
        </p>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2 text-base">
          <Flame class="text-primary h-4 w-4" />
          Content Intensity (NSFW)
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <Label>Intensity Level ({intensityValue})</Label>
            <Badge variant="outline" class="text-xs">
              {CONTENT_INTENSITY_LEVELS[intensityValue]?.label ?? 'Level ' + intensityValue}
            </Badge>
          </div>
          <Slider
            bind:value={intensityValue}
            min={0}
            max={MAX_CONTENT_INTENSITY}
            step={1}
            type="single"
            onValueChange={(val) => {
              intensityValue = val
            }}
            onValueCommit={(val) => updateNsfwIntensity(val)}
          />
          <!-- <div class="grid grid-cols-3 gap-x-2 gap-y-1 text-[10px] text-muted-foreground sm:grid-cols-5">
            {#each Object.entries(CONTENT_INTENSITY_LEVELS) as [level, intensity]}
              <span>{level}: {intensity.label}</span>
            {/each}
          </div> -->
          <!-- <div class="flex items-center justify-between gap-3">
            <span class="text-muted-foreground text-xs">
              {#if isSavingIntensity}
                Saving intensity...
              {:else}
                Choose a level, then save it.
              {/if}
            </span>
          </div>
        </div> -->
        </div>

        <!-- <div class="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-500 flex items-start gap-2">
          <ShieldAlert class="h-4 w-4 shrink-0 mt-0.5" />
        </div> -->
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2 text-base">
          <Crown class="text-primary h-4 w-4" />
          GM Persona
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-2">
        <Label for="gm-persona">GM voice and table style</Label>
        <Textarea
          id="gm-persona"
          bind:value={gmPersonaDraft}
          placeholder="Describe the GM's voice, pacing, focus, and table style."
          class="min-h-24"
          onblur={saveGMPersona}
        />
        <p class="text-muted-foreground text-xs">Saved on blur and used by campaign generation.</p>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2 text-base">
          <BookOpenText class="text-primary h-4 w-4" />
          World Charter
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-2">
        <Label for="world-charter">Campaign truths and director guidance</Label>
        <div class="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onclick={draftWorldCharterFromCampaign}
            disabled={isDraftingWorldCharter || isExpandingWorldCharter}
          >
            {isDraftingWorldCharter ? 'Drafting...' : 'Draft from Campaign'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onclick={expandWorldCharterWithAI}
            disabled={isDraftingWorldCharter || isExpandingWorldCharter}
          >
            {isExpandingWorldCharter ? 'Expanding...' : 'Expand with AI'}
          </Button>
        </div>
        <Textarea
          id="world-charter"
          bind:value={worldCharterDraft}
          placeholder="Define the campaign premise, tone, immutable facts, factions, open questions, and boundaries the GM should preserve."
          class="min-h-36"
          onblur={saveWorldCharter}
        />
        <p class="text-muted-foreground text-xs">
          Saved on blur. Drafting from campaign saves immediately; AI expansion updates the draft
          for review.
        </p>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2 text-base">
          <Swords class="text-primary h-4 w-4" />
          Companion Combat Policy
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-3">
        <Label for="default-combat-policy">Default for new sessions</Label>
        <Select.Root
          type="single"
          value={campaign.settings.companionCombatPolicy}
          onValueChange={(value) =>
            value &&
            saveCampaignSettings({
              companionCombatPolicy: value as typeof campaign.settings.companionCombatPolicy,
            })}
        >
          <Select.Trigger id="default-combat-policy" class="w-full">
            {combatPolicies.find(
              (policy) => policy.value === campaign.settings?.companionCombatPolicy,
            )?.label ?? 'Autonomous companions'}
          </Select.Trigger>
          <Select.Content>
            {#each combatPolicies as policy (policy.value)}
              <Select.Item value={policy.value} label={policy.label}>
                <div class="flex flex-col items-start">
                  <span>{policy.label}</span>
                  <span class="text-muted-foreground text-xs">{policy.description}</span>
                </div>
              </Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </CardContent>
    </Card>
  </div>
{:else if isLoadingCampaignSettings}
  <p class="text-muted-foreground text-sm">Loading campaign settings...</p>
{:else if campaignSettingsError}
  <p class="text-destructive text-sm">{campaignSettingsError}</p>
{:else}
  <p class="text-muted-foreground text-sm">
    Campaign settings are available for active Campaign Engine campaigns.
  </p>
{/if}

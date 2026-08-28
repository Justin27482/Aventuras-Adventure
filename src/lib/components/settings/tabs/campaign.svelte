<script lang="ts">
  import { campaign } from '$lib/stores/campaign.svelte'
  import { story } from '$lib/stores/story.svelte'
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
  import { BookOpenText, Crown, Users, Swords, Flame } from 'lucide-svelte'
  import { Slider } from '$lib/components/ui/slider'
  import { Badge } from '$lib/components/ui/badge'
  import { CONTENT_INTENSITY_LEVELS, MAX_CONTENT_INTENSITY } from '$lib/services/content-intensity'
  import { ruleset } from '$lib/stores/ruleset.svelte'

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

  $effect(() => {
    worldCharterDraft = campaign.settings?.worldCharter ?? ''
    gmPersonaDraft = campaign.settings?.gmPersona ?? ''
    intensityValue = campaign.settings?.nsfwIntensity ?? 0
  })

  $effect(() => {
    if (campaign.current && !ruleset.loaded) void ruleset.loadAll()
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

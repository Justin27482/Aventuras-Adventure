<script lang="ts">
  import { settings } from '$lib/stores/settings.svelte'
  import { debug } from '$lib/stores/debug.svelte'
  import { ui } from '$lib/stores/ui.svelte'
  import { database } from '$lib/services/database'
  import { generatePlainText } from '$lib/services/ai/sdk'
  import {
    APPEARANCE_DESCRIPTOR_LABELS_SETTING_KEY,
    DEFAULT_VISUAL_DESCRIPTOR_LABELS,
  } from '$lib/utils/visualDescriptors'
  import type { VisualDescriptorLabel } from '$lib/types'
  import {
    ChevronDown,
    RotateCcw,
    FolderOpen,
    BookOpen,
    Brain,
    Search,
    Bug,
    Code2,
    Crown,
    Layers,
    ListTree,
    Sparkles,
    ExternalLink,
    Database,
  } from 'lucide-svelte'
  import { Switch } from '$lib/components/ui/switch'
  import { Label } from '$lib/components/ui/label'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Slider } from '$lib/components/ui/slider'
  import * as Collapsible from '$lib/components/ui/collapsible'
  import { Separator } from '$lib/components/ui/separator'

  // Section visibility state
  let showLorebookImportSection = $state(false)
  let showLoreManagementSection = $state(false)
  let showClassifierSection = $state(false)
  let showEntryRetrievalSection = $state(false)
  let showContextWindowSection = $state(false)
  let showLorebookLimitsSection = $state(false)
  let showAgenticRetrievalSection = $state(false)
  let showAppearanceLabelsSection = $state(false)
  let appearanceLabels = $state<VisualDescriptorLabel[]>([])
  let newAppearanceLabel = $state('')
  let newAppearanceLabelGate = $state('0')
  let appearanceLabelsError = $state<string | null>(null)
  let appearanceLabelsLoaded = $state(false)
  let editingAppearanceLabelKey = $state<string | null>(null)
  let isGeneratingAppearanceHint = $state(false)

  async function loadAppearanceLabels() {
    if (appearanceLabelsLoaded) return
    try {
      const stored = await database.getSetting(APPEARANCE_DESCRIPTOR_LABELS_SETTING_KEY)
      const parsed = stored ? (JSON.parse(stored) as VisualDescriptorLabel[]) : []
      appearanceLabels = parsed.filter(
        (label) =>
          typeof label.key === 'string' &&
          typeof label.label === 'string' &&
          Number.isInteger(label.minNsfwIntensity),
      )
      appearanceLabelsLoaded = true
    } catch (error) {
      appearanceLabelsError = error instanceof Error ? error.message : 'Unable to load appearance labels.'
    }
  }

  async function saveAppearanceLabels(labels: VisualDescriptorLabel[]) {
    await database.setSetting(APPEARANCE_DESCRIPTOR_LABELS_SETTING_KEY, JSON.stringify(labels))
    appearanceLabels = labels
  }

  function customLabelKey(label: string): string {
    return label
      .replace(/[^a-zA-Z0-9]+(.)/g, (_, character: string) => character.toUpperCase())
      .replace(/^[A-Z]/, (character) => character.toLowerCase())
  }

  async function generateAppearanceHint(label: string): Promise<string> {
    const hint = await generatePlainText(
      {
        presetId: 'agentic',
        system:
          'You write concise input hints for a tabletop RPG character appearance form. Return only a neutral, practical hint of 4 to 8 words. Do not include sexuality, biography, personality, or a label prefix.',
        prompt: `Write a helpful form hint for the appearance label "${label}".`,
      },
      'appearanceLabelHint',
    )
    return hint.trim().replace(/^['"]|['"]$/g, '')
  }

  async function addAppearanceLabel() {
    const label = newAppearanceLabel.trim()
    const minNsfwIntensity = Number(newAppearanceLabelGate)
    if (!label) {
      appearanceLabelsError = 'Enter a label name.'
      return
    }
    if (!Number.isInteger(minNsfwIntensity) || minNsfwIntensity < 0 || minNsfwIntensity > 8) {
      appearanceLabelsError = 'The required intensity must be a whole number from 0 to 8.'
      return
    }
    const key = customLabelKey(label)
    if (
      !key ||
      DEFAULT_VISUAL_DESCRIPTOR_LABELS.some((entry) => entry.key === key) ||
      appearanceLabels.some(
        (entry) => entry.key === key || entry.label.toLowerCase() === label.toLowerCase(),
      )
    ) {
      appearanceLabelsError = 'That appearance label already exists.'
      return
    }

    isGeneratingAppearanceHint = true
    appearanceLabelsError = null
    try {
      const hint = await generateAppearanceHint(label)
      await saveAppearanceLabels([
        ...appearanceLabels,
        { key, label, minNsfwIntensity, hint },
      ])
      newAppearanceLabel = ''
      newAppearanceLabelGate = '0'
    } catch (error) {
      appearanceLabelsError = error instanceof Error ? error.message : 'Unable to add appearance label.'
    } finally {
      isGeneratingAppearanceHint = false
    }
  }

  async function updateAppearanceLabel(updated: VisualDescriptorLabel) {
    appearanceLabelsError = null
    try {
      await saveAppearanceLabels(
        appearanceLabels.map((label) => (label.key === updated.key ? updated : label)),
      )
      editingAppearanceLabelKey = null
    } catch (error) {
      appearanceLabelsError = error instanceof Error ? error.message : 'Unable to save appearance label.'
    }
  }

  async function deleteAppearanceLabel(key: string) {
    appearanceLabelsError = null
    try {
      await saveAppearanceLabels(appearanceLabels.filter((label) => label.key !== key))
    } catch (error) {
      appearanceLabelsError = error instanceof Error ? error.message : 'Unable to delete appearance label.'
    }
  }

  // Manual mode toggle handler
  async function handleManualModeToggle(checked: boolean) {
    await settings.setAdvancedManualMode(checked)
  }

  // Debug mode toggle handler
  function handleDebugModeToggle(checked: boolean) {
    settings.setDebugMode(checked)
  }

  function handleGMModeToggle(checked: boolean) {
    settings.setGMMode(checked)
  }

  async function handleOpenDebugLogsWindow() {
    await debug.popOutDebug()
  }

  function handleOpenMigrationLog() {
    ui.closeSettings()
    setTimeout(() => ui.openMigrationLog(), 0)
  }

  $effect(() => {
    if (showAppearanceLabelsSection) void loadAppearanceLabels()
  })
</script>

<div class="space-y-6">
  <!-- General Settings -->
  <div class="space-y-4">
    <!-- Manual Request Mode -->
    <div class="flex flex-row items-center justify-between">
      <div class="space-y-0.5">
        <div class="flex items-center gap-2">
          <Code2 class="text-muted-foreground h-4 w-4" />
          <Label>Manual Request Mode</Label>
        </div>
        <p class="text-muted-foreground text-xs">
          Edit full request body parameters for advanced models.
        </p>
        {#if settings.advancedRequestSettings.manualMode}
          <p class="pt-1 text-xs font-medium text-amber-500">
            Manual mode active. Temperature and max token controls are locked.
          </p>
        {/if}
      </div>
      <Switch
        checked={settings.advancedRequestSettings.manualMode}
        onCheckedChange={handleManualModeToggle}
      />
    </div>

    <!-- GM Mode -->
    <div class="flex flex-row items-center justify-between">
      <div class="space-y-0.5">
        <div class="flex items-center gap-2">
          <Crown class="text-muted-foreground h-4 w-4" />
          <Label>GM Mode</Label>
        </div>
        <p class="text-muted-foreground text-xs">
          Enable director-level controls for scene, roll, party, and world-state changes.
        </p>
        {#if settings.uiSettings.gmMode}
          <p class="pt-1 text-xs font-medium text-amber-500">
            GM Mode active. Manual campaign control surfaces may appear during play.
          </p>
        {/if}
      </div>
      <Switch checked={settings.uiSettings.gmMode} onCheckedChange={handleGMModeToggle} />
    </div>

    <!-- Debug Mode -->
    <div class="flex flex-row items-center justify-between">
      <div class="space-y-0.5">
        <div class="flex items-center gap-2">
          <Bug class="text-muted-foreground h-4 w-4" />
          <Label>Debug Mode</Label>
        </div>
        <p class="text-muted-foreground text-xs">Log API requests and responses for debugging.</p>
        {#if settings.uiSettings.debugMode}
          <p class="pt-1 text-xs font-medium text-amber-500">
            Logs are session-only and not persisted.
          </p>
        {/if}
      </div>
      <Switch checked={settings.uiSettings.debugMode} onCheckedChange={handleDebugModeToggle} />
    </div>

    {#if settings.uiSettings.debugMode}
      <div class="flex flex-row items-center justify-between rounded-md border border-dashed p-3">
        <div class="space-y-0.5">
          <div class="flex items-center gap-2">
            <ListTree class="text-muted-foreground h-4 w-4" />
            <Label>API Debug Logs</Label>
          </div>
          <p class="text-muted-foreground text-xs">
            Open the live request/response log list from settings.
          </p>
        </div>
        <Button variant="outline" size="sm" class="gap-2" onclick={handleOpenDebugLogsWindow}>
          <ExternalLink class="h-4 w-4" />
          Open Logs Window
        </Button>
      </div>
    {/if}

    <div class="flex flex-row items-center justify-between rounded-md border border-dashed p-3">
      <div class="space-y-0.5">
        <div class="flex items-center gap-2">
          <Database class="text-muted-foreground h-4 w-4" />
          <Label>Database Migration Log</Label>
        </div>
        <p class="text-muted-foreground text-xs">
          Inspect applied migrations, affected database objects, checksums, and SQL text.
        </p>
      </div>
      <Button variant="outline" size="sm" class="gap-2" onclick={handleOpenMigrationLog}>
        <ListTree class="h-4 w-4" />
        Open Migration Log
      </Button>
    </div>
  </div>

  <Separator />

  <!-- Service Configurations -->
  <div class="space-y-3">
    <div class="bg-card text-card-foreground rounded-lg border shadow-sm">
      <Collapsible.Root bind:open={showAppearanceLabelsSection}>
        <div class="flex items-center gap-3 p-3 pl-4">
          <Collapsible.Trigger class="group/trigger flex flex-1 items-center gap-2 text-left">
            <div class="bg-primary/10 text-primary flex h-8 w-8 items-center justify-center rounded-md">
              <Sparkles class="h-4 w-4" />
            </div>
            <div class="flex-1">
              <Label class="leading-none font-medium">Appearance Labels</Label>
              <p class="text-muted-foreground mt-1 text-xs">
                Global fields and content-intensity gates for character appearance.
              </p>
            </div>
          </Collapsible.Trigger>
          <Collapsible.Trigger>
            {#snippet child({ props })}
              <Button {...props} variant="ghost" size="icon" class="h-8 w-8">
                <ChevronDown
                  class={`h-4 w-4 transition-transform duration-200 ${showAppearanceLabelsSection ? 'rotate-180' : ''}`}
                />
                <span class="sr-only">Toggle appearance labels</span>
              </Button>
            {/snippet}
          </Collapsible.Trigger>
        </div>

        <Collapsible.Content>
          <div class="bg-muted/10 space-y-4 border-t p-4">
            <p class="text-muted-foreground text-xs">
              Built-in labels are always available. Custom labels are global across campaigns and appear only when a campaign meets their minimum content intensity.
            </p>
            <div class="grid gap-2 sm:grid-cols-[1fr_96px_auto]">
              <div class="space-y-1">
                <Label for="appearance-label-name">New label</Label>
                <Input id="appearance-label-name" bind:value={newAppearanceLabel} placeholder="e.g. Presence" />
              </div>
              <div class="space-y-1">
                <Label for="appearance-label-gate">Min. level</Label>
                <Input id="appearance-label-gate" type="number" min="0" max="8" bind:value={newAppearanceLabelGate} />
              </div>
              <Button class="self-end" onclick={addAppearanceLabel} disabled={isGeneratingAppearanceHint}>
                {isGeneratingAppearanceHint ? 'Creating...' : 'Add label'}
              </Button>
            </div>

            {#if appearanceLabels.length > 0}
              <div class="space-y-2">
                {#each appearanceLabels as label (label.key)}
                  {#if editingAppearanceLabelKey === label.key}
                    <div class="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_96px]">
                      <div class="space-y-1"><Label>Label</Label><Input bind:value={label.label} /></div>
                      <div class="space-y-1"><Label>Min. level</Label><Input type="number" min="0" max="8" bind:value={label.minNsfwIntensity} /></div>
                      <div class="sm:col-span-2 space-y-1"><Label>Hint</Label><Input bind:value={label.hint} placeholder="Field-specific input guidance" /></div>
                      <div class="flex gap-2 sm:col-span-2"><Button size="sm" onclick={() => updateAppearanceLabel(label)}>Save</Button><Button size="sm" variant="outline" onclick={() => (editingAppearanceLabelKey = null)}>Cancel</Button></div>
                    </div>
                  {:else}
                    <div class="flex items-center justify-between gap-3 rounded-md border p-3">
                      <div class="min-w-0"><p class="text-sm font-medium">{label.label} <span class="text-muted-foreground font-normal">Level {label.minNsfwIntensity}+</span></p><p class="text-muted-foreground truncate text-xs">{label.hint || 'No hint configured'}</p></div>
                      <div class="flex gap-1"><Button size="sm" variant="outline" onclick={() => (editingAppearanceLabelKey = label.key)}>Edit</Button><Button size="sm" variant="destructive" onclick={() => deleteAppearanceLabel(label.key)}>Delete</Button></div>
                    </div>
                  {/if}
                {/each}
              </div>
            {:else if appearanceLabelsLoaded}
              <p class="text-muted-foreground text-xs">No custom appearance labels yet.</p>
            {/if}

            {#if appearanceLabelsError}<p class="text-destructive text-xs">{appearanceLabelsError}</p>{/if}
          </div>
        </Collapsible.Content>
      </Collapsible.Root>
    </div>

    <!-- Lorebook Import Settings -->
    <div class="bg-card text-card-foreground rounded-lg border shadow-sm">
      <Collapsible.Root bind:open={showLorebookImportSection}>
        <div class="flex items-center gap-3 p-3 pl-4">
          <Collapsible.Trigger class="group/trigger flex flex-1 items-center gap-2 text-left">
            <div
              class="flex h-8 w-8 items-center justify-center rounded-md bg-green-500/10 transition-colors group-hover/trigger:bg-green-500/20"
            >
              <FolderOpen class="h-4 w-4 text-green-500" />
            </div>
            <div class="flex-1">
              <Label class="leading-none font-medium">Lorebook Import</Label>
              <p class="text-muted-foreground mt-1 text-xs">Batch size and concurrency</p>
            </div>
          </Collapsible.Trigger>
          <div class="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              class="h-8 w-8"
              onclick={() => settings.resetLorebookClassifierSpecificSettings()}
              title="Reset to default"
            >
              <RotateCcw class="h-3.5 w-3.5" />
            </Button>
            <Collapsible.Trigger>
              {#snippet child({ props })}
                <Button {...props} variant="ghost" size="icon" class="h-8 w-8">
                  {#if showLorebookImportSection}
                    <ChevronDown class="h-4 w-4 rotate-180 transition-transform duration-200" />
                  {:else}
                    <ChevronDown class="h-4 w-4 transition-transform duration-200" />
                  {/if}
                  <span class="sr-only">Toggle</span>
                </Button>
              {/snippet}
            </Collapsible.Trigger>
          </div>
        </div>

        <Collapsible.Content>
          <div class="bg-muted/10 space-y-6 border-t p-4">
            <!-- Batch Size -->
            <div class="space-y-3">
              <div class="flex justify-between">
                <Label>Batch Size</Label>
                <span class="bg-muted rounded px-2 py-0.5 text-xs font-medium">
                  {settings.serviceSpecificSettings.lorebookClassifier?.batchSize ?? 50}
                </span>
              </div>
              <Slider
                value={settings.serviceSpecificSettings.lorebookClassifier?.batchSize ?? 50}
                min={10}
                max={100}
                step={10}
                type="single"
                onValueChange={(v) => {
                  settings.serviceSpecificSettings.lorebookClassifier.batchSize = v
                  settings.saveServiceSpecificSettings()
                }}
              />
              <div
                class="text-muted-foreground flex justify-between text-[10px] font-medium tracking-wider uppercase"
              >
                <span>Reliable</span>
                <span>Fast</span>
              </div>
            </div>

            <!-- Max Concurrent -->
            <div class="space-y-3">
              <div class="flex justify-between">
                <Label>Max Concurrent Requests</Label>
                <span class="bg-muted rounded px-2 py-0.5 text-xs font-medium">
                  {settings.serviceSpecificSettings.lorebookClassifier?.maxConcurrent ?? 5}
                </span>
              </div>
              <Slider
                value={settings.serviceSpecificSettings.lorebookClassifier?.maxConcurrent ?? 5}
                min={1}
                max={10}
                step={1}
                type="single"
                onValueChange={(v) => {
                  settings.serviceSpecificSettings.lorebookClassifier.maxConcurrent = v
                  settings.saveServiceSpecificSettings()
                }}
              />
              <div
                class="text-muted-foreground flex justify-between text-[10px] font-medium tracking-wider uppercase"
              >
                <span>Sequential</span>
                <span>Parallel</span>
              </div>
            </div>
          </div>
        </Collapsible.Content>
      </Collapsible.Root>
    </div>

    <!-- Lore Management Settings -->
    <div class="bg-card text-card-foreground rounded-lg border shadow-sm">
      <Collapsible.Root bind:open={showLoreManagementSection}>
        <div class="flex items-center gap-3 p-3 pl-4">
          <Collapsible.Trigger class="group/trigger flex flex-1 items-center gap-2 text-left">
            <div
              class="flex h-8 w-8 items-center justify-center rounded-md bg-purple-500/10 transition-colors group-hover/trigger:bg-purple-500/20"
            >
              <BookOpen class="h-4 w-4 text-purple-500" />
            </div>
            <div class="flex-1">
              <Label class="leading-none font-medium">Lore Management</Label>
              <p class="text-muted-foreground mt-1 text-xs">Autonomous agent iteration limits</p>
            </div>
          </Collapsible.Trigger>
          <div class="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              class="h-8 w-8"
              onclick={() => settings.resetLoreManagementSettings()}
              title="Reset to default"
            >
              <RotateCcw class="h-3.5 w-3.5" />
            </Button>
            <Collapsible.Trigger>
              {#snippet child({ props })}
                <Button {...props} variant="ghost" size="icon" class="h-8 w-8">
                  {#if showLoreManagementSection}
                    <ChevronDown class="h-4 w-4 rotate-180 transition-transform duration-200" />
                  {:else}
                    <ChevronDown class="h-4 w-4 transition-transform duration-200" />
                  {/if}
                  <span class="sr-only">Toggle</span>
                </Button>
              {/snippet}
            </Collapsible.Trigger>
          </div>
        </div>

        <Collapsible.Content>
          <div class="bg-muted/10 space-y-6 border-t p-4">
            <!-- Max Iterations -->
            <div class="space-y-3">
              <div class="flex justify-between">
                <Label>Max Iterations</Label>
                <span class="bg-muted rounded px-2 py-0.5 text-xs font-medium">
                  {settings.systemServicesSettings.loreManagement?.maxIterations ?? 50}
                </span>
              </div>
              <Slider
                value={settings.systemServicesSettings.loreManagement?.maxIterations ?? 50}
                min={10}
                max={100}
                step={5}
                type="single"
                onValueChange={(v) => {
                  settings.systemServicesSettings.loreManagement.maxIterations = v
                  settings.saveSystemServicesSettings()
                }}
              />
              <div
                class="text-muted-foreground flex justify-between text-[10px] font-medium tracking-wider uppercase"
              >
                <span>Conservative</span>
                <span>Extensive</span>
              </div>
            </div>
          </div>
        </Collapsible.Content>
      </Collapsible.Root>
    </div>

    <!-- Classifier Settings -->
    <div class="bg-card text-card-foreground rounded-lg border shadow-sm">
      <Collapsible.Root bind:open={showClassifierSection}>
        <div class="flex items-center gap-3 p-3 pl-4">
          <Collapsible.Trigger class="group/trigger flex flex-1 items-center gap-2 text-left">
            <div
              class="flex h-8 w-8 items-center justify-center rounded-md bg-cyan-500/10 transition-colors group-hover/trigger:bg-cyan-500/20"
            >
              <Brain class="h-4 w-4 text-cyan-500" />
            </div>
            <div class="flex-1">
              <Label class="leading-none font-medium">World State Classifier</Label>
              <p class="text-muted-foreground mt-1 text-xs">Context window management</p>
            </div>
          </Collapsible.Trigger>
          <div class="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              class="h-8 w-8"
              onclick={() => settings.resetClassifierSettings()}
              title="Reset to default"
            >
              <RotateCcw class="h-3.5 w-3.5" />
            </Button>
            <Collapsible.Trigger>
              {#snippet child({ props })}
                <Button {...props} variant="ghost" size="icon" class="h-8 w-8">
                  {#if showClassifierSection}
                    <ChevronDown class="h-4 w-4 rotate-180 transition-transform duration-200" />
                  {:else}
                    <ChevronDown class="h-4 w-4 transition-transform duration-200" />
                  {/if}
                  <span class="sr-only">Toggle</span>
                </Button>
              {/snippet}
            </Collapsible.Trigger>
          </div>
        </div>

        <Collapsible.Content>
          <div class="bg-muted/10 space-y-6 border-t p-4">
            <!-- Chat History Truncation -->
            <div class="space-y-3">
              <div class="flex justify-between">
                <Label>Chat History Truncation (Words)</Label>
                <span class="bg-muted rounded px-2 py-0.5 text-xs font-medium">
                  {settings.systemServicesSettings.classifier?.chatHistoryTruncation === 0
                    ? 'No Limit'
                    : (settings.systemServicesSettings.classifier?.chatHistoryTruncation ?? 0)}
                </span>
              </div>
              <Slider
                value={settings.systemServicesSettings.classifier?.chatHistoryTruncation ?? 0}
                min={0}
                max={500}
                step={50}
                type="single"
                onValueChange={(v) => {
                  settings.systemServicesSettings.classifier.chatHistoryTruncation = v
                  settings.saveSystemServicesSettings()
                }}
              />
              <div
                class="text-muted-foreground flex justify-between text-[10px] font-medium tracking-wider uppercase"
              >
                <span>Unlimited</span>
                <span>500 Words</span>
              </div>
            </div>
          </div>
        </Collapsible.Content>
      </Collapsible.Root>
    </div>

    <!-- Entry Retrieval Settings -->
    <div class="bg-card text-card-foreground rounded-lg border shadow-sm">
      <Collapsible.Root bind:open={showEntryRetrievalSection}>
        <div class="flex items-center gap-3 p-3 pl-4">
          <Collapsible.Trigger class="group/trigger flex flex-1 items-center gap-2 text-left">
            <div
              class="flex h-8 w-8 items-center justify-center rounded-md bg-amber-500/10 transition-colors group-hover/trigger:bg-amber-500/20"
            >
              <Search class="h-4 w-4 text-amber-500" />
            </div>
            <div class="flex-1">
              <Label class="leading-none font-medium">Entry Retrieval</Label>
              <p class="text-muted-foreground mt-1 text-xs">LLM-based selection settings</p>
            </div>
          </Collapsible.Trigger>
          <div class="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              class="h-8 w-8"
              onclick={() => settings.resetEntryRetrievalSettings()}
              title="Reset to default"
            >
              <RotateCcw class="h-3.5 w-3.5" />
            </Button>
            <Collapsible.Trigger>
              {#snippet child({ props })}
                <Button {...props} variant="ghost" size="icon" class="h-8 w-8">
                  {#if showEntryRetrievalSection}
                    <ChevronDown class="h-4 w-4 rotate-180 transition-transform duration-200" />
                  {:else}
                    <ChevronDown class="h-4 w-4 transition-transform duration-200" />
                  {/if}
                  <span class="sr-only">Toggle</span>
                </Button>
              {/snippet}
            </Collapsible.Trigger>
          </div>
        </div>

        <Collapsible.Content>
          <div class="bg-muted/10 space-y-6 border-t p-4">
            <!-- Enable LLM Selection -->
            <div class="flex flex-row items-center justify-between">
              <div class="space-y-0.5">
                <Label class="text-sm">Enable LLM Selection</Label>
                <p class="text-muted-foreground text-xs">
                  Use LLM to intelligently select lorebook entries
                </p>
              </div>
              <Switch
                checked={settings.systemServicesSettings.entryRetrieval?.enableLLMSelection ?? true}
                onCheckedChange={(v) => {
                  settings.systemServicesSettings.entryRetrieval.enableLLMSelection = v
                  settings.saveSystemServicesSettings()
                }}
              />
            </div>

            <!-- Max Tier 3 Entries -->
            <div class="space-y-3">
              <div class="flex justify-between">
                <Label>Max Tier 3 Entries</Label>
                <span class="bg-muted rounded px-2 py-0.5 text-xs font-medium">
                  {settings.systemServicesSettings.entryRetrieval?.maxTier3Entries === 0
                    ? 'Unlimited'
                    : (settings.systemServicesSettings.entryRetrieval?.maxTier3Entries ?? 0)}
                </span>
              </div>
              <Slider
                value={settings.systemServicesSettings.entryRetrieval?.maxTier3Entries ?? 0}
                min={0}
                max={20}
                step={1}
                type="single"
                onValueChange={(v) => {
                  settings.systemServicesSettings.entryRetrieval.maxTier3Entries = v
                  settings.saveSystemServicesSettings()
                }}
              />
              <div
                class="text-muted-foreground flex justify-between text-[10px] font-medium tracking-wider uppercase"
              >
                <span>Unlimited</span>
                <span>20 Entries</span>
              </div>
            </div>

            <!-- Max Words Per Entry -->
            <div class="space-y-3">
              <div class="flex justify-between">
                <Label>Max Words Per Entry</Label>
                <span class="bg-muted rounded px-2 py-0.5 text-xs font-medium">
                  {settings.systemServicesSettings.entryRetrieval?.maxWordsPerEntry === 0
                    ? 'Unlimited'
                    : (settings.systemServicesSettings.entryRetrieval?.maxWordsPerEntry ?? 0)}
                </span>
              </div>
              <Slider
                value={settings.systemServicesSettings.entryRetrieval?.maxWordsPerEntry ?? 0}
                min={0}
                max={1000}
                step={50}
                type="single"
                onValueChange={(v) => {
                  settings.systemServicesSettings.entryRetrieval.maxWordsPerEntry = v
                  settings.saveSystemServicesSettings()
                }}
              />
              <div
                class="text-muted-foreground flex justify-between text-[10px] font-medium tracking-wider uppercase"
              >
                <span>Unlimited</span>
                <span>1000 Words</span>
              </div>
            </div>
          </div>
        </Collapsible.Content>
      </Collapsible.Root>
    </div>

    <!-- Memory Retrieval Settings -->
    <div class="bg-card text-card-foreground rounded-lg border shadow-sm">
      <Collapsible.Root bind:open={showAgenticRetrievalSection}>
        <div class="flex items-center gap-3 p-3 pl-4">
          <Collapsible.Trigger class="group/trigger flex flex-1 items-center gap-2 text-left">
            <div
              class="flex h-8 w-8 items-center justify-center rounded-md bg-pink-500/10 transition-colors group-hover/trigger:bg-pink-500/20"
            >
              <Sparkles class="h-4 w-4 text-pink-500" />
            </div>
            <div class="flex-1">
              <Label class="leading-none font-medium">Memory Retrieval</Label>
              <p class="text-muted-foreground mt-1 text-xs">
                How past sessions are retrieved for context
              </p>
            </div>
          </Collapsible.Trigger>
          <div class="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              class="h-8 w-8"
              onclick={() => {
                settings.resetTimelineFillSettings()
                settings.resetAgenticRetrievalSpecificSettings()
              }}
              title="Reset to default"
            >
              <RotateCcw class="h-3.5 w-3.5" />
            </Button>
            <Collapsible.Trigger>
              {#snippet child({ props })}
                <Button {...props} variant="ghost" size="icon" class="h-8 w-8">
                  {#if showAgenticRetrievalSection}
                    <ChevronDown class="h-4 w-4 rotate-180 transition-transform duration-200" />
                  {:else}
                    <ChevronDown class="h-4 w-4 transition-transform duration-200" />
                  {/if}
                  <span class="sr-only">Toggle</span>
                </Button>
              {/snippet}
            </Collapsible.Trigger>
          </div>
        </div>

        <Collapsible.Content>
          <div class="bg-muted/10 space-y-6 border-t p-4">
            <!-- Enable Memory Retrieval -->
            <div class="flex flex-row items-center justify-between">
              <div class="space-y-0.5">
                <Label class="text-sm">Enable Memory Retrieval</Label>
                <p class="text-muted-foreground text-xs">
                  Retrieve context from past chapters during generation
                </p>
              </div>
              <Switch
                checked={settings.systemServicesSettings.timelineFill?.enabled ?? true}
                onCheckedChange={(v) => {
                  settings.systemServicesSettings.timelineFill.enabled = v
                  settings.saveSystemServicesSettings()
                }}
              />
            </div>

            {#if settings.systemServicesSettings.timelineFill?.enabled}
              <!-- Mode Selection -->
              <div class="space-y-3">
                <Label>Retrieval Mode</Label>
                <div class="grid grid-cols-2 gap-2">
                  <button
                    class="flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors {settings
                      .systemServicesSettings.timelineFill?.mode === 'static' ||
                    !settings.systemServicesSettings.timelineFill?.mode
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/50'}"
                    onclick={() => {
                      settings.systemServicesSettings.timelineFill.mode = 'static'
                      settings.saveSystemServicesSettings()
                    }}
                  >
                    <span class="text-sm font-medium">Static</span>
                    <span class="text-muted-foreground text-xs">
                      Generates questions, then answers them from chapters
                    </span>
                  </button>
                  <button
                    class="flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors {settings
                      .systemServicesSettings.timelineFill?.mode === 'agentic'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/50'}"
                    onclick={() => {
                      settings.systemServicesSettings.timelineFill.mode = 'agentic'
                      settings.saveSystemServicesSettings()
                    }}
                  >
                    <span class="text-sm font-medium">Agentic</span>
                    <span class="text-muted-foreground text-xs">
                      LLM agent explores chapters and entries with tools
                    </span>
                  </button>
                </div>
              </div>

              <!-- Static Mode Options -->
              {#if settings.systemServicesSettings.timelineFill?.mode === 'static' || !settings.systemServicesSettings.timelineFill?.mode}
                <div class="space-y-3">
                  <div class="flex justify-between">
                    <Label>Max Queries</Label>
                    <span class="bg-muted rounded px-2 py-0.5 text-xs font-medium">
                      {settings.systemServicesSettings.timelineFill?.maxQueries ?? 5}
                    </span>
                  </div>
                  <Slider
                    value={settings.systemServicesSettings.timelineFill?.maxQueries ?? 5}
                    min={1}
                    max={10}
                    step={1}
                    type="single"
                    onValueChange={(v) => {
                      settings.systemServicesSettings.timelineFill.maxQueries = v
                      settings.saveSystemServicesSettings()
                    }}
                  />
                  <p class="text-muted-foreground text-xs">
                    Number of questions generated to query chapter history
                  </p>
                </div>
              {/if}

              <!-- Agentic Mode Options -->
              {#if settings.systemServicesSettings.timelineFill?.mode === 'agentic'}
                <div class="space-y-3">
                  <div class="flex justify-between">
                    <Label>Max Iterations</Label>
                    <span class="bg-muted rounded px-2 py-0.5 text-xs font-medium">
                      {settings.systemServicesSettings.agenticRetrieval?.maxIterations ?? 30}
                    </span>
                  </div>
                  <Slider
                    value={settings.systemServicesSettings.agenticRetrieval?.maxIterations ?? 30}
                    min={1}
                    max={30}
                    step={1}
                    type="single"
                    onValueChange={(v) => {
                      settings.systemServicesSettings.agenticRetrieval.maxIterations = v
                      settings.saveSystemServicesSettings()
                    }}
                  />
                  <p class="text-muted-foreground text-xs">
                    Maximum tool-calling rounds for the retrieval agent
                  </p>
                </div>
              {/if}
            {/if}
          </div>
        </Collapsible.Content>
      </Collapsible.Root>
    </div>

    <!-- Context Window Settings -->
    <div class="bg-card text-card-foreground rounded-lg border shadow-sm">
      <Collapsible.Root bind:open={showContextWindowSection}>
        <div class="flex items-center gap-3 p-3 pl-4">
          <Collapsible.Trigger class="group/trigger flex flex-1 items-center gap-2 text-left">
            <div
              class="flex h-8 w-8 items-center justify-center rounded-md bg-blue-500/10 transition-colors group-hover/trigger:bg-blue-500/20"
            >
              <Layers class="h-4 w-4 text-blue-500" />
            </div>
            <div class="flex-1">
              <Label class="leading-none font-medium">Context Window</Label>
              <p class="text-muted-foreground mt-1 text-xs">
                Recent entries included in AI operations
              </p>
            </div>
          </Collapsible.Trigger>
          <div class="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              class="h-8 w-8"
              onclick={() => settings.resetContextWindowSettings()}
              title="Reset to default"
            >
              <RotateCcw class="h-3.5 w-3.5" />
            </Button>
            <Collapsible.Trigger>
              {#snippet child({ props })}
                <Button {...props} variant="ghost" size="icon" class="h-8 w-8">
                  {#if showContextWindowSection}
                    <ChevronDown class="h-4 w-4 rotate-180 transition-transform duration-200" />
                  {:else}
                    <ChevronDown class="h-4 w-4 transition-transform duration-200" />
                  {/if}
                  <span class="sr-only">Toggle</span>
                </Button>
              {/snippet}
            </Collapsible.Trigger>
          </div>
        </div>

        <Collapsible.Content>
          <div class="bg-muted/10 space-y-6 border-t p-4">
            <!-- Retrieval Context -->
            <div class="space-y-3">
              <div class="flex justify-between">
                <Label>Retrieval/Classification</Label>
                <span class="bg-muted rounded px-2 py-0.5 text-xs font-medium">
                  {settings.serviceSpecificSettings.contextWindow?.recentEntriesForRetrieval ?? 5} entries
                </span>
              </div>
              <Slider
                value={settings.serviceSpecificSettings.contextWindow?.recentEntriesForRetrieval ??
                  5}
                min={2}
                max={15}
                step={1}
                type="single"
                onValueChange={(v) => {
                  settings.serviceSpecificSettings.contextWindow.recentEntriesForRetrieval = v
                  settings.saveServiceSpecificSettings()
                }}
              />
              <p class="text-muted-foreground text-xs">
                Entries for retrieval and classification operations
              </p>
            </div>

            <!-- Tiered Context -->
            <div class="space-y-3">
              <div class="flex justify-between">
                <Label>Tiered Context Building</Label>
                <span class="bg-muted rounded px-2 py-0.5 text-xs font-medium">
                  {settings.serviceSpecificSettings.contextWindow?.recentEntriesForTiered ?? 10} entries
                </span>
              </div>
              <Slider
                value={settings.serviceSpecificSettings.contextWindow?.recentEntriesForTiered ?? 10}
                min={3}
                max={20}
                step={1}
                type="single"
                onValueChange={(v) => {
                  settings.serviceSpecificSettings.contextWindow.recentEntriesForTiered = v
                  settings.saveServiceSpecificSettings()
                }}
              />
              <p class="text-muted-foreground text-xs">Entries for lorebook entry injection</p>
            </div>

            <!-- Action Choices Context -->
            <div class="space-y-3">
              <div class="flex justify-between">
                <Label>Action Choices</Label>
                <span class="bg-muted rounded px-2 py-0.5 text-xs font-medium">
                  {settings.serviceSpecificSettings.contextWindow?.recentEntriesForChoices ?? 5} entries
                </span>
              </div>
              <Slider
                value={settings.serviceSpecificSettings.contextWindow?.recentEntriesForChoices ?? 5}
                min={1}
                max={10}
                step={1}
                type="single"
                onValueChange={(v) => {
                  settings.serviceSpecificSettings.contextWindow.recentEntriesForChoices = v
                  settings.saveServiceSpecificSettings()
                }}
              />
              <p class="text-muted-foreground text-xs">Entries for generating action choices</p>
            </div>
          </div>
        </Collapsible.Content>
      </Collapsible.Root>
    </div>

    <!-- Lorebook Limits Settings -->
    <div class="bg-card text-card-foreground rounded-lg border shadow-sm">
      <Collapsible.Root bind:open={showLorebookLimitsSection}>
        <div class="flex items-center gap-3 p-3 pl-4">
          <Collapsible.Trigger class="group/trigger flex flex-1 items-center gap-2 text-left">
            <div
              class="flex h-8 w-8 items-center justify-center rounded-md bg-orange-500/10 transition-colors group-hover/trigger:bg-orange-500/20"
            >
              <ListTree class="h-4 w-4 text-orange-500" />
            </div>
            <div class="flex-1">
              <Label class="leading-none font-medium">Lorebook Limits</Label>
              <p class="text-muted-foreground mt-1 text-xs">Max entries injected per operation</p>
            </div>
          </Collapsible.Trigger>
          <div class="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              class="h-8 w-8"
              onclick={() => settings.resetLorebookLimitsSettings()}
              title="Reset to default"
            >
              <RotateCcw class="h-3.5 w-3.5" />
            </Button>
            <Collapsible.Trigger>
              {#snippet child({ props })}
                <Button {...props} variant="ghost" size="icon" class="h-8 w-8">
                  {#if showLorebookLimitsSection}
                    <ChevronDown class="h-4 w-4 rotate-180 transition-transform duration-200" />
                  {:else}
                    <ChevronDown class="h-4 w-4 transition-transform duration-200" />
                  {/if}
                  <span class="sr-only">Toggle</span>
                </Button>
              {/snippet}
            </Collapsible.Trigger>
          </div>
        </div>

        <Collapsible.Content>
          <div class="bg-muted/10 space-y-6 border-t p-4">
            <!-- Max for Suggestions -->
            <div class="space-y-3">
              <div class="flex justify-between">
                <Label>Suggestions</Label>
                <span class="bg-muted rounded px-2 py-0.5 text-xs font-medium">
                  {settings.serviceSpecificSettings.lorebookLimits?.maxForSuggestions ?? 15} entries
                </span>
              </div>
              <Slider
                value={settings.serviceSpecificSettings.lorebookLimits?.maxForSuggestions ?? 15}
                min={5}
                max={30}
                step={5}
                type="single"
                onValueChange={(v) => {
                  settings.serviceSpecificSettings.lorebookLimits.maxForSuggestions = v
                  settings.saveServiceSpecificSettings()
                }}
              />
              <p class="text-muted-foreground text-xs">Max entries for suggestion generation</p>
            </div>

            <!-- Max for Action Choices -->
            <div class="space-y-3">
              <div class="flex justify-between">
                <Label>Action Choices</Label>
                <span class="bg-muted rounded px-2 py-0.5 text-xs font-medium">
                  {settings.serviceSpecificSettings.lorebookLimits?.maxForActionChoices ?? 12} entries
                </span>
              </div>
              <Slider
                value={settings.serviceSpecificSettings.lorebookLimits?.maxForActionChoices ?? 12}
                min={5}
                max={25}
                step={1}
                type="single"
                onValueChange={(v) => {
                  settings.serviceSpecificSettings.lorebookLimits.maxForActionChoices = v
                  settings.saveServiceSpecificSettings()
                }}
              />
              <p class="text-muted-foreground text-xs">Max entries for action choice generation</p>
            </div>

            <!-- Max per Tier -->
            <div class="space-y-3">
              <div class="flex justify-between">
                <Label>Per Tier</Label>
                <span class="bg-muted rounded px-2 py-0.5 text-xs font-medium">
                  {settings.serviceSpecificSettings.lorebookLimits?.maxEntriesPerTier ?? 20} entries
                </span>
              </div>
              <Slider
                value={settings.serviceSpecificSettings.lorebookLimits?.maxEntriesPerTier ?? 20}
                min={3}
                max={20}
                step={1}
                type="single"
                onValueChange={(v) => {
                  settings.serviceSpecificSettings.lorebookLimits.maxEntriesPerTier = v
                  settings.saveServiceSpecificSettings()
                }}
              />
              <p class="text-muted-foreground text-xs">Max entries per injection tier</p>
            </div>

            <!-- LLM Threshold -->
            <div class="space-y-3">
              <div class="flex justify-between">
                <Label>LLM Selection Threshold</Label>
                <span class="bg-muted rounded px-2 py-0.5 text-xs font-medium">
                  {settings.serviceSpecificSettings.lorebookLimits?.llmThreshold ?? 30} entries
                </span>
              </div>
              <Slider
                value={settings.serviceSpecificSettings.lorebookLimits?.llmThreshold ?? 30}
                min={10}
                max={100}
                step={10}
                type="single"
                onValueChange={(v) => {
                  settings.serviceSpecificSettings.lorebookLimits.llmThreshold = v
                  settings.saveServiceSpecificSettings()
                }}
              />
              <p class="text-muted-foreground text-xs">
                Entry count that triggers LLM-based selection
              </p>
            </div>
          </div>
        </Collapsible.Content>
      </Collapsible.Root>
    </div>
  </div>
</div>

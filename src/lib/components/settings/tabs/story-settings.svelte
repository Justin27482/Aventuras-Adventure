<script lang="ts">
  import { onDestroy } from 'svelte'
  import { story } from '$lib/stores/story.svelte'
  import { hasRequiredCredentials } from '$lib/services/ai/image'
  import { templateEngine } from '$lib/services/templates/engine'
  import { PROMPT_TEMPLATES } from '$lib/services/prompts/templates'
  import WritingStyleFields from '$lib/components/shared/WritingStyleFields.svelte'
  import { Textarea } from '$lib/components/ui/textarea'
  import { Button } from '$lib/components/ui/button'
  import { Label } from '$lib/components/ui/label'
  import { Input } from '$lib/components/ui/input'
  import { Switch } from '$lib/components/ui/switch'
  import * as ResponsiveModal from '$lib/components/ui/responsive-modal'
  import { ui } from '$lib/stores/ui.svelte'
  import type { StorySettings } from '$lib/types'

  // Static — defined at module scope so they aren't re-created per component instance
  const KNOWN_VARIABLES = new Set([
    'mode',
    'pov',
    'tense',
    'genre',
    'tone',
    'themes',
    'settingDescription',
    'visualProseMode',
    'inlineImageMode',
    'protagonistName',
    'protagonistDescription',
    'currentLocation',
    'storyTime',
    'tieredContextBlock',
    'retrievedChapterContext',
    'chapterSummaries',
    'styleGuidance',
    'inlineImageInstructions',
    'moneySystemEnabled',
    'moneyName',
    'currentMoney',
    'moneyState',
    'visualProseInstructions',
    'runtimeVars_characters',
    'runtimeVars_locations',
    'runtimeVars_items',
    'runtimeVars_storyBeats',
    'runtimeVars_protagonist',
  ])

  const VARIABLE_REFERENCE = [
    {
      group: 'Protagonist',
      vars: [
        { name: 'protagonistName', desc: "Protagonist's name as set in World" },
        { name: 'protagonistDescription', desc: "Protagonist's description from World" },
      ],
    },
    {
      group: 'World',
      vars: [
        { name: 'currentLocation', desc: 'Current location name' },
        { name: 'storyTime', desc: 'In-story time (Year, Day, Hour, Minute)' },
        { name: 'moneyName', desc: 'Currency name configured for this story' },
        { name: 'currentMoney', desc: 'Current amount of money in this story' },
        { name: 'moneyState', desc: 'Formatted currency state, e.g. "42 gold"' },
        { name: 'genre', desc: 'Story genre' },
        { name: 'tone', desc: 'Writing tone' },
        { name: 'settingDescription', desc: 'World description' },
      ],
    },
    {
      group: 'Memory & Context',
      vars: [
        { name: 'tieredContextBlock', desc: 'Recent story memory injected by the memory system' },
        { name: 'chapterSummaries', desc: 'Summaries of past chapters' },
        { name: 'retrievedChapterContext', desc: 'Retrieved chapter context from memory' },
        { name: 'styleGuidance', desc: 'Style review guidance (when style reviewer is active)' },
      ],
    },
    {
      group: 'Runtime Variables',
      vars: [
        { name: 'runtimeVars_characters', desc: 'Runtime variable values for all characters' },
        { name: 'runtimeVars_protagonist', desc: 'Runtime variable values for the protagonist' },
        { name: 'runtimeVars_locations', desc: 'Runtime variable values for all locations' },
        { name: 'runtimeVars_items', desc: 'Runtime variable values for all items' },
        { name: 'runtimeVars_storyBeats', desc: 'Runtime variable values for all story beats' },
      ],
    },
  ]

  // Defined as a plain const so Svelte doesn't parse {{ }} as template expressions
  const promptPlaceholder =
    'Leave empty to use the default pack template. Use {{ protagonistName }}, {{ currentLocation }}, etc.'

  // ── Reactive state ────────────────────────────────────────────────────────────

  const storySettings = $derived(story.currentStory?.settings ?? {})
  const isAdventureStory = $derived(story.currentStory?.mode === 'adventure')
  const imageGenEnabled = $derived(hasRequiredCredentials())
  const DEFAULT_CLOTHING_ZONES = ['torso', 'chest', 'hips', 'legs', 'arms', 'hands', 'feet']
  const DEFAULT_MONEY_NAME = 'gold'
  const defaultClassifierEnabled = true
  const characterClassifierEnabled = $derived(storySettings.characterClassificationEnabled ?? true)
  const locationClassifierEnabled = $derived(storySettings.locationClassificationEnabled ?? true)
  const inventoryClassifierEnabled = $derived(
    storySettings.inventoryClassificationEnabled ?? defaultClassifierEnabled,
  )
  const storyBeatClassifierEnabled = $derived(storySettings.storyBeatClassificationEnabled ?? true)
  const sceneClassifierEnabled = $derived(storySettings.sceneClassificationEnabled ?? true)
  const timeClassifierEnabled = $derived(storySettings.timeClassificationEnabled ?? true)
  const runtimeVarClassifierEnabled = $derived(storySettings.runtimeVarClassificationEnabled ?? true)
  const moneyClassifierEnabled = $derived(
    !!storySettings.moneySystemEnabled &&
      (storySettings.moneyClassificationEnabled ?? defaultClassifierEnabled),
  )
  const itemFallbackEnabled = $derived(
    inventoryClassifierEnabled && (storySettings.itemAcquisitionFallbackEnabled ?? true),
  )
  const clothingFallbackEnabled = $derived(
    inventoryClassifierEnabled && (storySettings.clothingStateFallbackEnabled ?? true),
  )
  const moneyFallbackEnabled = $derived(
    moneyClassifierEnabled && (storySettings.moneyFallbackEnabled ?? true),
  )
  const moneyRecoveryEnabled = $derived(
    moneyClassifierEnabled && (storySettings.moneyRecoveryEnabled ?? true),
  )
  const editingPassBeforeDisplayEnabled = $derived(
    storySettings.editingPassBeforeDisplayEnabled ?? false,
  )

  // Track only customSystemPrompt so the effect below doesn't fire on unrelated
  // setting changes (tone, pov, etc.) and overwrite an unsaved draft.
  const savedCustomPrompt = $derived(story.currentStory?.settings?.customSystemPrompt)

  // Local draft — initialised and re-synced only when the saved value changes.
  // Two write sources (user input + external sync) make a writable $derived inapplicable.
  // eslint-disable-next-line svelte/prefer-writable-derived
  let customPromptDraft = $state('')
  $effect(() => {
    customPromptDraft = savedCustomPrompt ?? ''
  })

  let validationResult = $state<{ success: boolean; error?: string } | null>(null)
  let unknownVars = $state<string[]>([])
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let showVarReference = $state(false)
  let clothingZonesDraft = $state('')
  let moneyNameDraft = $state(DEFAULT_MONEY_NAME)
  let styleFieldsResetKey = $state(0)
  let transitionModalOpen = $state(false)
  let transitionLoading = $state(false)
  let pendingTransitionUpdates = $state<Partial<StorySettings> | null>(null)
  let pendingTransitionLabel = $state('')

  $effect(() => {
    const zones = storySettings.clothingZones ?? DEFAULT_CLOTHING_ZONES
    clothingZonesDraft = zones.join(', ')
  })

  $effect(() => {
    moneyNameDraft = (storySettings.moneyName ?? DEFAULT_MONEY_NAME).trim() || DEFAULT_MONEY_NAME
  })

  onDestroy(() => {
    if (debounceTimer) clearTimeout(debounceTimer)
  })

  // ── Derived flags ─────────────────────────────────────────────────────────────

  const isActive = $derived(!!savedCustomPrompt)
  const isDirty = $derived(customPromptDraft !== (savedCustomPrompt ?? ''))
  const canSave = $derived(
    isDirty && (customPromptDraft.trim() === '' || (validationResult?.success ?? false)),
  )
  const unsummarizedEntryCount = $derived(story.visibleEntries.length)
  const atChapterBoundary = $derived(unsummarizedEntryCount === 0)

  // ── Functions ─────────────────────────────────────────────────────────────────

  function validate(value: string) {
    if (!value.trim()) {
      validationResult = null
      unknownVars = []
      return
    }
    const result = templateEngine.parseTemplate(value)
    validationResult = result
    unknownVars = result.success
      ? templateEngine.extractVariableNames(value).filter((v) => !KNOWN_VARIABLES.has(v))
      : []
  }

  function onDraftInput(value: string) {
    customPromptDraft = value
    validationResult = null // clear stale result immediately so canSave goes false until debounce fires
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => validate(value), 300)
  }

  function loadCurrentTemplate() {
    if (debounceTimer) clearTimeout(debounceTimer)
    const template = PROMPT_TEMPLATES.find((t) => t.id === 'adventure')
    if (template) {
      customPromptDraft = template.content
      validate(template.content)
    }
  }

  async function savePrompt() {
    await requestTransition(
      { customSystemPrompt: customPromptDraft.trim() || undefined },
      describeTransition({ customSystemPrompt: customPromptDraft.trim() || undefined }),
      { refreshToneFields: false },
    )
  }

  async function clearOverride() {
    customPromptDraft = ''
    validationResult = null
    unknownVars = []
    await requestTransition(
      { customSystemPrompt: undefined },
      describeTransition({ customSystemPrompt: undefined }),
      { refreshToneFields: false },
    )
  }

  function parseClothingZones(raw: string): string[] {
    return raw
      .split(',')
      .map((zone) => zone.trim().toLowerCase())
      .filter(Boolean)
  }

  async function saveClothingZones(raw: string) {
    const parsed = parseClothingZones(raw)
    await story.updateStorySettings({
      clothingZones: parsed.length > 0 ? parsed : DEFAULT_CLOTHING_ZONES,
    })
  }

  async function saveMoneyName(raw: string) {
    const next = raw.trim() || DEFAULT_MONEY_NAME
    moneyNameDraft = next
    await story.updateStorySettings({ moneyName: next })
  }

  function currentSettingsValue<K extends keyof StorySettings>(key: K): StorySettings[K] | undefined {
    return story.currentStory?.settings?.[key]
  }

  function normalizeStyleValue(value: unknown): string {
    if (typeof value !== 'string') return ''
    return value.trim()
  }

  function isTransitionSensitiveChange(
    updates: Partial<StorySettings>,
  ): boolean {
    return Object.entries(updates).some(([key, value]) => {
      switch (key) {
        case 'pov':
        case 'tense':
        case 'visualProseMode':
          return currentSettingsValue(key as 'pov' | 'tense' | 'visualProseMode') !== value
        case 'tone':
        case 'customSystemPrompt':
          return normalizeStyleValue(currentSettingsValue(key as 'tone' | 'customSystemPrompt')) !==
            normalizeStyleValue(value)
        default:
          return false
      }
    })
  }

  function describeTransition(
    updates: Partial<StorySettings>,
  ): string {
    const parts: string[] = []

    if (updates.pov !== undefined && updates.pov !== story.currentStory?.settings?.pov) {
      parts.push(`POV: ${story.currentStory?.settings?.pov ?? story.pov} -> ${updates.pov}`)
    }
    if (updates.tense !== undefined && updates.tense !== story.currentStory?.settings?.tense) {
      parts.push(`Tense: ${story.currentStory?.settings?.tense ?? story.tense} -> ${updates.tense}`)
    }
    if (
      updates.tone !== undefined &&
      normalizeStyleValue(updates.tone) !== normalizeStyleValue(story.currentStory?.settings?.tone)
    ) {
      const nextTone = normalizeStyleValue(updates.tone) || 'default tone'
      parts.push(`Tone -> ${nextTone}`)
    }
    if (
      updates.customSystemPrompt !== undefined &&
      normalizeStyleValue(updates.customSystemPrompt) !==
        normalizeStyleValue(story.currentStory?.settings?.customSystemPrompt)
    ) {
      parts.push(
        normalizeStyleValue(updates.customSystemPrompt)
          ? 'Custom style instructions updated'
          : 'Custom style instructions cleared',
      )
    }
    if (
      updates.visualProseMode !== undefined &&
      updates.visualProseMode !== story.currentStory?.settings?.visualProseMode
    ) {
      parts.push(`Visual prose ${updates.visualProseMode ? 'enabled' : 'disabled'}`)
    }

    return parts.join(' | ')
  }

  function buildTransitionGuidance(
    updates: Partial<StorySettings>,
  ): string {
    const instructionLines = [
      'Starting with this reply, transition fully into the story\'s updated narration settings.',
      'Treat any prior prose as summarized backstory continuity rather than a style sample to keep copying.',
      'Use the current story settings and custom prompt override as the source of truth for voice and formatting.',
    ]

    if (updates.pov !== undefined || updates.tense !== undefined) {
      instructionLines.push(
        `Write the new narration in ${updates.pov ?? story.pov} person and ${updates.tense ?? story.tense} tense.`,
      )
    }
    if (updates.tone !== undefined && normalizeStyleValue(updates.tone)) {
      instructionLines.push(`Adopt this tone immediately: ${normalizeStyleValue(updates.tone)}.`)
    }
    if (updates.customSystemPrompt !== undefined) {
      instructionLines.push(
        normalizeStyleValue(updates.customSystemPrompt)
          ? 'Apply the updated custom style instructions immediately.'
          : 'Stop using the prior custom style instructions and follow the default template plus current story settings.',
      )
    }
    if (updates.visualProseMode !== undefined) {
      instructionLines.push(
        updates.visualProseMode
          ? 'Use the story\'s visual prose presentation rules from this response onward.'
          : 'Keep the response in normal prose without visual prose formatting unless the updated story settings explicitly require it.',
      )
    }

    return instructionLines.join('\n')
  }

  function resetWritingStyleControls() {
    styleFieldsResetKey += 1
    customPromptDraft = savedCustomPrompt ?? ''
    validationResult = null
    unknownVars = []
  }

  function closeTransitionModal(resetFields = false) {
    transitionModalOpen = false
    transitionLoading = false
    pendingTransitionUpdates = null
    pendingTransitionLabel = ''

    if (resetFields) {
      resetWritingStyleControls()
    }
  }

  async function applyTransitionUpdates(
    updates: Partial<StorySettings>,
  ) {
    if (!story.currentStory) return

    await story.updateStorySettings(updates)
    ui.queueNarrativeTransitionGuidance(
      story.currentStory.id,
      buildTransitionGuidance(updates),
    )
  }

  async function requestTransition(
    updates: Partial<StorySettings>,
    label: string,
    options: { refreshToneFields?: boolean } = {},
  ) {
    if (!story.currentStory) return
    if (!isTransitionSensitiveChange(updates)) return

    if (atChapterBoundary) {
      await applyTransitionUpdates(updates)
      if (options.refreshToneFields !== false) {
        resetWritingStyleControls()
      }
      return
    }

    pendingTransitionUpdates = updates
    pendingTransitionLabel = label
    transitionModalOpen = true
  }

  async function confirmSummarizeAndApplyTransition() {
    if (!story.currentStory || !pendingTransitionUpdates) return

    transitionLoading = true

    try {
      if (story.visibleEntries.length > 0) {
        await story.createManualChapter(story.entries.length)
      }
      await applyTransitionUpdates(pendingTransitionUpdates)
      closeTransitionModal(false)
    } catch {
      closeTransitionModal(true)
    }
  }

  function handleToneTransition(nextTone: string) {
    void requestTransition({ tone: nextTone }, describeTransition({ tone: nextTone }))
  }

  function handlePOVTransition(nextPov: 'first' | 'second' | 'third') {
    void requestTransition({ pov: nextPov }, describeTransition({ pov: nextPov }))
  }

  function handleTenseTransition(nextTense: 'past' | 'present') {
    void requestTransition({ tense: nextTense }, describeTransition({ tense: nextTense }))
  }

  function handleVisualProseTransition(nextVisualProseMode: boolean) {
    void requestTransition(
      { visualProseMode: nextVisualProseMode },
      describeTransition({ visualProseMode: nextVisualProseMode }),
    )
  }
</script>

<div class="space-y-6">
  <div>
    <h3 class="text-lg font-semibold">Story Settings</h3>
    <p class="text-muted-foreground text-sm">Configure settings for the current story.</p>
  </div>

  <div class="space-y-2">
    <p class="text-muted-foreground text-xs">
      {#if atChapterBoundary}
        Chapter boundary reached. Narrative voice changes can apply immediately to the next reply.
      {:else}
        {unsummarizedEntryCount} unsummarized entr{unsummarizedEntryCount === 1 ? 'y remains' : 'ies remain'} in the current prose window. Voice or style changes will summarize them first.
      {/if}
    </p>

    {#key styleFieldsResetKey}
      <WritingStyleFields
        selectedPOV={storySettings.pov ?? 'second'}
        selectedTense={storySettings.tense ?? 'present'}
        tone={storySettings.tone ?? ''}
        visualProseMode={storySettings.visualProseMode ?? false}
        imageGenerationEnabled={imageGenEnabled}
        imageGenerationMode={storySettings.imageGenerationMode ?? 'none'}
        backgroundImagesEnabled={storySettings.backgroundImagesEnabled ?? false}
        referenceMode={storySettings.referenceMode ?? false}
        onPOVChange={handlePOVTransition}
        onTenseChange={handleTenseTransition}
        onToneChange={handleToneTransition}
        onVisualProseModeChange={handleVisualProseTransition}
        onImageGenerationModeChange={(v) => story.updateStorySettings({ imageGenerationMode: v })}
        onBackgroundImagesEnabledChange={(v) =>
          story.updateStorySettings({ backgroundImagesEnabled: v })}
        onReferenceModeChange={(v) => story.updateStorySettings({ referenceMode: v })}
      />
    {/key}
  </div>

  <!-- ── Clothing & Armor System ─────────────────────────────────────────── -->
  <div class="border-t pt-4">
    <div class="space-y-3">
      <div class="flex items-center space-x-2">
        <Switch
          id="clothing-system-enabled"
          checked={storySettings.clothingSystemEnabled ?? false}
          onCheckedChange={(v) =>
            story.updateStorySettings({
              clothingSystemEnabled: v,
              clothingZones: storySettings.clothingZones ?? DEFAULT_CLOTHING_ZONES,
              clothingMaxDurability: storySettings.clothingMaxDurability ?? 100,
              clothingRepairAmount: storySettings.clothingRepairAmount ?? 20,
            })}
        />
        <div class="grid gap-1.5 leading-none">
          <Label for="clothing-system-enabled">Enable Clothing & Armor System</Label>
          <p class="text-muted-foreground text-xs">
            Adds slot tracking and durability for equipped clothing items in the Inventory sidebar.
          </p>
        </div>
      </div>

      {#if storySettings.clothingSystemEnabled}
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="space-y-1">
            <Label for="clothing-zones" class="text-sm">Coverage Zones</Label>
            <Input
              id="clothing-zones"
              value={clothingZonesDraft}
              oninput={(e) => (clothingZonesDraft = (e.currentTarget as HTMLInputElement).value)}
              onblur={(e) => saveClothingZones((e.currentTarget as HTMLInputElement).value)}
              placeholder="torso, chest, hips, legs"
            />
            <p class="text-muted-foreground text-xs">
              Comma-separated zone list used by the clothing coverage panel.
            </p>
          </div>

          <div class="space-y-1">
            <Label for="clothing-max-durability" class="text-sm">Default Max Durability</Label>
            <Input
              id="clothing-max-durability"
              type="number"
              min="1"
              value={String(storySettings.clothingMaxDurability ?? 100)}
              oninput={(e) =>
                story.updateStorySettings({
                  clothingMaxDurability: Math.max(
                    1,
                    Number((e.currentTarget as HTMLInputElement).value) || 100,
                  ),
                })}
            />
          </div>

          <div class="space-y-1">
            <Label for="clothing-repair-amount" class="text-sm">Repair Amount Per Action</Label>
            <Input
              id="clothing-repair-amount"
              type="number"
              min="1"
              value={String(storySettings.clothingRepairAmount ?? 20)}
              oninput={(e) =>
                story.updateStorySettings({
                  clothingRepairAmount: Math.max(
                    1,
                    Number((e.currentTarget as HTMLInputElement).value) || 20,
                  ),
                })}
            />
            <p class="text-muted-foreground text-xs">
              Repair requires a sewing kit in inventory and consumes 1 per repair.
            </p>
          </div>
        </div>
      {/if}
    </div>
  </div>

  <!-- ── Money Tracking System ─────────────────────────────────────────── -->
  {#if isAdventureStory}
    <div class="border-t pt-4">
      <div class="space-y-3">
        <div class="flex items-center space-x-2">
          <Switch
            id="money-system-enabled"
            checked={storySettings.moneySystemEnabled ?? false}
            onCheckedChange={(v) =>
              story.updateStorySettings({
                moneySystemEnabled: v,
                moneyName: storySettings.moneyName ?? DEFAULT_MONEY_NAME,
                moneyAmount: Math.max(0, Math.floor(storySettings.moneyAmount ?? 0)),
              })}
          />
          <div class="grid gap-1.5 leading-none">
            <Label for="money-system-enabled">Enable Money Tracking</Label>
            <p class="text-muted-foreground text-xs">
              Tracks a dedicated currency balance for this story and keeps purchases constrained by
              available funds.
            </p>
          </div>
        </div>

        {#if storySettings.moneySystemEnabled}
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="space-y-1">
              <Label for="money-name" class="text-sm">Currency Name</Label>
              <Input
                id="money-name"
                value={moneyNameDraft}
                oninput={(e) => (moneyNameDraft = (e.currentTarget as HTMLInputElement).value)}
                onblur={(e) => saveMoneyName((e.currentTarget as HTMLInputElement).value)}
                placeholder="gold"
              />
              <p class="text-muted-foreground text-xs">
                Used in prompts and parsing (examples: gold, credits, dollars, crowns).
              </p>
            </div>

            <div class="space-y-1">
              <Label for="money-amount" class="text-sm">Current Amount</Label>
              <Input
                id="money-amount"
                type="number"
                min="0"
                step="1"
                value={String(Math.max(0, Math.floor(storySettings.moneyAmount ?? 0)))}
                oninput={(e) =>
                  story.updateStorySettings({
                    moneyAmount: Math.max(0, Math.floor(Number((e.currentTarget as HTMLInputElement).value) || 0)),
                  })}
              />
              <p class="text-muted-foreground text-xs">
                Current balance used for affordability checks and post-narrative money updates.
              </p>
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- ── Classification Scope ───────────────────────────────────────────── -->
  <div class="border-t pt-4">
    <div class="space-y-3">
      <div class="grid gap-1">
        <h4 class="text-sm font-medium">Classification Scope</h4>
        <p class="text-muted-foreground text-xs">
          Disable specific classifier subprocesses to reduce token usage. Disabled subprocesses do
          not run their fallbacks.
        </p>
      </div>

      <div class="flex items-center space-x-2">
        <Switch
          id="character-classifier-enabled"
          checked={characterClassifierEnabled}
          onCheckedChange={(v) => story.updateStorySettings({ characterClassificationEnabled: v })}
        />
        <div class="grid gap-1.5 leading-none">
          <Label for="character-classifier-enabled">Track Characters</Label>
          <p class="text-muted-foreground text-xs">Character updates and newly introduced characters.</p>
        </div>
      </div>

      <div class="flex items-center space-x-2">
        <Switch
          id="location-classifier-enabled"
          checked={locationClassifierEnabled}
          onCheckedChange={(v) => story.updateStorySettings({ locationClassificationEnabled: v })}
        />
        <div class="grid gap-1.5 leading-none">
          <Label for="location-classifier-enabled">Track Locations</Label>
          <p class="text-muted-foreground text-xs">Location updates and newly introduced locations.</p>
        </div>
      </div>

      <div class="flex items-center space-x-2">
        <Switch
          id="inventory-classifier-enabled"
          checked={inventoryClassifierEnabled}
          onCheckedChange={(v) => story.updateStorySettings({ inventoryClassificationEnabled: v })}
        />
        <div class="grid gap-1.5 leading-none">
          <Label for="inventory-classifier-enabled">Track Inventory/Items In Classifier</Label>
          <p class="text-muted-foreground text-xs">
            Enables item updates/new item extraction (including clothing-state item updates).
          </p>
        </div>
      </div>

      <div class="flex items-center space-x-2">
        <Switch
          id="storybeat-classifier-enabled"
          checked={storyBeatClassifierEnabled}
          onCheckedChange={(v) => story.updateStorySettings({ storyBeatClassificationEnabled: v })}
        />
        <div class="grid gap-1.5 leading-none">
          <Label for="storybeat-classifier-enabled">Track Story Beats</Label>
          <p class="text-muted-foreground text-xs">
            Story beat updates, completion/failure transitions, and new beats.
          </p>
        </div>
      </div>

      <div class="flex items-center space-x-2">
        <Switch
          id="scene-classifier-enabled"
          checked={sceneClassifierEnabled}
          onCheckedChange={(v) => story.updateStorySettings({ sceneClassificationEnabled: v })}
        />
        <div class="grid gap-1.5 leading-none">
          <Label for="scene-classifier-enabled">Track Scene State</Label>
          <p class="text-muted-foreground text-xs">
            Scene location and present-character extraction for each narration.
          </p>
        </div>
      </div>

      <div class="flex items-center space-x-2">
        <Switch
          id="time-classifier-enabled"
          checked={timeClassifierEnabled}
          onCheckedChange={(v) => story.updateStorySettings({ timeClassificationEnabled: v })}
        />
        <div class="grid gap-1.5 leading-none">
          <Label for="time-classifier-enabled">Track Time Progression</Label>
          <p class="text-muted-foreground text-xs">
            Classifier-derived time advancement (none/minutes/hours/days).
          </p>
        </div>
      </div>

      <div class="flex items-center space-x-2">
        <Switch
          id="money-classifier-enabled"
          checked={moneyClassifierEnabled}
          disabled={!storySettings.moneySystemEnabled}
          onCheckedChange={(v) => story.updateStorySettings({ moneyClassificationEnabled: v })}
        />
        <div class="grid gap-1.5 leading-none">
          <Label for="money-classifier-enabled">Track Money In Classifier</Label>
          <p class="text-muted-foreground text-xs">
            Enables extraction of scene money deltas. Requires Money Tracking to be enabled.
          </p>
        </div>
      </div>

      <div class="flex items-center space-x-2">
        <Switch
          id="runtimevar-classifier-enabled"
          checked={runtimeVarClassifierEnabled}
          onCheckedChange={(v) => story.updateStorySettings({ runtimeVarClassificationEnabled: v })}
        />
        <div class="grid gap-1.5 leading-none">
          <Label for="runtimevar-classifier-enabled">Track Runtime Variables</Label>
          <p class="text-muted-foreground text-xs">
            Enables inline runtime-variable extraction from classifier output.
          </p>
        </div>
      </div>

      <div class="border-border grid gap-3 border-t pt-3">
        <p class="text-muted-foreground text-[11px] font-medium uppercase">Fallback Subprocesses</p>

        <div class="flex items-center space-x-2">
          <Switch
            id="item-fallback-enabled"
            checked={itemFallbackEnabled}
            disabled={!inventoryClassifierEnabled}
            onCheckedChange={(v) => story.updateStorySettings({ itemAcquisitionFallbackEnabled: v })}
          />
          <div class="grid gap-1.5 leading-none">
            <Label for="item-fallback-enabled">Item Acquisition Fallback</Label>
            <p class="text-muted-foreground text-xs">
              Heuristic item pickup inference when item classifier extraction misses updates.
            </p>
          </div>
        </div>

        <div class="flex items-center space-x-2">
          <Switch
            id="clothing-fallback-enabled"
            checked={clothingFallbackEnabled}
            disabled={!inventoryClassifierEnabled}
            onCheckedChange={(v) => story.updateStorySettings({ clothingStateFallbackEnabled: v })}
          />
          <div class="grid gap-1.5 leading-none">
            <Label for="clothing-fallback-enabled">Clothing-State Fallback</Label>
            <p class="text-muted-foreground text-xs">
              Heuristic clothing damage/repair inference when clothing updates are missed.
            </p>
          </div>
        </div>

        <div class="flex items-center space-x-2">
          <Switch
            id="money-fallback-enabled"
            checked={moneyFallbackEnabled}
            disabled={!moneyClassifierEnabled}
            onCheckedChange={(v) => story.updateStorySettings({ moneyFallbackEnabled: v })}
          />
          <div class="grid gap-1.5 leading-none">
            <Label for="money-fallback-enabled">Money Heuristic Fallback</Label>
            <p class="text-muted-foreground text-xs">
              Heuristic money delta extraction when the primary classifier omits money updates.
            </p>
          </div>
        </div>

        <div class="flex items-center space-x-2">
          <Switch
            id="money-recovery-enabled"
            checked={moneyRecoveryEnabled}
            disabled={!moneyClassifierEnabled}
            onCheckedChange={(v) => story.updateStorySettings({ moneyRecoveryEnabled: v })}
          />
          <div class="grid gap-1.5 leading-none">
            <Label for="money-recovery-enabled">Money Secondary LLM Recovery</Label>
            <p class="text-muted-foreground text-xs">
              Extra LLM pass to recover money updates when transaction cues are detected.
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ── Custom System Prompt ─────────────────────────────────────────────── -->
  <div class="border-t pt-4">
    <div class="mb-4 flex items-center space-x-2">
      <Switch
        id="editing-pass-before-display-enabled"
        checked={editingPassBeforeDisplayEnabled}
        onCheckedChange={(v) => story.updateStorySettings({ editingPassBeforeDisplayEnabled: v })}
      />
      <div class="grid gap-1.5 leading-none">
        <Label for="editing-pass-before-display-enabled">Enable Hidden Editing Pass</Label>
        <p class="text-muted-foreground text-xs">
          Runs a second AI editing pass on each narrative response before display. Improves polish,
          but may increase generation latency and cost.
        </p>
      </div>
    </div>

    <div class="mb-3 flex items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <Label class="text-sm font-medium">Custom System Prompt</Label>
        {#if isActive}
          <span
            class="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400"
          >
            Active
          </span>
        {/if}
      </div>
      <div class="flex gap-2">
        <Button variant="outline" size="sm" onclick={loadCurrentTemplate}>
          Load default template
        </Button>
        {#if isActive || customPromptDraft}
          <Button
            variant="ghost"
            size="sm"
            class="text-destructive hover:text-destructive"
            onclick={clearOverride}
          >
            Clear override
          </Button>
        {/if}
      </div>
    </div>

    <p class="text-muted-foreground mb-3 text-xs">
      Replaces the default pack template for this story only. Supports Liquid template variables.
      Changes take effect on the next generation — no restart needed.
    </p>

    <Textarea
      value={customPromptDraft}
      oninput={(e) => onDraftInput((e.currentTarget as HTMLTextAreaElement).value)}
      class="min-h-[200px] font-mono text-xs"
      placeholder={promptPlaceholder}
    />

    <!-- Validation status -->
    {#if customPromptDraft.trim()}
      <div class="mt-2 space-y-1">
        {#if validationResult === null}
          <p class="text-muted-foreground text-xs">Validating…</p>
        {:else if validationResult.success}
          <p class="text-xs text-green-600 dark:text-green-400">✓ Template is valid</p>
        {:else}
          <p class="text-destructive text-xs">✕ Syntax error: {validationResult.error}</p>
        {/if}

        {#if unknownVars.length > 0}
          <p class="text-xs text-amber-600 dark:text-amber-400">
            ⚠ Unknown variables (will render empty):
            {#each unknownVars as v, i (v)}
              <code class="font-mono">{v}</code>{i < unknownVars.length - 1 ? ', ' : ''}
            {/each}
            — these may be custom pack variables.
          </p>
        {/if}
      </div>
    {/if}

    <!-- Save / status row -->
    {#if isDirty}
      <div class="mt-3 flex items-center justify-between gap-2">
        <p class="text-muted-foreground text-xs">Unsaved changes</p>
        <Button size="sm" onclick={savePrompt} disabled={!canSave}>Save</Button>
      </div>
    {/if}

    <!-- Variable reference (collapsible) -->
    <div class="mt-4">
      <button
        class="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs transition-colors"
        onclick={() => (showVarReference = !showVarReference)}
        type="button"
      >
        <span>{showVarReference ? '▾' : '▸'}</span>
        Available template variables
      </button>

      {#if showVarReference}
        <div class="border-border mt-2 rounded-md border p-3 text-xs">
          {#each VARIABLE_REFERENCE as group (group.group)}
            <div class="mb-3 last:mb-0">
              <p
                class="text-muted-foreground mb-1 text-[0.65rem] font-semibold tracking-wide uppercase"
              >
                {group.group}
              </p>
              <div class="space-y-1">
                {#each group.vars as v (v.name)}
                  <div class="flex gap-2">
                    <code class="text-primary min-w-0 shrink-0 font-mono">{`{{ ${v.name} }}`}</code>
                    <span class="text-muted-foreground">{v.desc}</span>
                  </div>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Tips -->
    <div class="border-border mt-4 space-y-2 rounded-md border border-dashed p-3 text-xs">
      <p class="font-medium">Tips</p>
      <ul class="text-muted-foreground list-disc space-y-1 pl-4">
        <li>
          This override applies to this story only. The default pack template is untouched and used
          by all other stories.
        </li>
        <li>
          Custom pack variables (defined in Vault → Prompts) are also available here. They will
          appear in the unknown variable warning below, but that's expected — they're resolved at
          generation time and will work correctly.
        </li>
        <li>
          For more advanced use cases — multiple template variants or sharing prompts across stories
          — consider creating a <strong>custom prompt pack</strong> in the Vault instead.
        </li>
      </ul>
    </div>
  </div>
</div>

<ResponsiveModal.Root bind:open={transitionModalOpen}>
  <ResponsiveModal.Content class="flex max-w-lg flex-col gap-0 p-0">
    <ResponsiveModal.Header class="border-b px-6 py-4">
      <ResponsiveModal.Title>Summarize Before Switching Voice</ResponsiveModal.Title>
      <ResponsiveModal.Description>
        Narrative voice changes are safest after current prose has been summarized into chapter history.
      </ResponsiveModal.Description>
    </ResponsiveModal.Header>

    <div class="space-y-4 px-6 py-4">
      <div class="space-y-2 rounded-md border p-3">
        <p class="text-sm font-medium">Pending change</p>
        <p class="text-muted-foreground text-sm">{pendingTransitionLabel}</p>
      </div>

      <div class="space-y-2 rounded-md border p-3">
        <p class="text-sm font-medium">Unsummarized prose</p>
        <p class="text-muted-foreground text-sm">
          {unsummarizedEntryCount} entr{unsummarizedEntryCount === 1 ? 'y is' : 'ies are'} still in the active prose window. To avoid mixing old and new voice, the app will create a chapter summary first.
        </p>
      </div>
    </div>

    <ResponsiveModal.Footer class="border-t px-6 py-4">
      <Button variant="outline" onclick={() => closeTransitionModal(true)} disabled={transitionLoading}>
        Cancel
      </Button>
      <Button onclick={confirmSummarizeAndApplyTransition} disabled={transitionLoading}>
        {#if transitionLoading}
          Summarizing...
        {:else}
          Summarize Now And Apply
        {/if}
      </Button>
    </ResponsiveModal.Footer>
  </ResponsiveModal.Content>
</ResponsiveModal.Root>

<script lang="ts">
  import { untrack } from 'svelte'
  import type { FullPack } from '$lib/services/packs/types'
  import type { PromptPackCompatibilityReport } from '$lib/services/packs/prompt-pack-compatibility'
  import { allSamples } from './sampleContext'
  import { packService } from '$lib/services/packs/pack-service'
  import { createIsMobile } from '$lib/hooks/is-mobile.svelte'
  import TemplateGroupList from './TemplateGroupList.svelte'
  import TemplateEditor from './TemplateEditor.svelte'
  import VariableManager from './VariableManager.svelte'
  import RuntimeVariableManager from './RuntimeVariableManager.svelte'
  import VariablePalette from './VariablePalette.svelte'
  import { Button } from '$lib/components/ui/button'
  import { Badge } from '$lib/components/ui/badge'
  import { Skeleton } from '$lib/components/ui/skeleton'
  import * as Dialog from '$lib/components/ui/dialog'
  import * as Drawer from '$lib/components/ui/drawer'
  import * as ToggleGroup from '$lib/components/ui/toggle-group'
  import { Input } from '$lib/components/ui/input'
  import { Textarea } from '$lib/components/ui/textarea'
  import { Label } from '$lib/components/ui/label'
  import { renderDescription } from '$lib/utils/markdown'
  import { variableRegistry } from '$lib/services/templates/variables'
  import { story } from '$lib/stores/story.svelte'
  import { ContextBuilder } from '$lib/services/context'
  import TestVariablesModal from './TestVariablesModal.svelte'
  import {
    ChevronLeft,
    Menu,
    Save,
    Undo2,
    RotateCcw,
    Pencil,
    Eye,
    Check,
    X,
    Settings,
    RefreshCw,
  } from 'lucide-svelte'

  interface Props {
    packId: string
    onClose: () => void
    onDirtyChange?: (dirty: boolean) => void
  }

  let { packId, onClose, onDirtyChange }: Props = $props()

  let selectedTemplateId = $state<string | null>(null)
  let showVariables = $state(false)
  let showRuntimeVars = $state(false)
  let fullPack = $state<FullPack | null>(null)
  let loading = $state(true)
  let drawerOpen = $state(false)
  let compatibility = $state<PromptPackCompatibilityReport | null>(null)
  let compatibilityLoading = $state(false)
  let liveContextValues = $state<Record<string, string>>({})
  const systemVariableCount = variableRegistry.getByCategory('system').length
  const promptRuntimeVariableCount = variableRegistry.getByCategory('runtime').length

  // Editor tab state
  let editorActiveTab = $state<'system' | 'user'>('system')
  let mobileView = $state<'editor' | 'preview'>('editor')

  // Dirty guard state
  let isEditorDirty = $state(false)
  let showDirtyDialog = $state(false)
  let pendingAction = $state<(() => void) | null>(null)
  let editorRef = $state<TemplateEditor | null>(null)

  // Test variables state
  let showTestVars = $state(false)
  let testValues = $state<Record<string, string>>({})
  const variablePreviewValues = $derived({ ...allSamples, ...liveContextValues, ...testValues })

  function handleTestValuesChange(values: Record<string, string>) {
    testValues = values
  }

  // Sync testValues when variables change: all samples + custom defaults as base, user overrides on top
  $effect(() => {
    const vars = fullPack?.variables
    if (!vars) return
    // Build complete defaults: system + runtime samples + custom variable defaults
    const defaults: Record<string, string> = { ...allSamples }
    for (const v of vars) {
      if (v.defaultValue) {
        defaults[v.variableName] = v.defaultValue
      }
    }
    // Read current testValues without creating a dependency (avoid infinite loop)
    const current = untrack(() => testValues)
    // Overlay existing non-empty user overrides on top of defaults
    const merged: Record<string, string> = { ...defaults }
    for (const [key, value] of Object.entries(current)) {
      if (value !== '' && key in defaults) {
        merged[key] = value
      }
    }
    testValues = merged
  })

  // Pack settings edit state
  let editingSettings = $state(false)
  let settingsDraft = $state({ name: '', author: '', description: '' })

  const isMobile = createIsMobile()

  $effect(() => {
    loadPack()
  })

  $effect(() => {
    const storyId = story.currentStory?.id
    if (!storyId) {
      liveContextValues = {}
      return
    }

    void (async () => {
      try {
        const contextBuilder = await ContextBuilder.forStory(storyId, packId)
        const context = contextBuilder.getContext()
        liveContextValues = Object.fromEntries(
          Object.entries(context).map(([key, value]) => [key, String(value ?? '')]),
        )
      } catch (error) {
        console.warn('[PromptPackEditor] Failed to load live prompt context:', error)
        liveContextValues = {}
      }
    })()
  })

  async function loadPack() {
    loading = true
    try {
      fullPack = await packService.getFullPack(packId)
      await loadCompatibility()
    } catch (error) {
      console.error('[PromptPackEditor] Failed to load pack:', error)
    } finally {
      loading = false
    }
  }

  async function loadCompatibility() {
    compatibilityLoading = true
    try {
      compatibility = await packService.getPromptPackCompatibility(packId)
    } catch (error) {
      console.error('[PromptPackEditor] Failed to check pack compatibility:', error)
      compatibility = null
    } finally {
      compatibilityLoading = false
    }
  }

  async function refreshPack() {
    try {
      fullPack = await packService.getFullPack(packId)
      await loadCompatibility()
      // testValues cleanup and default re-initialization handled by $effect watching fullPack.variables
    } catch (error) {
      console.error('[PromptPackEditor] Failed to refresh pack:', error)
    }
  }

  /**
   * Guard wrapper: if editor is dirty, show dialog instead of executing action.
   * If clean, execute immediately.
   */
  function guardDirty(action: () => void) {
    if (isEditorDirty) {
      pendingAction = action
      showDirtyDialog = true
    } else {
      action()
    }
  }

  function handleSelectTemplate(templateId: string) {
    if (templateId === selectedTemplateId) return
    guardDirty(() => {
      showVariables = false
      showRuntimeVars = false
      selectedTemplateId = templateId
      isEditorDirty = false
      drawerOpen = false
    })
  }

  function handleToggleVariables() {
    guardDirty(() => {
      showVariables = !showVariables
      if (showVariables) {
        selectedTemplateId = null
        showRuntimeVars = false
      }
      isEditorDirty = false
      drawerOpen = false
    })
  }

  function handleToggleRuntimeVars() {
    guardDirty(() => {
      showRuntimeVars = !showRuntimeVars
      if (showRuntimeVars) {
        selectedTemplateId = null
        showVariables = false
      }
      isEditorDirty = false
      drawerOpen = false
    })
  }

  function handleShowSettings() {
    guardDirty(() => {
      selectedTemplateId = null
      showVariables = false
      showRuntimeVars = false
      isEditorDirty = false
      drawerOpen = false
    })
  }

  const showSettings = $derived(!selectedTemplateId && !showVariables && !showRuntimeVars)

  function handleBack() {
    guardDirty(() => {
      onClose()
    })
  }

  function handleDirtyChange(dirty: boolean) {
    isEditorDirty = dirty
  }

  // Propagate dirty state to parent
  $effect(() => {
    onDirtyChange?.(isEditorDirty)
  })

  /**
   * Guard wrapper exposed to parent: show dialog if dirty, else execute immediately.
   */
  export function guardNavigation(action: () => void) {
    guardDirty(action)
  }

  // Dirty dialog actions
  async function handleSaveAndSwitch() {
    if (editorRef) {
      const saved = await editorRef.save()
      if (!saved) return
    }
    isEditorDirty = false
    showDirtyDialog = false
    pendingAction?.()
    pendingAction = null
  }

  function handleDiscardAndSwitch() {
    if (editorRef) {
      editorRef.discard()
    }
    isEditorDirty = false
    showDirtyDialog = false
    pendingAction?.()
    pendingAction = null
  }

  function handleCancelSwitch() {
    showDirtyDialog = false
    pendingAction = null
  }

  function startEditSettings() {
    settingsDraft = {
      name: fullPack?.pack.name ?? '',
      author: fullPack?.pack.author ?? '',
      description: fullPack?.pack.description ?? '',
    }
    editingSettings = true
  }

  async function saveSettings() {
    const name = settingsDraft.name.trim()
    if (!name) return
    try {
      await packService.updatePack(packId, {
        name,
        author: settingsDraft.author.trim() || null,
        description: settingsDraft.description.trim() || null,
      })
      await refreshPack()
    } catch (error) {
      console.error('[PromptPackEditor] Failed to save pack settings:', error)
    }
    editingSettings = false
  }

  function discardSettings() {
    editingSettings = false
  }
</script>

<div class="flex h-full flex-col">
  <!-- Header Bar -->
  <div class="border-b">
    <!-- Top row: back + pack name + hamburger -->
    <div class="flex items-center gap-2 px-4 py-1.5 sm:py-2">
      <Button
        variant="ghost"
        size="icon"
        class="text-muted-foreground hover:text-foreground -ml-2 h-8 w-8 shrink-0"
        onclick={handleBack}
      >
        <ChevronLeft class="h-4 w-4" />
      </Button>

      {#if loading}
        <Skeleton class="h-5 w-32" />
      {:else if fullPack}
        <h2 class="min-w-0 shrink truncate font-semibold">{fullPack.pack.name}</h2>
        {#if isEditorDirty}
          <Badge variant="outline" class="shrink-0 border-yellow-500/50 text-xs text-yellow-500"
            >Unsaved</Badge
          >
        {/if}
      {/if}

      <!-- Desktop: System/User tabs + action buttons in header row -->
      {#if selectedTemplateId && editorRef && !isMobile.current}
        <div class="ml-auto flex items-center gap-1">
          <ToggleGroup.Root
            type="single"
            value={editorActiveTab}
            onValueChange={(v) => {
              if (v) editorActiveTab = v as 'system' | 'user'
            }}
            variant="outline"
            size="sm"
            class="mr-1 gap-0"
          >
            <ToggleGroup.Item value="system" class="h-7 rounded-r-none px-2.5 text-xs"
              >System</ToggleGroup.Item
            >
            <ToggleGroup.Item value="user" class="h-7 rounded-l-none px-2.5 text-xs"
              >User</ToggleGroup.Item
            >
          </ToggleGroup.Root>

          <VariablePalette
            iconOnly
            customVariables={fullPack?.variables ?? []}
            onInsert={(name) => editorRef?.insertVariable(name)}
          />

          <Button
            variant="ghost"
            size="icon"
            class="h-8 w-8"
            disabled={!isEditorDirty}
            onclick={() => editorRef?.save()}
            title="Save"
          >
            <Save class="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            class="h-8 w-8"
            disabled={!isEditorDirty}
            onclick={() => editorRef?.discard()}
            title="Discard"
          >
            <Undo2 class="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            class="h-8 w-8"
            onclick={() => editorRef?.reset()}
            title="Reset to default"
          >
            <RotateCcw class="h-3.5 w-3.5" />
          </Button>
        </div>
      {:else if !isMobile.current}
        <div class="ml-auto"></div>
      {/if}

      {#if isMobile.current}
        <Button
          variant="outline"
          size="icon"
          class="ml-auto h-8 w-8 shrink-0"
          onclick={() => (drawerOpen = true)}
        >
          <Menu class="h-4 w-4" />
        </Button>
      {/if}
    </div>

    <!-- Bottom toolbar (mobile only) -->
    {#if selectedTemplateId && editorRef && isMobile.current}
      <!-- Mobile: full bottom toolbar (unchanged) -->
      <div class="border-t"></div>
      <div class="flex items-center gap-1 px-4 py-1.5">
        <ToggleGroup.Root
          type="single"
          value={mobileView}
          onValueChange={(v) => {
            if (v) mobileView = v as 'editor' | 'preview'
          }}
          variant="outline"
          size="sm"
          class="gap-0"
        >
          <ToggleGroup.Item value="editor" class="h-7 w-7 rounded-r-none" title="Editor">
            <Pencil class="h-3.5 w-3.5" />
          </ToggleGroup.Item>
          <ToggleGroup.Item value="preview" class="h-7 w-7 rounded-l-none" title="Preview">
            <Eye class="h-3.5 w-3.5" />
          </ToggleGroup.Item>
        </ToggleGroup.Root>

        <ToggleGroup.Root
          type="single"
          value={editorActiveTab}
          onValueChange={(v) => {
            if (v) editorActiveTab = v as 'system' | 'user'
          }}
          variant="outline"
          size="sm"
          class="gap-0"
        >
          <ToggleGroup.Item value="system" class="h-7 rounded-r-none px-2.5 text-xs"
            >System</ToggleGroup.Item
          >
          <ToggleGroup.Item value="user" class="h-7 rounded-l-none px-2.5 text-xs"
            >User</ToggleGroup.Item
          >
        </ToggleGroup.Root>

        <VariablePalette
          customVariables={fullPack?.variables ?? []}
          onInsert={(name) => editorRef?.insertVariable(name)}
        />

        <div class="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            class="h-8 w-8"
            disabled={!isEditorDirty}
            onclick={() => editorRef?.save()}
            title="Save"
          >
            <Save class="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            class="h-8 w-8"
            disabled={!isEditorDirty}
            onclick={() => editorRef?.discard()}
            title="Discard"
          >
            <Undo2 class="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            class="h-8 w-8"
            onclick={() => editorRef?.reset()}
            title="Reset to default"
          >
            <RotateCcw class="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    {/if}
  </div>

  <!-- Main Content -->
  {#if loading}
    <div class="flex flex-1 items-center justify-center">
      <div class="space-y-3 text-center">
        <Skeleton class="mx-auto h-6 w-48" />
        <Skeleton class="mx-auto h-4 w-32" />
      </div>
    </div>
  {:else if fullPack}
    <div class="flex flex-1 overflow-hidden">
      <!-- Left Panel (desktop only) -->
      {#if !isMobile.current}
        <div class="w-64 shrink-0 overflow-hidden border-r">
          <TemplateGroupList
            {selectedTemplateId}
            {showVariables}
            {showRuntimeVars}
            {showSettings}
            onSelectTemplate={handleSelectTemplate}
            onToggleVariables={handleToggleVariables}
            onToggleRuntimeVars={handleToggleRuntimeVars}
            onShowSettings={handleShowSettings}
          />
        </div>
      {/if}

      <!-- Right Panel -->
      <div class="flex flex-1 overflow-hidden">
        {#if showVariables}
          <div class="flex-1 overflow-hidden">
            <VariableManager
              {packId}
              variables={fullPack?.variables ?? []}
              previewValues={variablePreviewValues}
              onVariablesChanged={refreshPack}
            />
          </div>
        {:else if showRuntimeVars}
          <div class="flex-1 overflow-hidden">
            <RuntimeVariableManager
              {packId}
              runtimeVariables={fullPack?.runtimeVariables ?? []}
              previewValues={variablePreviewValues}
              onVariablesChanged={refreshPack}
            />
          </div>
        {:else if selectedTemplateId}
          <div class="flex-1 overflow-hidden">
            <TemplateEditor
              bind:this={editorRef}
              {packId}
              templateId={selectedTemplateId}
              customVariables={fullPack.variables}
              activeTab={editorActiveTab}
              {mobileView}
              {testValues}
              hasCustomVariables={(fullPack?.variables.length ?? 0) > 0}
              onTestVarsOpen={() => (showTestVars = true)}
              onDirtyChange={handleDirtyChange}
              onActiveTabChange={(tab) => (editorActiveTab = tab)}
            />
          </div>
        {:else}
          <!-- Pack Settings (default view) -->
          <div class="flex flex-1 flex-col overflow-y-auto p-6">
            <div class="mx-auto w-full max-w-2xl space-y-6">
              <!-- Header -->
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <Settings class="text-muted-foreground h-4 w-4" />
                  <h3 class="text-sm font-medium">Pack Settings</h3>
                </div>
                {#if !editingSettings && !fullPack.pack.isDefault}
                  <Button
                    variant="ghost"
                    size="sm"
                    class="h-7 gap-1.5 text-xs"
                    onclick={startEditSettings}
                  >
                    <Pencil class="h-3.5 w-3.5" />
                    Edit
                  </Button>
                {/if}
              </div>

              {#if editingSettings}
                <!-- Edit mode -->
                <div class="space-y-4">
                  <div class="space-y-1.5">
                    <Label for="pack-name">Name</Label>
                    <Input id="pack-name" bind:value={settingsDraft.name} placeholder="Pack name" />
                  </div>

                  <div class="space-y-1.5">
                    <Label for="pack-author">Author</Label>
                    <Input
                      id="pack-author"
                      bind:value={settingsDraft.author}
                      placeholder="Author name"
                    />
                  </div>

                  <div class="space-y-1.5">
                    <Label for="pack-desc">Description</Label>
                    <p class="text-muted-foreground text-xs">Supports Markdown and HTML</p>
                    <Textarea
                      id="pack-desc"
                      bind:value={settingsDraft.description}
                      rows={8}
                      placeholder="Describe your pack..."
                      class="font-mono text-sm"
                    />
                  </div>

                  <div class="flex gap-2">
                    <Button size="sm" onclick={saveSettings} disabled={!settingsDraft.name.trim()}>
                      <Check class="mr-1.5 h-3.5 w-3.5" />
                      Save
                    </Button>
                    <Button variant="ghost" size="sm" onclick={discardSettings}>
                      <X class="mr-1.5 h-3.5 w-3.5" />
                      Cancel
                    </Button>
                  </div>
                </div>
              {:else}
                <!-- Read-only display -->
                <div class="space-y-4">
                  <div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                    <span class="text-muted-foreground">Name</span>
                    <span>{fullPack.pack.name}</span>
                    <span class="text-muted-foreground">Author</span>
                    <span>{fullPack.pack.author || '—'}</span>
                  </div>

                  {#if fullPack.pack.description}
                    <div class="border-t pt-4">
                      <div class="prose-content text-sm">
                        {@html renderDescription(fullPack.pack.description)}
                      </div>
                    </div>
                  {:else if !fullPack.pack.isDefault}
                    <div class="text-muted-foreground border-t pt-4 text-center text-sm">
                      No description. Click Edit to add one.
                    </div>
                  {/if}
                </div>
              {/if}

              <div class="space-y-3 border-t pt-4">
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <h4 class="text-sm font-medium">Template Compatibility</h4>
                    <p class="text-muted-foreground text-xs">
                      Checks syntax and variable references without changing custom templates.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    class="h-7 gap-1.5 text-xs"
                    onclick={loadCompatibility}
                    disabled={compatibilityLoading}
                  >
                    <RefreshCw
                      class={compatibilityLoading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'}
                    />
                    Check
                  </Button>
                </div>

                {#if compatibilityLoading}
                  <p class="text-muted-foreground text-xs">Checking templates...</p>
                {:else if compatibility}
                  {#if compatibility.compatible}
                    <p
                      class="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-600 dark:text-emerald-400"
                    >
                      Compatible with the current prompt contract.
                    </p>
                  {:else}
                    <div
                      class="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs"
                    >
                      {#if compatibility.missingTemplateIds.length > 0}
                        <div>
                          <p class="font-medium text-amber-700 dark:text-amber-300">
                            Missing templates
                          </p>
                          <p class="text-muted-foreground mt-1 break-words">
                            {compatibility.missingTemplateIds.join(', ')}
                          </p>
                        </div>
                      {/if}
                      {#if compatibility.issues.length > 0}
                        <div>
                          <p class="font-medium text-amber-700 dark:text-amber-300">
                            Template issues
                          </p>
                          <ul class="text-muted-foreground mt-1 list-disc space-y-1 pl-4">
                            {#each compatibility.issues as issue (`${issue.templateId}:${issue.type}:${issue.message}`)}
                              <li>{issue.templateId}: {issue.message}</li>
                            {/each}
                          </ul>
                        </div>
                      {/if}
                    </div>
                  {/if}
                {/if}
              </div>

              <div class="space-y-3 border-t pt-4">
                <div>
                  <h4 class="text-sm font-medium">Prompt Contract</h4>
                  <p class="text-muted-foreground text-xs">
                    Built-in variables are injected automatically. Custom and entity runtime
                    variables are editable per pack.
                  </p>
                </div>
                <div class="grid gap-2 sm:grid-cols-3">
                  <button
                    type="button"
                    class="border-border bg-muted/20 hover:bg-muted/40 rounded-md border p-3 text-left transition-colors"
                    onclick={handleToggleVariables}
                  >
                    <span class="text-muted-foreground block text-[11px] uppercase"
                      >Custom variables</span
                    >
                    <span class="text-foreground text-lg font-semibold"
                      >{fullPack.variables.length}</span
                    >
                    <span class="text-muted-foreground block text-[11px]">View variables</span>
                  </button>
                  <button
                    type="button"
                    class="border-border bg-muted/20 hover:bg-muted/40 rounded-md border p-3 text-left transition-colors"
                    onclick={handleToggleRuntimeVars}
                  >
                    <span class="text-muted-foreground block text-[11px] uppercase"
                      >Entity runtime vars</span
                    >
                    <span class="text-foreground text-lg font-semibold"
                      >{fullPack.runtimeVariables?.length ?? 0}</span
                    >
                    <span class="text-muted-foreground block text-[11px]">View definitions</span>
                  </button>
                  <div class="border-border bg-muted/20 rounded-md border p-3">
                    <span class="text-muted-foreground block text-[11px] uppercase"
                      >Built-in prompt vars</span
                    >
                    <span class="text-foreground text-lg font-semibold"
                      >{systemVariableCount + promptRuntimeVariableCount}</span
                    >
                    <span class="text-muted-foreground block text-[11px]"
                      >{systemVariableCount} system + {promptRuntimeVariableCount} runtime</span
                    >
                  </div>
                </div>
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>
  {:else}
    <div class="flex flex-1 items-center justify-center">
      <p class="text-muted-foreground text-sm">Pack not found</p>
    </div>
  {/if}
</div>

<!-- Mobile Drawer for template navigation -->
{#if isMobile.current}
  <Drawer.Root bind:open={drawerOpen}>
    <Drawer.Content class="h-[70vh]">
      <Drawer.Header>
        <Drawer.Title>Templates</Drawer.Title>
      </Drawer.Header>
      <div class="flex-1 overflow-hidden">
        <TemplateGroupList
          {selectedTemplateId}
          {showVariables}
          {showRuntimeVars}
          {showSettings}
          onSelectTemplate={handleSelectTemplate}
          onToggleVariables={handleToggleVariables}
          onToggleRuntimeVars={handleToggleRuntimeVars}
          onShowSettings={handleShowSettings}
        />
      </div>
    </Drawer.Content>
  </Drawer.Root>
{/if}

<!-- Test Variables modal -->
<TestVariablesModal
  open={showTestVars}
  customVariables={fullPack?.variables ?? []}
  {testValues}
  onOpenChange={(open) => (showTestVars = open)}
  onTestValuesChange={handleTestValuesChange}
/>

<!-- Dirty guard dialog -->
<Dialog.Root bind:open={showDirtyDialog}>
  <Dialog.Content class="gap-4 py-6 sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>Unsaved Changes</Dialog.Title>
      <Dialog.Description>You have unsaved changes. What would you like to do?</Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer class="flex gap-2 sm:justify-end">
      <Button variant="outline" onclick={handleCancelSwitch}>Cancel</Button>
      <Button variant="secondary" onclick={handleDiscardAndSwitch}>Discard</Button>
      <Button onclick={handleSaveAndSwitch}>Save & Continue</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

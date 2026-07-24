<script lang="ts">
  import { characterVault } from '$lib/stores/characterVault.svelte'
  import { lorebookVault } from '$lib/stores/lorebookVault.svelte'
  import { scenarioVault } from '$lib/stores/scenarioVault.svelte'
  import { ui } from '$lib/stores/ui.svelte'
  import type { VaultCharacter, VaultLorebook, VaultScenario } from '$lib/types'
  import {
    Plus,
    Search as SearchIcon,
    Star,
    Users,
    ChevronLeft,
    Upload,
    Archive,
    Book,
    Globe,
    MapPin,
    Tags,
    Bot,
    FileCode,
    Download,
  } from 'lucide-svelte'
  import UniversalVaultCard from './UniversalVaultCard.svelte'
  import InteractiveVaultAssistant from './InteractiveVaultAssistant.svelte'
  import VaultCharacterForm from './VaultCharacterForm.svelte'
  import VaultLorebookEditor from './VaultLorebookEditor.svelte'
  import VaultScenarioEditor from './VaultScenarioEditor.svelte'
  import type { FocusedEntity } from '$lib/services/ai/vault/InteractiveVaultService'
  import DiscoveryModal from '$lib/components/discovery/DiscoveryModal.svelte'
  import TagFilter from './TagFilter.svelte'
  import TagManager from '$lib/components/tags/TagManager.svelte'
  import { tagStore } from '$lib/stores/tags.svelte'
  import { fade } from 'svelte/transition'
  import { tick } from 'svelte'
  import PromptPackList from './prompts/PromptPackList.svelte'
  import PromptPackEditor from './prompts/PromptPackEditor.svelte'
  import ImportPreviewDialog from './prompts/ImportPreviewDialog.svelte'
  import VaultExportModal from './VaultExportModal.svelte'
  import * as ResponsiveModal from '$lib/components/ui/responsive-modal'
  import {
    importExportService,
    type ImportValidationResult,
    type ConflictStrategy,
  } from '$lib/services/packs/import-export'
  import type { PresetPack } from '$lib/services/packs/types'

  // Shared Components
  import EmptyState from '$lib/components/ui/empty-state/empty-state.svelte'

  // Shadcn Components
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs'
  import { Badge } from '$lib/components/ui/badge'
  import { Skeleton } from '$lib/components/ui/skeleton'
  import { ScrollArea } from '$lib/components/ui/scroll-area'
  import { cn } from '$lib/utils/cn'

  // Types
  import type { VaultTab } from '$lib/stores/ui.svelte'
  type VaultType = 'character' | 'lorebook' | 'scenario'

  type AnyVaultItem = VaultCharacter | VaultLorebook | VaultScenario

  // State
  let activeTab = $state<VaultTab>(ui.vaultTab)
  let searchInput = $state('')
  let searchQuery = $state('')
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  $effect(() => {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      searchQuery = searchInput
    }, 300)
  })
  let showFavoritesOnly = $state(false)
  let selectedTags = $state<string[]>([])
  let filterLogic = $state<'AND' | 'OR'>('OR')
  let showTagManager = $state(false)
  let showCreatePackDialog = $state(false)

  // Import state
  let importDialogOpen = $state(false)
  let importValidation = $state<ImportValidationResult | null>(null)
  let importConflictPack = $state<PresetPack | null>(null)
  // Prompts tab view state
  type PromptsViewState = { mode: 'browsing' } | { mode: 'editing'; packId: string }
  let promptsViewState = $state<PromptsViewState>({ mode: 'browsing' })
  let isPromptEditorDirty = $state(false)
  let promptEditorRef = $state<PromptPackEditor | null>(null)

  // Modal States
  let showCharForm = $state(false)
  let editingCharacter = $state<VaultCharacter | null>(null)
  let editingLorebook = $state<VaultLorebook | null>(null)
  let editingScenarioId = $state<string | null>(null)
  let editingScenario = $derived(
    editingScenarioId ? (scenarioVault.getById(editingScenarioId) ?? null) : null,
  )

  let showDiscoveryModal = $state(false)
  let discoveryMode = $state<VaultType>('character')
  let showVaultAssistant = $state(false)
  let assistantFocusedEntity = $state<FocusedEntity | null>(null)

  type CharacterDuplicateGroup = {
    key: string
    name: string
    items: VaultCharacter[]
    keepId: string
  }
  let showCharacterDedup = $state(false)
  let duplicateGroups = $state<CharacterDuplicateGroup[]>([])
  let dedupBusy = $state(false)

  // Export modal state
  let exportEntity = $state<VaultLorebook | VaultCharacter | VaultScenario | null>(null)
  let exportEntityType = $state<'lorebook' | 'character' | 'scenario' | null>(null)

  async function openAssistantWithEntity(entity: FocusedEntity) {
    showCharForm = false
    editingCharacter = null
    editingLorebook = null
    editingScenarioId = null
    // Two-phase wait to avoid a race with bits-ui's deferred scroll lock cleanup.
    //
    // When the entity editor unmounts, bits-ui schedules `resetBodyStyle()` via
    // requestAnimationFrame — NOT synchronously and NOT in the same microtask as
    // tick(). If we mount the assistant immediately after tick(), the assistant's
    // useBodyScrollLock captures `initialBodyStyle` while the body still has the
    // entity editor's pointer-events:none/overflow:hidden applied. Later when the
    // assistant closes, `resetBodyStyle()` restores that dirty style, freezing the UI.
    //
    // Fix: tick() lets Svelte unmount the entity editor and schedule the rAF.
    // The second await (a new rAF) runs AFTER the entity editor's rAF, which runs
    // first (FIFO). By the time we set showVaultAssistant = true, the body is clean.
    await tick()
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    assistantFocusedEntity = entity
    showVaultAssistant = true
  }

  // Configuration
  interface VaultSectionConfig {
    id: VaultTab
    label: string
    icon: typeof Users
    type: VaultType
    store: typeof characterVault | typeof lorebookVault | typeof scenarioVault
    singularLabel: string
    emptyIcon: typeof Users
    emptyTitle: string
    emptyDesc: string
    createLabel?: string
    createAction?: () => void
    importLabel: string
    importAction: (e: Event) => void
  }

  const sections: VaultSectionConfig[] = [
    {
      id: 'characters',
      label: 'Characters',
      icon: Users,
      type: 'character',
      store: characterVault,
      singularLabel: 'Character',
      emptyIcon: Users,
      emptyTitle: 'No characters in vault yet',
      emptyDesc: 'Create your first character to get started.',
      createLabel: 'New Character',
      createAction: openCreateCharForm,
      importLabel: 'Import Card',
      importAction: handleImportCard,
    },
    {
      id: 'lorebooks',
      label: 'Lorebooks',
      icon: Book,
      type: 'lorebook',
      store: lorebookVault,
      singularLabel: 'Lorebook',
      emptyIcon: Book,
      emptyTitle: 'No lorebooks in vault yet',
      emptyDesc: 'Create a new lorebook or import one from a file.',
      createLabel: 'New Lorebook',
      createAction: handleCreateLorebook,
      importLabel: 'Import Lorebook',
      importAction: handleImportLorebook,
    },
    {
      id: 'scenarios',
      label: 'Scenarios',
      icon: MapPin,
      type: 'scenario',
      store: scenarioVault,
      singularLabel: 'Scenario',
      emptyIcon: MapPin,
      emptyTitle: 'No scenarios in vault yet',
      emptyDesc: 'Import character cards to extract scenario settings.',
      createLabel: 'New Scenario',
      createAction: handleCreateScenario,
      importLabel: 'Import Card',
      importAction: handleImportScenario,
    },
  ]

  // Helper function to filter items
  function getFilteredItems<
    T extends {
      tags: string[]
      favorite: boolean
      name: string
      description: string | null
      traits?: string[]
    },
  >(items: T[]): T[] {
    let result = items

    if (showFavoritesOnly) {
      result = result.filter((item) => item.favorite)
    }

    if (selectedTags.length > 0) {
      if (filterLogic === 'AND') {
        result = result.filter((item) => selectedTags.every((tag) => item.tags.includes(tag)))
      } else {
        result = result.filter((item) => selectedTags.some((tag) => item.tags.includes(tag)))
      }
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(
        (item) =>
          item.name.toLowerCase().includes(query) ||
          item.description?.toLowerCase().includes(query) ||
          item.tags.some((t) => t.toLowerCase().includes(query)) ||
          item.traits?.some((t) => t.toLowerCase().includes(query)),
      )
    }

    return result
  }

  // Memoised filtered items per tab — only recomputes when deps change
  let filteredByTab = $derived.by(() => ({
    characters: getFilteredItems(characterVault.items as AnyVaultItem[]),
    lorebooks: getFilteredItems(lorebookVault.items as AnyVaultItem[]),
    scenarios: getFilteredItems(scenarioVault.items as AnyVaultItem[]),
    prompts: [],
  }))

  // Load on mount
  $effect(() => {
    if (!characterVault.isLoaded) characterVault.load()
    if (!lorebookVault.isLoaded) lorebookVault.load()
    if (!scenarioVault.isLoaded) scenarioVault.load()
    if (!tagStore.isLoaded) tagStore.load()
  })

  // Sync with UI store
  $effect(() => {
    activeTab = ui.vaultTab
    selectedTags = []
  })

  $effect(() => {
    ui.setVaultTab(activeTab)
    selectedTags = []
  })

  // Handlers
  function openCreateCharForm() {
    editingCharacter = null
    showCharForm = true
  }

  function openEditCharForm(character: VaultCharacter) {
    editingCharacter = character
    showCharForm = true
  }

  function handleImportCard(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    characterVault.importFromFile(file)
    input.value = ''
  }

  function handleImportLorebook(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    lorebookVault.importFromFile(file)
    input.value = ''
  }

  async function handleCreateLorebook() {
    const newLorebook = await lorebookVault.add({
      name: '',
      description: null,
      entries: [],
      tags: [],
      favorite: false,
      source: 'manual',
      originalFilename: null,
      originalStoryId: null,
      metadata: {
        format: 'aventura',
        totalEntries: 0,
        entryBreakdown: {
          character: 0,
          location: 0,
          item: 0,
          faction: 0,
          concept: 0,
          event: 0,
        },
      },
    })
    editingLorebook = newLorebook
  }

  async function handleCreateScenario() {
    const newScenario = await scenarioVault.add({
      name: '',
      description: null,
      settingSeed: '',
      npcs: [],
      primaryCharacterName: '',
      firstMessage: null,
      alternateGreetings: [],
      tags: [],
      favorite: false,
      source: 'manual',
      originalFilename: null,
      metadata: null,
    })
    editingScenarioId = newScenario.id
  }

  function handleImportScenario(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    scenarioVault.importFromFile(file)
    input.value = ''
  }

  function openBrowseOnline(mode: VaultType) {
    discoveryMode = mode
    showDiscoveryModal = true
  }

  // Generic Edit/Delete handlers
  function handleEdit(item: AnyVaultItem, type: VaultType) {
    if (type === 'character') openEditCharForm(item as VaultCharacter)
    else if (type === 'lorebook') editingLorebook = item as VaultLorebook
    else if (type === 'scenario') editingScenarioId = (item as VaultScenario).id
  }

  function handleOpenPack(packId: string) {
    promptsViewState = { mode: 'editing', packId }
  }

  function normalizeCharacterName(name: string): string {
    return name.trim().toLowerCase().replace(/\s+/g, ' ')
  }

  function buildCharacterDuplicateGroups(): CharacterDuplicateGroup[] {
    const grouped = new Map<string, VaultCharacter[]>()
    for (const item of characterVault.items) {
      const key = normalizeCharacterName(item.name)
      if (!key) continue
      const bucket = grouped.get(key)
      if (bucket) bucket.push(item)
      else grouped.set(key, [item])
    }

    const groups: CharacterDuplicateGroup[] = []
    for (const [key, items] of grouped.entries()) {
      if (items.length < 2) continue
      const sorted = [...items].sort((a, b) => b.updatedAt - a.updatedAt)
      groups.push({
        key,
        name: sorted[0].name,
        items: sorted,
        keepId: sorted[0].id,
      })
    }
    return groups.sort((a, b) => a.name.localeCompare(b.name))
  }

  function openCharacterDedup() {
    duplicateGroups = buildCharacterDuplicateGroups()
    showCharacterDedup = true
  }

  function selectDedupKeep(groupKey: string, keepId: string) {
    duplicateGroups = duplicateGroups.map((group) =>
      group.key === groupKey ? { ...group, keepId } : group,
    )
  }

  async function mergeDuplicateGroup(group: CharacterDuplicateGroup) {
    const keep = characterVault.getById(group.keepId)
    if (!keep) {
      ui.showToast('Selected keep character not found', 'error')
      return
    }

    const toMerge = group.items.filter((item) => item.id !== keep.id)
    if (toMerge.length === 0) return

    const mergedTraits = Array.from(new Set([...keep.traits, ...toMerge.flatMap((c) => c.traits)]))
    const mergedTags = Array.from(new Set([...keep.tags, ...toMerge.flatMap((c) => c.tags)]))

    const mergedVisualDescriptors = { ...(keep.visualDescriptors || {}) }
    for (const item of toMerge) {
      for (const [k, v] of Object.entries(item.visualDescriptors || {})) {
        if (!mergedVisualDescriptors[k as keyof typeof mergedVisualDescriptors] && v) {
          ;(mergedVisualDescriptors as Record<string, string | undefined>)[k] = v
        }
      }
    }

    let mergedDescription = keep.description
    if (!mergedDescription || !mergedDescription.trim()) {
      const candidate = toMerge.find((item) => item.description && item.description.trim())
      mergedDescription = candidate?.description ?? keep.description
    }

    let mergedPortrait = keep.portrait
    if (!mergedPortrait) {
      const candidate = toMerge.find((item) => !!item.portrait)
      mergedPortrait = candidate?.portrait ?? null
    }

    const mergedFavorite = keep.favorite || toMerge.some((item) => item.favorite)

    const mergedMetadata = {
      ...(keep.metadata || {}),
      ...Object.assign({}, ...toMerge.map((item) => item.metadata || {})),
    }

    await characterVault.update(keep.id, {
      description: mergedDescription ?? null,
      traits: mergedTraits,
      tags: mergedTags,
      visualDescriptors: mergedVisualDescriptors,
      portrait: mergedPortrait,
      favorite: mergedFavorite,
      metadata: Object.keys(mergedMetadata).length > 0 ? mergedMetadata : null,
    })

    for (const item of toMerge) {
      await characterVault.delete(item.id)
    }

    ui.showToast(`Merged ${toMerge.length + 1} duplicates for ${keep.name}`, 'info')
    duplicateGroups = buildCharacterDuplicateGroups()
  }

  async function mergeAllDuplicateGroups() {
    if (duplicateGroups.length === 0 || dedupBusy) return
    dedupBusy = true
    try {
      for (const group of duplicateGroups) {
        await mergeDuplicateGroup(group)
      }
      duplicateGroups = buildCharacterDuplicateGroups()
    } finally {
      dedupBusy = false
    }
  }

  function guardPromptNavigation(action: () => void) {
    if (
      activeTab === 'prompts' &&
      promptsViewState.mode === 'editing' &&
      isPromptEditorDirty &&
      promptEditorRef
    ) {
      promptEditorRef.guardNavigation(() => {
        promptsViewState = { mode: 'browsing' }
        action()
      })
    } else {
      if (activeTab === 'prompts' && promptsViewState.mode === 'editing') {
        promptsViewState = { mode: 'browsing' }
      }
      action()
    }
  }

  // Import pack handlers
  async function handleImportPack() {
    const content = await importExportService.pickAndReadImportFile()
    if (!content) return
    const result = importExportService.validateImport(content)
    importValidation = result
    if (result.valid && result.pack) {
      importConflictPack = await importExportService.checkNameConflict(result.pack.name)
    } else {
      importConflictPack = null
    }
    importDialogOpen = true
  }

  async function handleImportConfirm(strategy: ConflictStrategy) {
    if (!importValidation?.pack) return
    try {
      const newPackId = await importExportService.applyImport(
        importValidation.pack,
        strategy,
        importConflictPack ?? undefined,
      )
      if (newPackId) {
        ui.showToast('Pack imported successfully', 'info')
      }
    } catch (e) {
      console.error('Import failed:', e)
      ui.showToast('Import failed', 'error')
    } finally {
      importDialogOpen = false
      importValidation = null
      importConflictPack = null
    }
  }
</script>

<Tabs
  value={activeTab}
  onValueChange={(v) => {
    if (!v) return
    const newTab = v as VaultTab
    if (newTab === activeTab) return
    guardPromptNavigation(() => {
      activeTab = newTab
    })
  }}
  class="bg-background flex h-full flex-col"
>
  <!-- Header -->
  <div class="bg-muted/20 flex flex-col border-b">
    <!-- Top Bar -->
    <div class="flex items-center gap-2 px-4 py-3">
      <div class="flex shrink-0 items-center gap-1">
        <Button
          variant="link"
          size="icon"
          class="text-muted-foreground hover:text-foreground -ml-2 h-9 w-9"
          onclick={() => guardPromptNavigation(() => ui.setActivePanel('library'))}
          title="Back to Library"
        >
          <ChevronLeft class="h-5 w-5" />
        </Button>
        <div class="flex items-center gap-2">
          <Archive class="text-muted-foreground h-5 w-5" />
          <h2 class="text-lg font-semibold tracking-tight">Vault</h2>
        </div>
      </div>

      <!-- Right Side Actions -->
      <div
        class="flex flex-1 items-center justify-end gap-2 [&_[data-button-label]]:max-lg:!hidden"
      >
        <Button
          icon={Bot}
          label="Vault Assistant"
          variant="outline"
          size="sm"
          class="h-9"
          onclick={() => (showVaultAssistant = true)}
        />

        {#if activeTab === 'prompts' && promptsViewState.mode === 'browsing'}
          <Button
            icon={Download}
            label="Import"
            variant="outline"
            size="sm"
            class="h-9"
            onclick={handleImportPack}
          />

          <Button
            icon={Plus}
            label="New Pack"
            size="sm"
            class="h-9"
            onclick={() => (showCreatePackDialog = true)}
          />
        {:else if activeTab !== 'prompts'}
          <Button
            icon={Tags}
            label="Tags"
            variant="outline"
            size="sm"
            class="h-9"
            onclick={() => (showTagManager = true)}
          />

          {#each sections as section (section.id)}
            {#if activeTab === section.id}
              {#if section.id === 'characters'}
                <Button
                  icon={Users}
                  label="De-dup"
                  variant="outline"
                  size="sm"
                  class="h-9"
                  onclick={openCharacterDedup}
                />
              {/if}

              <Button
                icon={Globe}
                label="Browse Online"
                variant="outline"
                size="sm"
                class="h-9"
                onclick={() => openBrowseOnline(section.type)}
              />

              <div class="relative">
                <Button
                  icon={Upload}
                  label={section.importLabel}
                  variant="outline"
                  size="sm"
                  class="h-9 cursor-pointer"
                />
                <input
                  type="file"
                  accept={section.id === 'lorebooks' ? '.json,application/json' : '.json,.png'}
                  class="absolute inset-0 cursor-pointer opacity-0"
                  onchange={section.importAction}
                />
              </div>

              {#if section.createAction}
                <Button
                  icon={Plus}
                  label={section.createLabel!}
                  size="sm"
                  class="h-9"
                  onclick={section.createAction}
                />
              {/if}
            {/if}
          {/each}
        {/if}
      </div>
    </div>

    <!-- Tab Bar -->
    <div class="px-4 pb-2">
      <TabsList class="bg-muted/50 grid w-full max-w-lg grid-cols-4">
        {#each sections as section (section.id)}
          <TabsTrigger value={section.id} class="flex items-center gap-2">
            <section.icon class="h-4 w-4" />
            <span class="hidden sm:inline">{section.label}</span>
            <Badge variant="secondary" class="ml-1 h-5 px-1 py-0 text-[10px]">
              {section.store.items.length}
            </Badge>
          </TabsTrigger>
        {/each}
        <TabsTrigger value="prompts" class="flex items-center gap-2">
          <FileCode class="h-4 w-4" />
          <span class="hidden sm:inline">Prompts</span>
        </TabsTrigger>
      </TabsList>
    </div>
  </div>

  <!-- Search and Filters (hidden for Prompts tab) -->
  <div
    class="bg-background/95 supports-[backdrop-filter]:bg-background/60 flex flex-col gap-3 p-4 backdrop-blur"
    class:hidden={activeTab === 'prompts'}
  >
    <div class="flex items-center gap-2">
      <Input
        type="text"
        bind:value={searchInput}
        placeholder={`Search ${activeTab}...`}
        class="bg-muted/40 flex-1"
        leftIcon={SearchIcon}
      />

      <div class="flex shrink-0 items-center gap-2">
        <TagFilter
          {selectedTags}
          logic={filterLogic}
          type={sections.find((s) => s.id === activeTab)?.type || 'character'}
          onUpdate={(tags, logic) => {
            selectedTags = tags
            filterLogic = logic
          }}
        />

        <Button
          icon={Star}
          label="Favorites"
          variant="outline"
          size="default"
          class={cn(
            'transition-all',
            showFavoritesOnly &&
              'border-yellow-500/50 bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20 hover:text-yellow-700',
          )}
          iconClass={cn('h-3 w-3', showFavoritesOnly && 'fill-yellow-500 text-yellow-500')}
          onclick={() => (showFavoritesOnly = !showFavoritesOnly)}
        />
      </div>
    </div>
  </div>

  <!-- Content -->
  {#each sections as section (section.id)}
    <TabsContent
      value={section.id}
      class="m-0 flex-1 overflow-hidden p-0 outline-none data-[state=inactive]:hidden"
    >
      <ScrollArea class="h-full">
        <div class="flex min-h-full flex-col px-4 pb-36 sm:pb-16">
          {#if !section.store.isLoaded}
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {#each Array(6) as _, i (i)}
                <div class="space-y-3">
                  <Skeleton class="h-[200px] w-full rounded-xl" />
                  <div class="space-y-2">
                    <Skeleton class="h-4 w-[250px]" />
                    <Skeleton class="h-4 w-[200px]" />
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            {@const filteredItems = filteredByTab[section.id]}

            {#if filteredItems.length === 0}
              <div in:fade class="flex flex-1 flex-col items-center justify-center">
                <EmptyState
                  icon={section.emptyIcon}
                  title={searchQuery || showFavoritesOnly
                    ? `No ${section.label.toLowerCase()} match your filters`
                    : section.emptyTitle}
                  description={searchQuery || showFavoritesOnly
                    ? 'Try adjusting your search terms or filters.'
                    : section.emptyDesc}
                >
                  {#if !searchQuery && !showFavoritesOnly}
                    <div class="flex flex-col items-center gap-3 sm:flex-row">
                      {#if section.createAction}
                        <Button onclick={section.createAction}>
                          <Plus class="h-4 w-4" />
                          {section.createLabel}
                        </Button>
                      {/if}
                      <Button variant="outline" onclick={() => openBrowseOnline(section.type)}>
                        <Globe class="h-4 w-4" />
                        Browse Online
                      </Button>
                    </div>
                  {/if}
                </EmptyState>
              </div>
            {:else}
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" in:fade>
                {#each filteredItems as item, i (i)}
                  <UniversalVaultCard
                    item={item as AnyVaultItem}
                    type={section.type}
                    onEdit={() => handleEdit(item, section.type)}
                    onDelete={() => section.store.delete(item.id)}
                    onToggleFavorite={() => section.store.toggleFavorite(item.id)}
                    onExport={() => {
                      exportEntity = item
                      exportEntityType = section.type
                    }}
                    onDuplicate={async () => {
                      try {
                        const result = await section.store.duplicate(item.id)
                        if (!result) {
                          ui.showToast(
                            `Original ${section.singularLabel.toLowerCase()} not found`,
                            'error',
                          )
                          return
                        }
                        ui.showToast(`${section.singularLabel} duplicated`, 'info')
                      } catch (e) {
                        console.error('Duplicate failed:', e)
                        ui.showToast(
                          `Failed to duplicate ${section.singularLabel.toLowerCase()}`,
                          'error',
                        )
                      }
                    }}
                  />
                {/each}
              </div>
            {/if}
          {/if}
        </div>
      </ScrollArea>
    </TabsContent>
  {/each}

  <!-- Prompts Tab Content -->
  <TabsContent
    value="prompts"
    class="m-0 flex-1 overflow-hidden p-0 outline-none data-[state=inactive]:hidden"
  >
    {#if promptsViewState.mode === 'browsing'}
      <ScrollArea class="h-full">
        <div class="flex min-h-full flex-col px-4 pt-4 pb-36 sm:pb-16">
          <PromptPackList
            onOpenPack={handleOpenPack}
            bind:showCreateDialog={showCreatePackDialog}
          />
        </div>
      </ScrollArea>
    {:else}
      <PromptPackEditor
        bind:this={promptEditorRef}
        packId={promptsViewState.packId}
        onClose={() => {
          promptsViewState = { mode: 'browsing' }
        }}
        onDirtyChange={(dirty) => {
          isPromptEditorDirty = dirty
        }}
      />
    {/if}
  </TabsContent>
</Tabs>

<!-- Character Form Modal -->
{#if showCharForm}
  <VaultCharacterForm
    character={editingCharacter}
    onClose={() => {
      showCharForm = false
      editingCharacter = null
    }}
    onOpenAssistant={openAssistantWithEntity}
  />
{/if}

<!-- Lorebook Editor Modal -->
{#if editingLorebook}
  <VaultLorebookEditor
    lorebook={editingLorebook}
    onClose={() => (editingLorebook = null)}
    onOpenAssistant={openAssistantWithEntity}
  />
{/if}

<!-- Scenario Editor Modal -->
{#if editingScenario}
  <VaultScenarioEditor
    scenario={editingScenario}
    onClose={() => (editingScenarioId = null)}
    onOpenAssistant={openAssistantWithEntity}
  />
{/if}

<!-- Discovery Modal -->
<DiscoveryModal
  isOpen={showDiscoveryModal}
  mode={discoveryMode}
  onClose={() => (showDiscoveryModal = false)}
/>

<!-- Tag Manager Modal -->
{#if showTagManager}
  <TagManager open={showTagManager} onOpenChange={(v) => (showTagManager = v)} />
{/if}

<!-- Vault Assistant Overlay -->
{#if showVaultAssistant}
  <InteractiveVaultAssistant
    focusedEntity={assistantFocusedEntity}
    onClose={() => {
      showVaultAssistant = false
      assistantFocusedEntity = null
    }}
  />
{/if}
<!-- Export Modal -->
{#if exportEntity && exportEntityType}
  <VaultExportModal
    entity={exportEntity}
    entityType={exportEntityType}
    onClose={() => {
      exportEntity = null
      exportEntityType = null
    }}
  />
{/if}
<!-- Import Preview Dialog -->
<ImportPreviewDialog
  open={importDialogOpen}
  validationResult={importValidation}
  conflictPack={importConflictPack}
  onConfirm={handleImportConfirm}
  onCancel={() => {
    importDialogOpen = false
    importValidation = null
    importConflictPack = null
  }}
/>

<!-- Character De-dup Modal -->
<ResponsiveModal.Root
  open={showCharacterDedup}
  onOpenChange={(open) => {
    showCharacterDedup = open
    if (open) duplicateGroups = buildCharacterDuplicateGroups()
  }}
>
  <ResponsiveModal.Content class="sm:max-w-2xl">
    <ResponsiveModal.Header>
      <ResponsiveModal.Title>Character De-dup</ResponsiveModal.Title>
      <ResponsiveModal.Description>
        Review duplicate character names and choose which one to keep in each group.
      </ResponsiveModal.Description>
    </ResponsiveModal.Header>

    <div class="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
      {#if duplicateGroups.length === 0}
        <p class="text-muted-foreground text-sm">No duplicate character names found.</p>
      {:else}
        {#each duplicateGroups as group (group.key)}
          <div class="rounded-lg border p-3">
            <div class="mb-2 flex items-center justify-between">
              <div class="text-sm font-medium">{group.name}</div>
              <Badge variant="secondary">{group.items.length} duplicates</Badge>
            </div>

            <div class="space-y-2">
              {#each group.items as item (item.id)}
                <button
                  type="button"
                  class={cn(
                    'w-full rounded-md border px-2.5 py-2 text-left text-xs transition-colors',
                    group.keepId === item.id
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border text-muted-foreground hover:bg-muted/50',
                  )}
                  onclick={() => selectDedupKeep(group.key, item.id)}
                >
                  <div class="font-medium">{item.name}</div>
                  <div class="mt-1 line-clamp-2 opacity-80">{item.description || 'No description'}</div>
                  <div class="mt-1.5 opacity-70">
                    Updated: {new Date(item.updatedAt).toLocaleString()}
                    {#if item.favorite}
                      • Favorite
                    {/if}
                  </div>
                </button>
              {/each}
            </div>

            <div class="mt-2 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onclick={() => mergeDuplicateGroup(group)}
                disabled={dedupBusy}
              >
                Merge This Group
              </Button>
            </div>
          </div>
        {/each}
      {/if}
    </div>

    <ResponsiveModal.Footer>
      <Button variant="outline" onclick={() => (showCharacterDedup = false)} disabled={dedupBusy}
        >Close</Button
      >
      <Button onclick={mergeAllDuplicateGroups} disabled={dedupBusy || duplicateGroups.length === 0}
        >{dedupBusy ? 'Merging…' : 'Merge All'}</Button
      >
    </ResponsiveModal.Footer>
  </ResponsiveModal.Content>
</ResponsiveModal.Root>

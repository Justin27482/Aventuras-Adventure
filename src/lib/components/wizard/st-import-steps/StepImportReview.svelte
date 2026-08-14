<script lang="ts">
  import {
    User,
    Users,
    MapPin,
    BookOpen,
    MessageSquare,
    FileText,
    Loader2,
    AlertCircle,
    Save,
    X,
    CheckCircle2,
    Circle,
  } from 'lucide-svelte'
  import * as Card from '$lib/components/ui/card'
  import * as Alert from '$lib/components/ui/alert'
  import { Input } from '$lib/components/ui/input'
  import { Label } from '$lib/components/ui/label'
  import { Badge } from '$lib/components/ui/badge'
  import { Switch } from '$lib/components/ui/switch'
  import { Button } from '$lib/components/ui/button'
  import ChapterizeOptions from '$lib/components/shared/ChapterizeOptions.svelte'
  import { SvelteSet } from 'svelte/reactivity'
  import type { GeneratedProtagonist, GeneratedCharacter } from '$lib/services/ai/sdk'
  import type { ImportedLorebookItem } from '../wizardTypes'
  import type { StoryMode, POV, ChapterSourceImportReport } from '$lib/types'
  import type { Tense } from '$lib/services/ai/wizard'

  interface Props {
    storyTitle: string
    selectedMode: StoryMode
    selectedPOV: POV
    selectedTense: Tense
    tone: string
    protagonist: GeneratedProtagonist | null
    protagonistPortrait: string | null
    supportingCharacters: GeneratedCharacter[]
    settingSeed: string
    importedLorebooks: ImportedLorebookItem[]
    importChatAsEntries: boolean
    chatMessageCount: number
    isCreatingStory: boolean
    createError: string | null
    saveToVault: boolean
    hasCard: boolean
    vaultTag: string
    vaultDescription: string
    chapterizeAfterImport: boolean
    chapterizeIncludeLorebook: boolean
    chapterizeIncludeTimeline: boolean
    chapterizeIncludeClassification: boolean
    chapterizationProgress: { current: number; total: number } | null
    chapterizationTimelineProgress: { current: number; total: number } | null
    chapterizationClassificationProgress: { current: number; total: number } | null
    chapterizationStatus: string | null
    importProcessingStatus: string | null
    importProcessingProgress: { phase: string; current: number; total: number } | null
    chapterizationReport: ChapterSourceImportReport | null
    chapterizationAwaitingDecision: boolean
    onTitleChange: (v: string) => void
    onSaveToVaultChange: (v: boolean) => void
    onVaultTagChange: (v: string) => void
    onVaultDescriptionChange: (v: string) => void
    onChapterizeAfterImportChange: (v: boolean) => void
    onChapterizeIncludeLorebookChange: (v: boolean) => void
    onChapterizeIncludeTimelineChange: (v: boolean) => void
    onChapterizeIncludeClassificationChange: (v: boolean) => void
    onCancelChapterization: () => void
    onContinueChapterization: () => void
    onAbortChapterization: () => void
  }

  let {
    storyTitle,
    selectedMode: _selectedMode,
    selectedPOV,
    selectedTense,
    tone,
    protagonist,
    protagonistPortrait,
    supportingCharacters,
    settingSeed,
    importedLorebooks,
    importChatAsEntries,
    chatMessageCount,
    isCreatingStory,
    createError,
    saveToVault,
    hasCard,
    vaultTag,
    vaultDescription,
    chapterizeAfterImport,
    chapterizeIncludeLorebook,
    chapterizeIncludeTimeline,
    chapterizeIncludeClassification,
    chapterizationProgress,
    chapterizationTimelineProgress,
    chapterizationClassificationProgress,
    chapterizationStatus,
    importProcessingStatus,
    importProcessingProgress,
    chapterizationReport,
    chapterizationAwaitingDecision,
    onTitleChange,
    onSaveToVaultChange,
    onVaultTagChange,
    onVaultDescriptionChange,
    onChapterizeAfterImportChange,
    onChapterizeIncludeLorebookChange,
    onChapterizeIncludeTimelineChange,
    onChapterizeIncludeClassificationChange,
    onCancelChapterization,
    onContinueChapterization,
    onAbortChapterization,
  }: Props = $props()

  let expandedChapterKeys = new SvelteSet<string>()

  function chapterKey(
    chapter: NonNullable<ChapterSourceImportReport['chapters']>[number],
    index: number,
  ): string {
    return `${chapter.filename}::${index}`
  }

  function isChapterExpanded(
    chapter: NonNullable<ChapterSourceImportReport['chapters']>[number],
    index: number,
  ): boolean {
    return expandedChapterKeys.has(chapterKey(chapter, index))
  }

  function toggleChapterExpanded(
    chapter: NonNullable<ChapterSourceImportReport['chapters']>[number],
    index: number,
  ): void {
    const key = chapterKey(chapter, index)
    const next = new SvelteSet(expandedChapterKeys)
    if (next.has(key)) {
      next.delete(key)
    } else {
      next.add(key)
    }
    expandedChapterKeys = next
  }

  $effect(() => {
    const chapters = chapterizationReport?.chapters ?? []
    if (chapters.length === 0) return
    const lastIndex = chapters.length - 1
    expandedChapterKeys = new SvelteSet([chapterKey(chapters[lastIndex], lastIndex)])
  })

  const totalLorebookEntries = $derived(importedLorebooks.flatMap((lb) => lb.entries).length)

  const steps = $derived.by(() => {
    if (!isCreatingStory) return []

    const list = []

    // 1. Base Story Creation (always runs)
    const baseDone = chapterizationProgress !== null
    list.push({
      id: 'base',
      label: 'Preparing story database',
      status: baseDone ? 'completed' : 'active',
      details: baseDone ? 'Done' : 'Creating database records...',
    })

    // 2. Chapter Generation
    if (importProcessingProgress) {
      list.push({
        id: 'import-processing',
        label: importProcessingProgress.phase,
        status:
          importProcessingProgress.current >= importProcessingProgress.total
            ? 'completed'
            : 'active',
        details: `${importProcessingProgress.current}/${importProcessingProgress.total}`,
      })
    } else if (importProcessingStatus) {
      list.push({
        id: 'import-processing',
        label: 'Import text processing',
        status: importProcessingStatus.toLowerCase().includes('warning') ? 'pending' : 'completed',
        details: importProcessingStatus,
      })
    }

    // 2. Chapter Generation
    if (chapterizeAfterImport) {
      const active =
        chapterizationProgress !== null &&
        chapterizationProgress.current < chapterizationProgress.total
      const done =
        chapterizationProgress !== null &&
        chapterizationProgress.current === chapterizationProgress.total
      list.push({
        id: 'chapters',
        label: 'Generating chapters',
        status: done ? 'completed' : active ? 'active' : 'pending',
        details: active
          ? `Processing chapter ${chapterizationProgress.current}/${chapterizationProgress.total}`
          : done
            ? 'Done'
            : 'Waiting in queue...',
      })
    }

    // 3. Timeline Estimation
    if (chapterizeIncludeTimeline) {
      const active =
        chapterizationTimelineProgress !== null &&
        chapterizationTimelineProgress.current < chapterizationTimelineProgress.total
      const done =
        chapterizationTimelineProgress !== null &&
        chapterizationTimelineProgress.current === chapterizationTimelineProgress.total
      list.push({
        id: 'timeline',
        label: 'Estimating timelines',
        status: done ? 'completed' : active ? 'active' : 'pending',
        details: active
          ? `Estimating timeline: chapter ${chapterizationTimelineProgress.current}/${chapterizationTimelineProgress.total}`
          : done
            ? 'Done'
            : 'Waiting in queue...',
      })
    }

    // 4. Chapter Classification
    if (chapterizeIncludeClassification) {
      const active =
        chapterizationClassificationProgress !== null &&
        chapterizationClassificationProgress.current < chapterizationClassificationProgress.total
      const done =
        chapterizationClassificationProgress !== null &&
        chapterizationClassificationProgress.current === chapterizationClassificationProgress.total
      list.push({
        id: 'classification',
        label: 'Classifying chapters',
        status: done ? 'completed' : active ? 'active' : 'pending',
        details: active
          ? `Classifying: chapter ${chapterizationClassificationProgress.current}/${chapterizationClassificationProgress.total}`
          : done
            ? 'Done'
            : 'Waiting in queue...',
      })
    }

    // 5. Lorebook update
    if (chapterizeIncludeLorebook) {
      const active = chapterizationStatus !== null
      const done =
        chapterizationStatus === null &&
        chapterizationProgress !== null &&
        chapterizationProgress.current === chapterizationProgress.total &&
        (!chapterizeIncludeTimeline ||
          chapterizationTimelineProgress?.current === chapterizationProgress.total) &&
        (!chapterizeIncludeClassification ||
          chapterizationClassificationProgress?.current === chapterizationProgress.total)
      list.push({
        id: 'lorebook',
        label: 'Updating lorebook',
        status: done ? 'completed' : active ? 'active' : 'pending',
        details: done ? 'Done' : active ? chapterizationStatus : 'Waiting in queue...',
      })
    }

    return list
  })

  const progressPercent = $derived.by(() => {
    if (!chapterizationProgress) return 0
    const totalChapters = chapterizationProgress.total
    if (totalChapters === 0) return 0

    let totalUnits = totalChapters
    let completedUnits = chapterizationProgress.current

    if (chapterizeIncludeTimeline) {
      totalUnits += totalChapters
      completedUnits += chapterizationTimelineProgress?.current ?? 0
    }
    if (chapterizeIncludeClassification) {
      totalUnits += totalChapters
      completedUnits += chapterizationClassificationProgress?.current ?? 0
    }
    if (chapterizeIncludeLorebook) {
      totalUnits += 1
      const isLoreDone =
        chapterizationStatus === null &&
        chapterizationProgress.current === totalChapters &&
        (!chapterizeIncludeTimeline || chapterizationTimelineProgress?.current === totalChapters) &&
        (!chapterizeIncludeClassification ||
          chapterizationClassificationProgress?.current === totalChapters)
      if (isLoreDone) {
        completedUnits += 1
      }
    }

    return (completedUnits / totalUnits) * 100
  })
</script>

<div class="space-y-5">
  <p class="text-muted-foreground">Review your import and give your story a title.</p>

  <!-- Story Title -->
  <div class="space-y-2">
    <Label for="story-title">Story Title</Label>
    <Input
      id="story-title"
      placeholder="Enter a title for your story"
      value={storyTitle}
      oninput={(e) => onTitleChange(e.currentTarget.value)}
    />
  </div>

  <!-- Tag & Description -->
  <div class="space-y-2">
    <Label for="vault-tag">Tag</Label>
    <Input
      id="vault-tag"
      placeholder="e.g. fantasy, sci-fi, romance"
      value={vaultTag}
      oninput={(e) => onVaultTagChange(e.currentTarget.value)}
    />
  </div>
  <div class="space-y-2">
    <Label for="vault-description">Description</Label>
    <Input
      id="vault-description"
      placeholder="Enter Description for your story"
      value={vaultDescription}
      oninput={(e) => onVaultDescriptionChange(e.currentTarget.value)}
    />
  </div>

  <!-- Summary Cards -->
  <div class="space-y-3">
    <!-- Mode & Style -->
    <Card.Root>
      <Card.Content class="p-3">
        <div class="flex flex-wrap gap-2">
          <Badge variant="secondary">Adventure</Badge>
          <Badge variant="outline">{selectedPOV} person</Badge>
          <Badge variant="outline">{selectedTense} tense</Badge>
          {#if tone}
            <Badge variant="outline">{tone}</Badge>
          {/if}
        </div>
      </Card.Content>
    </Card.Root>

    <!-- Protagonist -->
    {#if protagonist}
      <Card.Root>
        <Card.Content class="flex items-center gap-3 p-3">
          {#if protagonistPortrait}
            <img
              src={protagonistPortrait}
              alt={protagonist.name}
              class="h-10 w-10 rounded-lg object-cover"
            />
          {/if}
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <User class="text-primary h-4 w-4" />
              <p class="text-sm font-medium">{protagonist.name}</p>
            </div>
            <p class="text-muted-foreground mt-0.5 line-clamp-1 text-xs">
              {protagonist.description}
            </p>
          </div>
        </Card.Content>
      </Card.Root>
    {/if}

    <!-- Supporting Cast -->
    {#if supportingCharacters.length > 0}
      <Card.Root>
        <Card.Content class="p-3">
          <div class="flex items-center gap-2">
            <Users class="text-muted-foreground h-4 w-4" />
            <span class="text-sm">{supportingCharacters.length} supporting characters</span>
          </div>
          <div class="mt-1.5 flex flex-wrap gap-1">
            {#each supportingCharacters as char (char.name)}
              <Badge variant="outline" class="text-xs">{char.name}</Badge>
            {/each}
          </div>
        </Card.Content>
      </Card.Root>
    {/if}

    <!-- Setting -->
    {#if settingSeed}
      <Card.Root>
        <Card.Content class="p-3">
          <div class="flex items-center gap-2">
            <MapPin class="text-muted-foreground h-4 w-4" />
            <span class="text-sm font-medium">World Setting</span>
          </div>
          <p class="text-muted-foreground mt-1 line-clamp-2 text-xs">{settingSeed}</p>
        </Card.Content>
      </Card.Root>
    {/if}

    <!-- Lorebook -->
    {#if totalLorebookEntries > 0}
      <Card.Root>
        <Card.Content class="flex items-center gap-2 p-3">
          <BookOpen class="text-muted-foreground h-4 w-4" />
          <span class="text-sm">
            {totalLorebookEntries} lorebook entries from {importedLorebooks.length} lorebook{importedLorebooks.length >
            1
              ? 's'
              : ''}
          </span>
        </Card.Content>
      </Card.Root>
    {/if}

    <!-- Chat Import -->
    <Card.Root>
      <Card.Content class="flex items-center gap-2 p-3">
        {#if importChatAsEntries}
          <MessageSquare class="text-muted-foreground h-4 w-4" />
          <span class="text-sm">{chatMessageCount} chat messages will be imported</span>
        {:else}
          <FileText class="text-muted-foreground h-4 w-4" />
          <span class="text-sm">Starting fresh with card opening</span>
        {/if}
      </Card.Content>
    </Card.Root>

    <!-- Generate Chapters from History -->
    {#if importChatAsEntries && chatMessageCount > 0}
      <ChapterizeOptions
        {chapterizeAfterImport}
        {chapterizeIncludeLorebook}
        {chapterizeIncludeTimeline}
        {chapterizeIncludeClassification}
        {onChapterizeAfterImportChange}
        {onChapterizeIncludeLorebookChange}
        {onChapterizeIncludeTimelineChange}
        {onChapterizeIncludeClassificationChange}
      />
    {/if}

    <!-- Save to Vault Option -->
    {#if hasCard}
      <Card.Root>
        <Card.Content class="flex items-center justify-between p-3">
          <div class="flex items-center gap-2">
            <Save class="text-muted-foreground h-4 w-4" />
            <span class="text-sm">Save scenario to vault</span>
          </div>
          <Switch checked={saveToVault} onCheckedChange={(v) => onSaveToVaultChange(v)} />
        </Card.Content>
      </Card.Root>
    {/if}
  </div>

  <!-- Loading -->
  {#if isCreatingStory}
    <div class="bg-muted/40 border-muted space-y-4 rounded-lg border p-4 text-sm">
      <div class="flex items-center justify-between border-b pb-2">
        <span class="text-foreground font-medium">Importing Story & Processing Chapters</span>
        {#if (chapterizationProgress || chapterizationStatus) && !chapterizationAwaitingDecision}
          <Button variant="outline" size="sm" class="h-8 gap-1.5" onclick={onCancelChapterization}>
            <X class="h-3.5 w-3.5" />
            Cancel chapter generation
          </Button>
        {/if}
      </div>

      {#if chapterizationStatus}
        <div class="rounded border border-slate-300/40 bg-slate-900 px-3 py-2 text-xs text-white">
          {chapterizationStatus}
        </div>
      {/if}

      {#if chapterizationAwaitingDecision}
        <div class="space-y-2 rounded border border-amber-400/40 bg-amber-500/10 p-3">
          <p class="text-sm font-medium">Review current chapter before continuing</p>
          <p class="text-muted-foreground text-xs">
            Chapterization is paused for review. Continue to process the next chapter, or stop and
            keep completed chapters.
          </p>
          <div class="flex gap-2">
            <Button size="sm" class="h-8" onclick={onContinueChapterization}>Continue</Button>
            <Button size="sm" variant="outline" class="h-8" onclick={onAbortChapterization}
              >Stop Here</Button
            >
          </div>
        </div>
      {/if}

      {#if progressPercent > 0}
        <div class="space-y-1.5 border-b pb-3">
          <div class="text-muted-foreground flex justify-between text-xs">
            <span>Overall progress</span>
            <span class="text-foreground font-medium">{Math.round(progressPercent)}%</span>
          </div>
          <div class="bg-secondary h-2 w-full overflow-hidden rounded-full">
            <div
              class="bg-primary h-full transition-all duration-300 ease-out"
              style="width: {progressPercent}%"
            ></div>
          </div>
        </div>
      {/if}

      <div class="space-y-3">
        {#each steps as step (step.id)}
          <div class="flex items-start gap-3">
            <div class="mt-0.5 shrink-0">
              {#if step.status === 'completed'}
                <CheckCircle2 class="h-4 w-4 text-emerald-500" />
              {:else if step.status === 'active'}
                <Loader2 class="text-primary h-4 w-4 animate-spin" />
              {:else}
                <Circle class="text-muted-foreground/30 h-4 w-4" />
              {/if}
            </div>
            <div class="min-w-0 flex-1">
              <p
                class="font-medium {step.status === 'active'
                  ? 'text-primary'
                  : step.status === 'completed'
                    ? 'text-muted-foreground line-through'
                    : 'text-muted-foreground'}"
              >
                {step.label}
              </p>
              {#if step.status === 'active' && step.details}
                <p class="text-muted-foreground mt-0.5 text-xs">{step.details}</p>
              {/if}
            </div>
          </div>
        {/each}
      </div>

      {#if chapterizationReport && chapterizationReport.chapters.length > 0}
        <div class="space-y-3 border-t pt-3">
          <div>
            <p class="text-sm font-semibold">Chapterization Report</p>
            <p class="text-muted-foreground text-xs">
              {chapterizationReport.importedCount} chapter{chapterizationReport.importedCount === 1
                ? ''
                : 's'} processed
            </p>
            <div class="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div class="bg-muted/40 rounded border px-2 py-1.5">
                Characters: {chapterizationReport.createdTotals.characters}
              </div>
              <div class="bg-muted/40 rounded border px-2 py-1.5">
                Locations: {chapterizationReport.createdTotals.locations}
              </div>
              <div class="bg-muted/40 rounded border px-2 py-1.5">
                Items: {chapterizationReport.createdTotals.items}
              </div>
              <div class="bg-muted/40 rounded border px-2 py-1.5">
                Story Beats: {chapterizationReport.createdTotals.storyBeats}
              </div>
            </div>
          </div>

          <div class="max-h-72 space-y-2 overflow-y-auto pr-1">
            {#each chapterizationReport.chapters as chapter, chapterIndex (chapter.filename + chapterIndex)}
              {@const chapterExpanded = isChapterExpanded(chapter, chapterIndex)}
              <div class="rounded border p-2">
                <button
                  type="button"
                  class="hover:bg-muted/50 -mx-1 flex w-[calc(100%+0.5rem)] items-center justify-between rounded px-1 py-0.5 text-left"
                  onclick={() => toggleChapterExpanded(chapter, chapterIndex)}
                >
                  <span class="min-w-0">
                    <span class="block truncate text-xs font-medium"
                      >{chapterIndex + 1}. {chapter.title}</span
                    >
                    <span class="text-muted-foreground block truncate text-[11px]"
                      >{chapter.filename}</span
                    >
                  </span>
                  <span class="text-muted-foreground text-[11px]"
                    >{chapterExpanded ? 'Hide' : 'Show'}</span
                  >
                </button>

                {#if chapterExpanded}
                  <div class="mt-2 space-y-2 text-xs">
                    {#if chapter.summary}
                      <p class="bg-muted/30 rounded border px-2 py-1.5">{chapter.summary}</p>
                    {/if}

                    <div class="grid gap-2 sm:grid-cols-2">
                      <div class="rounded border p-2">
                        <p class="font-medium">Characters</p>
                        <p class="text-muted-foreground mt-1">
                          {chapter.characters.length > 0 ? chapter.characters.join(', ') : 'None'}
                        </p>
                      </div>
                      <div class="rounded border p-2">
                        <p class="font-medium">Locations</p>
                        <p class="text-muted-foreground mt-1">
                          {chapter.locations.length > 0 ? chapter.locations.join(', ') : 'None'}
                        </p>
                      </div>
                      <div class="rounded border p-2">
                        <p class="font-medium">Items</p>
                        <p class="text-muted-foreground mt-1">
                          {chapter.created.items.length > 0
                            ? chapter.created.items.join(', ')
                            : 'None'}
                        </p>
                      </div>
                      <div class="rounded border p-2">
                        <p class="font-medium">Story Beats / Events</p>
                        <p class="text-muted-foreground mt-1">
                          {chapter.events.length > 0 ? chapter.events.join(', ') : 'None'}
                        </p>
                      </div>
                    </div>

                    <div class="grid gap-2 sm:grid-cols-2">
                      <div class="rounded border p-2">
                        <p class="font-medium">Keywords</p>
                        <p class="text-muted-foreground mt-1">
                          {chapter.keywords.length > 0 ? chapter.keywords.join(', ') : 'None'}
                        </p>
                      </div>
                      <div class="rounded border p-2">
                        <p class="font-medium">Plot Threads</p>
                        <p class="text-muted-foreground mt-1">
                          {chapter.plotThreads.length > 0 ? chapter.plotThreads.join(', ') : 'None'}
                        </p>
                      </div>
                    </div>

                    {#if chapter.errors.length > 0}
                      <div
                        class="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-amber-700"
                      >
                        {chapter.errors.join(' | ')}
                      </div>
                    {/if}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}

  {#if createError}
    <Alert.Root variant="destructive">
      <AlertCircle class="h-4 w-4" />
      <Alert.Description>{createError}</Alert.Description>
    </Alert.Root>
  {/if}
</div>

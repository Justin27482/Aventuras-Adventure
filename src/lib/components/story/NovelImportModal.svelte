<script lang="ts">
  import type {
    ChapterImportProgressEvent,
    ChapterSourceImportReport,
    EntryState,
    EntryType,
  } from '$lib/types'
  import { ui } from '$lib/stores/ui.svelte'
  import { story } from '$lib/stores/story.svelte'
  import { database } from '$lib/services/database'
  import { packService } from '$lib/services/packs/pack-service'
  import type { PresetPack } from '$lib/services/packs/types'
  import * as ResponsiveModal from '$lib/components/ui/responsive-modal'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Textarea } from '$lib/components/ui/textarea'
  import { Label } from '$lib/components/ui/label'
  import {
    AlertTriangle,
    ArrowDown,
    ArrowUp,
    Calendar,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    FileText,
    Loader2,
    MapPin,
    Plus,
    Sparkles,
    Tag,
    Theater,
    Upload,
    Users,
    X,
  } from 'lucide-svelte'

  const ACCEPTED_TYPES = '.txt,.md,.markdown,text/plain,text/markdown'

  type ChapterImportFile = {
    id: string
    file: File
    orderHint: number
    originalIndex: number
  }

  type ReviewEntryType = 'character' | 'location' | 'event'

  type ReviewEntryPreview = {
    key: string
    name: string
    type: ReviewEntryType
    chapterTitle: string
    chapterFilename: string
    chapterEmotionalTone: string | null
    chapterIndex: number
  }

  let files = $state<ChapterImportFile[]>([])
  let title = $state('')
  let description = $state('')
  let dragOver = $state(false)
  let loading = $state(false)
  let fileInput = $state<HTMLInputElement | null>(null)
  let importReport = $state<ChapterSourceImportReport | null>(null)
  let addedLorebookKeys = $state<Set<string>>(new Set())
  let stepByStepReview = $state(true)
  let pendingSources = $state<Array<{ filename: string; content: string }>>([])
  let guidedActive = $state(false)
  let awaitingGuidedDecision = $state(false)
  let guidedAborted = $state(false)
  let guidedStoryMode = $state<'adventure' | 'creative-writing'>('creative-writing')
  let progressState = $state<{
    chapterIndex: number
    totalChapters: number
    title: string
    filename: string
    phase: string
    message: string
  } | null>(null)
  let guidedProcessedCount = $state(0)
  let totalPlannedChapters = $state(0)
  let expandedChapterKeys = $state<Set<string>>(new Set())
  let reviewSidebarCollapsed = $state(false)
  let selectedReviewEntryKey = $state<string | null>(null)
  let selectedPackId = $state('default-pack')
  let availablePacks = $state<PresetPack[]>([])
  let packsLoaded = $state(false)

  async function loadPacks() {
    if (packsLoaded) return
    availablePacks = await packService.getAllPacks()
    packsLoaded = true
  }

  function extractChapterOrderHint(filename: string, fallbackIndex: number): number {
    const chapterMatch = filename.match(/(?:chapter|ch)\s*(\d+)/i)
    if (chapterMatch) {
      const parsed = Number(chapterMatch[1])
      if (Number.isFinite(parsed)) return parsed
    }

    const leadingNumberMatch = filename.match(/^(\d+)/)
    if (leadingNumberMatch) {
      const parsed = Number(leadingNumberMatch[1])
      if (Number.isFinite(parsed)) return parsed
    }

    return fallbackIndex
  }

  function toOrderedFiles(selectedFiles: File[]): ChapterImportFile[] {
    return selectedFiles
      .map((file, index) => ({
        id: crypto.randomUUID(),
        file,
        originalIndex: index,
        orderHint: extractChapterOrderHint(file.name, index),
      }))
      .sort((a, b) => a.orderHint - b.orderHint || a.originalIndex - b.originalIndex)
  }

  function entryStateForType(type: EntryType): EntryState {
    switch (type) {
      case 'character':
        return {
          type: 'character',
          isPresent: false,
          lastSeenLocation: null,
          currentDisposition: null,
          relationship: { level: 0, status: 'unknown', history: [] },
          knownFacts: [],
          revealedSecrets: [],
        }
      case 'location':
        return {
          type: 'location',
          isCurrentLocation: false,
          visitCount: 0,
          changes: [],
          presentCharacters: [],
          presentItems: [],
        }
      case 'item':
        return {
          type: 'item',
          inInventory: false,
          currentLocation: null,
          condition: null,
          uses: [],
        }
      case 'faction':
        return {
          type: 'faction',
          playerStanding: 0,
          status: 'unknown',
          knownMembers: [],
        }
      case 'concept':
        return {
          type: 'concept',
          revealed: false,
          comprehensionLevel: 'unknown',
          relatedEntries: [],
        }
      case 'event':
        return {
          type: 'event',
          occurred: false,
          occurredAt: null,
          witnesses: [],
          consequences: [],
        }
    }
  }

  function lorebookKey(name: string, type: EntryType): string {
    return `${type}:${name.trim().toLowerCase()}`
  }

  function hasLorebookEntry(name: string, type: EntryType): boolean {
    const key = lorebookKey(name, type)
    if (addedLorebookKeys.has(key)) return true
    return story.lorebookEntries.some(
      (entry) => entry.type === type && lorebookKey(entry.name, entry.type) === key,
    )
  }

  function resetState() {
    files = []
    title = ''
    description = ''
    dragOver = false
    importReport = null
    addedLorebookKeys = new Set()
    stepByStepReview = true
    pendingSources = []
    guidedActive = false
    awaitingGuidedDecision = false
    guidedAborted = false
    guidedStoryMode = 'creative-writing'
    progressState = null
    guidedProcessedCount = 0
    totalPlannedChapters = 0
    expandedChapterKeys = new Set()
    reviewSidebarCollapsed = false
    selectedReviewEntryKey = null
    selectedPackId = 'default-pack'
  }

  $effect(() => {
    if (ui.novelImportModalOpen) {
      void loadPacks()
    }
  })

  function finalizeImportRun(options?: {
    keepReport?: boolean
    keepProgress?: boolean
    keepAbortedFlag?: boolean
  }) {
    guidedActive = false
    awaitingGuidedDecision = false
    pendingSources = []

    if (!options?.keepAbortedFlag) {
      guidedAborted = false
    }

    if (!options?.keepReport) {
      importReport = null
    }

    if (!options?.keepProgress) {
      progressState = null
    }
  }

  function phaseLabel(phase: ChapterImportProgressEvent['phase']): string {
    switch (phase) {
      case 'chapter-start':
        return 'Starting chapter'
      case 'entry-created':
        return 'Entry created'
      case 'summarize-start':
        return 'Summarizing'
      case 'summarize-complete':
        return 'Summary complete'
      case 'classify-start':
        return 'Extracting world updates'
      case 'classify-complete':
        return 'World updates complete'
      case 'lore-start':
        return 'Running lore management'
      case 'lore-complete':
        return 'Lore management complete'
      case 'chapter-record-start':
        return 'Creating chapter memory'
      case 'chapter-record-complete':
        return 'Chapter memory saved'
      case 'source-save':
        return 'Saving chapter source'
      case 'chapter-complete':
        return 'Chapter complete'
      case 'chapter-error':
        return 'Chapter error'
      default:
        return 'Working'
    }
  }

  function updateProgress(
    event: ChapterImportProgressEvent,
    override?: { chapterIndex?: number; totalChapters?: number },
  ) {
    progressState = {
      chapterIndex: override?.chapterIndex ?? event.chapterIndex,
      totalChapters: override?.totalChapters ?? event.totalChapters,
      title: event.title,
      filename: event.filename,
      phase: phaseLabel(event.phase),
      message: event.message,
    }
  }

  function close() {
    if (loading) return
    ui.closeNovelImport()
    resetState()
  }

  function chapterKey(chapter: ChapterSourceImportReport['chapters'][number], index: number): string {
    return `${chapter.filename}::${index}`
  }

  function reviewEntryKey(type: ReviewEntryType, name: string, chapterIndex: number): string {
    return `${type}:${name.trim().toLowerCase()}:${chapterIndex}`
  }

  function collectReviewEntries(report: ChapterSourceImportReport | null): ReviewEntryPreview[] {
    if (!report) return []
    const entries: ReviewEntryPreview[] = []

    for (const [chapterIndex, chapter] of report.chapters.entries()) {
      for (const name of chapter.characters) {
        entries.push({
          key: reviewEntryKey('character', name, chapterIndex),
          name,
          type: 'character',
          chapterTitle: chapter.title,
          chapterFilename: chapter.filename,
          chapterEmotionalTone: chapter.emotionalTone,
          chapterIndex,
        })
      }

      for (const name of chapter.locations) {
        entries.push({
          key: reviewEntryKey('location', name, chapterIndex),
          name,
          type: 'location',
          chapterTitle: chapter.title,
          chapterFilename: chapter.filename,
          chapterEmotionalTone: chapter.emotionalTone,
          chapterIndex,
        })
      }

      for (const name of chapter.events) {
        entries.push({
          key: reviewEntryKey('event', name, chapterIndex),
          name,
          type: 'event',
          chapterTitle: chapter.title,
          chapterFilename: chapter.filename,
          chapterEmotionalTone: chapter.emotionalTone,
          chapterIndex,
        })
      }
    }

    return entries
  }

  function filterReviewEntriesByType(
    entries: ReviewEntryPreview[],
    type: ReviewEntryType,
  ): ReviewEntryPreview[] {
    return entries.filter((entry) => entry.type === type)
  }

  function selectReviewEntry(entryKey: string) {
    selectedReviewEntryKey = entryKey
  }

  function toggleReviewSidebar() {
    reviewSidebarCollapsed = !reviewSidebarCollapsed
  }

  function reviewEntryBadgeClass(type: ReviewEntryType): string {
    switch (type) {
      case 'character':
        return 'border-blue-500/40 bg-blue-500/10 text-blue-700'
      case 'location':
        return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700'
      case 'event':
        return 'border-cyan-500/40 bg-cyan-500/10 text-cyan-700'
    }
  }

  function reviewEntryTypeLabel(type: ReviewEntryType): string {
    switch (type) {
      case 'character':
        return 'Character'
      case 'location':
        return 'Location'
      case 'event':
        return 'Event'
    }
  }

  function getReviewEntryDescription(entry: ReviewEntryPreview | null): string | null {
    if (!entry) return null

    const lorebookEntry = story.lorebookEntries.find(
      (candidate) => candidate.type === entry.type && lorebookKey(candidate.name, candidate.type) === lorebookKey(entry.name, entry.type),
    )
    if (lorebookEntry?.description?.trim()) {
      return lorebookEntry.description.trim()
    }

    if (entry.type === 'character') {
      const character = story.characters.find(
        (candidate) => candidate.name.trim().toLowerCase() === entry.name.trim().toLowerCase(),
      )
      if (character?.description?.trim()) {
        return character.description.trim()
      }
    }

    if (entry.type === 'location') {
      const location = story.locations.find(
        (candidate) => candidate.name.trim().toLowerCase() === entry.name.trim().toLowerCase(),
      )
      if (location?.description?.trim()) {
        return location.description.trim()
      }
    }

    return null
  }

  function isChapterExpanded(chapter: ChapterSourceImportReport['chapters'][number], index: number): boolean {
    return expandedChapterKeys.has(chapterKey(chapter, index))
  }

  function toggleChapterExpanded(chapter: ChapterSourceImportReport['chapters'][number], index: number) {
    const key = chapterKey(chapter, index)
    const next = new Set(expandedChapterKeys)
    if (next.has(key)) {
      next.delete(key)
    } else {
      next.add(key)
    }
    expandedChapterKeys = next
  }

  function expandAllChapters() {
    if (!importReport) return
    expandedChapterKeys = new Set(importReport.chapters.map((chapter, index) => chapterKey(chapter, index)))
  }

  function collapseAllChapters() {
    expandedChapterKeys = new Set()
  }

  function expandLatestChapter(chapters: ChapterSourceImportReport['chapters']) {
    if (chapters.length === 0) {
      expandedChapterKeys = new Set()
      return
    }
    const lastIndex = chapters.length - 1
    expandedChapterKeys = new Set([chapterKey(chapters[lastIndex], lastIndex)])
  }

  function openFilePicker() {
    fileInput?.click()
  }

  async function readSelectedFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    const selected = Array.from(fileList)
    files = toOrderedFiles(selected)
    if (!title.trim() && files.length > 0) {
      title = files[0].file.name.replace(/\.[^.]+$/, '').trim()
    }
  }

  function removeFile(fileId: string) {
    files = files.filter((file) => file.id !== fileId)
  }

  function moveFileByOffset(fileId: string, offset: number) {
    const index = files.findIndex((file) => file.id === fileId)
    if (index < 0) return
    const targetIndex = index + offset
    if (targetIndex < 0 || targetIndex >= files.length) return

    const next = [...files]
    const [moved] = next.splice(index, 1)
    next.splice(targetIndex, 0, moved)
    files = next
  }

  async function addArtifactToLorebook(
    name: string,
    type: EntryType,
    chapterTitle: string,
    showToast: boolean = true,
  ): Promise<'added' | 'already' | 'skipped'> {
    if (!story.currentStory) return 'skipped'
    const trimmedName = name.trim()
    if (!trimmedName) return 'skipped'

    const key = lorebookKey(trimmedName, type)
    const existing = hasLorebookEntry(trimmedName, type)

    if (existing) {
      if (showToast) {
        ui.showToast(`${trimmedName} is already in lorebook`, 'info')
      }
      addedLorebookKeys = new Set([...addedLorebookKeys, key])
      return 'already'
    }

    const descriptionByType: Record<EntryType, string> = {
      character: `Character noted during imported chapter: ${chapterTitle}`,
      location: `Location noted during imported chapter: ${chapterTitle}`,
      item: `Item noted during imported chapter: ${chapterTitle}`,
      faction: `Faction noted during imported chapter: ${chapterTitle}`,
      concept: `Story concept noted during imported chapter: ${chapterTitle}`,
      event: `Event noted during imported chapter: ${chapterTitle}`,
    }

    await story.addLorebookEntry({
      name: trimmedName,
      type,
      description: descriptionByType[type],
      hiddenInfo: null,
      aliases: [],
      state: entryStateForType(type),
      adventureState: { discovered: true, interactedWith: false, notes: [] },
      creativeState: { arc: null, thematicRole: null, symbolism: null },
      injection: {
        mode: 'keyword',
        keywords: [trimmedName],
        priority: 40,
      },
      firstMentioned: null,
      lastMentioned: null,
      mentionCount: 0,
      createdBy: 'user',
      loreManagementBlacklisted: false,
    })

    addedLorebookKeys = new Set([...addedLorebookKeys, key])
    if (showToast) {
      ui.showToast(`Added ${trimmedName} to lorebook`, 'info')
    }
    return 'added'
  }

  function rebuildReportFromChapters(chapters: ChapterSourceImportReport['chapters']): ChapterSourceImportReport {
    return {
      importedCount: chapters.length,
      parseIntoStoryState: true,
      failedChapterCount: chapters.filter((chapter) => chapter.errors.length > 0).length,
      createdTotals: {
        characters: chapters.reduce((sum, chapter) => sum + chapter.created.characters.length, 0),
        locations: chapters.reduce((sum, chapter) => sum + chapter.created.locations.length, 0),
        items: chapters.reduce((sum, chapter) => sum + chapter.created.items.length, 0),
        storyBeats: chapters.reduce((sum, chapter) => sum + chapter.created.storyBeats.length, 0),
        lorebookEntries: chapters.reduce(
          (sum, chapter) => sum + chapter.created.lorebookEntries.length,
          0,
        ),
      },
      lorebookTotals: {
        created: chapters.reduce((sum, chapter) => sum + chapter.lorebookChanges.created, 0),
        updated: chapters.reduce((sum, chapter) => sum + chapter.lorebookChanges.updated, 0),
        deleted: chapters.reduce((sum, chapter) => sum + chapter.lorebookChanges.deleted, 0),
        merged: chapters.reduce((sum, chapter) => sum + chapter.lorebookChanges.merged, 0),
        eventsCreated: chapters.reduce(
          (sum, chapter) => sum + chapter.lorebookChanges.eventsCreated,
          0,
        ),
        eventsUpdated: chapters.reduce(
          (sum, chapter) => sum + chapter.lorebookChanges.eventsUpdated,
          0,
        ),
      },
      chapters,
    }
  }

  async function processNextGuidedChapter() {
    if (!guidedActive || pendingSources.length === 0) return

    loading = true
    awaitingGuidedDecision = false
    try {
      const [nextSource, ...rest] = pendingSources
      pendingSources = rest

      const report = await story.importChapterSources([nextSource], {
        parseIntoStoryState: true,
        createStoryEntries: true,
        createChapterRecords: true,
        onProgress: (event) =>
          updateProgress(event, {
            chapterIndex: guidedProcessedCount + 1,
            totalChapters: totalPlannedChapters,
          }),
      })

      const existing = importReport?.chapters ?? []
      const nextChapters = [...existing, ...report.chapters]
      importReport = rebuildReportFromChapters(nextChapters)
      expandLatestChapter(nextChapters)
      guidedProcessedCount += 1
      loading = false

      if (pendingSources.length > 0) {
        awaitingGuidedDecision = true
        progressState = {
          chapterIndex: guidedProcessedCount,
          totalChapters: totalPlannedChapters,
          title: report.chapters[0]?.title ?? nextSource.filename,
          filename: nextSource.filename,
          phase: 'Paused for review',
          message: `Review chapter ${guidedProcessedCount}, then continue or abort remaining chapters.`,
        }
      } else {
        finalizeImportRun({ keepReport: true, keepProgress: true })
        progressState = {
          chapterIndex: guidedProcessedCount,
          totalChapters: totalPlannedChapters,
          title: report.chapters[0]?.title ?? nextSource.filename,
          filename: nextSource.filename,
          phase: 'Import complete',
          message: 'All selected chapters were processed.',
        }
        ui.showToast('Chapter-by-chapter import complete', 'info')
      }
    } catch (error) {
      finalizeImportRun({ keepReport: true, keepProgress: true })
      const message = error instanceof Error ? error.message : 'Failed during guided chapter import'
      ui.showToast(`Guided import stopped: ${message}`, 'error')
    } finally {
      loading = false
    }
  }

  async function continueGuidedImport() {
    if (!awaitingGuidedDecision || loading) return
    await processNextGuidedChapter()
  }

  function abortGuidedImport() {
    finalizeImportRun({ keepReport: true, keepProgress: true, keepAbortedFlag: true })
    guidedAborted = true
    progressState = {
      chapterIndex: guidedProcessedCount,
      totalChapters: totalPlannedChapters,
      title: progressState?.title ?? 'Import',
      filename: progressState?.filename ?? '',
      phase: 'Aborted',
      message: `Stopped after ${guidedProcessedCount} chapter${guidedProcessedCount === 1 ? '' : 's'}.`,
    }
    ui.showToast('Aborted remaining chapter imports. Imported chapters were kept.', 'info')
  }

  async function addBulkArtifactsToLorebook(
    items: Array<{ name: string; type: EntryType }>,
    chapterTitle: string,
  ) {
    const unique = new Map<string, { name: string; type: EntryType }>()
    for (const item of items) {
      const trimmedName = item.name.trim()
      if (!trimmedName) continue
      const key = lorebookKey(trimmedName, item.type)
      if (!unique.has(key)) {
        unique.set(key, { name: trimmedName, type: item.type })
      }
    }

    let addedCount = 0
    let alreadyCount = 0

    for (const item of unique.values()) {
      const result = await addArtifactToLorebook(item.name, item.type, chapterTitle, false)
      if (result === 'added') addedCount++
      if (result === 'already') alreadyCount++
    }

    ui.showToast(
      `Bulk add complete: ${addedCount} added, ${alreadyCount} already present`,
      'info',
    )
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault()
    dragOver = false
    void readSelectedFiles(event.dataTransfer?.files ?? null)
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault()
    dragOver = true
  }

  function handleDragLeave() {
    dragOver = false
  }

  async function handleImport() {
    if (files.length === 0 || loading) return

    loading = true
    try {
      const sources = await Promise.all(
        files.map(async (selected) => ({
          filename: selected.file.name,
          content: await selected.file.text(),
        })),
      )

      totalPlannedChapters = sources.length
      guidedProcessedCount = 0

      if (stepByStepReview) {
        importReport = rebuildReportFromChapters([])
        collapseAllChapters()
        progressState = {
          chapterIndex: 0,
          totalChapters: sources.length,
          title: '',
          filename: '',
          phase: 'Preparing import',
          message: 'Creating story shell for chapter import...',
        }

        const shellStartedAt = Date.now()
        console.log(
          `[NovelImport] createNovelStoryShell started at ${new Date(shellStartedAt).toISOString()}`,
        )
        const createdStory = await story.createNovelStoryShell({
          title: title.trim() || undefined,
          description: description.trim() || undefined,
          fallbackFilename: sources[0]?.filename,
          genre: 'Novel',
        })
        await database.setStoryPack(createdStory.id, selectedPackId)
        const shellElapsedMs = Date.now() - shellStartedAt
        console.log(`[NovelImport] createNovelStoryShell completed in ${shellElapsedMs}ms`)

        guidedStoryMode = createdStory.mode
        pendingSources = [...sources]
        guidedActive = true
        guidedAborted = false
        progressState = {
          chapterIndex: 0,
          totalChapters: sources.length,
          title: '',
          filename: '',
          phase: 'Preparing import',
          message: `Story shell created in ${Math.max(1, Math.round(shellElapsedMs / 100) / 10)}s. Starting chapter 1...`,
        }
        await processNextGuidedChapter()
      } else {
        const result = await story.createNovelStoryFromChapterSources(sources, {
          title: title.trim() || undefined,
          description: description.trim() || undefined,
          parseIntoStoryState: true,
          preserveProvidedOrder: true,
          onProgress: (event) => updateProgress(event),
        })
        await database.setStoryPack(result.story.id, selectedPackId)

        importReport = result.report
        expandLatestChapter(result.report.chapters)
        guidedStoryMode = result.story.mode
        progressState = {
          chapterIndex: result.report.importedCount,
          totalChapters: sources.length,
          title: result.report.chapters[result.report.chapters.length - 1]?.title ?? '',
          filename: result.report.chapters[result.report.chapters.length - 1]?.filename ?? '',
          phase: 'Import complete',
          message: 'All selected chapters were processed.',
        }
        ui.showToast(
          `Created ${result.story.mode === 'creative-writing' ? 'creative writing' : 'story'} from ${sources.length} chapter${sources.length === 1 ? '' : 's'}`,
          'info',
        )
      }
    } catch (error) {
      finalizeImportRun({ keepReport: true, keepProgress: true })
      console.error('[NovelImportModal] Failed to create story from chapters:', error)
      const message = error instanceof Error ? error.message : 'Failed to create story from chapters'
      ui.showToast(`Failed to create story from chapters: ${message}`, 'error')
    } finally {
      loading = false
    }
  }

  function openCreatedStory() {
    ui.setActivePanel('story')
    close()
  }

  const canOpenStory = $derived(
    !!importReport && !guidedActive && !awaitingGuidedDecision && !loading,
  )

  const fileCount = $derived(files.length)
  const totalBytes = $derived(files.reduce((sum, selected) => sum + selected.file.size, 0))
  const reviewEntries = $derived.by(() => collectReviewEntries(importReport))
  const selectedReviewEntry = $derived.by(() => {
    if (reviewEntries.length === 0) return null
    return reviewEntries.find((entry) => entry.key === selectedReviewEntryKey) ?? reviewEntries[0]
  })
  const selectedReviewEntryDescription = $derived.by(() => getReviewEntryDescription(selectedReviewEntry))

  $effect(() => {
    if (reviewEntries.length === 0) {
      selectedReviewEntryKey = null
      return
    }

    if (!selectedReviewEntryKey || !reviewEntries.some((entry) => entry.key === selectedReviewEntryKey)) {
      selectedReviewEntryKey = reviewEntries[0].key
    }
  })
</script>

<ResponsiveModal.Root open={ui.novelImportModalOpen} onOpenChange={(open) => !open && close()}>
  <ResponsiveModal.Content class="flex max-h-[90vh] w-[95vw] max-w-6xl flex-col gap-0 p-0">
    <ResponsiveModal.Header class="border-b px-6 py-4">
      <div class="flex items-center gap-2">
        <Sparkles class="text-primary h-5 w-5" />
        <ResponsiveModal.Title>Create Novel from Chapters</ResponsiveModal.Title>
      </div>
      <ResponsiveModal.Description>
        Import ordered chapter files to create a new creative-writing story, then process each chapter in sequence.
      </ResponsiveModal.Description>
    </ResponsiveModal.Header>

    <div class="flex-1 space-y-4 overflow-y-auto px-6 py-6">
      {#if progressState && (loading || guidedActive || awaitingGuidedDecision || importReport)}
        <div class="rounded-lg border border-slate-200/30 bg-slate-900 p-3 text-xs shadow-sm">
          <p class="font-medium text-white">
            Chapter {Math.max(progressState.chapterIndex, 1)} of {Math.max(progressState.totalChapters, 1)}
            {#if progressState.title}
              · {progressState.title}
            {/if}
          </p>
          <p class="mt-1 text-white/95">{progressState.phase}</p>
          {#if progressState.message != progressState.phase}
            <p class="mt-0.5 text-white/90">{progressState.message}</p>
          {/if}
          {#if progressState.filename}
            <p class="mt-1 truncate text-white/75">{progressState.filename}</p>
          {/if}
        </div>
      {/if}

      <div class="space-y-2">
        <Label for="novel-import-pack">Prompt Pack</Label>
        <select
          id="novel-import-pack"
          class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          bind:value={selectedPackId}
          disabled={loading || guidedActive || awaitingGuidedDecision}
        >
          {#if availablePacks.length === 0}
            <option value="default-pack">default-pack</option>
          {:else}
            {#each availablePacks as pack (pack.id)}
              <option value={pack.id}>{pack.name} ({pack.id})</option>
            {/each}
          {/if}
        </select>
      </div>

      {#if importReport}
        <div class="rounded-lg border p-4">
          <div class="flex items-center justify-between gap-2">
            <p class="text-sm font-semibold">Import Results</p>
            {#if importReport.chapters.length > 0}
              <div class="flex items-center gap-1">
                <Button variant="ghost" size="sm" class="h-7 px-2 text-[11px]" onclick={expandAllChapters}>
                  Expand All
                </Button>
                <Button variant="ghost" size="sm" class="h-7 px-2 text-[11px]" onclick={collapseAllChapters}>
                  Collapse All
                </Button>
              </div>
            {/if}
          </div>
          <p class="text-muted-foreground mt-1 text-xs">
            {importReport.importedCount} chapters processed. Review extracted artifacts below.
          </p>
          <div class="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
            <div class="bg-muted/40 rounded border px-2 py-1.5">Characters: {importReport.createdTotals.characters}</div>
            <div class="bg-muted/40 rounded border px-2 py-1.5">Locations: {importReport.createdTotals.locations}</div>
            <div class="bg-muted/40 rounded border px-2 py-1.5">Items: {importReport.createdTotals.items}</div>
            <div class="bg-muted/40 rounded border px-2 py-1.5">Story Beats: {importReport.createdTotals.storyBeats}</div>
            <div class="bg-muted/40 rounded border px-2 py-1.5">Lorebook: {importReport.createdTotals.lorebookEntries}</div>
          </div>
          <div class="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
            <div class="bg-muted/20 rounded border px-2 py-1.5">
              Lorebook Created: {importReport.lorebookTotals.created}
            </div>
            <div class="bg-muted/20 rounded border px-2 py-1.5">
              Lorebook Updated: {importReport.lorebookTotals.updated}
            </div>
            <div class="bg-muted/20 rounded border px-2 py-1.5">
              Lorebook Merged: {importReport.lorebookTotals.merged}
            </div>
            <div class="bg-muted/20 rounded border px-2 py-1.5">
              Event Entries Created: {importReport.lorebookTotals.eventsCreated}
            </div>
            <div class="bg-muted/20 rounded border px-2 py-1.5">
              Event Entries Updated: {importReport.lorebookTotals.eventsUpdated}
            </div>
            <div class="bg-muted/20 rounded border px-2 py-1.5">
              Lorebook Deleted: {importReport.lorebookTotals.deleted}
            </div>
          </div>
          {#if importReport.failedChapterCount > 0}
            <div class="mt-3 flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
              <AlertTriangle class="mt-0.5 h-4 w-4 text-amber-500" />
              <span>
                {importReport.failedChapterCount} chapter{importReport.failedChapterCount === 1 ? '' : 's'} had partial processing errors. Raw chapter sources were still imported.
              </span>
            </div>
          {/if}
        </div>

        <div class="flex min-h-[28rem] gap-3">
          <div
            class={`bg-muted/20 flex shrink-0 flex-col rounded-lg border transition-all duration-200 ${
              reviewSidebarCollapsed ? 'w-11' : 'w-72'
            }`}
          >
            <div class="flex items-center justify-between border-b p-2">
              {#if !reviewSidebarCollapsed}
                <p class="px-1 text-xs font-semibold">Entry Preview</p>
              {/if}
              <Button
                variant="ghost"
                size="icon"
                class="h-7 w-7"
                onclick={toggleReviewSidebar}
                title={reviewSidebarCollapsed ? 'Expand preview panel' : 'Collapse preview panel'}
              >
                {#if reviewSidebarCollapsed}
                  <ChevronRight class="h-4 w-4" />
                {:else}
                  <ChevronLeft class="h-4 w-4" />
                {/if}
              </Button>
            </div>

            {#if !reviewSidebarCollapsed}
              <div class="min-h-0 flex-1 overflow-y-auto p-2">
                {#if reviewEntries.length === 0}
                  <p class="text-muted-foreground p-2 text-xs">No extracted entries available yet.</p>
                {:else}
                  {@const characterEntries = filterReviewEntriesByType(reviewEntries, 'character')}
                  {@const locationEntries = filterReviewEntriesByType(reviewEntries, 'location')}
                  {@const eventEntries = filterReviewEntriesByType(reviewEntries, 'event')}

                  <div class="space-y-3">
                    <div>
                      <p class="text-muted-foreground px-1 pb-1 text-[11px] font-medium uppercase">Characters</p>
                      <div class="space-y-1">
                        {#each characterEntries as entry (entry.key)}
                          <button
                            type="button"
                            class={`w-full rounded border px-2 py-1.5 text-left text-xs ${selectedReviewEntry?.key === entry.key ? 'border-primary bg-primary/10' : 'hover:bg-muted/50 border-transparent'}`}
                            onclick={() => selectReviewEntry(entry.key)}
                          >
                            <p class="truncate font-medium">{entry.name}</p>
                            <p class="text-muted-foreground truncate text-[11px]">{entry.chapterTitle}</p>
                          </button>
                        {/each}
                      </div>
                    </div>

                    <div>
                      <p class="text-muted-foreground px-1 pb-1 text-[11px] font-medium uppercase">Locations</p>
                      <div class="space-y-1">
                        {#each locationEntries as entry (entry.key)}
                          <button
                            type="button"
                            class={`w-full rounded border px-2 py-1.5 text-left text-xs ${selectedReviewEntry?.key === entry.key ? 'border-primary bg-primary/10' : 'hover:bg-muted/50 border-transparent'}`}
                            onclick={() => selectReviewEntry(entry.key)}
                          >
                            <p class="truncate font-medium">{entry.name}</p>
                            <p class="text-muted-foreground truncate text-[11px]">{entry.chapterTitle}</p>
                          </button>
                        {/each}
                      </div>
                    </div>

                    <div>
                      <p class="text-muted-foreground px-1 pb-1 text-[11px] font-medium uppercase">Events</p>
                      <div class="space-y-1">
                        {#if eventEntries.length === 0}
                          <p class="text-muted-foreground px-2 text-[11px]">No event entries detected.</p>
                        {:else}
                          {#each eventEntries as entry (entry.key)}
                            <button
                              type="button"
                              class={`w-full rounded border px-2 py-1.5 text-left text-xs ${selectedReviewEntry?.key === entry.key ? 'border-primary bg-primary/10' : 'hover:bg-muted/50 border-transparent'}`}
                              onclick={() => selectReviewEntry(entry.key)}
                            >
                              <p class="truncate font-medium">{entry.name}</p>
                              <p class="text-muted-foreground truncate text-[11px]">{entry.chapterTitle}</p>
                            </button>
                          {/each}
                        {/if}
                      </div>
                    </div>
                  </div>
                {/if}
              </div>

              {#if selectedReviewEntry}
                <div class="border-t p-3">
                  <p class="truncate text-sm font-semibold">{selectedReviewEntry.name}</p>
                  <span class={`mt-1 inline-flex rounded border px-1.5 py-0.5 text-[11px] ${reviewEntryBadgeClass(selectedReviewEntry.type)}`}>
                    {reviewEntryTypeLabel(selectedReviewEntry.type)}
                  </span>
                  <p class="text-muted-foreground mt-2 truncate text-xs">{selectedReviewEntry.chapterTitle}</p>
                  <p class="text-muted-foreground truncate text-[11px]">{selectedReviewEntry.chapterFilename}</p>
                  {#if selectedReviewEntryDescription}
                    <p class="bg-muted/40 mt-2 rounded border px-2 py-1.5 text-[11px]">
                      {selectedReviewEntryDescription}
                    </p>
                  {/if}
                  {#if selectedReviewEntry.chapterEmotionalTone}
                    <p class="text-muted-foreground mt-1 text-[11px]">
                      Tone: {selectedReviewEntry.chapterEmotionalTone}
                    </p>
                  {/if}
                  <Button
                    size="sm"
                    variant="outline"
                    class="mt-2 h-7 w-full text-[11px]"
                    disabled={hasLorebookEntry(selectedReviewEntry.name, selectedReviewEntry.type)}
                    onclick={() =>
                      addArtifactToLorebook(
                        selectedReviewEntry.name,
                        selectedReviewEntry.type,
                        selectedReviewEntry.chapterTitle,
                      )}
                  >
                    {#if hasLorebookEntry(selectedReviewEntry.name, selectedReviewEntry.type)}Saved in Lorebook{:else}<Plus class="mr-1 h-3 w-3" />Add to Lorebook{/if}
                  </Button>
                </div>
              {/if}
            {/if}
          </div>

          <div class="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            {#each importReport.chapters as chapter, chapterIndex (chapter.filename + chapterIndex)}
            {@const chapterExpanded = isChapterExpanded(chapter, chapterIndex)}
            <div class="rounded-lg border p-3">
              <div class="flex items-start justify-between gap-2">
                <button
                  type="button"
                  class="hover:bg-muted/50 -ml-1 inline-flex min-w-0 flex-1 items-start gap-2 rounded px-1 py-0.5 text-left"
                  onclick={() => toggleChapterExpanded(chapter, chapterIndex)}
                >
                  {#if chapterExpanded}
                    <ChevronDown class="mt-0.5 h-4 w-4 shrink-0" />
                  {:else}
                    <ChevronRight class="mt-0.5 h-4 w-4 shrink-0" />
                  {/if}
                  <span class="min-w-0">
                  <p class="truncate text-sm font-medium">{chapterIndex + 1}. {chapter.title}</p>
                  <p class="text-muted-foreground truncate text-xs">{chapter.filename}</p>
                  </span>
                </button>
                <div class="flex shrink-0 items-center gap-1">
                {#if chapter.errors.length === 0}
                  <span class="inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600">
                    <Check class="h-3 w-3" />
                    Processed
                  </span>
                {:else}
                  <span class="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600">
                    <AlertTriangle class="h-3 w-3" />
                    Partial
                  </span>
                {/if}
              </div>
              </div>

              {#if chapterExpanded}
                <div class="mt-2 flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    class="h-7 px-2 text-[11px]"
                    onclick={() =>
                      addBulkArtifactsToLorebook(
                        [
                          ...chapter.characters.map((name) => ({ name, type: 'character' as const })),
                          ...chapter.locations.map((name) => ({ name, type: 'location' as const })),
                          ...chapter.events.map((name) => ({ name, type: 'event' as const })),
                          ...chapter.plotThreads.map((name) => ({ name, type: 'concept' as const })),
                          ...chapter.keywords.map((name) => ({ name, type: 'concept' as const })),
                        ],
                        chapter.title,
                      )}
                  >
                    Add All
                  </Button>
                </div>

                {#if chapter.summary}
                  <p class="bg-muted/30 mt-2 rounded border px-2 py-1.5 text-xs">{chapter.summary}</p>
                {/if}

                <div class="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                  <div class="rounded border p-2">
                    <p class="mb-1 flex items-center gap-1 font-medium"><Users class="h-3.5 w-3.5" /> Characters</p>
                    {#if chapter.characters.length === 0}
                      <p class="text-muted-foreground">None extracted</p>
                    {:else}
                      <div class="space-y-1">
                        <div class="mb-1 flex justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            class="h-6 px-2 text-[11px]"
                            onclick={() =>
                              addBulkArtifactsToLorebook(
                                chapter.characters.map((name) => ({ name, type: 'character' as const })),
                                chapter.title,
                              )}
                          >
                            Add All Characters
                          </Button>
                        </div>
                        {#each chapter.characters as name}
                          <div class="flex items-center justify-between gap-2">
                            <span class="truncate">{name}</span>
                            <Button
                              size="sm"
                              variant="outline"
                              class="h-6 px-2 text-[11px]"
                              disabled={hasLorebookEntry(name, 'character')}
                              onclick={() => addArtifactToLorebook(name, 'character', chapter.title)}
                            >
                              {#if hasLorebookEntry(name, 'character')}Saved{:else}<Plus class="mr-1 h-3 w-3" />Lorebook{/if}
                            </Button>
                          </div>
                        {/each}
                      </div>
                    {/if}
                  </div>

                  <div class="rounded border p-2">
                    <p class="mb-1 flex items-center gap-1 font-medium"><MapPin class="h-3.5 w-3.5" /> Locations</p>
                    {#if chapter.locations.length === 0}
                      <p class="text-muted-foreground">None extracted</p>
                    {:else}
                      <div class="space-y-1">
                        <div class="mb-1 flex justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            class="h-6 px-2 text-[11px]"
                            onclick={() =>
                              addBulkArtifactsToLorebook(
                                chapter.locations.map((name) => ({ name, type: 'location' as const })),
                                chapter.title,
                              )}
                          >
                            Add All Locations
                          </Button>
                        </div>
                        {#each chapter.locations as name}
                          <div class="flex items-center justify-between gap-2">
                            <span class="truncate">{name}</span>
                            <Button
                              size="sm"
                              variant="outline"
                              class="h-6 px-2 text-[11px]"
                              disabled={hasLorebookEntry(name, 'location')}
                              onclick={() => addArtifactToLorebook(name, 'location', chapter.title)}
                            >
                              {#if hasLorebookEntry(name, 'location')}Saved{:else}<Plus class="mr-1 h-3 w-3" />Lorebook{/if}
                            </Button>
                          </div>
                        {/each}
                      </div>
                    {/if}
                  </div>

                  <div class="rounded border p-2">
                    <p class="mb-1 flex items-center gap-1 font-medium"><Calendar class="h-3.5 w-3.5" /> Events</p>
                    {#if chapter.events.length === 0}
                      <p class="text-muted-foreground">No event entries detected</p>
                    {:else}
                      <div class="space-y-1">
                        <div class="mb-1 flex justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            class="h-6 px-2 text-[11px]"
                            onclick={() =>
                              addBulkArtifactsToLorebook(
                                chapter.events.map((name) => ({ name, type: 'event' as const })),
                                chapter.title,
                              )}
                          >
                            Add All Events
                          </Button>
                        </div>
                        {#each chapter.events as name}
                          <div class="flex items-center justify-between gap-2">
                            <span class="truncate">{name}</span>
                            <Button
                              size="sm"
                              variant="outline"
                              class="h-6 px-2 text-[11px]"
                              disabled={hasLorebookEntry(name, 'event')}
                              onclick={() => addArtifactToLorebook(name, 'event', chapter.title)}
                            >
                              {#if hasLorebookEntry(name, 'event')}Saved{:else}<Plus class="mr-1 h-3 w-3" />Lorebook{/if}
                            </Button>
                          </div>
                        {/each}
                      </div>
                    {/if}
                  </div>

                  <div class="rounded border p-2 sm:col-span-2">
                    <p class="mb-1 flex items-center gap-1 font-medium"><Tag class="h-3.5 w-3.5" /> Plot Threads & Tags</p>
                    {#if chapter.plotThreads.length === 0 && chapter.keywords.length === 0}
                      <p class="text-muted-foreground">None extracted</p>
                    {:else}
                      <div class="flex flex-wrap gap-1.5">
                        <div class="w-full pb-1 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            class="h-6 px-2 text-[11px]"
                            onclick={() =>
                              addBulkArtifactsToLorebook(
                                [
                                  ...chapter.plotThreads.map((name) => ({ name, type: 'concept' as const })),
                                  ...chapter.keywords.map((name) => ({ name, type: 'concept' as const })),
                                ],
                                chapter.title,
                              )}
                          >
                            Add All Tags
                          </Button>
                        </div>
                        {#each [...chapter.plotThreads, ...chapter.keywords] as concept}
                          <button
                            type="button"
                            class="bg-muted hover:bg-muted/80 inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px]"
                            disabled={hasLorebookEntry(concept, 'concept')}
                            onclick={() => addArtifactToLorebook(concept, 'concept', chapter.title)}
                          >
                            {concept}
                            {#if hasLorebookEntry(concept, 'concept')}
                              <Check class="h-3 w-3" />
                            {:else}
                              <Plus class="h-3 w-3" />
                            {/if}
                          </button>
                        {/each}
                      </div>
                    {/if}
                  </div>
                </div>

                {#if chapter.emotionalTone}
                  <p class="text-muted-foreground mt-2 inline-flex items-center gap-1 text-xs">
                    <Theater class="h-3.5 w-3.5" /> Tone: {chapter.emotionalTone}
                  </p>
                {/if}

                {#if chapter.created.storyBeats.length > 0}
                  <p class="text-muted-foreground mt-1 text-xs">New story beats: {chapter.created.storyBeats.join(', ')}</p>
                {/if}

                <p class="text-muted-foreground mt-1 text-xs">
                  Lorebook changes: +{chapter.lorebookChanges.created} created, {chapter.lorebookChanges.updated} updated, {chapter.lorebookChanges.merged} merged, {chapter.lorebookChanges.deleted} deleted
                </p>
                <p class="text-muted-foreground mt-0.5 text-xs">
                  Event entries: +{chapter.lorebookChanges.eventsCreated} created, {chapter.lorebookChanges.eventsUpdated} updated
                </p>

                {#if chapter.errors.length > 0}
                  <div class="mt-2 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700">
                    {chapter.errors.join(' | ')}
                  </div>
                {/if}
              {:else}
                <p class="text-muted-foreground mt-2 text-xs">
                  Collapsed. Expand to review summary, artifacts, and lorebook actions.
                </p>
              {/if}
            </div>
            {/each}
          </div>
        </div>
      {:else}
        <div
          class={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
            dragOver ? 'border-primary bg-primary/10' : 'border-muted hover:border-muted-foreground/50'
          }`}
          ondrop={handleDrop}
          ondragover={handleDragOver}
          ondragleave={handleDragLeave}
          role="button"
          tabindex="0"
          onclick={openFilePicker}
          onkeydown={(event) => event.key === 'Enter' && openFilePicker()}
        >
          <Upload class="text-muted-foreground mx-auto mb-3 h-12 w-12" />
          <p class="text-foreground mb-1">Drop chapter text files here</p>
          <p class="text-muted-foreground text-sm">or click to browse .txt and .md files</p>
        </div>

        <input
          bind:this={fileInput}
          type="file"
          class="hidden"
          accept={ACCEPTED_TYPES}
          multiple
          onchange={(event) => readSelectedFiles((event.currentTarget as HTMLInputElement).files)}
        />

        <div class="grid gap-2">
          <Label for="novel-title">Story Title</Label>
          <Input
            id="novel-title"
            bind:value={title}
            placeholder="Enter a title, or leave blank to use the first chapter filename"
            disabled={loading}
          />
        </div>

        <div class="grid gap-2">
          <Label for="novel-description">Story Description</Label>
          <Textarea
            id="novel-description"
            bind:value={description}
            rows={3}
            placeholder="Optional description for the new story"
            disabled={loading}
          />
        </div>

        <div class="flex items-start gap-2 rounded-lg border p-3">
          <input
            id="step-by-step-review"
            type="checkbox"
            class="mt-1"
            bind:checked={stepByStepReview}
            disabled={loading}
          />
          <div class="grid gap-1.5 leading-none">
            <Label for="step-by-step-review" class="text-sm font-medium">
              Pause for review between chapters
            </Label>
            <p class="text-muted-foreground text-xs">
              Processes one chapter at a time and waits for Continue or Abort.
            </p>
          </div>
        </div>

        <div class="rounded-lg border border-dashed p-4 text-sm">
          <p class="font-medium">Processing order</p>
          <p class="text-muted-foreground mt-1">
            Files are initially sorted by chapter number from filename. Use Up/Down controls to reorder before import.
          </p>
        </div>

        <div class="bg-muted/40 rounded-lg border p-4 text-sm">
          <div class="flex items-center justify-between gap-3">
            <span class="font-medium">Selected files</span>
            <span class="text-muted-foreground text-xs">{fileCount} files · {totalBytes} bytes</span>
          </div>
          <div class="mt-3 max-h-48 space-y-2 overflow-y-auto">
            {#if files.length === 0}
              <p class="text-muted-foreground text-sm">No chapter files selected yet.</p>
            {:else}
              {#each files as selected, index (selected.id)}
                <div class="bg-background flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                  <div class="min-w-0">
                    <p class="truncate text-sm font-medium">{index + 1}. {selected.file.name}</p>
                    <p class="text-muted-foreground text-xs">{selected.file.size} bytes</p>
                  </div>
                  <div class="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-7 w-7"
                      title="Move up"
                      disabled={index === 0}
                      onclick={() => moveFileByOffset(selected.id, -1)}
                    >
                      <ArrowUp class="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-7 w-7"
                      title="Move down"
                      disabled={index === files.length - 1}
                      onclick={() => moveFileByOffset(selected.id, 1)}
                    >
                      <ArrowDown class="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-7 w-7"
                      title="Remove file"
                      onclick={() => removeFile(selected.id)}
                    >
                      <X class="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              {/each}
            {/if}
          </div>
        </div>
      {/if}
    </div>

    <div class="flex items-center justify-between gap-3 border-t px-6 py-4">
      <Button variant="secondary" onclick={close} disabled={loading}>
        <X class="mr-2 h-4 w-4" />
        {#if importReport}Close{:else}Cancel{/if}
      </Button>
      {#if awaitingGuidedDecision}
        <div class="flex items-center gap-2">
          <Button variant="outline" onclick={abortGuidedImport}>
            Abort Remaining ({pendingSources.length})
          </Button>
          <Button onclick={continueGuidedImport}>
            Continue to Next Chapter
          </Button>
        </div>
      {:else if guidedActive}
        <Button disabled>
          <Loader2 class="mr-2 h-4 w-4 animate-spin" />
          Processing Next Chapter...
        </Button>
      {:else if canOpenStory}
        <Button onclick={openCreatedStory}>
          <Sparkles class="mr-2 h-4 w-4" />
          Open {guidedStoryMode === 'creative-writing' ? 'Creative Writing' : 'Story'}
        </Button>
      {:else}
        <Button onclick={handleImport} disabled={loading || files.length === 0}>
          {#if loading}
            <Loader2 class="mr-2 h-4 w-4 animate-spin" />
            Creating...
          {:else}
            <Sparkles class="mr-2 h-4 w-4" />
            Create Story
          {/if}
        </Button>
      {/if}
    </div>
  </ResponsiveModal.Content>
</ResponsiveModal.Root>

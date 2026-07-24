<script lang="ts">
  import type {
    ChapterImportProgressEvent,
    ChapterSourceImportReport,
    EntryState,
    EntryType,
  } from '$lib/types'
  import { open } from '@tauri-apps/plugin-dialog'
  import { readTextFile } from '@tauri-apps/plugin-fs'
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
    Tag,
    Theater,
    Upload,
    Users,
    X,
  } from 'lucide-svelte'
  import * as ResponsiveModal from '$lib/components/ui/responsive-modal'
  import { Button } from '$lib/components/ui/button'
  import { Checkbox } from '$lib/components/ui/checkbox'
  import { Label } from '$lib/components/ui/label'
  import { ui } from '$lib/stores/ui.svelte'
  import { story } from '$lib/stores/story.svelte'

  type SourceFile = {
    id: string
    filename: string
    content: string
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

  let dragOver = $state(false)
  let files = $state<SourceFile[]>([])
  let importing = $state(false)
  let parseIntoStoryState = $state(true)
  let stepByStepReview = $state(true)
  let importReport = $state<ChapterSourceImportReport | null>(null)
  let pendingSources = $state<Array<{ filename: string; content: string }>>([])
  let guidedActive = $state(false)
  let awaitingGuidedDecision = $state(false)
  let guidedAborted = $state(false)
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
  let addedLorebookKeys = $state<Set<string>>(new Set())
  let expandedChapterKeys = $state<Set<string>>(new Set())
  let reviewSidebarCollapsed = $state(false)
  let selectedReviewEntryKey = $state<string | null>(null)

  const fileCount = $derived(files.length)
  const totalCharacters = $derived(files.reduce((sum, file) => sum + file.content.length, 0))

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

  function toOrderedFiles(rawFiles: SourceFile[]): SourceFile[] {
    return [...rawFiles].sort((a, b) => a.orderHint - b.orderHint || a.originalIndex - b.originalIndex)
  }

  function resetState() {
    files = []
    dragOver = false
    importing = false
    parseIntoStoryState = true
    stepByStepReview = true
    importReport = null
    pendingSources = []
    guidedActive = false
    awaitingGuidedDecision = false
    guidedAborted = false
    progressState = null
    guidedProcessedCount = 0
    totalPlannedChapters = 0
    addedLorebookKeys = new Set()
    expandedChapterKeys = new Set()
    reviewSidebarCollapsed = false
    selectedReviewEntryKey = null
  }

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

  function close() {
    ui.closeChapterSourceImport()
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

    ui.showToast(`Bulk add complete: ${addedCount} added, ${alreadyCount} already present`, 'info')
  }

  function rebuildReportFromChapters(chapters: ChapterSourceImportReport['chapters']): ChapterSourceImportReport {
    return {
      importedCount: chapters.length,
      parseIntoStoryState,
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

  async function readSelectedFiles(selected: FileList | null) {
    if (!selected || selected.length === 0) return
    const nextFiles: SourceFile[] = []
    let offset = files.length
    for (const file of Array.from(selected)) {
      nextFiles.push({
        id: crypto.randomUUID(),
        filename: file.name,
        content: await file.text(),
        orderHint: extractChapterOrderHint(file.name, offset),
        originalIndex: offset,
      })
      offset += 1
    }
    files = toOrderedFiles([...files, ...nextFiles])
  }

  async function browseFiles() {
    const selection = await open({
      multiple: true,
      filters: [
        { name: 'Chapter text', extensions: ['txt', 'md', 'markdown'] },
        { name: 'Text', extensions: ['txt'] },
        { name: 'Markdown', extensions: ['md', 'markdown'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    })

    if (!selection) return
    const paths = Array.isArray(selection) ? selection : [selection]
    const nextFiles: SourceFile[] = []
    let offset = files.length
    for (const path of paths) {
      const filename = path.split(/[\\/]/).pop() ?? path
      nextFiles.push({
        id: crypto.randomUUID(),
        filename,
        content: await readTextFile(path),
        orderHint: extractChapterOrderHint(filename, offset),
        originalIndex: offset,
      })
      offset += 1
    }
    files = toOrderedFiles([...files, ...nextFiles])
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

  async function processNextGuidedChapter() {
    if (!guidedActive || pendingSources.length === 0) return

    importing = true
    awaitingGuidedDecision = false
    try {
      const [nextSource, ...rest] = pendingSources
      pendingSources = rest

      const report = await story.importChapterSources([nextSource], {
        parseIntoStoryState,
        createStoryEntries: parseIntoStoryState,
        createChapterRecords: parseIntoStoryState,
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
      importing = false

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
      importing = false
    }
  }

  async function continueGuidedImport() {
    if (!awaitingGuidedDecision || importing) return
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

  async function handleImport() {
    if (!story.currentStory || files.length === 0 || importing) return

    importing = true
    try {
      const sources = files.map((file) => ({ filename: file.filename, content: file.content }))

      totalPlannedChapters = sources.length
      guidedProcessedCount = 0

      if (stepByStepReview) {
        importReport = rebuildReportFromChapters([])
        collapseAllChapters()
        pendingSources = [...sources]
        guidedActive = true
        guidedAborted = false
        progressState = {
          chapterIndex: 0,
          totalChapters: sources.length,
          title: '',
          filename: '',
          phase: 'Preparing import',
          message: 'Starting chapter 1...',
        }
        await processNextGuidedChapter()
      } else {
        const report = await story.importChapterSources(sources, {
          parseIntoStoryState,
          createStoryEntries: parseIntoStoryState,
          createChapterRecords: parseIntoStoryState,
          onProgress: (event) => updateProgress(event),
        })

        importReport = report
        expandLatestChapter(report.chapters)
        progressState = {
          chapterIndex: report.importedCount,
          totalChapters: sources.length,
          title: report.chapters[report.chapters.length - 1]?.title ?? '',
          filename: report.chapters[report.chapters.length - 1]?.filename ?? '',
          phase: 'Import complete',
          message: 'All selected chapters were processed.',
        }

        const totals = report.createdTotals
        ui.showToast(
          `Imported ${report.importedCount} chapter sourc${report.importedCount === 1 ? 'e' : 'es'} (${totals.characters} chars, ${totals.locations} locs, +${report.lorebookTotals.created}/${report.lorebookTotals.updated} lore create/update)`,
          'info',
        )
      }
    } catch (error) {
      finalizeImportRun({ keepReport: true, keepProgress: true })
      ui.showToast(error instanceof Error ? error.message : 'Failed to import chapter text', 'error')
    } finally {
      importing = false
    }
  }

  const canCloseAsDone = $derived(
    !!importReport && !guidedActive && !awaitingGuidedDecision && !importing,
  )
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

<ResponsiveModal.Root open={ui.chapterSourceImportModalOpen} onOpenChange={(open) => !open && close()}>
  <ResponsiveModal.Content class="flex max-h-[90vh] w-[95vw] max-w-6xl flex-col gap-0 p-0">
    <ResponsiveModal.Header class="border-b px-6 py-4">
      <div class="flex items-center gap-2">
        <Upload class="text-primary h-5 w-5" />
        <ResponsiveModal.Title>Import Chapter Text</ResponsiveModal.Title>
      </div>
      <ResponsiveModal.Description>
        Import raw chapter files as searchable source records, with optional parsing into story state.
      </ResponsiveModal.Description>
    </ResponsiveModal.Header>

    <div class="flex-1 space-y-4 overflow-y-auto px-6 py-6">
      {#if progressState && (importing || guidedActive || awaitingGuidedDecision || importReport)}
        <div class="rounded-lg border border-slate-200/30 bg-slate-900 p-3 text-xs shadow-sm">
          <p class="font-medium text-white">
            Chapter {Math.max(progressState.chapterIndex, 1)} of {Math.max(progressState.totalChapters, 1)}
            {#if progressState.title}
              · {progressState.title}
            {/if}
          </p>
          <p class="mt-1 text-white/95">{progressState.phase}</p>
          <p class="mt-0.5 text-white/90">{progressState.message}</p>
          {#if progressState.filename}
            <p class="mt-1 truncate text-white/75">{progressState.filename}</p>
          {/if}
        </div>
      {/if}

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
            <div class="bg-muted/20 rounded border px-2 py-1.5">Lorebook Created: {importReport.lorebookTotals.created}</div>
            <div class="bg-muted/20 rounded border px-2 py-1.5">Lorebook Updated: {importReport.lorebookTotals.updated}</div>
            <div class="bg-muted/20 rounded border px-2 py-1.5">Lorebook Merged: {importReport.lorebookTotals.merged}</div>
            <div class="bg-muted/20 rounded border px-2 py-1.5">Event Entries Created: {importReport.lorebookTotals.eventsCreated}</div>
            <div class="bg-muted/20 rounded border px-2 py-1.5">Event Entries Updated: {importReport.lorebookTotals.eventsUpdated}</div>
            <div class="bg-muted/20 rounded border px-2 py-1.5">Lorebook Deleted: {importReport.lorebookTotals.deleted}</div>
          </div>
          {#if importReport.failedChapterCount > 0}
            <div class="mt-3 flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
              <AlertTriangle class="mt-0.5 h-4 w-4 text-amber-500" />
              <span>
                {importReport.failedChapterCount} chapter{importReport.failedChapterCount === 1 ? '' : 's'} had partial processing errors.
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
          onclick={browseFiles}
          onkeydown={(event) => event.key === 'Enter' && void browseFiles()}
        >
          <FileText class="text-muted-foreground mx-auto mb-3 h-12 w-12" />
          <p class="text-foreground mb-1">Drop chapter text files here</p>
          <p class="text-muted-foreground text-sm">or click to browse .txt and .md files</p>
        </div>

        <div class="flex items-start gap-2 rounded-lg border p-3">
          <Checkbox id="parse-into-story" bind:checked={parseIntoStoryState} class="mt-1" />
          <div class="grid gap-1.5 leading-none">
            <Label for="parse-into-story" class="text-sm font-medium">Parse imported text into story state</Label>
            <p class="text-muted-foreground text-xs">
              Summarizes chapters and lets the classifier/lore manager extract beats, characters, locations, and lorebook entries.
            </p>
          </div>
        </div>

        <div class="flex items-start gap-2 rounded-lg border p-3">
          <Checkbox id="step-review" bind:checked={stepByStepReview} class="mt-1" />
          <div class="grid gap-1.5 leading-none">
            <Label for="step-review" class="text-sm font-medium">Pause for review between chapters</Label>
            <p class="text-muted-foreground text-xs">Process one chapter, review, then continue or abort.</p>
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
            <span class="text-muted-foreground text-xs">{fileCount} files · {totalCharacters} chars</span>
          </div>
          {#if fileCount === 0}
            <p class="text-muted-foreground mt-2 text-sm">No chapter files selected yet.</p>
          {:else}
            <div class="mt-3 space-y-2 text-xs">
              {#each files as file, index (file.id)}
                <div class="bg-background flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                  <div class="min-w-0">
                    <span class="truncate">{index + 1}. {file.filename}</span>
                    <p class="text-muted-foreground shrink-0">{file.content.length} chars</p>
                  </div>
                  <div class="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-7 w-7"
                      title="Move up"
                      disabled={index === 0}
                      onclick={() => moveFileByOffset(file.id, -1)}
                    >
                      <ArrowUp class="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-7 w-7"
                      title="Move down"
                      disabled={index === files.length - 1}
                      onclick={() => moveFileByOffset(file.id, 1)}
                    >
                      <ArrowDown class="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-7 w-7"
                      title="Remove file"
                      onclick={() => removeFile(file.id)}
                    >
                      <X class="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <ResponsiveModal.Footer class="border-t px-6 py-3">
      <Button variant="outline" onclick={close} disabled={importing}>
        {#if canCloseAsDone}Close{:else}Cancel{/if}
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
      {:else if canCloseAsDone}
        <Button onclick={close}>
          Done
        </Button>
      {:else}
        <Button onclick={handleImport} disabled={importing || fileCount === 0 || !story.currentStory}>
          {#if importing}
            <Loader2 class="mr-2 h-4 w-4 animate-spin" />
          {/if}
          Import Sources
        </Button>
      {/if}
    </ResponsiveModal.Footer>
  </ResponsiveModal.Content>
</ResponsiveModal.Root>

<script lang="ts">
  import { story } from '$lib/stores/story.svelte'
  import { ui } from '$lib/stores/ui.svelte'
  import { serviceFactory } from '$lib/services/ai/core/factory'
  import type { EditorConversation } from '$lib/types'
  import type {
    EditorChatMessage,
    EditorInteractiveContext,
    EditorProposedEdit,
    EditorToolCallDisplay,
  } from '$lib/services/ai/generation/InteractiveEditorAssistantService'
  import * as ResponsiveModal from '$lib/components/ui/responsive-modal'
  import { Button } from '$lib/components/ui/button'
  import { Textarea } from '$lib/components/ui/textarea'
  import { Badge } from '$lib/components/ui/badge'
  import { SvelteMap } from 'svelte/reactivity'
  import {
    Loader2,
    BookMarked,
    Check,
    X,
    RefreshCw,
    Send,
    PencilLine,
    History,
    ChevronDown,
    ChevronUp,
    Trash2,
    Pencil,
    Maximize2,
    ChevronLeft,
    ChevronRight,
  } from 'lucide-svelte'

  interface Props {
    open: boolean
    onClose: () => void
  }

  let { open, onClose }: Props = $props()

  const interactiveService = serviceFactory.createInteractiveEditorAssistantService()

  let composer = $state('')
  let loading = $state(false)
  let applying = $state(false)
  let streamStatus = $state<string | null>(null)
  let chatMessages = $state<EditorChatMessage[]>([])
  let pendingEdits = $state<EditorProposedEdit[]>([])
  let selectedTargetEntryId = $state('')
  let lastStoryId = $state<string | null>(null)
  let conversations = $state<EditorConversation[]>([])
  let conversationSelectorOpen = $state(false)
  let renamingConversationId = $state<string | null>(null)
  let renameValue = $state('')
  let activeConversationId = $state<string | null>(null)
  let pendingSave: Promise<unknown> = Promise.resolve()
  let reviewModalOpen = $state(false)
  let reviewEditId = $state<string | null>(null)
  let reviewRevisedContent = $state('')
  let reviewReprocessChapter = $state(true)
  let reviewRerunLorebookPass = $state(false)
  let autoScrollConversation = $state(true)
  let conversationContainer = $state<HTMLDivElement | null>(null)
  let reviewCurrentTextarea = $state<HTMLTextAreaElement | null>(null)
  let reviewTextarea = $state<HTMLTextAreaElement | null>(null)
  let syncingReviewScroll = false
  let deferredChapterReprocess = new SvelteMap<
    string,
    { entryId: string; rerunLorebookPass: boolean }
  >()

  function createWelcomeMessage(storyTitle: string | undefined): EditorChatMessage {
    return {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: storyTitle
        ? `I'm your publishing-style editor for ${storyTitle}. We can discuss pacing, prose, continuity, and then I can apply targeted rewrites when you ask.`
        : 'Open a story and I can help you workshop draft quality, continuity, and targeted rewrites.',
      timestamp: Date.now(),
    }
  }

  function getEntryPosition(entryId: string): number {
    const entry = story.entries.find((candidate) => candidate.id === entryId)
    return entry?.position ?? Number.MAX_SAFE_INTEGER
  }

  function sortPendingEditsByEntryOrder(edits: EditorProposedEdit[]): EditorProposedEdit[] {
    return [...edits].sort((a, b) => {
      const positionDelta = getEntryPosition(a.entryId) - getEntryPosition(b.entryId)
      if (positionDelta !== 0) return positionDelta
      return a.id.localeCompare(b.id)
    })
  }

  function scrollConversationToBottom() {
    if (!conversationContainer) return
    conversationContainer.scrollTop = conversationContainer.scrollHeight
  }

  function getChapterForEntry(entryId: string) {
    return story.currentBranchChapters.find((chapter) =>
      story.getChapterEntries(chapter).some((entry) => entry.id === entryId),
    )
  }

  function hasPendingEditsForChapter(chapterId: string, edits: EditorProposedEdit[]): boolean {
    return edits.some((edit) => getChapterForEntry(edit.entryId)?.id === chapterId)
  }

  async function finalizeDeferredChapterReprocess(
    edit: EditorProposedEdit,
    remainingEdits: EditorProposedEdit[],
    markDirty: boolean,
  ): Promise<{
    chapterUpdated: boolean
    chapterNumber: number | null
    lorebookRefreshed: boolean
  }> {
    const chapter = getChapterForEntry(edit.entryId)
    if (!chapter) {
      return { chapterUpdated: false, chapterNumber: null, lorebookRefreshed: false }
    }

    const existing = deferredChapterReprocess.get(chapter.id)
    if (markDirty && edit.reprocessChapter) {
      deferredChapterReprocess.set(chapter.id, {
        entryId: existing?.entryId ?? edit.entryId,
        rerunLorebookPass: (existing?.rerunLorebookPass ?? false) || edit.rerunLorebookPass,
      })
    }

    if (hasPendingEditsForChapter(chapter.id, remainingEdits)) {
      return { chapterUpdated: false, chapterNumber: chapter.number, lorebookRefreshed: false }
    }

    const deferred = deferredChapterReprocess.get(chapter.id)
    if (!deferred) {
      return { chapterUpdated: false, chapterNumber: chapter.number, lorebookRefreshed: false }
    }

    deferredChapterReprocess.delete(chapter.id)
    return story.reprocessEditorAssistantChapter(deferred.entryId, deferred.rerunLorebookPass)
  }

  function buildApplyToast(
    result: { chapterUpdated: boolean; chapterNumber: number | null; lorebookRefreshed: boolean },
    deferred: boolean,
  ): string {
    if (deferred) {
      return `Edit applied (chapter ${result.chapterNumber ?? '?'} refresh deferred)`
    }

    const chapterNote = result.chapterUpdated
      ? ` (chapter ${result.chapterNumber ?? '?'} refreshed)`
      : ''
    const loreNote = result.lorebookRefreshed ? ' + lorebook pass' : ''
    return `Edit applied${chapterNote}${loreNote}`
  }

  function resetConversation() {
    chatMessages = [createWelcomeMessage(story.currentStory?.title)]
    pendingEdits = []
    selectedTargetEntryId = ''
    interactiveService.reset()
    activeConversationId = null
    deferredChapterReprocess = new SvelteMap()
  }

  $effect(() => {
    const _effectDependency = `${chatMessages.length}:${loading ? 1 : 0}`
    void _effectDependency
    if (!autoScrollConversation) return
    queueMicrotask(() => {
      scrollConversationToBottom()
    })
  })

  $effect(() => {
    const left = reviewCurrentTextarea
    const right = reviewTextarea
    if (!left || !right) return

    const handleLeftScroll = () => syncReviewScroll('left')
    const handleRightScroll = () => syncReviewScroll('right')

    left.addEventListener('scroll', handleLeftScroll)
    right.addEventListener('scroll', handleRightScroll)

    return () => {
      left.removeEventListener('scroll', handleLeftScroll)
      right.removeEventListener('scroll', handleRightScroll)
    }
  })

  function hasConversationContent(): boolean {
    return chatMessages.some((message) => message.role === 'user')
  }

  async function loadConversationsList() {
    if (!story.currentStory) {
      conversations = []
      return
    }

    try {
      conversations = await interactiveService.listConversations(story.currentStory.id)
    } catch {
      conversations = []
    }
  }

  function queueSave(): Promise<boolean> {
    if (!story.currentStory) return Promise.resolve(false)

    const chatMessagesSnapshot = [...chatMessages]
    const pendingEditsSnapshot = [...pendingEdits]
    const selectedTargetSnapshot = selectedTargetEntryId || null

    const attempt = pendingSave.then(async () => {
      const conversationId = await interactiveService.saveConversation(
        story.currentStory!.id,
        chatMessagesSnapshot,
        pendingEditsSnapshot,
        { selectedTargetEntryId: selectedTargetSnapshot },
      )
      activeConversationId = conversationId
      loadConversationsList().catch(() => {})
    })

    pendingSave = attempt.catch((error) => {
      console.error('[EditorAssistant] Save failed:', error)
    })

    return attempt.then(
      () => true,
      () => false,
    )
  }

  async function handleNewConversation() {
    if (loading || applying) return

    if (hasConversationContent()) {
      const saved = await queueSave()
      if (!saved) {
        ui.showToast('Failed to save current conversation before creating a new one.', 'error')
        return
      }
    }

    conversationSelectorOpen = false
    resetConversation()
    await loadConversationsList()
  }

  async function handleSwitchConversation(id: string) {
    if (loading || applying || !story.currentStory) return

    if (id === activeConversationId) {
      conversationSelectorOpen = false
      return
    }

    if (hasConversationContent()) {
      const saved = await queueSave()
      if (!saved) {
        ui.showToast('Failed to save current conversation before switching.', 'error')
        return
      }
    }

    const context = buildInteractiveContext()
    if (!context) return

    await interactiveService.initialize(context)
    const loaded = await interactiveService.loadConversation(id)
    if (!loaded) {
      ui.showToast('Failed to load conversation.', 'error')
      return
    }

    chatMessages = loaded.chatMessages.length
      ? loaded.chatMessages
      : [createWelcomeMessage(story.currentStory.title)]
    pendingEdits = sortPendingEditsByEntryOrder(loaded.pendingEdits)
    selectedTargetEntryId = loaded.selectedTargetEntryId ?? ''
    activeConversationId = id
    conversationSelectorOpen = false
  }

  function startRename(conv: EditorConversation) {
    renamingConversationId = conv.id
    renameValue = conv.title || ''
  }

  function cancelRename() {
    renamingConversationId = null
    renameValue = ''
  }

  async function commitRename() {
    if (!renamingConversationId) return

    const conversationId = renamingConversationId
    const nextTitle = renameValue.trim()
    renamingConversationId = null
    renameValue = ''
    if (!nextTitle) return

    try {
      await interactiveService.renameConversation(conversationId, nextTitle)
      await loadConversationsList()
    } catch (error) {
      console.error('[EditorAssistant] Rename conversation failed:', error)
      ui.showToast('Failed to rename conversation.', 'error')
    }
  }

  async function handleDeleteConversation(id: string) {
    if (loading || applying) return

    try {
      await interactiveService.deleteConversation(id)
      if (activeConversationId === id) {
        resetConversation()
      }
      await loadConversationsList()
    } catch (error) {
      console.error('[EditorAssistant] Delete conversation failed:', error)
      ui.showToast('Failed to delete conversation.', 'error')
    }
  }

  $effect(() => {
    const currentStoryId = story.currentStory?.id ?? null
    if (currentStoryId !== lastStoryId) {
      lastStoryId = currentStoryId
      resetConversation()
      conversations = []
      conversationSelectorOpen = false
      renamingConversationId = null
      renameValue = ''
      if (currentStoryId) {
        loadConversationsList().catch(() => {})
      }
    }
  })

  function buildInteractiveContext(
    currentStory = story.currentStory,
  ): EditorInteractiveContext | null {
    if (!currentStory) return null

    const chapterEntriesByNumber: Record<string, typeof story.entries> = {}
    for (const chapter of story.chapters) {
      chapterEntriesByNumber[String(chapter.number)] = story.getChapterEntries(chapter)
    }

    return {
      story: currentStory,
      recentEntries: story.entries
        .filter((entry) => entry.type === 'user_action' || entry.type === 'narration')
        .slice(-12)
        .map((entry) => `${entry.type === 'user_action' ? 'USER' : 'ASSISTANT'}: ${entry.content}`),
      chapters: story.chapters,
      storyEntries: story.entries,
      chapterEntriesByNumber,
      worldState: {
        characters: story.characters,
        locations: story.locations,
        items: story.items,
        storyBeats: story.storyBeats,
        lorebookEntries: story.lorebookEntries,
      },
    }
  }

  function appendAssistantMessage(message: EditorChatMessage) {
    chatMessages = [
      ...chatMessages,
      {
        ...message,
        id: message.id || crypto.randomUUID(),
        timestamp: message.timestamp || Date.now(),
      },
    ]
  }

  function parseStructuredRewriteEdits(messageContent: string): EditorProposedEdit[] {
    const pattern =
      /\*\*Entry\s+(\d+)\s*\((Rewritten(?:\s+as\s+([A-Za-z_ ]+))?[^)]*)\):\*\*[\s\S]*?```\n?([\s\S]*?)```/gi
    const parsed: EditorProposedEdit[] = []

    for (const match of messageContent.matchAll(pattern)) {
      const entryPosition = Number(match[1])
      const typeHint = (match[3] ?? '').trim().toLowerCase()
      const revisedContent = match[4]?.trim()

      if (!Number.isFinite(entryPosition) || !revisedContent) continue

      const targetEntry = story.entries.find((entry) => entry.position === entryPosition)
      if (!targetEntry) continue

      const revisedEntryType =
        typeHint === 'narration'
          ? 'narration'
          : typeHint === 'user action' || typeHint === 'user_action'
            ? 'user_action'
            : targetEntry.type

      parsed.push({
        id: crypto.randomUUID(),
        entryId: targetEntry.id,
        entryType: targetEntry.type,
        revisedEntryType,
        originalContent: targetEntry.content,
        revisedContent,
        reason: `Parsed rewrite block for entry ${entryPosition} from assistant response.`,
        reprocessChapter: true,
        rerunLorebookPass: false,
      })
    }

    return parsed
  }

  const editableBranchEntries = $derived.by(() => {
    const currentBranchId = story.currentStory?.currentBranchId ?? null
    return story.entries.filter(
      (entry) =>
        entry.type !== 'system' &&
        (entry.branchId ?? null) === currentBranchId &&
        (entry.type === 'narration' || entry.type === 'user_action'),
    )
  })

  const selectedTargetEntry = $derived.by(() => {
    if (!selectedTargetEntryId) return null
    return editableBranchEntries.find((entry) => entry.id === selectedTargetEntryId) ?? null
  })

  function getToolStatusLabel(toolName: string): string {
    switch (toolName) {
      case 'search_lorebook_entries':
        return 'Searching lorebook...'
      case 'read_lorebook_entry':
        return 'Reading lorebook entry...'
      case 'list_chapters':
        return 'Reviewing chapter summaries...'
      case 'read_chapter':
        return 'Reading chapter context...'
      case 'search_story_text':
        return 'Searching story text...'
      case 'read_recent_story_text':
        return 'Reading recent text...'
      case 'apply_story_entry_edit':
        return 'Preparing entry edit...'
      default:
        return `Using tool: ${toolName}`
    }
  }

  function summarizeToolCalls(toolCalls: EditorToolCallDisplay[] | undefined): string {
    if (!toolCalls || toolCalls.length === 0) return ''
    const labels = toolCalls.map((call) => getToolStatusLabel(call.name).replace(/\.\.\.$/, ''))
    return `Context actions: ${labels.join('; ')}`
  }

  function looksLikeConcreteRewriteRequest(userText: string): boolean {
    return (
      /(rewrite|revise|edit|convert|rework)/i.test(userText) &&
      /(entry|entries|message|messages)/i.test(userText)
    )
  }

  function enqueueProposedEdit(edit: EditorProposedEdit) {
    const existingIndex = pendingEdits.findIndex(
      (candidate) => candidate.id === edit.id || candidate.entryId === edit.entryId,
    )

    if (existingIndex >= 0) {
      const next = [...pendingEdits]
      next[existingIndex] = edit
      pendingEdits = sortPendingEditsByEntryOrder(next)
    } else {
      pendingEdits = sortPendingEditsByEntryOrder([...pendingEdits, edit])
    }
    queueSave().catch(() => {})
  }

  function syncReviewScroll(source: 'left' | 'right') {
    if (syncingReviewScroll) return
    if (!reviewCurrentTextarea || !reviewTextarea) return

    const sourceElement = source === 'left' ? reviewCurrentTextarea : reviewTextarea
    const targetElement = source === 'left' ? reviewTextarea : reviewCurrentTextarea
    const sourceRange = sourceElement.scrollHeight - sourceElement.clientHeight
    const targetRange = targetElement.scrollHeight - targetElement.clientHeight
    const ratio = sourceRange > 0 ? sourceElement.scrollTop / sourceRange : 0

    syncingReviewScroll = true
    targetElement.scrollTop = targetRange > 0 ? ratio * targetRange : 0
    queueMicrotask(() => {
      syncingReviewScroll = false
    })
  }

  function openReviewModal(edit: EditorProposedEdit) {
    reviewEditId = edit.id
    reviewRevisedContent = edit.revisedContent
    reviewReprocessChapter = edit.reprocessChapter
    reviewRerunLorebookPass = edit.rerunLorebookPass
    reviewModalOpen = true
  }

  function openReviewModalById(editId: string) {
    const edit = pendingEdits.find((candidate) => candidate.id === editId)
    if (!edit) {
      closeReviewModal()
      return
    }
    openReviewModal(edit)
  }

  function getNextReviewEditId(currentEditId: string, edits: EditorProposedEdit[]): string | null {
    const currentIndex = edits.findIndex((candidate) => candidate.id === currentEditId)
    if (currentIndex < 0) return edits[0]?.id ?? null

    const nextAtSameIndex = edits[currentIndex]
    if (nextAtSameIndex) return nextAtSameIndex.id

    return edits[edits.length - 1]?.id ?? null
  }

  function getPreviousReviewEditId(
    currentEditId: string,
    edits: EditorProposedEdit[],
  ): string | null {
    const currentIndex = edits.findIndex((candidate) => candidate.id === currentEditId)
    if (currentIndex <= 0) return null
    return edits[currentIndex - 1]?.id ?? null
  }

  const reviewEditIndex = $derived.by(() => {
    if (!reviewEditId) return -1
    return pendingEdits.findIndex((candidate) => candidate.id === reviewEditId)
  })

  const previousReviewEditId = $derived.by(() => {
    if (!reviewEditId) return null
    return getPreviousReviewEditId(reviewEditId, pendingEdits)
  })

  const nextReviewEditId = $derived.by(() => {
    if (!reviewEditId) return null
    const currentIndex = pendingEdits.findIndex((candidate) => candidate.id === reviewEditId)
    if (currentIndex < 0) return null
    return pendingEdits[currentIndex + 1]?.id ?? null
  })

  function navigateReview(direction: 'previous' | 'next') {
    const targetId = direction === 'previous' ? previousReviewEditId : nextReviewEditId
    if (!targetId) return
    openReviewModalById(targetId)
  }

  function closeReviewModal() {
    reviewModalOpen = false
    reviewEditId = null
    reviewRevisedContent = ''
  }

  const reviewEdit = $derived.by(() => {
    if (!reviewEditId) return null
    return pendingEdits.find((candidate) => candidate.id === reviewEditId) ?? null
  })

  async function sendInteractiveMessage(messageText: string) {
    const context = buildInteractiveContext()
    if (!context || loading) return

    const userText = messageText.trim()
    if (!userText) {
      ui.showToast('Enter a prompt first', 'warning')
      return
    }

    const targetContextPrefix = selectedTargetEntry
      ? [
          '[TARGET_ENTRY_CONTEXT]',
          `entryId: ${selectedTargetEntry.id}`,
          `entryType: ${selectedTargetEntry.type}`,
          `entryPosition: ${selectedTargetEntry.position}`,
          'Use this entry as the primary rewrite target when the user asks for edits.',
          '',
          '[/TARGET_ENTRY_CONTEXT]',
          '',
        ].join('\n')
      : ''
    const toolCallingPrefix = looksLikeConcreteRewriteRequest(userText)
      ? [
          '[EDITOR_TOOL_INSTRUCTION]',
          'The user is asking for concrete edits to existing story entries.',
          'Queue those edits with apply_story_entry_edit tool calls instead of only returning rewritten prose in chat.',
          'If an entry should change role, include revisedType.',
          '[/EDITOR_TOOL_INSTRUCTION]',
          '',
        ].join('\n')
      : ''
    const outboundPrompt = `${toolCallingPrefix}${targetContextPrefix}${userText}`

    chatMessages = [
      ...chatMessages,
      {
        id: crypto.randomUUID(),
        role: 'user',
        content: userText,
        timestamp: Date.now(),
      },
    ]
    queueSave().catch(() => {})

    loading = true
    streamStatus = 'Thinking...'
    try {
      for await (const event of interactiveService.sendMessageStreaming(context, outboundPrompt)) {
        if (event.type === 'thinking') {
          streamStatus = 'Thinking...'
        } else if (event.type === 'tool_start') {
          streamStatus = getToolStatusLabel(event.toolName)
        } else if (event.type === 'tool_end') {
          streamStatus = null
          if (event.toolCall.edit) {
            enqueueProposedEdit(event.toolCall.edit)
            ui.showToast('Prepared an editable draft change', 'info')
          }
        } else if (event.type === 'message') {
          if (event.message.content?.trim() || (event.message.toolCalls?.length ?? 0) > 0) {
            appendAssistantMessage({
              ...event.message,
              content: event.message.content?.trim() || summarizeToolCalls(event.message.toolCalls),
            })
            const parsedRewriteEdits = event.message.content?.trim()
              ? parseStructuredRewriteEdits(event.message.content)
              : []
            for (const parsedEdit of parsedRewriteEdits) {
              enqueueProposedEdit(parsedEdit)
            }
            if (parsedRewriteEdits.length > 0) {
              ui.showToast(
                `Queued ${parsedRewriteEdits.length} parsed rewrite edit${parsedRewriteEdits.length === 1 ? '' : 's'}`,
                'info',
              )
            }
            queueSave().catch(() => {})
          }
          streamStatus = null
        } else if (event.type === 'error') {
          streamStatus = null
          ui.showToast(event.error, 'error')
        } else if (event.type === 'done') {
          streamStatus = null
        }
      }
    } catch (error) {
      console.error('[EditorAssistant] Interactive editor failed:', error)
      ui.showToast('Failed to message editor assistant', 'error')
    } finally {
      loading = false
      streamStatus = null
      if (hasConversationContent()) {
        queueSave().catch(() => {})
      }
    }
  }

  async function sendPrompt() {
    const trimmedPrompt = composer.trim()
    if (!trimmedPrompt) return
    composer = ''
    await sendInteractiveMessage(trimmedPrompt)
  }

  async function handleComposerKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    if (!composer.trim() || loading || !story.currentStory) return
    await sendPrompt()
  }

  async function _applyEdit(edit: EditorProposedEdit) {
    applying = true
    try {
      await story.applyEditorAssistantEdit(edit.entryId, edit.revisedContent, {
        revisedType: edit.revisedEntryType,
        reprocessChapter: false,
        rerunLorebookPass: edit.rerunLorebookPass,
      })
      const remainingEdits = pendingEdits.filter((candidate) => candidate.id !== edit.id)
      pendingEdits = remainingEdits

      const chapter = getChapterForEntry(edit.entryId)
      const deferred =
        !!chapter && hasPendingEditsForChapter(chapter.id, remainingEdits) && edit.reprocessChapter
      const result = await finalizeDeferredChapterReprocess(edit, remainingEdits, true)
      ui.showToast(buildApplyToast(result, deferred), 'info')
    } catch (error) {
      ui.showToast(error instanceof Error ? error.message : 'Failed to apply edit', 'error')
    } finally {
      applying = false
    }

    queueSave().catch(() => {})
  }

  async function applySingleReviewedEdit(
    edit: EditorProposedEdit,
  ): Promise<EditorProposedEdit[] | null> {
    applying = true
    try {
      await story.applyEditorAssistantEdit(edit.entryId, edit.revisedContent, {
        revisedType: edit.revisedEntryType,
        reprocessChapter: false,
        rerunLorebookPass: edit.rerunLorebookPass,
      })
      const remainingEdits = pendingEdits.filter((candidate) => candidate.id !== edit.id)
      pendingEdits = remainingEdits

      const chapter = getChapterForEntry(edit.entryId)
      const deferred =
        !!chapter && hasPendingEditsForChapter(chapter.id, remainingEdits) && edit.reprocessChapter
      const result = await finalizeDeferredChapterReprocess(edit, remainingEdits, true)
      ui.showToast(buildApplyToast(result, deferred), 'info')
      queueSave().catch(() => {})
      return remainingEdits
    } catch (error) {
      ui.showToast(error instanceof Error ? error.message : 'Failed to apply edit', 'error')
      return null
    } finally {
      applying = false
    }
  }

  async function applyReviewedEdit() {
    if (!reviewEdit) return

    const revised = reviewRevisedContent.trim()
    if (!revised) {
      ui.showToast('Revised text cannot be empty.', 'warning')
      return
    }

    const editToApply: EditorProposedEdit = {
      ...reviewEdit,
      revisedEntryType: reviewEdit.revisedEntryType,
      revisedContent: revised,
      reprocessChapter: reviewReprocessChapter,
      rerunLorebookPass: reviewRerunLorebookPass,
    }

    const nextReviewEditId = getNextReviewEditId(
      editToApply.id,
      pendingEdits.filter((candidate) => candidate.id !== editToApply.id),
    )
    const remainingEdits = await applySingleReviewedEdit(editToApply)
    if (!remainingEdits) return

    if (nextReviewEditId) {
      openReviewModalById(nextReviewEditId)
    } else {
      closeReviewModal()
    }
  }

  async function applyAllEdits() {
    if (pendingEdits.length === 0 || applying || loading) return

    applying = true
    const queue = [...pendingEdits]
    let applied = 0
    let failed = 0

    for (const edit of queue) {
      try {
        await story.applyEditorAssistantEdit(edit.entryId, edit.revisedContent, {
          revisedType: edit.revisedEntryType,
          reprocessChapter: false,
          rerunLorebookPass: edit.rerunLorebookPass,
        })
        const remainingEdits = pendingEdits.filter((candidate) => candidate.id !== edit.id)
        pendingEdits = remainingEdits
        await finalizeDeferredChapterReprocess(edit, remainingEdits, true)
        applied++
      } catch (error) {
        failed++
        console.error('[EditorAssistant] Batch apply failed:', error)
      }
    }

    if (applied > 0 && failed === 0) {
      ui.showToast(`Applied ${applied} edit${applied === 1 ? '' : 's'}`, 'info')
    } else if (applied > 0 && failed > 0) {
      ui.showToast(`Applied ${applied}, failed ${failed}. Failed edits remain queued.`, 'warning')
    } else {
      ui.showToast('No edits were applied.', 'error')
    }

    applying = false
    queueSave().catch(() => {})
  }

  function discardEdit(editId: string, options?: { advanceReview?: boolean }) {
    const discardedEdit = pendingEdits.find((candidate) => candidate.id === editId)
    const remainingEdits = pendingEdits.filter((candidate) => candidate.id !== editId)
    const nextReviewEditId = options?.advanceReview
      ? getNextReviewEditId(editId, remainingEdits)
      : null
    pendingEdits = remainingEdits
    if (reviewEditId === editId) {
      if (nextReviewEditId) {
        openReviewModalById(nextReviewEditId)
      } else {
        closeReviewModal()
      }
    }
    if (discardedEdit) {
      finalizeDeferredChapterReprocess(discardedEdit, remainingEdits, false).catch((error) => {
        console.error('[EditorAssistant] Deferred chapter reprocess failed after discard:', error)
        ui.showToast('Failed to refresh chapter after discard', 'error')
      })
    }
    queueSave().catch(() => {})
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) return
    if (hasConversationContent()) {
      queueSave().catch(() => {})
    }
    onClose()
  }
</script>

<ResponsiveModal.Root {open} onOpenChange={handleOpenChange}>
  <ResponsiveModal.Content class="max-h-[90vh] max-w-5xl overflow-hidden p-0">
    <div class="bg-background flex h-[90vh] flex-col">
      <div class="border-b px-5 py-4">
        <div class="flex items-start justify-between gap-4">
          <div>
            <div class="flex items-center gap-2">
              <PencilLine class="text-primary h-5 w-5" />
              <h2 class="text-lg font-semibold tracking-tight">Editor Assistant</h2>
            </div>
            <p class="text-muted-foreground mt-1 text-sm">
              Workshop prose, pacing, and continuity, then apply targeted edits to existing entries.
            </p>
          </div>
          <Button variant="ghost" size="icon" onclick={() => handleOpenChange(false)} title="Close">
            <X class="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div class="grid min-h-0 flex-1 gap-4 overflow-hidden p-5 lg:grid-cols-[0.95fr_1.35fr]">
        <div class="flex min-h-0 flex-col gap-4 overflow-hidden">
          <div class="min-h-0 flex-1 overflow-hidden rounded-lg border">
            <div class="border-b px-4 py-3">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <h3 class="font-medium">Pending Edits</h3>
                  <p class="text-muted-foreground text-xs">
                    Suggested rewrites stay queued until you explicitly approve them.
                  </p>
                </div>
                <div class="flex items-center gap-2">
                  <Button
                    size="sm"
                    onclick={applyAllEdits}
                    disabled={loading || applying || pendingEdits.length === 0}
                  >
                    <Check class="mr-2 h-4 w-4" />
                    Apply All ({pendingEdits.length})
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onclick={resetConversation}
                    disabled={loading || applying}
                  >
                    <RefreshCw class="mr-2 h-4 w-4" />
                    Reset
                  </Button>
                </div>
              </div>
            </div>

            <div class="max-h-[calc(90vh-22rem)] space-y-3 overflow-y-auto p-4">
              {#if pendingEdits.length === 0}
                <div class="text-muted-foreground rounded-md border border-dashed p-6 text-sm">
                  No pending edits yet. Ask for a rewrite and the assistant can queue exact entry
                  edits.
                </div>
              {:else}
                {#each pendingEdits as edit (edit.id)}
                  <div class="rounded-lg border p-4">
                    <div class="mb-2 flex items-center justify-between gap-3">
                      <div class="flex items-center gap-2">
                        <Badge variant="secondary">{edit.entryType}</Badge>
                        <span class="text-muted-foreground text-xs"
                          >Entry #{getEntryPosition(edit.entryId)}</span
                        >
                      </div>
                      <div class="text-muted-foreground text-xs">
                        {edit.reprocessChapter ? 'Reprocess chapter' : 'No chapter reprocess'}
                        {edit.rerunLorebookPass ? ' + lorebook' : ''}
                      </div>
                    </div>

                    <p class="text-muted-foreground mb-2 line-clamp-2 text-xs">{edit.reason}</p>
                    <p class="text-muted-foreground line-clamp-2 text-xs">
                      {edit.revisedContent.slice(0, 180)}{edit.revisedContent.length > 180
                        ? '...'
                        : ''}
                    </p>

                    <div class="mt-3 flex items-center gap-2">
                      <Button
                        size="sm"
                        onclick={() => openReviewModal(edit)}
                        disabled={applying || loading}
                      >
                        <Maximize2 class="mr-2 h-4 w-4" />
                        Review
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onclick={() => discardEdit(edit.id)}
                        disabled={applying || loading}
                      >
                        <X class="mr-2 h-4 w-4" />
                        Discard
                      </Button>
                    </div>
                  </div>
                {/each}
              {/if}
            </div>
          </div>

          <div class="rounded-lg border p-4">
            <h3 class="flex items-center gap-2 font-medium">
              <BookMarked class="h-4 w-4" />
              Context Coverage
            </h3>
            <div class="text-muted-foreground mt-2 space-y-2 text-sm">
              <p>Recent entries: {story.entries.length}</p>
              <p>Chapters: {story.chapters.length}</p>
              <p>Lorebook entries: {story.lorebookEntries.length}</p>
              <p>Characters: {story.characters.length}</p>
            </div>
          </div>
        </div>

        <div class="flex min-h-0 flex-col overflow-hidden rounded-lg border">
          <div class="border-b px-4 py-3">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h3 class="font-medium">Conversation</h3>
                <p class="text-muted-foreground text-xs">
                  Ask for critique, expansion, pacing updates, or direct rewrites to specific
                  entries.
                </p>
              </div>
              <div class="flex items-center gap-2">
                <label class="text-muted-foreground flex items-center gap-1.5 text-xs">
                  <input type="checkbox" bind:checked={autoScrollConversation} />
                  Auto-scroll
                </label>
                <Button
                  variant="outline"
                  size="sm"
                  onclick={handleNewConversation}
                  disabled={loading || applying}
                >
                  Reset
                </Button>
              </div>
            </div>

            <div class="relative mt-3">
              <button
                class="text-muted-foreground hover:text-foreground hover:bg-muted/60 flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-xs transition-colors"
                onclick={() => (conversationSelectorOpen = !conversationSelectorOpen)}
              >
                <History class="h-3.5 w-3.5" />
                <span class="font-medium">
                  {conversations.length > 0
                    ? `${conversations.length} conversation${conversations.length === 1 ? '' : 's'}`
                    : 'No saved conversations yet'}
                </span>
                {#if activeConversationId}
                  <span
                    class="bg-muted text-muted-foreground ml-1 rounded px-1.5 py-0.5 text-[10px]"
                  >
                    active
                  </span>
                {/if}
                {#if conversationSelectorOpen}
                  <ChevronUp class="ml-auto h-3.5 w-3.5" />
                {:else}
                  <ChevronDown class="ml-auto h-3.5 w-3.5" />
                {/if}
              </button>
              <p class="text-muted-foreground mt-1 text-[10px]">
                Conversation history: switch, rename, or delete previous editor sessions.
              </p>

              {#if conversationSelectorOpen}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <div
                  class="fixed inset-0 z-10"
                  onclick={() => (conversationSelectorOpen = false)}
                ></div>

                <div
                  class="bg-background absolute right-0 left-0 z-20 mt-1 max-h-72 overflow-y-auto rounded-md border shadow-lg"
                >
                  <div class="space-y-1 p-1.5">
                    <button
                      class="hover:bg-muted/70 flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs"
                      onclick={handleNewConversation}
                    >
                      <RefreshCw class="h-3.5 w-3.5" />
                      <span class="font-medium">New Conversation</span>
                    </button>

                    {#if conversations.length > 0}
                      <div class="my-1 border-t"></div>
                      {#each conversations as conv (conv.id)}
                        <div
                          class="group hover:bg-muted/60 flex items-center gap-2 rounded px-2 py-2"
                        >
                          {#if renamingConversationId === conv.id}
                            <form
                              class="flex min-w-0 flex-1 items-center gap-1"
                              onsubmit={(event) => {
                                event.preventDefault()
                                commitRename()
                              }}
                            >
                              <input
                                class="bg-background h-7 min-w-0 flex-1 rounded border px-2 text-xs"
                                type="text"
                                bind:value={renameValue}
                                onkeydown={(event) => {
                                  if (event.key === 'Escape') cancelRename()
                                }}
                                onblur={commitRename}
                              />
                            </form>
                          {:else}
                            <button
                              class="flex min-w-0 flex-1 items-center gap-2 text-left"
                              onclick={() => handleSwitchConversation(conv.id)}
                            >
                              <div class="min-w-0 flex-1">
                                <div class="truncate text-xs font-medium">
                                  {conv.title || 'Untitled'}
                                  {#if conv.id === activeConversationId}
                                    <span class="text-muted-foreground ml-1">(active)</span>
                                  {/if}
                                </div>
                                <div class="text-muted-foreground text-[10px]">
                                  {new Date(conv.updatedAt).toLocaleString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: 'numeric',
                                    minute: '2-digit',
                                  })}
                                </div>
                              </div>
                            </button>
                            <button
                              class="text-muted-foreground hover:bg-muted h-6 w-6 rounded p-1"
                              onclick={(event) => {
                                event.stopPropagation()
                                startRename(conv)
                              }}
                              title="Rename"
                            >
                              <Pencil class="h-3.5 w-3.5" />
                            </button>
                            <button
                              class="text-muted-foreground hover:bg-muted h-6 w-6 rounded p-1 hover:text-red-500"
                              onclick={(event) => {
                                event.stopPropagation()
                                handleDeleteConversation(conv.id)
                              }}
                              title="Delete"
                            >
                              <Trash2 class="h-3.5 w-3.5" />
                            </button>
                          {/if}
                        </div>
                      {/each}
                    {/if}
                  </div>
                </div>
              {/if}
            </div>
          </div>

          <div
            class="bg-muted/10 min-h-0 flex-1 overflow-y-auto p-4"
            bind:this={conversationContainer}
          >
            <div class="space-y-3">
              {#each chatMessages as message (message.id)}
                <div class={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                  <div
                    class={message.role === 'user'
                      ? 'bg-primary text-primary-foreground max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap'
                      : 'bg-card max-w-[90%] rounded-lg border px-3 py-2 text-sm whitespace-pre-wrap'}
                  >
                    {message.content}
                  </div>
                </div>
              {/each}

              {#if loading}
                <div class="text-muted-foreground flex items-center gap-2 text-sm">
                  <Loader2 class="h-4 w-4 animate-spin" />
                  {streamStatus || 'Thinking...'}
                </div>
              {/if}
            </div>
          </div>

          <div class="border-t p-4">
            <div class="space-y-2">
              <div class="space-y-1">
                <label
                  class="text-muted-foreground text-xs font-medium tracking-wide uppercase"
                  for="editor-assistant-target-entry"
                >
                  Rewrite Target (Optional)
                </label>
                <select
                  id="editor-assistant-target-entry"
                  class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  bind:value={selectedTargetEntryId}
                  disabled={!story.currentStory || loading || applying}
                >
                  <option value="">No fixed target</option>
                  {#each editableBranchEntries as entry (entry.id)}
                    <option value={entry.id}>
                      #{entry.position} [{entry.type === 'user_action' ? 'USER' : 'ASSISTANT'}] {entry.content
                        .slice(0, 90)
                        .replace(/\s+/g, ' ')}
                    </option>
                  {/each}
                </select>
              </div>

              {#if selectedTargetEntry}
                <div class="bg-muted/25 rounded border p-2 text-xs">
                  <p class="font-medium">Selected target entry preview</p>
                  <p class="text-muted-foreground mt-1 whitespace-pre-wrap">
                    {selectedTargetEntry.content.length > 320
                      ? `${selectedTargetEntry.content.slice(0, 320)}...`
                      : selectedTargetEntry.content}
                  </p>
                </div>
              {/if}

              <Textarea
                bind:value={composer}
                rows={4}
                placeholder="Discuss pacing, ask for expansion, or request concrete rewrites to specific entries..."
                onkeydown={handleComposerKeydown}
                disabled={!story.currentStory || loading || applying}
              />
              <div class="flex items-center justify-between gap-2">
                <p class="text-muted-foreground text-xs">
                  Use Shift+Enter for newline, Enter to send.
                </p>
                <Button
                  onclick={sendPrompt}
                  disabled={!composer.trim() || loading || applying || !story.currentStory}
                >
                  <Send class="mr-2 h-4 w-4" />
                  Send
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </ResponsiveModal.Content>
</ResponsiveModal.Root>

<ResponsiveModal.Root open={reviewModalOpen} onOpenChange={(v) => !v && closeReviewModal()}>
  <ResponsiveModal.Content class="h-[94vh] max-h-[94vh] w-[96vw] max-w-none overflow-hidden p-0">
    <div class="bg-background flex h-full min-h-0 flex-col">
      <div class="border-b px-5 py-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 class="text-lg font-semibold">Review Proposed Edit</h3>
            {#if reviewEdit}
              <p class="text-muted-foreground text-sm">
                Entry #{getEntryPosition(reviewEdit.entryId)} ({reviewEdit.entryType})
                {#if reviewEditIndex >= 0}
                  <span class="ml-2 text-xs">{reviewEditIndex + 1} of {pendingEdits.length}</span>
                {/if}
              </p>
            {/if}
          </div>
          <div class="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onclick={() => navigateReview('previous')}
              disabled={!previousReviewEditId}
            >
              <ChevronLeft class="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onclick={() => navigateReview('next')}
              disabled={!nextReviewEditId}
            >
              Next
              <ChevronRight class="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onclick={closeReviewModal}>
              <X class="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {#if reviewEdit}
        <div class="px-5 pt-4">
          <div class="bg-muted/25 rounded-lg border px-4 py-3">
            <p class="text-muted-foreground mb-1 text-[11px] font-semibold tracking-wide uppercase">
              Assistant Notes
            </p>
            <p class="text-sm leading-relaxed whitespace-pre-wrap">{reviewEdit.reason}</p>
          </div>
        </div>

        <div class="grid min-h-0 flex-1 gap-4 overflow-hidden p-5 pt-4 lg:grid-cols-2">
          <div class="flex min-h-0 flex-col overflow-hidden rounded-lg border">
            <div class="border-b px-4 py-3">
              <h4 class="font-medium">Current Text</h4>
            </div>
            <div class="min-h-0 flex-1 overflow-hidden p-4">
              <Textarea
                bind:ref={reviewCurrentTextarea}
                value={reviewEdit.originalContent}
                rows={20}
                class="h-full min-h-0 resize-none overflow-y-auto text-sm leading-relaxed"
                readonly
              />
            </div>
          </div>

          <div class="flex min-h-0 flex-col overflow-hidden rounded-lg border">
            <div class="border-b px-4 py-3">
              <h4 class="font-medium">Revised Text (Editable)</h4>
            </div>
            <div class="min-h-0 flex-1 overflow-hidden p-4">
              <Textarea
                bind:ref={reviewTextarea}
                bind:value={reviewRevisedContent}
                rows={20}
                class="h-full min-h-0 resize-none overflow-y-auto text-sm leading-relaxed"
                disabled={loading || applying}
              />
            </div>
          </div>
        </div>

        <div class="shrink-0 border-t px-5 py-3">
          <div class="mb-3 flex flex-wrap items-center gap-4">
            <label class="text-sm">
              <input type="checkbox" bind:checked={reviewReprocessChapter} class="mr-1.5" />
              Reprocess chapter
            </label>
            <label class="text-sm">
              <input type="checkbox" bind:checked={reviewRerunLorebookPass} class="mr-1.5" />
              Rerun lorebook pass
            </label>
          </div>
          <div class="flex items-center justify-end gap-2">
            <Button variant="outline" onclick={closeReviewModal} disabled={loading || applying}>
              Cancel
            </Button>
            <Button
              variant="outline"
              onclick={() => discardEdit(reviewEdit.id, { advanceReview: true })}
              disabled={loading || applying}
            >
              <X class="mr-2 h-4 w-4" />
              Discard Edit
            </Button>
            <Button
              onclick={applyReviewedEdit}
              disabled={loading || applying || !reviewRevisedContent.trim()}
            >
              <Check class="mr-2 h-4 w-4" />
              Apply This Edit
            </Button>
          </div>
        </div>
      {/if}
    </div>
  </ResponsiveModal.Content>
</ResponsiveModal.Root>

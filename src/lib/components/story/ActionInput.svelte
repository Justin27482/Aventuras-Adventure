<script lang="ts">
  import { onDestroy, tick } from 'svelte'
  import { ui, type RetryLastMessageOptions } from '$lib/stores/ui.svelte'
  import { story } from '$lib/stores/story.svelte'
  import { campaign } from '$lib/stores/campaign.svelte'
  import { settings } from '$lib/stores/settings.svelte'
  import { aiService } from '$lib/services/ai'
  import { database } from '$lib/services/database'
  import { SimpleActivationTracker } from '$lib/services/ai/retrieval/EntryRetrievalService'
  import { type ImageGenerationContext } from '$lib/services/ai'
  import { hasRequiredCredentials, getProviderDisplayName } from '$lib/services/ai/image'
  import { TranslationService } from '$lib/services/ai/utils/TranslationService'
  import { countTokens } from '$lib/services/tokenizer'
  import {
    Send,
    Wand2,
    MessageSquare,
    Brain,
    Sparkles,
    RefreshCw,
    X,
    Square,
    ImageIcon,
    Loader2,
    Search,
    PenLine,
  } from 'lucide-svelte'
  import GrammarCheck from './GrammarCheck.svelte'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import * as ResponsiveModal from '$lib/components/ui/responsive-modal'
  import {
    emitUserInput,
    emitNarrativeResponse,
    emitTTSQueued,
    eventBus,
    type ResponseStreamingEvent,
    type ClassificationCompleteEvent,
  } from '$lib/services/events'
  import { isTouchDevice } from '$lib/utils/swipe'
  import { isAndroid } from '$lib/utils/platform'
  import {
    GenerationPipeline,
    retryService,
    BackgroundTaskCoordinator,
    WorldStateTranslationService,
    handleEvent,
    type PipelineDependencies,
    type PipelineConfig,
    type GenerationContext,
    type RetrievalResult,
    type BackgroundTaskDependencies,
    type BackgroundTaskInput,
    type PipelineUICallbacks,
    type PipelineEventState,
  } from '$lib/services/generation'
  import type { AventuraEvent } from '$lib/services/events'
  import { InlineImageTracker } from '$lib/services/ai/image'
  import { handleInlineControlTags } from '$lib/services/generation/inline-control-handler'

  function log(...args: any[]) {
    console.log('[ActionInput]', ...args)
  }

  const MAX_CONTINUATIONS_PER_TURN = 3

  async function executeInlineControlTags(
    initialContent: string,
    continuationCount = 0,
    collectedRollIds: string[] = [],
  ): Promise<{ narrative: string; rollIds: string[] }> {
    const validActorIds = [
      ...(campaign.sceneTurnState?.actorOrder ?? []),
      ...story.characters.map((c) => c.id),
      ...story.characters.map((c) => c.name),
    ]
    const result = handleInlineControlTags(initialContent, {
      sceneModes: [
        'free',
        'exploration',
        'travel',
        'camp',
        'settlement',
        'combat',
        'social',
        'downtime',
      ],
      actorIds: validActorIds,
    })

    for (const issue of result.issues) {
      console.warn('[ActionInput] Ignoring invalid inline control tag:', issue.message)
    }

    const executedRollEntries: import('$lib/types').RollLedgerEntry[] = []

    for (const intent of result.intents) {
      if (!campaign.current) continue
      if (intent.kind === 'roll') {
        const notation = intent.notation || '1d20'
        // Match actor by ID or name
        let targetActorId = campaign.sceneTurnState?.activeActorId ?? null
        if (intent.actorId) {
          const matchChar = story.characters.find(
            (c) =>
              c.id === intent.actorId || c.name.toLowerCase() === intent.actorId?.toLowerCase(),
          )
          if (matchChar) targetActorId = matchChar.id
        }
        const rollResult = await (
          await import('$lib/services/dice')
        ).roll({
          campaignId: campaign.current.id,
          sessionId: campaign.activeSession?.id ?? null,
          actorId: targetActorId,
          notation,
          dc: intent.dc ?? null,
          reason: intent.reason ?? 'Narrative roll request',
          visibility: 'player_safe',
        })
        executedRollEntries.push(rollResult.entry)
        if (!collectedRollIds.includes(rollResult.entry.id)) {
          collectedRollIds.push(rollResult.entry.id)
        }
        eventBus.emit({
          type: 'DiceRolled',
          campaignId: rollResult.entry.campaignId,
          sessionId: rollResult.entry.sessionId,
          actorId: rollResult.entry.actorId,
          notation: rollResult.entry.notation,
          total: rollResult.entry.total,
          dc: rollResult.entry.dc,
          outcome: rollResult.entry.outcome,
          entry: rollResult.entry,
        })
      } else if (intent.kind === 'scene' && intent.mode) {
        const previousScene = campaign.sceneTurnState?.sceneMode ?? 'free'
        await campaign.setSceneMode(intent.mode as Parameters<typeof campaign.setSceneMode>[0])
        eventBus.emit({
          type: 'SceneChanged',
          campaignId: campaign.current.id,
          fromScene: previousScene,
          toScene: intent.mode,
        })
      } else if (intent.kind === 'actor' && intent.actorId) {
        const matchChar = story.characters.find(
          (c) => c.id === intent.actorId || c.name.toLowerCase() === intent.actorId?.toLowerCase(),
        )
        const targetId = matchChar?.id ?? intent.actorId
        await campaign.setActiveActor(targetId)
        eventBus.emit({ type: 'ActorChanged', campaignId: campaign.current.id, actorId: targetId })
      } else if (intent.kind === 'turn' && intent.action === 'advance') {
        await campaign.advanceTurn()
      }
    }

    let currentNarrative = result.narrative

    // Continuation pass if rolls were executed and continuation limit not reached
    if (
      executedRollEntries.length > 0 &&
      continuationCount < MAX_CONTINUATIONS_PER_TURN &&
      !stopRequested &&
      !activeAbortController?.signal.aborted
    ) {
      log('Continuing generation following roll execution', {
        continuationCount: continuationCount + 1,
        rollCount: executedRollEntries.length,
      })

      const rollSummary = executedRollEntries
        .map((entry) => {
          const actor =
            story.characters.find((c) => c.id === entry.actorId)?.name ?? entry.actorId ?? 'Actor'
          const dcText = entry.dc !== null ? ` vs DC ${entry.dc}` : ''
          const outcomeText = entry.outcome ? ` (${entry.outcome.replace('_', ' ')})` : ''
          const reasonText = entry.reason ? `: ${entry.reason}` : ''
          return `${actor} rolled ${entry.notation}${reasonText} = ${entry.total}${dcText}${outcomeText}`
        })
        .join('; ')

      const continuationPrompt = `[DICE ROLL RESULT: ${rollSummary}]\n\nNarrate the outcome of the roll and continue the story naturally. Do not repeat previous narration.`

      try {
        const continuationText = await (
          await import('$lib/services/ai/sdk')
        ).generatePlainText(
          {
            presetId: 'suggestions',
            system:
              'You are the narrator of an interactive adventure. Continue the narrative naturally based on the roll outcome. Keep safety and content rules intact.',
            prompt: continuationPrompt,
            signal: activeAbortController?.signal,
          },
          'narrativeContinuation',
        )

        if (continuationText && continuationText.trim()) {
          const subResult = await executeInlineControlTags(
            continuationText,
            continuationCount + 1,
            collectedRollIds,
          )
          currentNarrative += '\n\n' + subResult.narrative
        }
      } catch (err) {
        log('Continuation generation failed (non-fatal)', err)
      }
    }

    return {
      narrative: currentNarrative,
      rollIds: collectedRollIds,
    }
  }

  // ============================================================================
  // Translation Helper
  // ============================================================================

  async function translateUserInput(
    content: string,
    translationSettings: typeof settings.translationSettings,
  ): Promise<{ promptContent: string; originalInput: string | undefined }> {
    if (!TranslationService.shouldTranslateInput(translationSettings)) {
      return { promptContent: content, originalInput: undefined }
    }

    try {
      log('Translating user input', {
        sourceLanguage: translationSettings.sourceLanguage,
      })
      const result = await aiService.translateInput(content, translationSettings.sourceLanguage)
      log('Input translated', {
        originalLength: content.length,
        translatedLength: result.translatedContent.length,
      })
      return { promptContent: result.translatedContent, originalInput: content }
    } catch (error) {
      log('Input translation failed (non-fatal), using original', error)
      return { promptContent: content, originalInput: undefined }
    }
  }

  // ============================================================================
  // UI State
  // ============================================================================

  let inputValue = $state('')
  let pendingPlayerRoll = $state<{
    notation: string
    dc: number | null
    reason: string | null
  } | null>(null)
  let actionType = $state<'do' | 'say' | 'think' | 'story' | 'free'>('do')
  let isRawActionChoice = $state(false)
  let stopRequested = false
  let activeAbortController: AbortController | null = null
  let textareaRef: HTMLTextAreaElement | null = $state(null)
  let actingAsId = $state<string | null>(null)
  let lastImageGenContext = $state<ImageGenerationContext | null>(null)
  let isManualImageGenRunning = $state(false)
  let showFindReplaceModal = $state(false)
  let findText = $state('')
  let replaceText = $state('"')
  let replacingAll = $state(false)

  const unsubscribeRollRequested = eventBus.subscribe('RollRequested', ((
    event: Extract<AventuraEvent, { type: 'RollRequested' }>,
  ) => {
    if (event.campaignId !== campaign.current?.id) return
    pendingPlayerRoll = {
      notation: event.notation,
      dc: event.dc,
      reason: event.reason,
    }
  }) as never)

  const unsubscribeDiceRolled = eventBus.subscribe('DiceRolled', ((
    event: Extract<AventuraEvent, { type: 'DiceRolled' }>,
  ) => {
    if (event.campaignId !== campaign.current?.id || !pendingPlayerRoll) return
    pendingPlayerRoll = null
  }) as never)

  onDestroy(() => {
    unsubscribeRollRequested()
    unsubscribeDiceRolled()
  })

  // ============================================================================
  // Derived State
  // ============================================================================

  const canShowManualImageGen = $derived(
    story.currentStory?.settings?.imageGenerationMode === 'none' && !!lastImageGenContext,
  )

  const manualImageGenDisabled = $derived.by(() => {
    if (ui.isGenerating || isManualImageGenRunning) return true
    return !hasRequiredCredentials()
  })

  const sendKeyHint = $derived(
    isTouchDevice() ? 'Shift+Enter to send' : 'Enter to send, Shift+Enter for new line',
  )

  async function handleReplaceAllInStory() {
    if (!findText.trim()) {
      ui.showToast('Enter text to find first', 'warning')
      return
    }

    if (!story.currentStory) {
      ui.showToast('No story is currently loaded', 'warning')
      return
    }

    replacingAll = true
    try {
      const result = await story.replaceInAllEntries(findText, replaceText)
      if (result.updatedEntries === 0) {
        ui.showToast('No matching text found in editable entries', 'warning')
        return
      }

      const inheritedNote =
        result.skippedInherited > 0 ? ` (${result.skippedInherited} inherited skipped)` : ''
      ui.showToast(
        `Updated ${result.updatedEntries} entries with ${result.replacements} replacements${inheritedNote}`,
        'info',
      )
      showFindReplaceModal = false
    } catch (error) {
      ui.showToast(error instanceof Error ? error.message : 'Failed to replace text', 'error')
    } finally {
      replacingAll = false
    }
  }

  // Block generation when any service is missing a model or has an invalid profile
  const blockGeneration = $derived(settings.hasGenerationConfigIssues)
  const blockFreeTextForRoll = $derived(pendingPlayerRoll !== null)

  const turnActors = $derived.by(() => {
    const actorIds = campaign.sceneTurnState?.actorOrder ?? []
    return actorIds
      .map((actorId) => {
        const member = campaign.partyMembers.find((candidate) => candidate.characterId === actorId)
        const name =
          story.characters.find((character) => character.id === actorId)?.name ??
          member?.characterId ??
          actorId
        return { id: actorId, name }
      })
      .filter(
        (actor, index, list) => list.findIndex((candidate) => candidate.id === actor.id) === index,
      )
  })

  $effect(() => {
    const selected = campaign.sceneTurnState?.activeActorId ?? null
    if (selected !== actingAsId) {
      actingAsId = selected
    }
  })

  async function handleActingAsChange(actorId: string) {
    if (!actorId) return
    actingAsId = actorId
    await campaign.setActiveActor(actorId)
    await regenerateActionChoicesForCurrentActor()
  }

  async function handleEndTurn() {
    try {
      await campaign.advanceTurn()
      await regenerateActionChoicesForCurrentActor()
    } catch (error) {
      console.error('[ActionInput] Failed to advance the turn:', error)
      ui.showToast('Unable to advance the current turn.', 'error')
    }
  }

  // ============================================================================
  // Action Type Configuration
  // ============================================================================

  type ActionType = 'do' | 'say' | 'think' | 'story' | 'free'

  const actionIcons = {
    do: Wand2,
    say: MessageSquare,
    think: Brain,
    story: Sparkles,
    free: PenLine,
  }
  const actionLabels: Record<ActionType, string> = {
    do: 'Do',
    say: 'Say',
    think: 'Think',
    story: 'Story',
    free: 'Free',
  }
  const actionBorderColors: Record<ActionType, string> = {
    do: 'border-l-emerald-500',
    say: 'border-l-blue-500',
    think: 'border-l-purple-500',
    story: 'border-l-amber-500',
    free: 'border-l-surface-600',
  }
  const actionActiveStyles: Record<ActionType, string> = {
    do: 'bg-emerald-500/15 text-emerald-400',
    say: 'bg-blue-500/15 text-blue-400',
    think: 'bg-purple-500/15 text-purple-400',
    story: 'bg-amber-500/15 text-amber-400',
    free: 'bg-surface-600/30 text-surface-300',
  }
  const actionButtonStyles: Record<ActionType, string> = {
    do: 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10',
    say: 'text-blue-400 hover:text-blue-300 hover:bg-blue-500/10',
    think: 'text-purple-400 hover:text-purple-300 hover:bg-purple-500/10',
    story: 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10',
    free: 'text-surface-400 hover:text-surface-200 hover:bg-surface-500/10',
  }
  const actionTypes: ActionType[] = ['do', 'say', 'think', 'story', 'free']

  // POV-based prefixes/suffixes
  const protagonistName = $derived.by(
    () => story.characters.find((c) => c.relationship === 'self')?.name ?? 'The protagonist',
  )
  const actingCharacterName = $derived.by(() => {
    return getActingCharacter()?.name ?? protagonistName
  })

  function getActingCharacter() {
    const actorId = actingAsId ?? campaign.sceneTurnState?.activeActorId ?? null
    return actorId ? story.characters.find((character) => character.id === actorId) : undefined
  }

  function withActingCharacterDirective(content: string): string {
    const actorName = actingCharacterName.trim()
    if (!actorName) return content
    return `[Acting character: ${actorName}. Resolve this as ${actorName}'s action.]\n${content}`
  }

  const pov = $derived(story.pov)

  const actionPrefixes = $derived.by(() => {
    switch (pov) {
      case 'third':
        return {
          do: `${actingCharacterName} `,
          say: `${actingCharacterName} says, "`,
          think: `${actingCharacterName} thinks, "`,
          story: '',
          free: '',
        }
      default:
        return {
          do: 'I ',
          say: 'I say, "',
          think: 'I think to myself, "',
          story: '',
          free: '',
        }
    }
  })
  const actionSuffixes = { do: '', say: '"', think: '"', story: '', free: '' }

  // ============================================================================
  // Effects
  // ============================================================================

  $effect(() => {
    const storyId = story.currentStory?.id ?? null
    if (!storyId || (lastImageGenContext && lastImageGenContext.storyId !== storyId))
      lastImageGenContext = null
  })

  $effect(() => {
    ui.setRetryCallback(handleRetry)
    return () => ui.setRetryCallback(null)
  })

  $effect(() => {
    ui.setRetryLastMessageCallback(handleRetryLastMessage)
    return () => ui.setRetryLastMessageCallback(null)
  })

  $effect(() => {
    const pendingAction = ui.pendingActionChoice
    if (pendingAction && !ui.isGenerating) {
      inputValue = pendingAction
      isRawActionChoice = true
      ui.clearPendingActionChoice()
    }
  })

  // Auto-regenerate suggestions/actions after time-travel delete when no saved actions found
  $effect(() => {
    if (ui.suggestionsRegenerationNeeded && !ui.isGenerating && story.entries.length > 0) {
      ui.suggestionsRegenerationNeeded = false
      regenerateActionsAfterDelete()
    }
  })

  // ============================================================================
  // Builder Functions
  // ============================================================================

  function buildPipelineDependencies(): PipelineDependencies {
    return {
      shouldUseAgenticRetrieval: (chaptersLength: number) =>
        aiService.shouldUseAgenticRetrieval(
          { length: chaptersLength } as any,
          settings.systemServicesSettings.timelineFill,
        ),
      runAgenticRetrieval: aiService.runAgenticRetrieval.bind(aiService),
      formatAgenticRetrievalForPrompt: aiService.formatAgenticRetrievalForPrompt.bind(aiService),
      runTimelineFill: (visibleEntries, chapters) =>
        aiService.runTimelineFill(visibleEntries, chapters, story.getChapterEntries.bind(story)),
      answerChapterQuestion: (chapterNumber, question, chapters) =>
        aiService.answerChapterQuestion(
          chapterNumber,
          question,
          chapters,
          story.getChapterEntries.bind(story),
        ),
      answerChapterRangeQuestion: (startChapter, endChapter, question, chapters) =>
        aiService.answerChapterRangeQuestion(
          startChapter,
          endChapter,
          question,
          chapters,
          story.getChapterEntries.bind(story),
        ),
      getRelevantLorebookEntries: aiService.getRelevantLorebookEntries.bind(aiService),
      streamNarrative: aiService.streamNarrative.bind(aiService),
      classifyResponse: aiService.classifyResponse.bind(aiService),
      translateNarration: aiService.translateNarration.bind(aiService),
      generateImagesForNarrative: (ctx) =>
        aiService.generateImagesForNarrative({
          ...ctx,
          imageGenerationMode: story.currentStory?.settings?.imageGenerationMode,
          allCharacters: story.characters,
          allItems: story.items,
          imageSettings: settings.systemServicesSettings.imageGeneration,
          getImageProfile: (id) => settings.getImageProfile(id),
        }),
      isImageGenerationEnabled: (storySettings, type) =>
        aiService.isImageGenerationEnabled(storySettings, type),
      generateActionChoices: aiService.generateActionChoices.bind(aiService),
      translateActionChoices: aiService.translateActionChoices.bind(aiService),
      analyzeBackgroundChangeAndGenerateImage: (storyId, visibleEntries) =>
        aiService.analyzeBackgroundChangeAndGenerateImage(
          storyId,
          visibleEntries,
          story.updateCurrentBackgroundImage.bind(story),
        ),
    }
  }

  function buildBackgroundTaskDependencies(): BackgroundTaskDependencies {
    return {
      chapterService: {
        analyzeForChapter: aiService.analyzeForChapter.bind(aiService),
        summarizeChapter: aiService.summarizeChapter.bind(aiService),
        getNextChapterNumber: story.getNextChapterNumber.bind(story),
        addChapter: story.addChapter.bind(story),
      },
      loreManagement: {
        runLoreManagement: aiService.runLoreManagement.bind(aiService),
      },
      styleReview: { analyzeStyle: aiService.analyzeStyle.bind(aiService) },
    }
  }

  function buildBackgroundTaskInput(
    countStyleReview: boolean,
    styleReviewSource: string,
  ): BackgroundTaskInput {
    const storyId = story.currentStory?.id ?? ''
    const mode = story.currentStory?.mode ?? 'adventure'

    return {
      styleReview: {
        storyId,
        entries: story.entries,
        mode,
        pov: story.pov,
        tense: story.tense,
        enabled: settings.systemServicesSettings.styleReviewer.enabled,
        triggerInterval: settings.systemServicesSettings.styleReviewer.triggerInterval,
        currentCounter: ui.messagesSinceLastStyleReview,
        shouldIncrement: countStyleReview,
        source: styleReviewSource,
      },
      styleReviewCallbacks: {
        incrementCounter: ui.incrementStyleReviewCounter.bind(ui),
        setLoading: ui.setStyleReviewLoading.bind(ui),
        setResult: ui.setStyleReview.bind(ui),
      },
      chapterCheck: {
        storyId,
        currentBranchId: story.currentStory?.currentBranchId ?? null,
        entries: story.entries,
        lastChapterEndIndex: story.lastChapterEndIndex,
        tokensSinceLastChapter: story.tokensSinceLastChapter,
        tokensOutsideBuffer: story.tokensOutsideBuffer,
        messagesSinceLastChapter: story.messagesSinceLastChapter,
        memoryConfig: story.memoryConfig,
        currentBranchChapters: story.currentBranchChapters,
        mode,
        pov: story.pov,
        tense: story.tense,
      },
      loreSession: {
        storyId,
        currentBranchId: story.currentStory?.currentBranchId ?? null,
        lorebookEntries: story.lorebookEntries,
        chapters: story.currentBranchChapters,
        mode,
        pov: story.pov,
        tense: story.tense,
      },
      loreCallbacks: {
        onCreateEntry: async (entry) => {
          await story.addLorebookEntry(entry)
        },
        onUpdateEntry: story.updateLorebookEntry.bind(story),
        onDeleteEntry: story.deleteLorebookEntry.bind(story),
        onMergeEntries: async (entryIds, mergedEntry) => {
          await story.deleteLorebookEntries(entryIds)
          await story.addLorebookEntry(mergedEntry)
        },
        onQueryChapter: async (chapterNumber, question) => {
          return aiService.answerChapterQuestion(
            chapterNumber,
            question,
            story.currentBranchChapters,
            story.getChapterEntries.bind(story),
          )
        },
      },
      loreUICallbacks: {
        onStart: ui.startLoreManagement.bind(ui),
        onProgress: ui.updateLoreManagementProgress.bind(ui),
        onComplete: ui.finishLoreManagement.bind(ui),
      },
    }
  }

  // ============================================================================
  // Core Generation
  // ============================================================================

  /**
   * Send an OS notification when generation completes/fails while the app is backgrounded.
   * Only called on Android when the generationNotifications experimental feature is enabled.
   * Both body and largeBody are set so Android BigTextStyle keeps preview text
   * visible in collapsed, expanded, and grouped notification states.
   */
  async function sendGenerationNotification(responseText: string, success: boolean) {
    try {
      const { sendNotification, isPermissionGranted } =
        await import('@tauri-apps/plugin-notification')
      const permitted = await isPermissionGranted()
      if (!permitted) return

      if (success) {
        const previewText =
          settings.experimentalFeatures.notificationPreview && responseText.length > 0
            ? responseText.slice(0, 120).replace(/[<>]/g, '') +
              (responseText.length > 120 ? '…' : '')
            : 'Tap to return to your story.'
        sendNotification({
          title: 'Story generation complete',
          body: previewText,
          largeBody: previewText,
        })
      } else {
        sendNotification({
          title: 'Story generation failed',
          body: 'Tap to return and retry.',
          largeBody: 'Tap to return and retry.',
        })
      }
    } catch (e) {
      console.warn('[ActionInput] Failed to send notification:', e)
    }
  }

  /** Send a failure notification if the user was backgrounded during this generation. */
  async function notifyFailureIfBackgrounded() {
    if (
      ui.wasBackgroundedDuringGeneration &&
      settings.experimentalFeatures.generationNotifications
    ) {
      await sendGenerationNotification('', false)
    }
  }

  async function generateResponse(
    userActionEntryId: string,
    userActionContent: string,
    options?: {
      countStyleReview?: boolean
      styleReviewSource?: string
      cachedRetrievalResult?: RetrievalResult | null
      guidedRegenerationNudge?: string
      guidedRegenerationPreviousNarration?: string
    },
  ) {
    const countStyleReview = options?.countStyleReview ?? true
    const styleReviewSource =
      options?.styleReviewSource ?? (countStyleReview ? 'new' : 'regenerate')

    if (!story.currentStory) return

    stopRequested = false
    activeAbortController = new AbortController()

    const visualProseMode = story.currentStory.settings?.visualProseMode ?? false
    const inlineImageMode = story.currentStory.settings?.imageGenerationMode === 'inline'
    const streamingEntryId = crypto.randomUUID()
    const narrationEntryId = crypto.randomUUID()

    ui.setGenerating(true)
    ui.clearGenerationError()
    ui.clearActionChoices(story.currentStory.id)
    ui.startStreaming(visualProseMode, streamingEntryId)

    const currentStoryRef = story.currentStory

    let inlineImageTracker: InlineImageTracker | null = null
    if (inlineImageMode) {
      inlineImageTracker = new InlineImageTracker(
        currentStoryRef.id,
        narrationEntryId,
        () => story.characters,
      )
    }

    // Android: start foreground service to keep process alive when backgrounded
    const useBackgroundService = isAndroid() && settings.experimentalFeatures.backgroundGeneration
    if (useBackgroundService) {
      try {
        window.AndroidBridge?.startGenerationService()
      } catch (e) {
        console.warn('[ActionInput] Failed to start generation foreground service:', e)
      }
    }
    ui.resetBackgroundedFlag()

    try {
      const transitionGuidance = ui.consumeNarrativeTransitionGuidance(currentStoryRef.id)
      const combinedGuidance = [
        transitionGuidance,
        options?.guidedRegenerationNudge?.trim() || null,
      ]
        .filter(Boolean)
        .join('\n\n')

      const worldState = {
        characters: story.characters,
        locations: story.locations,
        items: story.items,
        storyBeats: story.storyBeats,
        clothingSystemEnabled: currentStoryRef.settings?.clothingSystemEnabled ?? false,
        moneySystemEnabled: currentStoryRef.settings?.moneySystemEnabled ?? false,
        moneyName: (currentStoryRef.settings?.moneyName ?? 'gold').trim() || 'gold',
        currentMoney: Math.max(0, Math.floor(currentStoryRef.settings?.moneyAmount ?? 0)),
        currentLocation: story.currentLocation,
        chapters: story.currentBranchChapters,
        memoryConfig: story.memoryConfig,
        lorebookEntries: story.lorebookEntries,
        actingProtagonistName: actingCharacterName,
        actingProtagonistDescription: getActingCharacter()?.description ?? null,
        guidedRegenerationNudge: combinedGuidance || undefined,
        guidedRegenerationPreviousNarration:
          options?.guidedRegenerationPreviousNarration?.trim() || undefined,
      }

      const storyPosition = story.entries.length
      const activationTracker = ui.getActivationTracker(storyPosition) as SimpleActivationTracker
      const embeddedImages = await database.getEmbeddedImagesForStory(currentStoryRef.id)
      const protagonist = story.characters.find((c) => c.relationship === 'self')
      const activeActorName = getActingCharacter()?.name ?? protagonist?.name ?? 'the protagonist'

      const ctx: GenerationContext = {
        story: currentStoryRef,
        visibleEntries: story.visibleEntries,
        allEntries: story.entries,
        worldState,
        userAction: {
          entryId: userActionEntryId,
          content: userActionContent,
          rawInput: userActionContent,
        },
        narrationEntryId,
        abortSignal: activeAbortController.signal,
      }

      const cfg: PipelineConfig = {
        embeddedImages,
        rawInput: userActionContent,
        actionType,
        wasRawActionChoice: false,
        timelineFillEnabled: settings.systemServicesSettings.timelineFill?.enabled ?? true,
        storyMode: currentStoryRef.mode ?? 'adventure',
        pov: story.pov,
        tense: story.tense,
        styleReview: ui.lastStyleReview,
        activationTracker,
        translationSettings: settings.translationSettings,
        imageSettings: {
          imageGenerationMode: currentStoryRef.settings?.imageGenerationMode ?? 'agentic',
          backgroundImagesEnabled: currentStoryRef.settings?.backgroundImagesEnabled ?? false,
          referenceMode: currentStoryRef.settings?.referenceMode ?? false,
        },
        promptContext: {
          mode: story.storyMode,
          pov: story.pov,
          tense: story.tense,
          protagonistName: activeActorName,
          activeActorName,
          genre: currentStoryRef.genre ?? undefined,
          settingDescription: currentStoryRef.description ?? undefined,
          tone: currentStoryRef.settings?.tone ?? undefined,
          themes: currentStoryRef.settings?.themes ?? undefined,
        },
        disableSuggestions: settings.uiSettings.disableSuggestions,
        activeThreads: story.pendingQuests,
        cachedRetrievalResult: options?.cachedRetrievalResult ?? null,
      }

      const deps = buildPipelineDependencies()
      const pipeline = new GenerationPipeline(deps)

      let fullResponse = ''
      let fullReasoning = ''
      let narrationEntry: Awaited<ReturnType<typeof story.addEntry>> | null = null

      const eventState: PipelineEventState = {
        fullResponse: () => fullResponse,
        fullReasoning: () => fullReasoning,
        streamingEntryId,
        visualProseMode,
        storyId: currentStoryRef.id,
        activeParallelPhases: new Set(),
      }

      const persistSuggestedActions = (actions: unknown[]) => {
        if (narrationEntry && actions.length > 0) {
          database
            .updateStoryEntry(narrationEntry.id, {
              suggestedActions: JSON.stringify(actions),
            })
            .catch((err) =>
              console.warn('[ActionInput] Failed to save suggested choices to entry:', err),
            )
        }
      }

      const eventCallbacks: PipelineUICallbacks = {
        startStreaming: ui.startStreaming.bind(ui),
        appendStreamContent: ui.appendStreamContent.bind(ui),
        appendReasoningContent: ui.appendReasoningContent.bind(ui),
        setGenerationStatus: ui.setGenerationStatus.bind(ui),
        setActionChoicesLoading: ui.setActionChoicesLoading.bind(ui),
        setActionChoices: (choices, storyId) => {
          ui.setActionChoices(choices, storyId)
          persistSuggestedActions(choices)
        },
        emitResponseStreaming: (chunk, accumulated) => {
          eventBus.emit<ResponseStreamingEvent>({
            type: 'ResponseStreaming',
            chunk,
            accumulated,
          })
        },
      }

      let classificationWarningShown = false

      for await (const event of pipeline.execute(ctx, cfg)) {
        if (stopRequested) break

        handleEvent(event, eventState, eventCallbacks)

        if (event.type === 'phase_complete' && event.phase === 'retrieval') {
          const retrievalResult = event.result as RetrievalResult | undefined
          ui.setLastLorebookRetrieval(retrievalResult?.lorebookRetrievalResult ?? null)
          ui.setLastRetrievalResult(retrievalResult ?? null)
        }

        if (event.type === 'narrative_chunk') {
          fullResponse += event.content
          if (event.reasoning) fullReasoning += event.reasoning
          if (inlineImageTracker)
            inlineImageTracker.processChunk(
              fullResponse,
              currentStoryRef.settings?.referenceMode ?? false,
            )
        }

        if (event.type === 'phase_complete' && event.phase === 'narrative' && fullResponse.trim()) {
          const controlResult = await executeInlineControlTags(fullResponse)
          fullResponse = controlResult.narrative
          const entryMetadata: import('$lib/types').EntryMetadata = {
            tokenCount: countTokens(fullResponse),
            ...(controlResult.rollIds.length > 0 ? { rollIds: controlResult.rollIds } : {}),
          }
          narrationEntry = await story.addEntry(
            'narration',
            fullResponse,
            entryMetadata,
            fullReasoning || undefined,
            narrationEntryId,
          )
          ui.endStreaming()
          emitNarrativeResponse(narrationEntry.id, fullResponse)
          if (inlineImageTracker?.hasPendingImages) await inlineImageTracker.flushToDatabase()
        }

        if (event.type === 'classification_complete' && narrationEntry) {
          if (event.result._classifierFallbackUsed && !classificationWarningShown) {
            classificationWarningShown = true
            const details = event.result._classifierError ? ` ${event.result._classifierError}` : ''
            console.warn('[ActionInput] Classifier fell back to heuristic parsing.', details)
            ui.showToast(
              'Classifier extraction failed for this turn; heuristic fallback was used.',
              'warning',
            )
          }

          if (event.result._moneyExtractionMissed && !classificationWarningShown) {
            classificationWarningShown = true
            console.warn(
              '[ActionInput] Classifier missed moneyUpdate despite money cues:',
              event.result._moneyExtractionMissReason,
            )
            ui.showToast(
              'Classifier missed money extraction for this turn. Check classifier model/profile settings.',
              'warning',
            )
          }

          eventBus.emit<ClassificationCompleteEvent>({
            type: 'ClassificationComplete',
            messageId: narrationEntry.id,
            result: event.result,
          })
          await story.applyClassificationResult(event.result, narrationEntry.id)
          await story.updateEntryTimeEnd(narrationEntry.id)

          if (currentStoryRef.settings?.imageGenerationMode !== 'none') {
            const presentCharacters = story.characters.filter(
              (c) =>
                event.result.scene.presentCharacterNames.includes(c.name) ||
                c.relationship === 'self',
            )
            const imageGenChatHistory = story.visibleEntries
              .filter((e) => e.type === 'user_action' || e.type === 'narration')
              .map((e) => `${e.type === 'user_action' ? 'USER' : 'ASSISTANT'}:\n${e.content}`)
              .join('\n\n')

            lastImageGenContext = {
              storyId: currentStoryRef.id,
              entryId: narrationEntry.id,
              narrativeResponse: fullResponse,
              userAction: userActionContent,
              presentCharacters,
              currentLocation:
                event.result.scene.currentLocationName ?? worldState.currentLocation?.name,
              chatHistory: imageGenChatHistory,
              lorebookContext: undefined,
              referenceMode: currentStoryRef.settings?.referenceMode ?? false,
            }
          }

          const translationSettings = settings.translationSettings
          if (TranslationService.shouldTranslateWorldState(translationSettings)) {
            const translationService = new WorldStateTranslationService({
              translateUIElements: aiService.translateUIElements.bind(aiService),
            })
            translationService
              .translateEntities(
                {
                  classificationResult: {
                    newCharacters: event.result.entryUpdates.newCharacters,
                    newLocations: event.result.entryUpdates.newLocations,
                    newItems: event.result.entryUpdates.newItems,
                    newStoryBeats: event.result.entryUpdates.newStoryBeats,
                  },
                  worldState: {
                    characters: story.characters,
                    locations: story.locations,
                    items: story.items,
                    storyBeats: story.storyBeats,
                  },
                  targetLanguage: translationSettings.targetLanguage,
                },
                {
                  updateCharacter: (id, data) => database.updateCharacter(id, data as any),
                  updateLocation: (id, data) => database.updateLocation(id, data as any),
                  updateItem: (id, data) => database.updateItem(id, data as any),
                  updateStoryBeat: (id, data) => database.updateStoryBeat(id, data as any),
                  refreshWorldState: story.refreshWorldState.bind(story),
                },
              )
              .catch((err) => log('World state translation failed (non-fatal)', err))
          }
        }

        if (event.type === 'phase_complete' && event.phase === 'translation' && narrationEntry) {
          const translationResult = event.result as
            | {
                translated: boolean
                translatedContent: string | null
                targetLanguage: string | null
              }
            | undefined
          if (translationResult?.translated && translationResult.translatedContent) {
            await database.updateStoryEntry(narrationEntry.id, {
              translatedContent: translationResult.translatedContent,
              translationLanguage: translationResult.targetLanguage,
            })
            await story.refreshEntry(narrationEntry.id)
          }
        }

        if (event.type === 'error' && event.fatal) {
          console.error('[ActionInput] Fatal pipeline error:', event.error)
          break
        }

        if (
          event.type === 'error' &&
          !event.fatal &&
          event.phase === 'classification' &&
          !classificationWarningShown
        ) {
          classificationWarningShown = true
          console.warn('[ActionInput] Classification failed (non-fatal):', event.error)
          ui.showToast('Classifier failed for this turn; fallback parsing was used.', 'warning')
        }
      }

      ui.updateActivationData(activationTracker, currentStoryRef.id)
      if (stopRequested) return

      if (!fullResponse.trim()) {
        const errorMessage = 'The AI returned an empty response after 3 attempts. Please try again.'
        const errorEntry = await story.addEntry('system', errorMessage)
        ui.setGenerationError({
          message: errorMessage,
          errorEntryId: errorEntry.id,
          userActionEntryId,
          timestamp: Date.now(),
        })

        await notifyFailureIfBackgrounded()
        return
      }

      if (
        narrationEntry &&
        settings.systemServicesSettings.tts.enabled &&
        settings.systemServicesSettings.tts.autoPlay
      ) {
        emitTTSQueued(narrationEntry.id, fullResponse)
      }

      const coordinator = new BackgroundTaskCoordinator(buildBackgroundTaskDependencies())
      const input = buildBackgroundTaskInput(countStyleReview, styleReviewSource)
      if (!story.memoryConfig.autoSummarize) input.chapterCheck.tokensOutsideBuffer = 0
      coordinator
        .runBackgroundTasks(input)
        .catch((err) => log('Background tasks failed (non-fatal)', err))

      // Android: notify user that generation completed while app is still backgrounded.
      // Awaited so the foreground service isn't torn down before the notification fires.
      if (
        ui.wasBackgroundedDuringGeneration &&
        ui.isAppBackgrounded &&
        settings.experimentalFeatures.generationNotifications
      ) {
        await sendGenerationNotification(fullResponse, true)
      }
    } catch (error) {
      // Only suppress handling when the user explicitly requested a stop.
      // An AbortError that arrives with stopRequested=false means the request
      // was cancelled externally (e.g. connection loss), so we still want to
      // record the error entry and send a failure notification.
      if (stopRequested) return
      console.error('[ActionInput] Generation error:', error)
      const baseMessage =
        error instanceof Error ? error.message : 'Failed to generate response. Please try again.'
      const errorMessage = ui.wasBackgroundedDuringGeneration
        ? `Generation may have been interrupted while the app was in the background. ${baseMessage}`
        : baseMessage
      const errorEntry = await story.addEntry('system', `Generation failed: ${errorMessage}`)
      ui.setGenerationError({
        message: errorMessage,
        errorEntryId: errorEntry.id,
        userActionEntryId,
        timestamp: Date.now(),
      })

      await notifyFailureIfBackgrounded()
    } finally {
      ui.endStreaming()
      ui.setGenerating(false)
      ui.setGenerationStatus('')
      activeAbortController = null

      // Android: always stop the foreground service when generation ends
      if (useBackgroundService) {
        try {
          window.AndroidBridge?.stopGenerationService()
        } catch (e) {
          console.warn('[ActionInput] Failed to stop generation foreground service:', e)
        }
      }
    }
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  /**
   * Regenerate suggestions or action choices after a time-travel delete
   * when no previously saved actions were found on the restored entry.
   */
  async function regenerateActionsAfterDelete() {
    await regenerateActionChoicesForCurrentActor({ persistToLastNarration: true })
  }

  async function regenerateActionChoicesForCurrentActor(
    options: { persistToLastNarration?: boolean } = {},
  ) {
    if (!story.currentStory || story.entries.length === 0) return

    // For adventure mode, generate new action choices.
    if (settings.uiSettings.disableSuggestions) return

    ui.setActionChoicesLoading(true)
    try {
      const lastNarration = [...story.entries].reverse().find((e) => e.type === 'narration')
      if (!lastNarration) {
        ui.setActionChoicesLoading(false)
        return
      }

      const protagonist = story.characters.find((c) => c.relationship === 'self')
      const actingCharacter = getActingCharacter() ?? protagonist
      const actingName = actingCharacter?.name ?? protagonist?.name ?? 'the protagonist'
      const promptContext: import('$lib/services/generation/phases/PostGenerationPhase').PromptContext =
        {
          mode: 'adventure',
          pov: story.pov,
          tense: story.tense,
          protagonistName: actingName,
          activeActorName: actingName,
          genre: story.currentStory.genre ?? undefined,
          settingDescription: story.currentStory.description ?? undefined,
          tone: story.currentStory.settings?.tone ?? undefined,
          themes: story.currentStory.settings?.themes ?? undefined,
        }

      const worldState = {
        characters: story.characters,
        locations: story.locations,
        items: story.items,
        storyBeats: story.storyBeats,
      }

      const lorebookEntries = story.lorebookEntries
      const result = await aiService.generateActionChoices(
        story.entries,
        worldState,
        lastNarration.content,
        lorebookEntries,
        promptContext,
        story.pov,
        story.currentStory?.id,
      )

      if (result.choices.length > 0) {
        ui.setActionChoices(result.choices, story.currentStory!.id)
        // Only time-travel recovery should rewrite the narration's saved suggestions.
        // Actor-change/end-turn regeneration is runtime state for the current actor.
        if (options.persistToLastNarration) {
          database
            .updateStoryEntry(lastNarration.id, {
              suggestedActions: JSON.stringify(result.choices),
            })
            .catch((err) =>
              console.warn('[ActionInput] Failed to save regenerated action choices:', err),
            )
        }
      }
    } catch (error) {
      console.warn('[ActionInput] Failed to regenerate action choices after delete:', error)
    } finally {
      ui.setActionChoicesLoading(false)
    }
  }

  async function handleManualImageGeneration() {
    if (!lastImageGenContext || manualImageGenDisabled) return
    const storySettings = story.currentStory?.settings
    if (!storySettings || storySettings.imageGenerationMode === 'none') return
    isManualImageGenRunning = true
    try {
      await aiService.generateImagesForNarrative({
        ...lastImageGenContext,
        imageGenerationMode: story.currentStory?.settings?.imageGenerationMode,
        allCharacters: story.characters,
        allItems: story.items,
        imageSettings: settings.systemServicesSettings.imageGeneration,
        getImageProfile: (id) => settings.getImageProfile(id),
      })
    } catch (error) {
      log('Manual image generation failed (non-fatal)', error)
    } finally {
      isManualImageGenRunning = false
    }
  }

  async function handleSubmit() {
    if (!inputValue.trim() || ui.isGenerating || !story.currentStory) return

    ui.clearGenerationError()
    ui.resetScrollBreak()

    const rawInput = inputValue.trim()
    const wasRawActionChoice = isRawActionChoice
    const forceFreeMode = settings.uiSettings.disableActionPrefixes

    let displayContent: string
    if (wasRawActionChoice || forceFreeMode) displayContent = rawInput
    else displayContent = actionPrefixes[actionType] + rawInput + actionSuffixes[actionType]
    const generationContent =
      wasRawActionChoice || forceFreeMode
        ? withActingCharacterDirective(displayContent)
        : displayContent

    isRawActionChoice = false
    inputValue = ''
    if (textareaRef) textareaRef.scrollTop = 0

    const embeddedImages = await database.getEmbeddedImagesForStory(story.currentStory.id)
    ui.createRetryBackup(
      story.currentStory.id,
      story.entries,
      story.characters,
      story.locations,
      story.items,
      story.storyBeats,
      embeddedImages,
      displayContent,
      rawInput,
      actionType,
      wasRawActionChoice,
      story.currentStory.timeTracker,
    )

    const { promptContent, originalInput } = await translateUserInput(
      displayContent,
      settings.translationSettings,
    )

    const userActionEntry = await story.addEntry('user_action', promptContent)

    if (originalInput) {
      await database.updateStoryEntry(userActionEntry.id, { originalInput })
      await story.refreshEntry(userActionEntry.id)
    }

    emitUserInput(displayContent, forceFreeMode ? 'free' : actionType)
    await tick()

    await generateResponse(userActionEntry.id, generationContent)
  }

  async function handleStopGeneration() {
    if (stopRequested || ui.isRetryingLastMessage) return

    stopRequested = true
    activeAbortController?.abort()
    ui.endStreaming()
    ui.setGenerating(false)

    const backup = ui.retryBackup
    if (!backup || !story.currentStory || backup.storyId !== story.currentStory.id) {
      if (backup) ui.clearRetryBackup()
      return
    }

    ui.clearGenerationError()
    ui.clearActionChoices(story.currentStory.id)

    if (backup.hasFullState) {
      ui.restoreActivationData(backup.activationData, backup.storyPosition)
    }
    ui.setLastLorebookRetrieval(null)
    ui.setLastRetrievalResult(null)

    const result = await retryService.handleStopGeneration(
      backup,
      {
        restoreFromRetryBackup: story.restoreFromRetryBackup.bind(story),
        deleteEntriesFromPosition: story.deleteEntriesFromPosition.bind(story),
        deleteEntitiesCreatedAfterBackup: story.deleteEntitiesCreatedAfterBackup.bind(story),
        restoreCharacterSnapshots: story.restoreCharacterSnapshots.bind(story),
        restoreTimeTrackerSnapshot: story.restoreTimeTrackerSnapshot.bind(story),
        lockRetryInProgress: story.lockRetryInProgress.bind(story),
        unlockRetryInProgress: story.unlockRetryInProgress.bind(story),
        restoreActivationData: ui.restoreActivationData.bind(ui),
        clearActivationData: () => ui.clearActivationData(),
        setLastLorebookRetrieval: ui.setLastLorebookRetrieval.bind(ui),
      },
      {
        clearGenerationError: () => ui.clearGenerationError(),
        clearSuggestions: () => undefined,
        clearActionChoices: () => ui.clearActionChoices(story.currentStory!.id),
      },
    )

    if (result.success) {
      await tick()
      actionType = (result.restoredActionType as ActionType) ?? actionType
      isRawActionChoice = result.restoredWasRawActionChoice ?? false
      inputValue = result.restoredRawInput ?? ''
    }
    ui.clearRetryBackup(true)
  }

  async function handleRetry() {
    const error = ui.lastGenerationError
    if (!error || ui.isGenerating) return

    const userActionEntry = story.entries.find((e) => e.id === error.userActionEntryId)
    if (!userActionEntry) {
      ui.clearGenerationError()
      return
    }

    await story.deleteEntry(error.errorEntryId)
    ui.clearGenerationError()

    await generateResponse(userActionEntry.id, userActionEntry.content, {
      countStyleReview: false,
      styleReviewSource: 'retry-error',
    })
  }

  function dismissError() {
    ui.clearGenerationError()
  }

  async function handleRetryLastMessage(retryOptions?: RetryLastMessageOptions) {
    const backup = ui.retryBackup
    console.log('[handleRetryLastMessage] called', {
      hasBackup: !!backup,
      isGenerating: ui.isGenerating,
    })
    if (!backup || ui.isGenerating || !story.currentStory) return
    if (backup.storyId !== story.currentStory.id) {
      ui.clearRetryBackup(false)
      return
    }

    const storyId = story.currentStory.id

    ui.clearGenerationError()
    ui.clearActionChoices(storyId)
    ui.setLastRetrievalResult(null)
    lastImageGenContext = null

    const result = await retryService.handleRetryLastMessage(
      backup,
      {
        restoreFromRetryBackup: story.restoreFromRetryBackup.bind(story),
        deleteEntriesFromPosition: story.deleteEntriesFromPosition.bind(story),
        deleteEntitiesCreatedAfterBackup: story.deleteEntitiesCreatedAfterBackup.bind(story),
        restoreCharacterSnapshots: story.restoreCharacterSnapshots.bind(story),
        restoreTimeTrackerSnapshot: story.restoreTimeTrackerSnapshot.bind(story),
        lockRetryInProgress: story.lockRetryInProgress.bind(story),
        unlockRetryInProgress: story.unlockRetryInProgress.bind(story),
        restoreActivationData: ui.restoreActivationData.bind(ui),
        clearActivationData: () => ui.clearActivationData(),
        setLastLorebookRetrieval: ui.setLastLorebookRetrieval.bind(ui),
      },
      {
        clearGenerationError: () => ui.clearGenerationError(),
        clearSuggestions: () => undefined,
        clearActionChoices: () => ui.clearActionChoices(storyId),
        clearImageContext: () => {
          lastImageGenContext = null
        },
      },
    )

    if (!result.success) return

    await tick()

    const { promptContent, originalInput } = await translateUserInput(
      backup.userActionContent,
      settings.translationSettings,
    )
    const userActionEntry = await story.addEntry('user_action', promptContent)

    if (originalInput) {
      await database.updateStoryEntry(userActionEntry.id, { originalInput })
      await story.refreshEntry(userActionEntry.id)
    }

    emitUserInput(backup.userActionContent, backup.actionType)
    await tick()

    ui.setRetryingLastMessage(true)
    try {
      await generateResponse(userActionEntry.id, promptContent, {
        countStyleReview: false,
        styleReviewSource: 'retry-last-message',
        cachedRetrievalResult: ui.lastRetrievalResult,
        guidedRegenerationNudge: retryOptions?.guidanceNudge,
        guidedRegenerationPreviousNarration: retryOptions?.previousNarration,
      })
    } finally {
      ui.setRetryingLastMessage(false)
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    const isMobile = isTouchDevice()
    const shouldSubmit = isMobile
      ? event.key === 'Enter' && event.shiftKey
      : event.key === 'Enter' && !event.shiftKey
    if (shouldSubmit) {
      event.preventDefault()
      handleSubmit()
    }
  }

  function autoResize(node: HTMLTextAreaElement, _value?: string) {
    function resize() {
      node.style.height = 'auto'
      node.style.height = `${node.scrollHeight}px`
    }
    resize()
    node.addEventListener('input', resize)
    return {
      update(_newValue?: string) {
        resize()
      },
      destroy() {
        node.removeEventListener('input', resize)
      },
    }
  }
</script>

<div class="ml-1 space-y-3">
  {#if ui.lastGenerationError && !ui.isGenerating}
    <div
      class="flex items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3"
    >
      <div class="flex items-center gap-2 text-sm text-red-400">
        <span>Generation failed. Would you like to try again?</span>
      </div>
      <div class="flex items-center gap-2">
        <button
          onclick={handleRetry}
          class="btn flex items-center gap-1.5 bg-red-500/20 text-sm text-red-400 hover:bg-red-500/30"
          ><RefreshCw class="h-4 w-4" />Retry</button
        >
        <button
          onclick={dismissError}
          class="text-surface-400 hover:bg-surface-700 hover:text-surface-200 rounded p-1.5"
          title="Dismiss"><X class="h-4 w-4" /></button
        >
      </div>
    </div>
  {/if}

  <GrammarCheck text={inputValue} onApplySuggestion={(newText) => (inputValue = newText)} />

  {#if campaign.current && campaign.sceneTurnState && turnActors.length > 0}
    <div
      class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-700/80 bg-slate-900/60 px-2.5 py-2"
    >
      <label
        class="flex items-center gap-2 text-[11px] font-medium tracking-[0.12em] text-slate-400 uppercase"
      >
        Acting as
        <select
          value={actingAsId ?? ''}
          onchange={(event) => void handleActingAsChange(event.currentTarget.value)}
          class="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 ring-0 outline-none"
        >
          {#each turnActors as actor (actor.id)}
            <option value={actor.id}>{actor.name}</option>
          {/each}
        </select>
      </label>

      <Button variant="secondary" size="sm" class="gap-2 text-xs" onclick={handleEndTurn}>
        <Square class="h-3.5 w-3.5" />
        End turn
      </Button>
    </div>
  {/if}

  <div
    class="sm:border-border rounded-lg border-l-0 sm:border sm:border-l-4 sm:shadow-sm {ui.isGenerating
      ? 'sm:border-l-surface-60'
      : `${actionBorderColors[actionType]}`} bg-card relative transition-colors duration-200"
  >
    {#if settings.uiSettings.showWordCount}<div class="absolute -top-[2.05rem] -right-3 sm:hidden">
        <div
          class="bg-surface-800 border-surface-500/30 text-surface-400 rounded-tl-md border border-b-0 px-2 py-0.5 text-sm"
        >
          {story.wordCount} words
        </div>
      </div>{/if}
    {#if !settings.uiSettings.disableActionPrefixes}
      <div
        class="border-surface-700/30 flex items-center gap-1 px-1 pt-0 pb-0 sm:border-b sm:px-2 sm:py-1"
      >
        {#each actionTypes as type (type)}{@const Icon = actionIcons[type]}<button
            class="flex flex-1 items-center justify-center gap-1.5 rounded-md py-1 text-[10px] font-medium transition-all duration-150 sm:flex-none sm:px-3 sm:py-1 sm:text-xs {actionType ===
            type
              ? actionActiveStyles[type]
              : `text-surface-500 hover:${actionButtonStyles[type]}`}"
            onclick={() => (actionType = type)}
            ><Icon class="h-3 w-3 sm:h-3.5 sm:w-3.5" /><span>{actionLabels[type]}</span></button
          >{/each}
      </div>
    {/if}
    <div class="mb-3 flex items-center gap-1 sm:mb-0 sm:items-end sm:p-1">
      <div class="relative min-w-0 flex-1 self-center">
        <textarea
          bind:value={inputValue}
          bind:this={textareaRef}
          disabled={blockFreeTextForRoll}
          use:autoResize={inputValue}
          onkeydown={handleKeydown}
          placeholder={blockFreeTextForRoll
            ? `Resolve ${pendingPlayerRoll?.notation ?? 'the outstanding roll'} to continue`
            : actionType === 'story'
              ? 'Describe what happens...'
              : actionType === 'say'
                ? 'What do you say?'
                : actionType === 'think'
                  ? 'What are you thinking?'
                  : actionType === 'free'
                    ? 'Write anything...'
                    : 'What do you do?'}
          class="text-surface-200 placeholder-surface-500 max-h-[160px] min-h-[24px] w-full resize-none border-none bg-transparent px-2 text-base leading-relaxed focus:ring-0 focus:outline-none sm:min-h-[24px]"
          rows="1"
        ></textarea>
      </div>
      {#if ui.isGenerating}
        {#if !ui.isRetryingLastMessage}<button
            onclick={handleStopGeneration}
            class="flex h-11 w-11 shrink-0 -translate-y-0.5 animate-pulse items-center justify-center rounded-lg p-0 text-red-400 transition-all hover:text-red-300 active:scale-95 sm:translate-y-0"
            title="Stop generation"><Square class="h-6 w-6" /></button
          >
        {:else}<button
            disabled
            class="flex h-11 w-11 shrink-0 cursor-not-allowed items-center justify-center rounded-lg p-0 text-red-400 opacity-50"
            title="Stop disabled during retry"><Square class="h-6 w-6" /></button
          >{/if}
      {:else}<button
          onclick={handleSubmit}
          disabled={!inputValue.trim() || blockGeneration || blockFreeTextForRoll}
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg p-0 transition-all active:scale-95 disabled:opacity-50 {actionButtonStyles[
            actionType
          ]} -translate-y-0.5 sm:translate-y-0"
          title={blockFreeTextForRoll
            ? 'Resolve the outstanding roll before entering another action'
            : blockGeneration
              ? 'AI configuration incomplete — check Settings'
              : `Send (${sendKeyHint})`}><Send class="h-6 w-6" /></button
        >{/if}
    </div>
  </div>

  {#if canShowManualImageGen}
    <div class="flex justify-end">
      <Button
        variant="secondary"
        size="sm"
        onclick={handleManualImageGeneration}
        disabled={manualImageGenDisabled}
        title={manualImageGenDisabled && !hasRequiredCredentials()
          ? `Add a ${getProviderDisplayName()} API key in Settings to generate images`
          : 'Generate images for the last narration'}
        class="gap-1.5 text-xs"
      >
        {#if isManualImageGenRunning}<Loader2 class="h-4 w-4 animate-spin" />{:else}<ImageIcon
            class="h-4 w-4"
          />{/if}
        {isManualImageGenRunning ? 'Generating...' : 'Generate Images'}
      </Button>
    </div>
  {/if}

  {#if story.currentStory}
    <div class="flex justify-end gap-1.5">
      <Button
        variant="ghost"
        size="icon"
        class="h-8 w-8"
        title="Find and replace in story"
        aria-label="Find and replace in story"
        onclick={() => (showFindReplaceModal = true)}
      >
        <Search class="h-4 w-4" />
      </Button>
    </div>
  {/if}

  <ResponsiveModal.Root
    open={showFindReplaceModal}
    onOpenChange={(open) => (showFindReplaceModal = open)}
  >
    <ResponsiveModal.Content class="sm:max-w-md">
      <ResponsiveModal.Header>
        <ResponsiveModal.Title>Find & Replace</ResponsiveModal.Title>
        <ResponsiveModal.Description>
          Replace text across all editable messages in the active story branch.
        </ResponsiveModal.Description>
      </ResponsiveModal.Header>

      <div class="space-y-3 py-2">
        <div class="space-y-1.5">
          <label
            for="find-replace-find"
            class="text-muted-foreground text-xs font-medium tracking-wide uppercase">Find</label
          >
          <Input id="find-replace-find" bind:value={findText} placeholder="e.g. '" class="h-9" />
        </div>
        <div class="space-y-1.5">
          <label
            for="find-replace-replace"
            class="text-muted-foreground text-xs font-medium tracking-wide uppercase">Replace</label
          >
          <Input
            id="find-replace-replace"
            bind:value={replaceText}
            placeholder="e.g. &quot;"
            class="h-9"
          />
        </div>
      </div>

      <ResponsiveModal.Footer>
        <Button
          variant="outline"
          onclick={() => (showFindReplaceModal = false)}
          disabled={replacingAll}
        >
          Cancel
        </Button>
        <Button
          onclick={handleReplaceAllInStory}
          disabled={replacingAll || ui.isGenerating || !findText.trim()}
        >
          {#if replacingAll}
            <Loader2 class="mr-1.5 h-4 w-4 animate-spin" />
            Replacing...
          {:else}
            Replace All
          {/if}
        </Button>
      </ResponsiveModal.Footer>
    </ResponsiveModal.Content>
  </ResponsiveModal.Root>
</div>

/**
 * Narrative Service
 *
 * The core service that generates story responses.
 * This is the heart of the application - it handles narrative generation
 * both streaming and non-streaming.
 *
 * Unlike other services that use the preset system, NarrativeService uses
 * the main narrative profile directly (apiSettings.defaultModel, temperature, maxTokens).
 *
 * Uses ContextBuilder for prompt generation through the unified Liquid template pipeline.
 */

import { streamNarrative, generateNarrative } from '../sdk/generate'
import { ContextBuilder } from '$lib/services/context'
import { StyleReviewerService } from './StyleReviewerService'
import { templateEngine } from '$lib/services/templates/engine'
import { createLogger } from '$lib/log'
import { stripPicTags } from '$lib/utils/inlineImageParser'
import type { StreamChunk } from '../core/types'
import type {
  Story,
  StoryEntry,
  Entry,
  Character,
  Location,
  Item,
  StoryBeat,
  Chapter,
  TimeTracker,
} from '$lib/types'
import type { StyleReviewResult } from './StyleReviewerService'
import type { TimelineFillResult } from '../retrieval/TimelineFillService'

const log = createLogger('Narrative')

/**
 * World state context for prompt building
 */
export interface WorldStateContext {
  characters: Character[]
  locations: Location[]
  items: Item[]
  storyBeats: StoryBeat[]
  currentLocation?: Location
  chapters?: Chapter[]
  actingProtagonistName?: string
  actingProtagonistDescription?: string | null
  guidedRegenerationNudge?: string
  guidedRegenerationPreviousNarration?: string
}

/**
 * World state context for narrative generation.
 * Extends the base WorldStateContext with lorebook entries.
 */
export interface NarrativeWorldState extends WorldStateContext {
  lorebookEntries?: Entry[]
}

/**
 * Format a TimeTracker into a human-readable string for the narrative prompt.
 * Always returns a value, defaulting to Year 1, Day 1, 0 hours 0 minutes if null.
 */
export function formatStoryTime(time: TimeTracker | null | undefined): string {
  const t = time ?? { years: 0, days: 0, hours: 0, minutes: 0 }
  const year = t.years + 1
  const day = t.days + 1
  return `Year ${year}, Day ${day}, ${t.hours} hours ${t.minutes} minutes`
}

/**
 * Build a block containing chapter summaries for injection into the system prompt.
 * Per design doc: summarized entries are excluded from direct context,
 * but their summaries provide narrative continuity.
 */
export function buildChapterSummariesBlock(
  chapters: Chapter[],
  timelineFillResult?: TimelineFillResult | null,
): string {
  if (chapters.length === 0) return ''

  let block = '\n\n<story_history>\n'
  block += '## Previous Chapters\n'
  block +=
    'The following chapters have occurred earlier in the story. Use them for continuity and context.\n\n'

  for (const chapter of chapters) {
    block += `### Chapter ${chapter.number}`
    if (chapter.title) {
      block += `: ${chapter.title}`
    }
    block += '\n'

    const startTime = formatStoryTime(chapter.startTime)
    const endTime = formatStoryTime(chapter.endTime)
    if (startTime && endTime) {
      block += `*Time: ${startTime} \u2192 ${endTime}*\n`
    } else if (startTime) {
      block += `*Time: ${startTime}*\n`
    }

    block += chapter.summary
    block += '\n'

    const metadata: string[] = []
    if (chapter.characters.length > 0) {
      metadata.push(`Characters: ${chapter.characters.join(', ')}`)
    }
    if (chapter.locations.length > 0) {
      metadata.push(`Locations: ${chapter.locations.join(', ')}`)
    }
    if (chapter.emotionalTone) {
      metadata.push(`Tone: ${chapter.emotionalTone}`)
    }
    if (metadata.length > 0) {
      block += `*${metadata.join(' | ')}*\n`
    }
    block += '\n'
  }

  if (timelineFillResult && timelineFillResult.responses.length > 0) {
    block += '## Retrieved Context\n'
    block +=
      'The following information was retrieved from past chapters and is relevant to the current scene:\n\n'

    for (const response of timelineFillResult.responses) {
      const chapterLabel =
        response.chapterNumbers.length === 1
          ? `Chapter ${response.chapterNumbers[0]}`
          : `Chapters ${response.chapterNumbers.join(', ')}`

      block += `**${chapterLabel}**\n`
      block += `Q: ${response.query}\n`
      block += `A: ${response.answer}\n\n`
    }
  }

  block += '</story_history>'
  return block
}

/**
 * Options for narrative generation.
 */
export interface NarrativeOptions {
  /** Pre-built tiered context block for injection */
  tieredContextBlock?: string
  /** Style review results for avoiding repetition */
  styleReview?: StyleReviewResult | null
  /** Retrieved chapter context from memory system */
  retrievedChapterContext?: string | null
  /** Abort signal for cancellation */
  signal?: AbortSignal
  /** Timeline fill result for Q&A injection */
  timelineFillResult?: TimelineFillResult | null
}

export type ManualEditorPassOptions = NarrativeOptions

/**
 * Service for generating narrative responses.
 *
 * This service uses the main narrative profile from apiSettings directly,
 * rather than going through the preset system. This ensures narrative
 * generation uses the user's primary model and settings.
 *
 * Prompt generation flows through ContextBuilder + Liquid templates.
 */
export class NarrativeService {
  /**
   * Create a new NarrativeService.
   * No preset required - uses main narrative profile from settings.
   */
  constructor() {
    // No configuration needed - uses main profile directly
  }

  /**
   * Stream a narrative response.
   *
   * This is the primary method used by the UI for real-time narrative generation.
   * Yields StreamChunk objects as text arrives from the model.
   */
  async *stream(
    entries: StoryEntry[],
    worldState: NarrativeWorldState,
    story?: Story | null,
    options: NarrativeOptions = {},
  ): AsyncIterable<StreamChunk> {
    const { tieredContextBlock, styleReview, retrievedChapterContext, signal, timelineFillResult } =
      options

    log('stream', {
      entriesCount: entries.length,
      hasTieredContext: !!tieredContextBlock,
      hasStyleReview: !!styleReview,
      hasRetrievedContext: !!retrievedChapterContext,
      hasTimelineFill: !!timelineFillResult,
    })

    // Build system prompt via ContextBuilder pipeline
    const { systemPrompt, primingMessage } = await this.buildPrompts(
      story,
      worldState,
      tieredContextBlock,
      styleReview,
      retrievedChapterContext,
      timelineFillResult,
    )

    // Build the user prompt from entries
    const mode = story?.mode ?? 'adventure'
    const inlineImageMode = story?.settings?.imageGenerationMode === 'inline'
    const userPrompt = this.buildUserPrompt(
      entries,
      mode,
      inlineImageMode,
      worldState.guidedRegenerationPreviousNarration,
      worldState.guidedRegenerationNudge,
      worldState.actingProtagonistName,
    )

    const firstPassPrompt = `${primingMessage}\n\n${userPrompt}`
    const editingPassEnabled = this.isEditingPassEnabled(story)

    try {
      // Default path: single-pass streaming
      if (!editingPassEnabled) {
        const stream = streamNarrative({
          system: systemPrompt,
          prompt: firstPassPrompt,
          signal,
        })

        // Use fullStream to capture both text and reasoning
        // - Native reasoning providers (Anthropic, OpenAI) emit reasoning-delta parts
        // - Models using <think> tags have reasoning extracted by extractReasoningMiddleware
        for await (const part of stream.fullStream) {
          if (part.type === 'reasoning-delta') {
            // Reasoning delta from native providers or extracted from <think> tags
            yield { content: '', reasoning: (part as { text?: string }).text, done: false }
          } else if (part.type === 'text-delta') {
            // Regular text content
            yield { content: (part as { text?: string }).text || '', done: false }
          }
          // Ignore other part types (reasoning-start, reasoning-end, tool calls, finish, etc.)
        }

        yield { content: '', done: true }
        return
      }

      // Hidden two-pass path:
      // 1) Generate draft
      // 2) Edit draft with mode-specific editor prompt
      // 3) Stream edited output to user
      const firstPassDraft = await generateNarrative({
        system: systemPrompt,
        prompt: firstPassPrompt,
        signal,
      })

      const editorSystemPrompt = await this.buildEditorSystemPrompt(
        story,
        worldState,
        tieredContextBlock,
        styleReview,
        retrievedChapterContext,
        timelineFillResult,
      )

      if (!editorSystemPrompt) {
        log('editor pass unavailable; falling back to first pass draft')
        yield { content: firstPassDraft, done: false }
        yield { content: '', done: true }
        return
      }

      const editorUserPrompt = this.buildEditorPassUserPrompt(firstPassDraft)

      try {
        const editorStream = streamNarrative({
          system: editorSystemPrompt,
          prompt: editorUserPrompt,
          signal,
        })

        for await (const part of editorStream.fullStream) {
          if (part.type === 'reasoning-delta') {
            yield { content: '', reasoning: (part as { text?: string }).text, done: false }
          } else if (part.type === 'text-delta') {
            yield { content: (part as { text?: string }).text || '', done: false }
          }
        }

        yield { content: '', done: true }
        return
      } catch (editorError) {
        log('editor pass failed; falling back to first pass draft', editorError)
        yield { content: firstPassDraft, done: false }
        yield { content: '', done: true }
        return
      }
    } catch (error) {
      log('stream error', error)
      // Re-throw to let caller handle the error
      throw error
    }
  }

  /**
   * Generate a complete narrative response (non-streaming).
   *
   * Used for scenarios where streaming is not needed or supported.
   */
  async generate(
    entries: StoryEntry[],
    worldState: NarrativeWorldState,
    story?: Story | null,
    options: Omit<NarrativeOptions, 'timelineFillResult'> = {},
  ): Promise<string> {
    const { tieredContextBlock, styleReview, retrievedChapterContext, signal } = options

    log('generate', { entriesCount: entries.length })

    // Build system prompt via ContextBuilder pipeline
    const { systemPrompt, primingMessage } = await this.buildPrompts(
      story,
      worldState,
      tieredContextBlock,
      styleReview,
      retrievedChapterContext,
    )

    const mode = story?.mode ?? 'adventure'
    const inlineImageMode = story?.settings?.imageGenerationMode === 'inline'
    const userPrompt = this.buildUserPrompt(
      entries,
      mode,
      inlineImageMode,
      worldState.guidedRegenerationPreviousNarration,
      worldState.guidedRegenerationNudge,
      worldState.actingProtagonistName,
    )

    const firstPassPrompt = `${primingMessage}\n\n${userPrompt}`
    const editingPassEnabled = this.isEditingPassEnabled(story)

    if (!editingPassEnabled) {
      return generateNarrative({
        system: systemPrompt,
        prompt: firstPassPrompt,
        signal,
      })
    }

    const firstPassDraft = await generateNarrative({
      system: systemPrompt,
      prompt: firstPassPrompt,
      signal,
    })

    const editorSystemPrompt = await this.buildEditorSystemPrompt(
      story,
      worldState,
      tieredContextBlock,
      styleReview,
      retrievedChapterContext,
      null,
    )

    if (!editorSystemPrompt) {
      log('editor pass unavailable; returning first pass draft')
      return firstPassDraft
    }

    try {
      return await generateNarrative({
        system: editorSystemPrompt,
        prompt: this.buildEditorPassUserPrompt(firstPassDraft),
        signal,
      })
    } catch (editorError) {
      log('editor pass failed; returning first pass draft', editorError)
      return firstPassDraft
    }
  }

  /**
   * Apply a manual editor pass to existing narrative prose.
   * Uses mode-specific editor templates and returns the edited prose.
   */
  async applyManualEditorPass(
    draft: string,
    worldState: NarrativeWorldState,
    story?: Story | null,
    options: ManualEditorPassOptions = {},
  ): Promise<string> {
    const { tieredContextBlock, styleReview, retrievedChapterContext, signal, timelineFillResult } =
      options

    // Manual editor pass should honor the currently active prompt configuration:
    // story custom system prompt (if set) or active pack/mode narrative template.
    const { systemPrompt } = await this.buildPrompts(
      story,
      worldState,
      tieredContextBlock,
      styleReview,
      retrievedChapterContext,
      timelineFillResult,
    )

    return generateNarrative({
      system: systemPrompt,
      prompt: this.buildEditorPassUserPrompt(draft),
      signal,
    })
  }

  /**
   * Build system and priming prompts through the ContextBuilder pipeline.
   *
   * Creates a ContextBuilder from the story, adds runtime variables
   * (tiered context, chapter summaries, style guidance), then renders
   * through the Liquid template for the story's mode.
   */
  private async buildPrompts(
    story: Story | null | undefined,
    worldState: NarrativeWorldState,
    tieredContextBlock?: string,
    styleReview?: StyleReviewResult | null,
    retrievedChapterContext?: string | null,
    timelineFillResult?: TimelineFillResult | null,
  ): Promise<{ systemPrompt: string; primingMessage: string }> {
    const { mode, ctx } = await this.buildNarrativeContext(
      story,
      worldState,
      tieredContextBlock,
      styleReview,
      retrievedChapterContext,
      timelineFillResult,
    )

    // Render system prompt — use per-story override when set, otherwise fall back to pack template
    let systemPrompt: string
    const customPrompt = story?.settings?.customSystemPrompt
    if (customPrompt) {
      const rendered = templateEngine.render(customPrompt, ctx.getContext())
      if (rendered === null) {
        throw new Error(
          'Custom system prompt contains a Liquid syntax error. Edit it in Story Settings.',
        )
      }
      const intensityContract = ctx.getContext().safetyContentIntensity
      systemPrompt = intensityContract ? `${rendered}\n\n${intensityContract}` : rendered
    } else {
      const { system } = await ctx.render('adventure')
      systemPrompt = system
    }

    // Build priming message based on pov/tense
    const context = ctx.getContext()
    const primingMessage =
      (context.narrativePriming as string) ||
      `You are the narrator of this interactive adventure. Resolve the currently acting character's action.`

    log('buildPrompts complete', {
      mode,
      usingCustomPrompt: !!customPrompt,
      systemPromptLength: systemPrompt.length,
      primingMessageLength: primingMessage.length,
    })

    return { systemPrompt, primingMessage }
  }

  private isEditingPassEnabled(story: Story | null | undefined): boolean {
    return story?.settings?.editingPassBeforeDisplayEnabled === true
  }

  private buildEditorPassUserPrompt(firstPassDraft: string): string {
    return [
      'Edit the draft below according to your system instructions.',
      'Preserve continuity, concrete facts, and scene outcomes.',
      'Return revised prose only.',
      '',
      '## Draft',
      firstPassDraft,
    ].join('\n')
  }

  private async buildEditorSystemPrompt(
    story: Story | null | undefined,
    worldState: NarrativeWorldState,
    tieredContextBlock?: string,
    styleReview?: StyleReviewResult | null,
    retrievedChapterContext?: string | null,
    timelineFillResult?: TimelineFillResult | null,
  ): Promise<string | null> {
    try {
      const { ctx } = await this.buildNarrativeContext(
        story,
        worldState,
        tieredContextBlock,
        styleReview,
        retrievedChapterContext,
        timelineFillResult,
      )

      const { system } = await ctx.render('editor-adventure')
      return system?.trim() ? system : null
    } catch (error) {
      log('buildEditorSystemPrompt failed', error)
      return null
    }
  }

  private async buildNarrativeContext(
    story: Story | null | undefined,
    worldState: NarrativeWorldState,
    tieredContextBlock?: string,
    styleReview?: StyleReviewResult | null,
    retrievedChapterContext?: string | null,
    timelineFillResult?: TimelineFillResult | null,
  ): Promise<{ mode: 'adventure'; ctx: ContextBuilder }> {
    const mode = story?.mode ?? 'adventure'

    let ctx: ContextBuilder

    if (story?.id) {
      ctx = await ContextBuilder.forStory(story.id)
    } else {
      ctx = new ContextBuilder()
      ctx.add({
        mode,
        pov: story?.settings?.pov ?? 'second',
        tense: story?.settings?.tense ?? 'present',
        protagonistName: 'the protagonist',
      })
    }

    if (tieredContextBlock) {
      ctx.add({ tieredContextBlock })
    }

    if (retrievedChapterContext) {
      ctx.add({ retrievedChapterContext })
    }

    if (worldState.chapters && worldState.chapters.length > 0) {
      const chapterSummaries = buildChapterSummariesBlock(worldState.chapters, timelineFillResult)
      if (chapterSummaries) {
        ctx.add({ chapterSummaries })
      }
    }

    const actingProtagonistName = worldState.actingProtagonistName?.trim()
    if (actingProtagonistName) {
      ctx.add({
        protagonistName: actingProtagonistName,
        protagonistDescription: worldState.actingProtagonistDescription ?? '',
        activeActorName: actingProtagonistName,
      })
    }

    if (styleReview && styleReview.phrases.length > 0) {
      const styleGuidance = StyleReviewerService.formatForPromptInjection(styleReview)
      if (styleGuidance) {
        ctx.add({ styleGuidance })
      }
    }

    const guidanceNudge = worldState.guidedRegenerationNudge?.trim()
    if (guidanceNudge) {
      ctx.add({ guidedRegenerationNudge: guidanceNudge })
    }

    return { mode, ctx }
  }

  /**
   * Build the user prompt from recent story entries.
   *
   * Formats entries as a conversation history with the current action highlighted.
   */
  private buildUserPrompt(
    entries: StoryEntry[],
    mode: 'adventure',
    inlineImageMode: boolean = false,
    guidedRegenerationPreviousNarration?: string,
    guidedRegenerationNudge?: string,
    actingProtagonistName?: string,
  ): string {
    // Use all entries passed - these are already the visible (non-summarized) entries
    // Truncation/context management happens upstream via the memory system

    // Format entries based on mode
    const historyParts: string[] = []
    for (const entry of entries) {
      // Strip <pic> tags if not in inline mode to prevent AI from immitating them
      const content = inlineImageMode ? entry.content : stripPicTags(entry.content)

      if (entry.type === 'user_action') {
        historyParts.push(`[ACTION] ${content}`)
      } else if (entry.type === 'narration') {
        historyParts.push(`[NARRATIVE]\n${content}`)
      }
    }

    // Get the last user action as the current input
    const lastUserAction = [...entries].reverse().find((e) => e.type === 'user_action')
    const currentAction = lastUserAction
      ? inlineImageMode
        ? lastUserAction.content
        : stripPicTags(lastUserAction.content)
      : ''

    // Build final prompt
    let prompt = ''

    if (historyParts.length > 1) {
      // Include history minus the last action (which becomes current)
      prompt += '## Recent Story:\n'
      prompt += historyParts.slice(0, -1).join('\n\n')
      prompt += '\n\n'
    }

    prompt += '## Current Action:\n'
    if (actingProtagonistName?.trim()) {
      prompt += `Acting character for this action: ${actingProtagonistName.trim()}\n`
      prompt += `Resolve the current action as ${actingProtagonistName.trim()}'s action, not another character's action.\n`
    }
    prompt += currentAction
    prompt += '\n\n'

    const previousDraft = guidedRegenerationPreviousNarration?.trim()
    if (previousDraft) {
      const draftContent = inlineImageMode ? previousDraft : stripPicTags(previousDraft)
      prompt += '## Previous Narrative Draft (Revise This):\n'
      prompt += draftContent
      prompt += '\n\n'
      prompt +=
        'Regenerate by revising this draft, not by starting from scratch. Keep valid details and flow, then correct inaccuracies and apply the guidance notes naturally.\n\n'
    }

    const guidance = guidedRegenerationNudge?.trim()
    if (guidance) {
      const checklist = guidance
        .split(/[.!?]+(?:\s+|$)/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .slice(0, 6)

      prompt += '## Guided Regeneration Notes (Soft Priority):\n'
      prompt +=
        'Use these as subtle steering notes for this regeneration. Try to address each point where it naturally fits the scene and continuity.\n'

      if (checklist.length > 0) {
        for (const item of checklist) {
          prompt += `- ${item}\n`
        }
      } else {
        prompt += `- ${guidance}\n`
      }

      prompt += '\n'
    }

    prompt += 'Continue the narrative:'

    return prompt
  }

}

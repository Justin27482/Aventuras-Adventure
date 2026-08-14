/**
 * PipelineEventHandler - Maps GenerationEvent pipeline events to UI callbacks.
 * Extracted from ActionInput.svelte for reusability and testability.
 */
import type { GenerationEvent } from './types'

export interface PipelineUICallbacks {
  startStreaming: (visualProseMode: boolean, streamingEntryId: string) => void
  appendStreamContent: (content: string) => void
  appendReasoningContent: (reasoning: string) => void
  setGenerationStatus: (status: string) => void
  setActionChoicesLoading: (loading: boolean) => void
  setActionChoices: (choices: any[], storyId?: string) => void
  emitResponseStreaming: (chunk: string, accumulated: string) => void
}

export interface PipelineEventState {
  fullResponse: () => string
  fullReasoning: () => string
  streamingEntryId: string
  visualProseMode: boolean
  storyId?: string
  /** Tracks which parallel phases are currently running */
  activeParallelPhases: Set<string>
}

/** Phases that run concurrently after the narrative phase.
 *  Note: BackgroundImagePhase and ImagePhase both emit phase 'image',
 *  but are not tracked here — they run inside imagePipeline or independently. */
const PARALLEL_PHASES = new Set(['classification', 'translation', 'post'])

/** Human-readable labels shown when a single parallel phase remains. */
const PHASE_LABELS: Record<string, string> = {
  classification: 'Updating world...',
  translation: 'Translating...',
}

/** Build the status message based on how many parallel phases are active */
function parallelStatusMessage(activePhases: Set<string>): string {
  if (activePhases.size === 0) return ''
  if (activePhases.size === 1) {
    const phase = activePhases.values().next().value!
    if (phase === 'post') {
      return 'Generating actions...'
    }
    return PHASE_LABELS[phase] ?? 'Processing...'
  }
  return `Processing ${activePhases.size} tasks...`
}

export function handleEvent(
  event: GenerationEvent,
  state: PipelineEventState,
  callbacks: PipelineUICallbacks,
): void {
  switch (event.type) {
    case 'phase_start':
      if (event.phase === 'narrative') {
        callbacks.startStreaming(state.visualProseMode, state.streamingEntryId)
      } else if (PARALLEL_PHASES.has(event.phase)) {
        state.activeParallelPhases.add(event.phase)
        callbacks.setGenerationStatus(parallelStatusMessage(state.activeParallelPhases))

        // Keep loading spinner for action choices
        if (event.phase === 'post') {
          callbacks.setActionChoicesLoading(true)
        }
      }
      break

    case 'narrative_chunk':
      if (event.content) {
        callbacks.appendStreamContent(event.content)
        callbacks.emitResponseStreaming(event.content, state.fullResponse() + event.content)
      }
      if (event.reasoning) callbacks.appendReasoningContent(event.reasoning)
      break

    case 'phase_complete':
      if (PARALLEL_PHASES.has(event.phase)) {
        state.activeParallelPhases.delete(event.phase)
        callbacks.setGenerationStatus(parallelStatusMessage(state.activeParallelPhases))
      }

      if (event.phase === 'post') {
        const postResult = event.result as { actionChoices: any[] | null } | undefined
        if (postResult?.actionChoices) {
          callbacks.setActionChoices(postResult.actionChoices, state.storyId)
        }
        callbacks.setActionChoicesLoading(false)
      }
      break
  }
}

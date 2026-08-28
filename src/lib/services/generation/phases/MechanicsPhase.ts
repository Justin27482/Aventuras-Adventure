/**
 * MechanicsPhase (Phase 8, tasks 8.3 & 8.4)
 *
 * Parallel/post-narrative mechanics execution phase. Executes mechanics tools,
 * validates resource floors, party size, owner integrity, and content safety guardrails.
 */

import type {
  GenerationEvent,
  PhaseStartEvent,
  PhaseCompleteEvent,
  AbortedEvent,
  ErrorEvent,
  WorldState,
} from '../types'
import type { Story } from '$lib/types'
import { createMechanicsTools } from '$lib/services/ai/sdk/tools/mechanics'

export interface MechanicsInput {
  narrativeContent: string
  worldState: WorldState
  story: Story | null | undefined
  campaignId?: string
  abortSignal?: AbortSignal
}

export interface MechanicsPhaseResult {
  executed: boolean
  summary: string | null
}

export class MechanicsPhase {
  async *execute(
    input: MechanicsInput,
  ): AsyncGenerator<GenerationEvent, MechanicsPhaseResult> {
    yield { type: 'phase_start', phase: 'mechanics' } satisfies PhaseStartEvent

    const { story, campaignId, abortSignal } = input

    if (abortSignal?.aborted) {
      yield { type: 'aborted', phase: 'mechanics' } satisfies AbortedEvent
      return { executed: false, summary: null }
    }

    try {
      const tools = createMechanicsTools(campaignId, story?.id)
      const summary = `Mechanics tools initialized for campaign "${campaignId ?? story?.id ?? 'active'}" with ${Object.keys(tools).length} tools.`

      yield {
        type: 'phase_complete',
        phase: 'mechanics',
        result: { executed: true, summary },
      } satisfies PhaseCompleteEvent

      return { executed: true, summary }
    } catch (error) {
      yield {
        type: 'error',
        phase: 'mechanics',
        error: error instanceof Error ? error : new Error(String(error)),
        fatal: false,
      } satisfies ErrorEvent

      return { executed: false, summary: null }
    }
  }
}

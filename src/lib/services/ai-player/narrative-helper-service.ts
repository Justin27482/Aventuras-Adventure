import { generatePlainText } from '$lib/services/ai/sdk'
import { renderStoryPrompt } from '$lib/services/prompts/render-story-prompt'
import type { EntryMetadata } from '$lib/types'

export type NarrativeHelperAudience = 'full_table' | 'player_subset' | 'private_player'
export type NarrativeHelperMood = 'tense' | 'mystical' | 'dramatic' | 'light' | 'neutral'

export interface NarrativeHelperExpandInput {
  storyId: string
  summary: string
  sceneSummary?: string
  mood?: NarrativeHelperMood
  audience?: NarrativeHelperAudience
  includeFactCheck?: boolean
  signal?: AbortSignal
}

export interface NarrativeHelperRegenerateInput {
  storyId: string
  summary: string
  previousText?: string
  tone?: NarrativeHelperMood | 'more_direct' | 'more_poetic'
  signal?: AbortSignal
}

export function buildNarrativeHelperMetadata(
  summary: string,
  generatedNarration: string,
): EntryMetadata {
  return {
    source: 'gm-narration-helper',
    narrativeHelper: {
      summary,
      generatedNarration,
      createdAt: new Date().toISOString(),
    },
  } as EntryMetadata
}

export class NarrativeHelperService {
  async expandSummary(input: NarrativeHelperExpandInput): Promise<string> {
    const summary = input.summary.trim()
    if (!summary) throw new Error('A summary is required before narration expansion.')

    const scene = input.sceneSummary?.trim() || 'No extra scene context was supplied.'
    const audience = input.audience ?? 'full_table'
    const mood = input.mood ?? 'neutral'
    const prompt = await renderStoryPrompt(input.storyId, 'narrative-helper', {
      narrativeHelperOperation: 'expand',
      summary,
      sceneSummary: scene,
      audience,
      mood,
      includeFactCheck: input.includeFactCheck ? 'yes' : 'no',
      previousNarration: '',
    })

    return generatePlainText(
      {
        presetId: 'agentic',
        system: prompt.system,
        prompt: prompt.user,
        signal: input.signal,
      },
      'narrative-helper',
    )
  }

  async regenerate(input: NarrativeHelperRegenerateInput): Promise<string> {
    const summary = input.summary.trim()
    if (!summary) throw new Error('A summary is required before regeneration.')
    const prompt = await renderStoryPrompt(input.storyId, 'narrative-helper', {
      narrativeHelperOperation: 'regenerate',
      summary,
      sceneSummary: 'No extra scene context was supplied.',
      audience: 'full_table',
      mood: input.tone ?? 'neutral',
      includeFactCheck: 'no',
      previousNarration: input.previousText?.trim() || '(none)',
    })

    return generatePlainText(
      {
        presetId: 'agentic',
        system: prompt.system,
        prompt: prompt.user,
        signal: input.signal,
      },
      'narrative-helper',
    )
  }
}

export const narrativeHelperService = new NarrativeHelperService()

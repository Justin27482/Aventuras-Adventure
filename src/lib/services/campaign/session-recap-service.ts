import { generatePlainText } from '$lib/services/ai/sdk'
import type { CampaignThread, Chapter, RollLedgerEntry, Story, StoryEntry } from '$lib/types'

export interface SessionRecapInput {
  story: Story
  entries: StoryEntry[]
  chapters: Chapter[]
  rolls: RollLedgerEntry[]
  threads: CampaignThread[]
  sessionNumber?: number
}

function compact(value: string | null | undefined, max = 500): string {
  const text = value?.trim() ?? ''
  return text.length > max ? `${text.slice(0, max).trim()}...` : text
}

export function buildSessionRecapSource(input: SessionRecapInput): string {
  const entryBlock = input.entries
    .filter((entry) => entry.type === 'user_action' || entry.type === 'narration')
    .slice(-30)
    .map((entry) => `[${entry.type}] ${compact(entry.content, 700)}`)
    .join('\n')
  const chapterBlock = input.chapters
    .slice(-8)
    .map((chapter) => `- ${chapter.title ?? `Chapter ${chapter.number}`}: ${compact(chapter.summary, 500)}`)
    .join('\n')
  const rollBlock = input.rolls
    .slice(0, 20)
    .map((roll) => `- ${roll.actorId ?? 'unknown actor'} rolled ${roll.notation} = ${roll.total}${roll.dc === null ? '' : ` vs DC ${roll.dc}`} (${roll.outcome ?? 'unresolved'})${roll.reason ? `: ${roll.reason}` : ''}`)
    .join('\n')
  const threadBlock = input.threads
    .filter((thread) => thread.status === 'active' || thread.status === 'dormant')
    .map((thread) => `- [${thread.visibility}] ${thread.title}: ${compact(thread.summary, 400) ?? 'No summary'}; clock ${thread.clockValue}${thread.clockMax === null ? '' : `/${thread.clockMax}`}`)
    .join('\n')

  return [
    `Campaign: ${input.story.title}`,
    input.sessionNumber ? `Session: ${input.sessionNumber}` : null,
    `Genre: ${input.story.genre ?? 'unspecified'}`,
    '',
    '## Recent Story Entries',
    entryBlock || '(none)',
    '',
    '## Chapter Summaries',
    chapterBlock || '(none)',
    '',
    '## Roll Ledger',
    rollBlock || '(none)',
    '',
    '## Campaign Threads',
    threadBlock || '(none)',
  ]
    .filter((section): section is string => section !== null)
    .join('\n')
}

export async function generateSessionRecap(input: SessionRecapInput): Promise<string> {
  const source = buildSessionRecapSource(input)
  return generatePlainText(
    {
      presetId: 'agentic',
      system:
        'You are a campaign session recap assistant for a game master. Produce a concise, factual markdown recap. Separate player-facing developments from director-only information. Never invent events, rolls, or outcomes that are not present in the source. Preserve unresolved threads and clearly identify unresolved rolls.',
      prompt: `Create a session recap from the following source. Use these sections: Overview, What Happened, Important Rolls, Thread Status, Director-Only Notes, and Next Session Hooks. Keep director-only information in its own section.\n\n${source}`,
    },
    'session-recap',
  )
}

import type { Character, Entry, Location, Story, StoryBeat, StoryEntry } from '$lib/types'
import { generatePlainText } from '$lib/services/ai/sdk'

export interface WorldCharterDraftInput {
  story: Story
  characters: Character[]
  locations: Location[]
  lorebookEntries: Entry[]
  storyBeats: StoryBeat[]
  entries: StoryEntry[]
  existingCharter?: string | null
}

function list(values: string[], limit = 8): string {
  const filtered = values.map((value) => value.trim()).filter(Boolean)
  if (filtered.length === 0) return 'None established yet.'
  const shown = filtered.slice(0, limit)
  const suffix = filtered.length > limit ? `\n- Plus ${filtered.length - limit} more.` : ''
  return shown.map((value) => `- ${value}`).join('\n') + suffix
}

function preview(value: string | null | undefined, max = 220): string | null {
  const text = value?.trim()
  if (!text) return null
  return text.length > max ? `${text.slice(0, max).trim()}...` : text
}

export function buildWorldCharterDraft(input: WorldCharterDraftInput): string {
  const protagonist = input.characters.find((character) => character.relationship === 'self')
  const companions = input.characters.filter(
    (character) => character.status !== 'deceased' && character.relationship !== 'self',
  )
  const currentLocation = input.locations.find((location) => location.current)
  const activeBeats = input.storyBeats.filter(
    (beat) => beat.status === 'active' || beat.status === 'pending',
  )
  const recentNarration = [...input.entries]
    .filter((entry) => entry.type === 'narration')
    .slice(-3)
    .map((entry) => preview(entry.content, 180))
    .filter((value): value is string => value !== null)

  return [
    `# World Charter`,
    `Campaign: ${input.story.title}`,
    input.story.genre ? `Genre: ${input.story.genre}` : null,
    input.story.description ? `Premise: ${input.story.description}` : null,
    '',
    `## Core Truths`,
    list([
      protagonist?.name ? `The primary character is ${protagonist.name}.` : '',
      currentLocation?.name ? `The current location is ${currentLocation.name}.` : '',
      ...input.lorebookEntries
        .slice(0, 6)
        .map((entry) => `${entry.name}: ${preview(entry.description, 160) ?? ''}`),
    ]),
    '',
    `## Tone and Themes`,
    list([
      input.story.settings?.tone ? `Tone: ${input.story.settings.tone}` : '',
      ...(input.story.settings?.themes ?? []).map((theme) => `Theme: ${theme}`),
    ]),
    '',
    `## Important Characters`,
    list([
      protagonist
        ? `${protagonist.name}: ${preview(protagonist.description, 160) ?? 'Primary character.'}`
        : '',
      ...companions
        .slice(0, 8)
        .map(
          (character) =>
            `${character.name}: ${preview(character.description, 160) ?? character.relationship ?? 'Companion or known character.'}`,
        ),
    ]),
    '',
    `## Places`,
    list(
      input.locations
        .slice(0, 8)
        .map(
          (location) =>
            `${location.name}${location.current ? ' (current)' : ''}: ${preview(location.description, 160) ?? 'No description yet.'}`,
        ),
    ),
    '',
    `## Active Threads`,
    list(
      activeBeats
        .slice(0, 8)
        .map(
          (beat) =>
            `${beat.title} [${beat.status}]: ${preview(beat.description, 160) ?? 'No description yet.'}`,
        ),
    ),
    '',
    `## Recent Direction`,
    list(recentNarration, 3),
    '',
    `## Director Notes`,
    input.existingCharter?.trim()
      ? `Existing charter notes to preserve or reconcile:\n${input.existingCharter.trim()}`
      : 'Add immutable world facts, unresolved mysteries, faction agendas, and boundaries here.',
  ]
    .filter((section): section is string => section !== null)
    .join('\n')
}

export async function expandWorldCharterDraft(input: WorldCharterDraftInput): Promise<string> {
  const draft = buildWorldCharterDraft(input)
  return generatePlainText(
    {
      presetId: 'agentic',
      system:
        'You are a campaign worldbuilding assistant. Expand a campaign world charter into concise, useful GM-facing guidance. Preserve all established facts. Do not invent contradictions. Return only the revised charter in markdown.',
      prompt: `Expand this campaign charter for GM planning. Add useful sections for immutable facts, faction tensions, open mysteries, session hooks, and player-safe boundaries when supported by the source material.\n\n${draft}`,
    },
    'directorOutliningAssistant',
  )
}

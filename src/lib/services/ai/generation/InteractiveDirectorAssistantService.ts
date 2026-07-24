import { tool, type ModelMessage, type ToolSet } from 'ai'
import { z } from 'zod'
import { createLogger } from '$lib/log'
import { database } from '$lib/services/database'
import { templateEngine } from '$lib/services/templates/engine'
import type {
  Chapter,
  Character,
  ChapterSource,
  DirectorProposalArtifact,
  Entry,
  Item,
  Location,
  Story,
  StoryEntry,
  StoryBeat,
} from '$lib/types'
import { BaseAIService } from '../BaseAIService'
import { stopWhenDone } from '../sdk/agents'
import { createStreamingAgenticAssistant } from '../sdk/agents/factory'
import { DirectorOutliningAssistantService } from './DirectorOutliningAssistantService'

const log = createLogger('InteractiveDirectorAssistant')

export interface DirectorInteractiveContext {
  story: Story
  recentEntries: string[]
  chapters: Chapter[]
  chapterSources: ChapterSource[]
  storyEntries: StoryEntry[]
  chapterEntriesByNumber: Record<string, StoryEntry[]>
  worldState: {
    characters: Character[]
    locations: Location[]
    items: Item[]
    storyBeats: StoryBeat[]
    lorebookEntries: Entry[]
  }
}

export interface DirectorToolCallDisplay {
  id: string
  name: string
  args: Record<string, unknown>
  result: string
  artifact?: DirectorProposalArtifact
}

export interface DirectorChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  toolCalls?: DirectorToolCallDisplay[]
  reasoning?: string
}

export type DirectorStreamEvent =
  | { type: 'tool_start'; toolCallId: string; toolName: string; args: Record<string, unknown> }
  | { type: 'tool_end'; toolCall: DirectorToolCallDisplay }
  | { type: 'thinking' }
  | { type: 'message'; message: DirectorChatMessage }
  | { type: 'done' }
  | { type: 'error'; error: string }

export class InteractiveDirectorAssistantService extends BaseAIService {
  private proposalService: DirectorOutliningAssistantService
  private initialized = false
  private conversationHistory: ModelMessage[] = []
  private systemPrompt = ''

  constructor(serviceId: string = 'directorOutliningAssistant') {
    super(serviceId)
    this.proposalService = new DirectorOutliningAssistantService(serviceId)
  }

  async initialize(context: DirectorInteractiveContext): Promise<void> {
    this.conversationHistory = []
    this.systemPrompt = await this.buildSystemPrompt(context.story)
    this.initialized = true
  }

  reset(): void {
    this.initialized = false
    this.conversationHistory = []
    this.systemPrompt = ''
  }

  private buildDirectorTools(context: DirectorInteractiveContext) {
    const createdArtifacts = new Map<string, DirectorProposalArtifact>()
    const lorebookEntries = JSON.parse(JSON.stringify(context.worldState.lorebookEntries)) as Entry[]
    const chapters = JSON.parse(JSON.stringify(context.chapters)) as Chapter[]
    const chapterSources = JSON.parse(JSON.stringify(context.chapterSources)) as ChapterSource[]
    const storyEntries = JSON.parse(JSON.stringify(context.storyEntries)) as StoryEntry[]
    const chapterEntriesByNumber = JSON.parse(
      JSON.stringify(context.chapterEntriesByNumber),
    ) as Record<string, StoryEntry[]>

    const tools = {
      search_lorebook_entries: tool({
        description:
          'Search lorebook entries by keyword, name, alias, or entry type. Use this when planning needs lore context from specific domains.',
        inputSchema: z.object({
          query: z
            .string()
            .optional()
            .describe('Optional search text across name, description, aliases, and keywords.'),
          type: z
            .string()
            .optional()
            .describe('Optional entry type filter such as character, location, item, concept, event.'),
          limit: z.number().optional().default(10).describe('Maximum entries to return.'),
        }),
        execute: async ({ query, type, limit }: { query?: string; type?: string; limit?: number }) => {
          let filtered = lorebookEntries

          if (type?.trim()) {
            const expectedType = type.trim().toLowerCase()
            filtered = filtered.filter((entry) => entry.type.toLowerCase() === expectedType)
          }

          if (query?.trim()) {
            const term = query.trim().toLowerCase()
            filtered = filtered.filter(
              (entry) =>
                entry.name.toLowerCase().includes(term) ||
                entry.description.toLowerCase().includes(term) ||
                entry.aliases.some((alias) => alias.toLowerCase().includes(term)) ||
                entry.injection.keywords.some((keyword) => keyword.toLowerCase().includes(term)),
            )
          }

          const selected = filtered.slice(0, limit ?? 10)
          return {
            total: filtered.length,
            entries: selected.map((entry) => ({
              id: entry.id,
              name: entry.name,
              type: entry.type,
              description:
                entry.description.length > 240
                  ? `${entry.description.slice(0, 240)}...`
                  : entry.description,
              aliases: entry.aliases,
              keywords: entry.injection.keywords,
            })),
          }
        },
      }),

      read_lorebook_entry: tool({
        description:
          'Read a full lorebook entry by id or exact name when detailed lore is needed for planning.',
        inputSchema: z.object({
          id: z.string().optional().describe('Entry id to read.'),
          name: z.string().optional().describe('Exact entry name to read when id is unknown.'),
        }),
        execute: async ({ id, name }: { id?: string; name?: string }) => {
          const trimmedId = id?.trim()
          const trimmedName = name?.trim().toLowerCase()
          const entry = lorebookEntries.find(
            (candidate) =>
              (trimmedId ? candidate.id === trimmedId : false) ||
              (trimmedName ? candidate.name.toLowerCase() === trimmedName : false),
          )

          if (!entry) {
            return {
              found: false,
              message: 'No matching lorebook entry found.',
            }
          }

          return {
            found: true,
            entry: {
              id: entry.id,
              name: entry.name,
              type: entry.type,
              description: entry.description,
              hiddenInfo: entry.hiddenInfo,
              aliases: entry.aliases,
              keywords: entry.injection.keywords,
              mentionCount: entry.mentionCount,
              updatedAt: entry.updatedAt,
            },
          }
        },
      }),

      list_chapters: tool({
        description:
          'List chapter summaries for timeline planning. Use this for future chapter planning where recent scene text may not be relevant.',
        inputSchema: z.object({
          limit: z.number().optional().default(30).describe('Maximum chapters to return.'),
        }),
        execute: async ({ limit }: { limit?: number }) => {
          const selected = chapters.slice(0, limit ?? 30)
          return {
            total: chapters.length,
            chapters: selected.map((chapter) => ({
              number: chapter.number,
              title: chapter.title,
              summary:
                chapter.summary.length > 500
                  ? `${chapter.summary.slice(0, 500)}...`
                  : chapter.summary,
              keywords: chapter.keywords,
              characters: chapter.characters,
              locations: chapter.locations,
              plotThreads: chapter.plotThreads,
            })),
          }
        },
      }),

      read_chapter: tool({
        description:
          'Read one chapter summary and optionally include chapter entry excerpts when deeper event detail is needed.',
        inputSchema: z.object({
          chapterNumber: z.number().describe('Chapter number to inspect.'),
          includeEntries: z
            .boolean()
            .optional()
            .default(false)
            .describe('Include chapter entry text excerpts.'),
          entryLimit: z.number().optional().default(24).describe('Max chapter entries to include.'),
        }),
        execute: async ({
          chapterNumber,
          includeEntries,
          entryLimit,
        }: {
          chapterNumber: number
          includeEntries?: boolean
          entryLimit?: number
        }) => {
          const chapter = chapters.find((candidate) => candidate.number === chapterNumber)
          if (!chapter) {
            return {
              found: false,
              message: `Chapter ${chapterNumber} not found.`,
            }
          }

          const key = String(chapterNumber)
          const chapterEntries = chapterEntriesByNumber[key] ?? []

          return {
            found: true,
            chapter: {
              number: chapter.number,
              title: chapter.title,
              summary: chapter.summary,
              keywords: chapter.keywords,
              characters: chapter.characters,
              locations: chapter.locations,
              plotThreads: chapter.plotThreads,
              emotionalTone: chapter.emotionalTone,
            },
            entries:
              includeEntries
                ? chapterEntries.slice(0, entryLimit ?? 24).map((entry) => ({
                    type: entry.type,
                    content: entry.content,
                    createdAt: entry.createdAt,
                  }))
                : undefined,
            entryCount: chapterEntries.length,
          }
        },
      }),

      search_story_text: tool({
        description:
          'Search current story text entries by keyword. Use this when the conversation needs exact recent or historical phrasing/events.',
        inputSchema: z.object({
          query: z.string().describe('Search term for story text content.'),
          limit: z.number().optional().default(12).describe('Maximum matches to return.'),
        }),
        execute: async ({ query, limit }: { query: string; limit?: number }) => {
          const term = query.trim().toLowerCase()
          const matches = term
            ? storyEntries.filter((entry) => entry.content.toLowerCase().includes(term))
            : []

          return {
            total: matches.length,
            matches: matches.slice(0, limit ?? 12).map((entry) => ({
              id: entry.id,
              type: entry.type,
              content: entry.content,
              createdAt: entry.createdAt,
            })),
          }
        },
      }),

      read_recent_story_text: tool({
        description:
          'Read the most recent story entries. Use only when immediate scene context is needed for planning.',
        inputSchema: z.object({
          count: z.number().optional().default(12).describe('How many recent entries to return.'),
          includeSystem: z
            .boolean()
            .optional()
            .default(false)
            .describe('Whether to include system entries.'),
        }),
        execute: async ({ count, includeSystem }: { count?: number; includeSystem?: boolean }) => {
          const filtered = includeSystem
            ? storyEntries
            : storyEntries.filter((entry) => entry.type !== 'system')
          const selected = filtered.slice(-Math.max(1, count ?? 12))

          return {
            totalAvailable: filtered.length,
            entries: selected.map((entry) => ({
              id: entry.id,
              type: entry.type,
              content: entry.content,
              createdAt: entry.createdAt,
            })),
          }
        },
      }),

      search_chapter_sources: tool({
        description:
          'Search imported chapter source text by filename, title, or full raw content. Use this when the summary is insufficient and you need exact past details.',
        inputSchema: z.object({
          query: z.string().describe('Search term for raw chapter source text.'),
          limit: z.number().optional().default(6).describe('Maximum results to return.'),
        }),
        execute: async ({ query, limit }: { query: string; limit?: number }) => {
          const term = query.trim().toLowerCase()
          const matches = chapterSources.filter((source) => {
            const haystack = [source.title, source.sourceFilename ?? '', source.rawText]
              .join('\n')
              .toLowerCase()
            return haystack.includes(term)
          })

          return {
            total: matches.length,
            sources: matches.slice(0, limit ?? 6).map((source) => {
              const content = source.rawText.trim()
              const hitIndex = content.toLowerCase().indexOf(term)
              const excerptStart = hitIndex >= 0 ? Math.max(0, hitIndex - 180) : 0
              const excerptEnd = hitIndex >= 0 ? Math.min(content.length, hitIndex + 420) : Math.min(content.length, 560)
              const excerpt = content.slice(excerptStart, excerptEnd)
              return {
                id: source.id,
                title: source.title,
                sourceFilename: source.sourceFilename,
                chapterNumber: source.chapterNumber,
                summary: source.summary,
                excerpt: excerpt.length < content.length ? `${excerpt}${excerptEnd < content.length ? '...' : ''}` : excerpt,
              }
            }),
          }
        },
      }),

      read_chapter_source: tool({
        description:
          'Read a full imported chapter source by id or exact title when detailed historical context is needed.',
        inputSchema: z.object({
          id: z.string().optional().describe('Source id to read.'),
          title: z.string().optional().describe('Exact source title to read when id is unknown.'),
        }),
        execute: async ({ id, title }: { id?: string; title?: string }) => {
          const trimmedId = id?.trim()
          const trimmedTitle = title?.trim().toLowerCase()
          const source = chapterSources.find(
            (candidate) =>
              (trimmedId ? candidate.id === trimmedId : false) ||
              (trimmedTitle ? candidate.title.toLowerCase() === trimmedTitle : false),
          )

          if (!source) {
            return { found: false, message: 'No matching chapter source found.' }
          }

          return {
            found: true,
            source: {
              id: source.id,
              title: source.title,
              sourceFilename: source.sourceFilename,
              chapterNumber: source.chapterNumber,
              summary: source.summary,
              rawText: source.rawText,
            },
          }
        },
      }),

      create_director_proposal_draft: tool({
        description:
          'Create a pending director proposal artifact when the user asks to capture the current brainstorming into a draft plan.',
        inputSchema: z.object({
          objective: z
            .string()
            .describe('A concise objective for the draft proposal based on current conversation.'),
          titleHint: z
            .string()
            .optional()
            .describe('Optional short title hint to emphasize in the generated draft.'),
        }),
        execute: async ({ objective, titleHint }: { objective: string; titleHint?: string }) => {
          const brief = titleHint?.trim()
            ? `${objective.trim()}\n\nPreferred draft title: ${titleHint.trim()}`
            : objective.trim()

          const artifact = await this.proposalService.generateProposal({
            story: context.story,
            brief,
            recentEntries: context.recentEntries,
            worldState: context.worldState,
            persist: true,
          })

          createdArtifacts.set(artifact.id, artifact)

          return {
            success: true,
            artifactId: artifact.id,
            title: artifact.title,
            summary:
              typeof artifact.draftPayload?.summary === 'string'
                ? artifact.draftPayload.summary
                : null,
            message: `Created pending draft proposal \"${artifact.title ?? 'Untitled proposal'}\".`,
          }
        },
      }),
    }

    return {
      tools,
      createdArtifacts,
    }
  }

  async *sendMessageStreaming(
    context: DirectorInteractiveContext,
    userMessage: string,
    signal?: AbortSignal,
  ): AsyncGenerator<DirectorStreamEvent> {
    if (!this.initialized) {
      await this.initialize(context)
    }

    const { tools, createdArtifacts } = this.buildDirectorTools(context)

    this.conversationHistory.push({
      role: 'user',
      content: userMessage,
    })

    try {
      const assistant = createStreamingAgenticAssistant(
        {
          presetId: this.presetId,
          instructions: this.systemPrompt,
          tools: tools as ToolSet,
          stopWhen: stopWhenDone(20),
          signal,
        },
        'interactive-director-assistant',
      )

      const streamResult = await assistant.stream({ messages: this.conversationHistory })

      const currentToolCalls: Array<{
        id: string
        name: string
        args: Record<string, unknown>
        claimed: boolean
      }> = []

      let stepContent = ''
      let stepReasoning: string | undefined
      let stepToolCalls: DirectorToolCallDisplay[] = []

      for await (const event of streamResult.fullStream) {
        switch (event.type) {
          case 'start-step':
            stepContent = ''
            stepReasoning = undefined
            stepToolCalls = []
            currentToolCalls.length = 0
            break

          case 'reasoning-start':
          case 'reasoning-delta':
            if (event.type === 'reasoning-delta') {
              stepReasoning = (stepReasoning || '') + event.text
            }
            yield { type: 'thinking' }
            break

          case 'text-delta':
            stepContent += event.text
            break

          case 'tool-call':
            currentToolCalls.push({
              id: event.toolCallId,
              name: event.toolName,
              args: event.input as Record<string, unknown>,
              claimed: false,
            })
            yield {
              type: 'tool_start',
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              args: event.input as Record<string, unknown>,
            }
            break

          case 'tool-result': {
            const info = currentToolCalls.find((tc) => tc.id === event.toolCallId && !tc.claimed)
            if (info) info.claimed = true

            if (!info) break

            const toolResult = 'result' in event ? event.result : event.output
            const resultRecord =
              toolResult && typeof toolResult === 'object'
                ? (toolResult as Record<string, unknown>)
                : undefined

            const artifactId =
              resultRecord && typeof resultRecord.artifactId === 'string'
                ? resultRecord.artifactId
                : null

            const toolCall: DirectorToolCallDisplay = {
              id: event.toolCallId,
              name: info.name,
              args: info.args,
              result: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
              artifact: artifactId ? createdArtifacts.get(artifactId) : undefined,
            }

            stepToolCalls.push(toolCall)
            yield { type: 'tool_end', toolCall }
            break
          }

          case 'finish-step':
            if (stepContent || stepToolCalls.length > 0) {
              yield {
                type: 'message',
                message: {
                  id: `dir-step-${Date.now()}`,
                  role: 'assistant',
                  content: stepContent,
                  timestamp: Date.now(),
                  toolCalls: stepToolCalls.length > 0 ? [...stepToolCalls] : undefined,
                  reasoning: stepReasoning,
                },
              }
            }
            break

          case 'error':
            yield { type: 'error', error: String(event.error) }
            return
        }
      }

      const responseMessages = await streamResult.response
      this.conversationHistory.push(...responseMessages.messages)
      yield { type: 'done' }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log('Interactive director stream failed', { message })
      yield { type: 'error', error: message }
    }
  }

  private async buildSystemPrompt(story: Story): Promise<string> {
    const packId = (await database.getStoryPackId(story.id)) ?? 'default-pack'
    const template =
      (await database.getPackTemplate(packId, 'interactive-director-assistant')) ??
      (packId !== 'default-pack'
        ? await database.getPackTemplate('default-pack', 'interactive-director-assistant')
        : null)

    const fallback = [
      'You are a collaborative Director Assistant for interactive fiction planning.',
      'Hold a natural brainstorming conversation with the user and refine ideas step by step.',
      'Ingest context selectively via tools: lorebook, chapter summaries, chapter text, and current story text only when needed for the current user request.',
      'Do NOT create proposal artifacts on every turn.',
      'Only call the create_director_proposal_draft tool when the user clearly asks to capture or draft the plan.',
      'When not drafting, reply conversationally and help sharpen premise, pacing, reveals, and beat structure.',
      'Keep hidden facts protected and prefer foreshadowing for sensitive reveals.',
    ].join('\n')

    if (!template?.content?.trim()) {
      return fallback
    }

    return (
      templateEngine.render(template.content, {
        storyTitle: story.title,
        storyMode: story.mode,
      }) || fallback
    )
  }
}

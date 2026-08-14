import { tool, type ModelMessage, type ToolSet } from 'ai'
import { z } from 'zod'
import { createLogger } from '$lib/log'
import { database } from '$lib/services/database'
import { templateEngine } from '$lib/services/templates/engine'
import type {
  Chapter,
  Character,
  EditorConversation,
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

const log = createLogger('InteractiveEditorAssistant')

export interface EditorInteractiveContext {
  story: Story
  recentEntries: string[]
  chapters: Chapter[]
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

export interface EditorProposedEdit {
  id: string
  entryId: string
  entryType: StoryEntry['type']
  revisedEntryType?: StoryEntry['type']
  originalContent: string
  revisedContent: string
  reason: string
  reprocessChapter: boolean
  rerunLorebookPass: boolean
}

export interface EditorToolCallDisplay {
  id: string
  name: string
  args: Record<string, unknown>
  result: string
  edit?: EditorProposedEdit
}

export interface EditorChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  toolCalls?: EditorToolCallDisplay[]
  reasoning?: string
}

export type EditorStreamEvent =
  | { type: 'tool_start'; toolCallId: string; toolName: string; args: Record<string, unknown> }
  | { type: 'tool_end'; toolCall: EditorToolCallDisplay }
  | { type: 'thinking' }
  | { type: 'message'; message: EditorChatMessage }
  | { type: 'done' }
  | { type: 'error'; error: string }

export class InteractiveEditorAssistantService extends BaseAIService {
  private initialized = false
  private conversationHistory: ModelMessage[] = []
  private systemPrompt = ''
  private conversationId: string | null = null

  constructor(serviceId: string = 'editorAssistant') {
    super(serviceId)
  }

  async initialize(context: EditorInteractiveContext): Promise<void> {
    this.conversationHistory = []
    this.systemPrompt = await this.buildSystemPrompt(context.story)
    this.initialized = true
  }

  reset(): void {
    this.initialized = false
    this.conversationHistory = []
    this.systemPrompt = ''
    this.conversationId = null
  }

  async listConversations(storyId: string): Promise<EditorConversation[]> {
    return database.listEditorConversations(storyId)
  }

  async renameConversation(conversationId: string, title: string): Promise<void> {
    await database.saveEditorConversation(conversationId, { title })
  }

  async deleteConversation(conversationId: string): Promise<void> {
    await database.deleteEditorConversation(conversationId)
    if (this.conversationId === conversationId) {
      this.reset()
    }
  }

  async saveConversation(
    storyId: string,
    chatMessages: EditorChatMessage[],
    pendingEdits: EditorProposedEdit[],
    uiState?: { selectedTargetEntryId?: string | null },
  ): Promise<string> {
    const messagesJson = JSON.stringify(this.conversationHistory)
    const chatMessagesJson = JSON.stringify(chatMessages)
    const pendingEditsJson = JSON.stringify(pendingEdits)
    const uiStateJson = JSON.stringify(uiState ?? {})

    if (this.conversationId) {
      await database.saveEditorConversation(this.conversationId, {
        messages: messagesJson,
        chatMessages: chatMessagesJson,
        pendingEdits: pendingEditsJson,
        uiState: uiStateJson,
      })
      return this.conversationId
    }

    const id = `ec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const title = this.generateTitle(chatMessages)
    const now = new Date().toISOString()

    await database.createEditorConversation({
      id,
      storyId,
      title,
      createdAt: now,
      updatedAt: now,
      messages: messagesJson,
      chatMessages: chatMessagesJson,
      pendingEdits: pendingEditsJson,
      uiState: uiStateJson,
    })

    this.conversationId = id
    return id
  }

  async loadConversation(conversationId: string): Promise<{
    chatMessages: EditorChatMessage[]
    pendingEdits: EditorProposedEdit[]
    selectedTargetEntryId: string | null
  } | null> {
    const conversation = await database.loadEditorConversation(conversationId)
    if (!conversation) {
      return null
    }

    try {
      this.conversationHistory = JSON.parse(conversation.messages) as ModelMessage[]
      this.conversationId = conversationId
      this.initialized = true

      const chatMessages = JSON.parse(conversation.chatMessages) as EditorChatMessage[]
      const pendingEdits = JSON.parse(conversation.pendingEdits) as EditorProposedEdit[]
      const parsedUi = conversation.uiState ? JSON.parse(conversation.uiState) : {}
      const selectedTargetEntryId =
        parsedUi && typeof parsedUi.selectedTargetEntryId === 'string'
          ? parsedUi.selectedTargetEntryId
          : null

      return {
        chatMessages,
        pendingEdits,
        selectedTargetEntryId,
      }
    } catch (error) {
      log('Failed to parse editor conversation payload', { conversationId, error })
      return null
    }
  }

  getConversationId(): string | null {
    return this.conversationId
  }

  private buildTools(context: EditorInteractiveContext) {
    const edits = new Map<string, EditorProposedEdit>()
    const lorebookEntries = JSON.parse(
      JSON.stringify(context.worldState.lorebookEntries),
    ) as Entry[]
    const chapters = JSON.parse(JSON.stringify(context.chapters)) as Chapter[]
    const storyEntries = JSON.parse(JSON.stringify(context.storyEntries)) as StoryEntry[]
    const chapterEntriesByNumber = JSON.parse(
      JSON.stringify(context.chapterEntriesByNumber),
    ) as Record<string, StoryEntry[]>

    const tools = {
      search_lorebook_entries: tool({
        description:
          'Search lorebook entries by keyword, name, alias, or entry type when editing needs canon reference.',
        inputSchema: z.object({
          query: z.string().optional(),
          type: z.string().optional(),
          limit: z.number().optional().default(10),
        }),
        execute: async ({
          query,
          type,
          limit,
        }: {
          query?: string
          type?: string
          limit?: number
        }) => {
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

          return {
            total: filtered.length,
            entries: filtered.slice(0, limit ?? 10).map((entry) => ({
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
        description: 'Read a full lorebook entry by id or exact name for precise editing context.',
        inputSchema: z.object({
          id: z.string().optional(),
          name: z.string().optional(),
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
            return { found: false, message: 'No matching lorebook entry found.' }
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
            },
          }
        },
      }),

      list_chapters: tool({
        description: 'List chapter summaries for pacing and continuity editing.',
        inputSchema: z.object({
          limit: z.number().optional().default(30),
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
          'Read chapter summary and optionally entry excerpts when detailed rewrite continuity is needed.',
        inputSchema: z.object({
          chapterNumber: z.number(),
          includeEntries: z.boolean().optional().default(false),
          entryLimit: z.number().optional().default(24),
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
            return { found: false, message: `Chapter ${chapterNumber} not found.` }
          }

          const chapterEntries = chapterEntriesByNumber[String(chapterNumber)] ?? []

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
            entries: includeEntries
              ? chapterEntries.slice(0, entryLimit ?? 24).map((entry) => ({
                  id: entry.id,
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
          'Search current story text entries by keyword. Use this to locate exact passages for edits.',
        inputSchema: z.object({
          query: z.string(),
          limit: z.number().optional().default(12),
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
              position: entry.position,
              content: entry.content,
              createdAt: entry.createdAt,
            })),
          }
        },
      }),

      read_recent_story_text: tool({
        description:
          'Read the most recent story entries for immediate scene-level editing context.',
        inputSchema: z.object({
          count: z.number().optional().default(12),
          includeSystem: z.boolean().optional().default(false),
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
              position: entry.position,
              content: entry.content,
              createdAt: entry.createdAt,
            })),
          }
        },
      }),

      apply_story_entry_edit: tool({
        description:
          'Commit a specific rewrite for an existing story entry when the user explicitly approves making text changes.',
        inputSchema: z.object({
          entryId: z.string().describe('Story entry ID to edit.'),
          revisedContent: z.string().describe('Full revised replacement text for the entry.'),
          revisedType: z
            .enum(['user_action', 'narration', 'system'])
            .optional()
            .describe('Optional new entry type when the rewrite should change the message role.'),
          reason: z.string().optional().describe('Short rationale for this edit.'),
          reprocessChapter: z
            .boolean()
            .optional()
            .default(true)
            .describe('Whether to re-summarize the affected chapter after edit.'),
          rerunLorebookPass: z
            .boolean()
            .optional()
            .default(false)
            .describe('Whether to run a lorebook management pass on chapter context after edit.'),
        }),
        execute: async ({
          entryId,
          revisedContent,
          revisedType,
          reason,
          reprocessChapter,
          rerunLorebookPass,
        }: {
          entryId: string
          revisedContent: string
          revisedType?: StoryEntry['type']
          reason?: string
          reprocessChapter?: boolean
          rerunLorebookPass?: boolean
        }) => {
          const entry = storyEntries.find((candidate) => candidate.id === entryId)
          if (!entry) {
            return { success: false, message: `Entry ${entryId} was not found.` }
          }
          if (entry.type === 'system') {
            return { success: false, message: 'System entries cannot be edited by this tool.' }
          }

          const revised = revisedContent.trim()
          if (!revised) {
            return { success: false, message: 'Revised content cannot be empty.' }
          }

          const edit: EditorProposedEdit = {
            id: crypto.randomUUID(),
            entryId: entry.id,
            entryType: entry.type,
            revisedEntryType: revisedType ?? entry.type,
            originalContent: entry.content,
            revisedContent,
            reason: reason?.trim() || 'Editorial rewrite requested in conversation.',
            reprocessChapter: reprocessChapter ?? true,
            rerunLorebookPass: rerunLorebookPass ?? false,
          }
          edits.set(edit.id, edit)

          return {
            success: true,
            editId: edit.id,
            entryId: edit.entryId,
            entryType: edit.entryType,
            message: `Prepared edit for entry ${entry.position} (${entry.type}).`,
          }
        },
      }),
    }

    return { tools, edits }
  }

  async *sendMessageStreaming(
    context: EditorInteractiveContext,
    userMessage: string,
    signal?: AbortSignal,
  ): AsyncGenerator<EditorStreamEvent> {
    if (!this.initialized) {
      await this.initialize(context)
    }

    const { tools, edits } = this.buildTools(context)

    this.conversationHistory.push({ role: 'user', content: userMessage })

    try {
      const assistant = createStreamingAgenticAssistant(
        {
          presetId: this.presetId,
          instructions: this.systemPrompt,
          tools: tools as ToolSet,
          stopWhen: stopWhenDone(20),
          signal,
        },
        'interactive-editor-assistant',
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
      let stepToolCalls: EditorToolCallDisplay[] = []

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

            const editId =
              resultRecord && typeof resultRecord.editId === 'string' ? resultRecord.editId : null

            const toolCall: EditorToolCallDisplay = {
              id: event.toolCallId,
              name: info.name,
              args: info.args,
              result: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
              edit: editId ? edits.get(editId) : undefined,
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
                  id: `editor-step-${Date.now()}`,
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
      log('Interactive editor stream failed', { message })
      yield { type: 'error', error: message }
    }
  }

  private async buildSystemPrompt(story: Story): Promise<string> {
    const packId = (await database.getStoryPackId(story.id)) ?? 'default-pack'
    const template =
      (await database.getPackTemplate(packId, 'interactive-editor-assistant')) ??
      (packId !== 'default-pack'
        ? await database.getPackTemplate('default-pack', 'interactive-editor-assistant')
        : null)

    const fallback = [
      'You are a collaborative fiction Editor Assistant for draft improvement.',
      'Discuss pacing, clarity, continuity, characterization, and scene impact conversationally.',
      'Use tools to reference lorebook entries, chapter summaries, chapter entries, and story text.',
      'Do NOT force edits by default. Explain suggested improvements first and get user alignment.',
      'When the user explicitly asks to rewrite, revise, convert, or edit a specific existing entry, you MUST call apply_story_entry_edit to queue that edit.',
      'If the user names multiple existing entries, queue one apply_story_entry_edit call per entry instead of only returning prose blocks in chat.',
      'Do not return full rewritten entry bodies in chat unless the matching apply_story_entry_edit call has already been queued, or the user explicitly asks for prose-only suggestions without queueing edits.',
      'If the rewrite should change an entry role, include revisedType in the tool call.',
      'When applying edits, preserve canon continuity and voice unless user asks for a tonal shift.',
      'Keep edits grounded in available story context and avoid introducing unsupported facts.',
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

  private generateTitle(chatMessages: EditorChatMessage[]): string {
    const firstUser = chatMessages.find((message) => message.role === 'user')
    const content = firstUser?.content?.trim()

    if (!content) return 'New Conversation'
    if (content.length <= 50) return content

    const truncated = content.slice(0, 50)
    const lastSpace = truncated.lastIndexOf(' ')
    return `${lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated}...`
  }
}

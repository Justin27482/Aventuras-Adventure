/**
 * Retrieval Tools
 *
 * Tool definitions for intelligent lorebook entry retrieval.
 * Used by AgenticRetrievalService for multi-turn reasoning about which entries to include.
 */

import { tool } from 'ai'
import { z } from 'zod'
import type { Entry, Chapter, ChapterSource } from '$lib/types'
import { entryTypeSchema } from '../schemas/lorebook'

/**
 * Context provided to retrieval tools.
 */
export interface RetrievalToolContext {
  /** Available lorebook entries */
  entries: Entry[]
  /** Session summaries for context */
  chapters: Chapter[]
  /** Imported source text records for full-text search */
  chapterSources?: ChapterSource[]
  /** Callback to record selected entry indices */
  onSelectEntry: (index: number) => void
  /** Ask a question about a specific session and get an answer */
  queryChapter?: (chapterNumber: number, question: string) => Promise<string>
}

/**
 * Create retrieval tools with the given context.
 */
export function createRetrievalTools(context: RetrievalToolContext) {
  const { entries, chapters, chapterSources = [], onSelectEntry, queryChapter } = context

  return {
    /**
     * List available sessions with summaries.
     */
    list_sessions: tool({
      description:
        'List all available sessions with their summaries, keywords, and characters. Use this to understand the campaign context before selecting entries.',
      inputSchema: z.object({
        limit: z.number().optional().default(20).describe('Maximum sessions to return'),
      }),
      execute: async ({ limit }: { limit?: number }) => {
        const limitedChapters = chapters.slice(0, limit ?? 20)
        return {
          sessions: limitedChapters.map((ch) => ({
            number: ch.number,
            title: ch.title,
            summary: ch.summary.slice(0, 500) + (ch.summary.length > 500 ? '...' : ''),
            keywords: ch.keywords,
            characters: ch.characters,
            locations: ch.locations,
            plotThreads: ch.plotThreads,
            emotionalTone: ch.emotionalTone,
          })),
          total: chapters.length,
        }
      },
    }),

    /**
     * Ask a question about a specific session.
     */
    query_session: tool({
      description:
        'Ask a specific question about a session to get relevant information. Do NOT ask for "the full content" - instead ask targeted questions like "What happened to [character]?" or "How did [event] unfold?" The query AI will read the session and answer your question.',
      inputSchema: z.object({
        sessionNumber: z.number().describe('The session number to query'),
        question: z
          .string()
          .describe(
            'A specific question about the session content (e.g., "What did the lead character discover?" or "How did the battle end?")',
          ),
      }),
      execute: async ({ sessionNumber, question }: { sessionNumber: number; question: string }) => {
        const chapter = chapters.find((ch) => ch.number === sessionNumber)
        if (!chapter) {
          return {
            found: false,
            error: `Session ${sessionNumber} not found`,
          }
        }

        let answer: string | undefined
        if (queryChapter) {
          try {
            answer = await queryChapter(sessionNumber, question)
          } catch {
            // Query failed, return summary only
          }
        }

        return {
          found: true,
          session: {
            number: chapter.number,
            title: chapter.title,
            summary: chapter.summary,
            keywords: chapter.keywords,
            characters: chapter.characters,
          },
          question,
          answer: answer ?? 'Unable to answer - using summary only',
        }
      },
    }),

    /**
     * Search lorebook entries by keyword or pattern.
     */
    search_entries: tool({
      description:
        'Search lorebook entries by keyword, name, or type. Use this to find entries relevant to the current context.',
      inputSchema: z.object({
        query: z
          .string()
          .optional()
          .describe('Search query (matches name, description, or keywords)'),
        type: entryTypeSchema.optional().describe('Filter by entry type'),
        limit: z.number().optional().default(20).describe('Maximum results to return'),
      }),
      execute: async ({
        query,
        type,
        limit,
      }: {
        query?: string
        type?: z.infer<typeof entryTypeSchema>
        limit?: number
      }) => {
        let filtered = entries

        if (type) {
          filtered = filtered.filter((e) => e.type === type)
        }

        if (query) {
          const lowerQuery = query.toLowerCase()
          filtered = filtered.filter(
            (e) =>
              e.name.toLowerCase().includes(lowerQuery) ||
              e.description.toLowerCase().includes(lowerQuery) ||
              e.aliases.some((a) => a.toLowerCase().includes(lowerQuery)) ||
              e.injection.keywords.some((k) => k.toLowerCase().includes(lowerQuery)),
          )
        }

        const limitedResults = filtered.slice(0, limit ?? 20)

        return {
          entries: limitedResults.map((e) => {
            const originalIndex = entries.indexOf(e)
            return {
              index: originalIndex,
              id: e.id,
              name: e.name,
              type: e.type,
              description: e.description.slice(0, 200) + (e.description.length > 200 ? '...' : ''),
              aliases: e.aliases,
              keywords: e.injection.keywords,
              priority: e.injection.priority,
              injectionMode: e.injection.mode,
            }
          }),
          total: limitedResults.length,
          availableTotal: filtered.length,
        }
      },
    }),

    /**
     * Search imported chapter source text.
     */
    search_chapter_sources: tool({
      description:
        'Search imported chapter source text by filename, title, or raw content. Use this when you need exact details that are not in the chapter summary.',
      inputSchema: z.object({
        query: z.string().describe('Search term to match against source title, filename, or text'),
        limit: z.number().optional().default(6).describe('Maximum sources to return'),
      }),
      execute: async ({ query, limit }: { query: string; limit?: number }) => {
        const term = query.trim().toLowerCase()
        const filtered = chapterSources.filter((source) => {
          const haystack = [source.title, source.sourceFilename ?? '', source.rawText]
            .join('\n')
            .toLowerCase()
          return haystack.includes(term)
        })

        return {
          total: filtered.length,
          sources: filtered.slice(0, limit ?? 6).map((source) => {
            const content = source.rawText.trim()
            const hitIndex = content.toLowerCase().indexOf(term)
            const excerptStart = hitIndex >= 0 ? Math.max(0, hitIndex - 160) : 0
            const excerptEnd =
              hitIndex >= 0
                ? Math.min(content.length, hitIndex + 360)
                : Math.min(content.length, 520)
            const excerpt = content.slice(excerptStart, excerptEnd)

            return {
              id: source.id,
              title: source.title,
              sourceFilename: source.sourceFilename,
              chapterNumber: source.chapterNumber,
              summary: source.summary,
              excerpt:
                excerpt.length < content.length
                  ? `${excerpt}${excerptEnd < content.length ? '...' : ''}`
                  : excerpt,
            }
          }),
        }
      },
    }),

    /**
     * Read a full imported chapter source by id or exact title.
     */
    read_chapter_source: tool({
      description:
        'Read a full imported chapter source by id or exact title when detailed context is required.',
      inputSchema: z.object({
        id: z.string().optional().describe('Source id to read'),
        title: z.string().optional().describe('Exact source title to read'),
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
          return {
            found: false,
            message: 'No matching chapter source found.',
          }
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

    /**
     * Select an entry for inclusion in context.
     */
    select_entry: tool({
      description:
        'Select a lorebook entry to be included in the narrative context. Use this after determining an entry is relevant.',
      inputSchema: z.object({
        index: z.number().describe('Index of the entry to select'),
        reason: z.string().describe('Brief reason for including this entry'),
      }),
      execute: async ({ index, reason }: { index: number; reason: string }) => {
        if (index < 0 || index >= entries.length) {
          return {
            success: false,
            error: `Entry index ${index} out of range (0-${entries.length - 1})`,
          }
        }

        onSelectEntry(index)
        const entry = entries[index]

        return {
          success: true,
          selected: {
            index,
            name: entry.name,
            type: entry.type,
          },
          reason,
        }
      },
    }),

    /**
     * Terminal tool to finish retrieval session.
     * Returns the final synthesis and signals completion.
     */
    finish_retrieval: tool({
      description:
        'Call this when you have finished gathering context. Provide a synthesis of your selections AND a summary of information learned from chapter queries.',
      inputSchema: z.object({
        synthesis: z
          .string()
          .describe('Explanation of why selected entries are relevant to the current context'),
        chapterSummary: z
          .string()
          .optional()
          .describe(
            'Summary of key information learned from chapter queries that is relevant to the current situation (character states, past events, relationships, etc.)',
          ),
        confidence: z.enum(['low', 'medium', 'high']).describe('Confidence level in the selection'),
        additionalContext: z
          .string()
          .optional()
          .describe('Any additional context notes for the narrative'),
      }),
      execute: async (args: {
        synthesis: string
        chapterSummary?: string
        confidence: 'low' | 'medium' | 'high'
        additionalContext?: string
      }) => {
        // This tool's execution signals completion of the retrieval loop
        return {
          completed: true,
          ...args,
        }
      },
    }),
  }
}

export type RetrievalTools = ReturnType<typeof createRetrievalTools>

import type { StoryEntry } from '$lib/types'

export interface ChapterBoundary {
  startIndex: number
  endIndex: number
  tokenCount: number
}

function estimateEntryTokens(entry: StoryEntry): number {
  const content = entry.content.trim()
  if (!content) return 0
  return Math.max(1, Math.ceil(content.length / 4))
}

/**
 * Plan deterministic chapter boundaries for imported history.
 * The protected tail buffer stays outside the chapterized range.
 */
export function planChapterBoundaries(
  entries: StoryEntry[],
  tokenThreshold: number,
  chapterBuffer: number,
  startIndex = 0,
): ChapterBoundary[] {
  const safeStartIndex = Math.max(0, startIndex)
  const safeThreshold = Math.max(1, Math.floor(tokenThreshold))
  const protectedTail = Math.max(0, Math.floor(chapterBuffer))
  const chapterableEnd = Math.max(safeStartIndex, entries.length - protectedTail)

  if (chapterableEnd <= safeStartIndex) return []

  const boundaries: ChapterBoundary[] = []
  let currentStart = safeStartIndex
  let runningTokens = 0

  for (let index = safeStartIndex; index < chapterableEnd; index++) {
    runningTokens += estimateEntryTokens(entries[index])
    const reachedThreshold = runningTokens >= safeThreshold
    const isLastAvailableEntry = index === chapterableEnd - 1

    if (reachedThreshold || isLastAvailableEntry) {
      boundaries.push({
        startIndex: currentStart,
        endIndex: index + 1,
        tokenCount: runningTokens,
      })
      currentStart = index + 1
      runningTokens = 0
    }
  }

  return boundaries
}

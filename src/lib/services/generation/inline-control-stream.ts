import {
  extractInlineControlTags,
  hasIncompleteInlineControlTag,
  type ParsedInlineControlTag,
} from '$lib/utils/inlineControlParser'

export interface InlineControlStreamUpdate {
  visibleContent: string
  completedTags: ParsedInlineControlTag[]
}

/** Buffers streamed text until control tags are complete, without exposing tag markup. */
export class InlineControlStreamBuffer {
  private content = ''
  private emittedTagKeys = new Set<string>()

  push(chunk: string): InlineControlStreamUpdate {
    this.content += chunk
    const completedTags = extractInlineControlTags(this.content).filter((tag) => {
      const key = `${tag.startIndex}:${tag.endIndex}:${tag.originalTag}`
      if (this.emittedTagKeys.has(key)) return false
      this.emittedTagKeys.add(key)
      return true
    })
    const incomplete = hasIncompleteInlineControlTag(this.content)
    const safeContent = incomplete.incomplete
      ? this.content.slice(0, incomplete.safeEnd)
      : this.content

    return {
      visibleContent: this.stripCompletedTags(safeContent),
      completedTags,
    }
  }

  flush(): InlineControlStreamUpdate {
    const update = this.push('')
    return {
      visibleContent: this.stripCompletedTags(this.content),
      completedTags: update.completedTags,
    }
  }

  reset(): void {
    this.content = ''
    this.emittedTagKeys.clear()
  }

  private stripCompletedTags(content: string): string {
    return content.replace(/<(roll|turn|scene|actor)\b[^>]*\/\s*>/gi, '')
  }
}

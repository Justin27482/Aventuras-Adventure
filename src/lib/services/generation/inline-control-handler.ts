import {
  extractInlineControlTags,
  stripInlineControlTags,
  validateInlineControlTags,
  type InlineControlValidationIssue,
  type ParsedInlineControlTag,
} from '$lib/utils/inlineControlParser'

export interface InlineControlIntent {
  tag: ParsedInlineControlTag
  kind: 'roll' | 'turn' | 'scene' | 'actor'
  notation?: string
  dc?: number | null
  reason?: string | null
  action?: string
  mode?: string
  actorId?: string
}

export interface InlineControlHandlingResult {
  narrative: string
  intents: InlineControlIntent[]
  issues: InlineControlValidationIssue[]
}

export interface InlineControlHandlerOptions {
  sceneModes?: readonly string[]
  actorIds?: readonly string[]
}

export function handleInlineControlTags(
  content: string,
  options: InlineControlHandlerOptions = {},
): InlineControlHandlingResult {
  const tags = extractInlineControlTags(content)
  const issues = validateInlineControlTags(tags, options)
  const invalidTags = new Set(issues.map((issue) => issue.tag.originalTag))
  const intents = tags
    .filter((tag) => !invalidTags.has(tag.originalTag))
    .map((tag): InlineControlIntent => {
      const attributes = tag.attributes
      const intent: InlineControlIntent = { tag, kind: tag.name }
      if (tag.name === 'roll') {
        intent.notation = attributes.notation || attributes.roll || attributes.dice || '1d20'
        const rawDc = attributes.dc || attributes.target || attributes.difficulty
        if (rawDc) {
          const parsedNum = Number(rawDc)
          if (Number.isFinite(parsedNum)) {
            intent.dc = parsedNum
          } else {
            const lower = rawDc.toLowerCase()
            if (lower === 'easy') intent.dc = 10
            else if (lower === 'medium' || lower === 'normal') intent.dc = 15
            else if (lower === 'hard') intent.dc = 18
            else if (lower === 'very hard' || lower === 'heroic') intent.dc = 22
            else intent.dc = null
          }
        } else {
          intent.dc = null
        }
        intent.reason = attributes.reason || attributes.for || attributes.cause || null
      } else if (tag.name === 'turn') {
        intent.action = attributes.action || attributes.turn
      } else if (tag.name === 'scene') {
        intent.mode = attributes.mode || attributes.scene || attributes.type
      } else {
        intent.actorId =
          attributes.id || attributes.actor || attributes.character || attributes.name
      }
      return intent
    })

  return {
    narrative: stripInlineControlTags(content),
    intents,
    issues,
  }
}

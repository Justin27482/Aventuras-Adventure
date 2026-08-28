export type InlineControlTagName = 'roll' | 'turn' | 'scene' | 'actor'

export interface ParsedInlineControlTag {
  name: InlineControlTagName
  originalTag: string
  startIndex: number
  endIndex: number
  attributes: Record<string, string>
}

export type InlineControlValidationIssue = {
  tag: ParsedInlineControlTag
  message: string
}

export interface InlineControlValidationOptions {
  sceneModes?: readonly string[]
  actorIds?: readonly string[]
}

const CONTROL_TAG_REGEX = /<(roll|turn|scene|actor)\b([^>]*?)(?:\/>|>\s*<\/\1>|>)/gi
const ATTRIBUTE_REGEX = /([a-zA-Z][\w-]*)\s*(?:=\s*(?:(["'])(.*?)\2|([^\s>]+)))?/gi

function parseAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  let match: RegExpExecArray | null
  const regex = /([a-zA-Z][\w-]*)\s*(?:=\s*(?:(["'])(.*?)\2|([^\s>]+)))?/gi
  while ((match = regex.exec(source)) !== null) {
    const key = match[1].toLowerCase()
    const val = match[3] ?? match[4] ?? ''
    attributes[key] = val
  }
  return attributes
}

export function parseDCValue(val: string | undefined): number | null {
  if (!val) return null
  const trimmed = val.trim().toLowerCase()
  if (!trimmed) return null
  if (trimmed === 'easy') return 10
  if (trimmed === 'medium' || trimmed === 'normal') return 15
  if (trimmed === 'hard') return 18
  if (trimmed === 'very hard' || trimmed === 'heroic') return 22
  const num = Number(trimmed)
  return Number.isFinite(num) ? num : null
}

export function extractInlineControlTags(content: string): ParsedInlineControlTag[] {
  const tags: ParsedInlineControlTag[] = []
  let match: RegExpExecArray | null

  while ((match = CONTROL_TAG_REGEX.exec(content)) !== null) {
    tags.push({
      name: match[1].toLowerCase() as InlineControlTagName,
      originalTag: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      attributes: parseAttributes(match[2]),
    })
  }

  return tags
}

export function validateInlineControlTags(
  tags: ParsedInlineControlTag[],
  options: InlineControlValidationOptions = {},
): InlineControlValidationIssue[] {
  const issues: InlineControlValidationIssue[] = []
  const sceneModes = options.sceneModes ?? []
  const actorIds = options.actorIds ?? []

  for (const tag of tags) {
    const attribute = (name: string) => tag.attributes[name]?.trim()
    if (tag.name === 'roll') {
      const notation = attribute('notation') || attribute('roll') || attribute('dice')
      if (!notation) {
        // We allow missing notation by defaulting to 1d20, so no issue needed
      }
      const rawDc = attribute('dc') || attribute('target') || attribute('difficulty')
      if (rawDc !== undefined && rawDc !== '' && parseDCValue(rawDc) === null) {
        issues.push({ tag, message: 'Roll dc must be a number or valid difficulty word.' })
      }
    }
    if (tag.name === 'scene') {
      const mode = attribute('mode') || attribute('scene') || attribute('type')
      if (!mode) issues.push({ tag, message: 'Scene tag requires mode.' })
      else if (sceneModes.length > 0 && !sceneModes.includes(mode)) {
        issues.push({ tag, message: `Unknown scene mode '${mode}'.` })
      }
    }
    if (tag.name === 'actor') {
      const id = attribute('id') || attribute('actor') || attribute('character') || attribute('name')
      if (!id) issues.push({ tag, message: 'Actor tag requires id.' })
      else if (
        actorIds.length > 0 &&
        !actorIds.includes(id) &&
        !actorIds.some((a) => a.toLowerCase() === id.toLowerCase())
      ) {
        issues.push({ tag, message: `Unknown actor '${id}'.` })
      }
    }
    if (tag.name === 'turn' && !attribute('action') && !attribute('turn')) {
      issues.push({ tag, message: 'Turn tag requires action.' })
    }
  }

  return issues
}

export function hasIncompleteInlineControlTag(content: string): {
  incomplete: boolean
  safeEnd: number
} {
  const lastOpen = content.lastIndexOf('<')
  if (lastOpen === -1) return { incomplete: false, safeEnd: content.length }

  const tail = content.slice(lastOpen)
  const nameMatch = tail.match(/^<(roll|turn|scene|actor)\b/i)
  if (!nameMatch) return { incomplete: false, safeEnd: content.length }
  if (/\/\s*>|>/.test(tail)) return { incomplete: false, safeEnd: content.length }

  return { incomplete: true, safeEnd: lastOpen }
}

export function stripInlineControlTags(content: string): string {
  return content.replace(CONTROL_TAG_REGEX, '')
}

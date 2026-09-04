/**
 * Detects out-of-character asides embedded inside otherwise in-character text
 * (narration prose or an AI Player's spoken/action dialogue) so the UI can
 * render the in-character content and each OOC aside as separate bubbles.
 *
 * Recognized markers: ((...)), (OOC: ...), [OOC: ...]. Plain single
 * parentheses without an "OOC" marker (e.g. "(quietly)") are left untouched.
 */

export interface InlineOOCExtraction {
  ic: string
  oocSegments: string[]
}

const DOUBLE_PAREN = /\(\(([\s\S]*?)\)\)/g
const OOC_PAREN = /\(\s*ooc\s*:?\s*([\s\S]*?)\)/gi
const OOC_BRACKET = /\[\s*ooc\s*:?\s*([\s\S]*?)\]/gi

function extractPattern(text: string, pattern: RegExp, collected: string[]): string {
  return text.replace(pattern, (_match, inner: string) => {
    const trimmed = inner.trim()
    if (trimmed) collected.push(trimmed)
    return ''
  })
}

function normalizeLineBreaks(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

export function extractInlineOOC(content: string): InlineOOCExtraction {
  const oocSegments: string[] = []
  let ic = normalizeLineBreaks(content)
  ic = extractPattern(ic, DOUBLE_PAREN, oocSegments)
  ic = extractPattern(ic, OOC_PAREN, oocSegments)
  ic = extractPattern(ic, OOC_BRACKET, oocSegments)
  ic = ic
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { ic, oocSegments }
}

import { parseMarkdown, parseInlineMarkdown } from '$lib/utils/markdown'
import type { ReadingWindowFormattingSettings } from '$lib/types'

const QUOTE_TOKEN_PREFIX = '@@RWQ'
const ANGLE_TOKEN_PREFIX = '@@RWA'

export interface ReadingWindowFormattingTokens {
  text: string
  replacements: Map<string, string>
}

export function encodeReadingWindowFormatting(text: string): ReadingWindowFormattingTokens {
  const replacements = new Map<string, string>()
  let tokenIndex = 0

  const replaceWithSpan = (pattern: RegExp, prefix: string, className: string, input: string) =>
    input.replace(pattern, (_match, inner: string) => {
      if (prefix === ANGLE_TOKEN_PREFIX && inner.trim().toLowerCase().startsWith('pic')) {
        return _match
      }

      const token = `${prefix}${tokenIndex++}@@`
      replacements.set(
        token,
        `<span class="reading-window-format ${className}">${parseInlineMarkdown(inner)}</span>`,
      )
      return token
    })

  let transformed = text
  transformed = replaceWithSpan(
    /<([^<>\n]+)>/g,
    ANGLE_TOKEN_PREFIX,
    'reading-window-angle-bracket',
    transformed,
  )
  transformed = transformed.replace(
    /"{1,2}([^"\n]+)"{1,2}|“([^”\n]+)”/g,
    (match, straight, curly) => {
      const inner = straight ?? curly
      const openingQuote = match.startsWith('“') ? '“' : '"'
      const closingQuote = match.endsWith('”') ? '”' : '"'
      const token = `${QUOTE_TOKEN_PREFIX}${tokenIndex++}@@`
      replacements.set(
        token,
        `<span class="reading-window-format reading-window-quote">${openingQuote}${parseInlineMarkdown(inner)}${closingQuote}</span>`,
      )
      return token
    },
  )

  return { text: transformed, replacements }
}

export function restoreReadingWindowFormatting(
  html: string,
  replacements: Map<string, string>,
): string {
  let output = html
  for (const [token, replacement] of Array.from(replacements.entries()).reverse()) {
    output = output.replaceAll(token, replacement)
  }
  return output
}

export function getReadingWindowStyleVars(settings: ReadingWindowFormattingSettings): string {
  return [
    `--reading-window-main-text: ${settings.mainText}`,
    `--reading-window-italics-text: ${settings.italicsText}`,
    `--reading-window-double-asterisk-text: ${settings.doubleAsteriskText}`,
    `--reading-window-quote-text: ${settings.quoteText}`,
    `--reading-window-angle-bracket-text: ${settings.angleBracketText}`,
  ].join('; ')
}

export function renderReadingWindowContent(text: string): string {
  if (!text) return ''

  const encoded = encodeReadingWindowFormatting(text)
  const rendered = parseMarkdown(encoded.text)
  return restoreReadingWindowFormatting(rendered, encoded.replacements)
}

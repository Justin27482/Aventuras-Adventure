import type { SmartLoraCatalogEntry, VisualDescriptors } from '$lib/types'

export type LoraSelection = {
  name: string
  strengthModel: number
  strengthClip: number
  reason: string
}

type CharacterLike = {
  name?: string
  description?: string | null
  traits?: string[]
  visualDescriptors?: VisualDescriptors
}

function parseAge(text: string): number | null {
  const lower = text.toLowerCase()

  const explicit = lower.match(
    /\b(\d{1,2})(?:\s*-\s*(\d{1,2}))?\s*(?:years?\s*old|year-old|yo|y\/o|aged?)\b/,
  )
  if (explicit) {
    const first = Number(explicit[1])
    const second = explicit[2] ? Number(explicit[2]) : null
    if (Number.isFinite(first) && first > 0) {
      if (second && Number.isFinite(second) && second > 0) {
        return Math.round((first + second) / 2)
      }
      return first
    }
  }

  const decade = lower.match(/\b(\d{2})s\b/)
  if (decade) {
    const decadeStart = Number(decade[1])
    if (Number.isFinite(decadeStart) && decadeStart > 0) {
      return decadeStart + 5
    }
  }

  if (/\bteen(?:ager)?s?\b/.test(lower)) return 18
  if (/\byoung adult\b/.test(lower)) return 22
  if (/\bmiddle[- ]aged\b/.test(lower)) return 45

  return null
}

function buildCharacterCorpus(character?: CharacterLike): string {
  if (!character) return ''
  const descriptors = character.visualDescriptors
  return [
    character.name ?? '',
    character.description ?? '',
    ...(character.traits ?? []),
    descriptors?.face ?? '',
    descriptors?.hair ?? '',
    descriptors?.eyes ?? '',
    descriptors?.build ?? '',
    descriptors?.clothing ?? '',
    descriptors?.accessories ?? '',
    descriptors?.distinguishing ?? '',
  ]
    .join(' ')
    .toLowerCase()
}

export function selectSmartLoras(options: {
  catalog: SmartLoraCatalogEntry[]
  profileId: string | null
  prompt: string
  character?: CharacterLike
  maxAutoLoras: number
}): LoraSelection[] {
  const { catalog, profileId, prompt, character, maxAutoLoras } = options
  if (!profileId || maxAutoLoras <= 0) return []

  const promptCorpus = prompt.toLowerCase()
  const characterCorpus = buildCharacterCorpus(character)
  const combinedCorpus = `${promptCorpus} ${characterCorpus}`
  const inferredAge = parseAge(characterCorpus)

  const ranked = catalog
    .filter((entry) => entry.enabled)
    .filter((entry) => entry.profileId === null || entry.profileId === profileId)
    .filter((entry) => {
      if (entry.minAge === null && entry.maxAge === null) return true
      if (inferredAge === null) return false
      if (entry.minAge !== null && inferredAge < entry.minAge) return false
      if (entry.maxAge !== null && inferredAge > entry.maxAge) return false
      return true
    })
    .map((entry) => {
      const tagMatches = entry.tags.filter((tag) =>
        combinedCorpus.includes(tag.toLowerCase()),
      ).length
      const descriptionMatches = entry.description
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length > 2 && combinedCorpus.includes(token)).length

      const score = entry.priority + tagMatches * 3 + descriptionMatches
      return { entry, score, tagMatches, descriptionMatches }
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)

  return ranked.slice(0, maxAutoLoras).map(({ entry, tagMatches, descriptionMatches }) => {
    const reasonParts: string[] = []
    if (entry.minAge !== null || entry.maxAge !== null) {
      reasonParts.push(`age match${inferredAge !== null ? ` (${inferredAge})` : ''}`)
    }
    if (tagMatches > 0) reasonParts.push(`tag matches: ${tagMatches}`)
    if (descriptionMatches > 0) reasonParts.push(`description matches: ${descriptionMatches}`)
    if (reasonParts.length === 0) reasonParts.push('priority match')

    return {
      name: entry.loraName,
      strengthModel: entry.strengthModel,
      strengthClip: entry.strengthClip,
      reason: reasonParts.join(', '),
    }
  })
}

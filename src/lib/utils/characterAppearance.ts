import type { Character, Item, VisualDescriptors } from '$lib/types'
import { formatDescriptorsForPrompt } from './visualDescriptors'

type ClothingMetadata = {
  isClothing?: boolean
  coveredZones?: string[]
  exposedZones?: string[]
  durability?: number
  maxDurability?: number
  unusable?: boolean
}

function getClothingMetadata(item: Item): ClothingMetadata {
  const clothing = item.metadata?.clothing
  return clothing && typeof clothing === 'object' ? (clothing as ClothingMetadata) : {}
}

function isEquippedClothingForCharacter(item: Item, characterId: string): boolean {
  if (item.ownerCharacterId !== characterId || !item.equipped || item.location !== 'inventory') {
    return false
  }
  const clothing = getClothingMetadata(item)
  return clothing.isClothing === true
}

function formatOutfitItem(item: Item): string {
  const clothing = getClothingMetadata(item)
  const condition: string[] = []
  if (clothing.unusable || clothing.durability === 0) condition.push('unusable')
  else if (
    clothing.durability !== undefined &&
    clothing.maxDurability !== undefined &&
    clothing.durability < clothing.maxDurability
  ) {
    condition.push(`worn (${clothing.durability}/${clothing.maxDurability})`)
  }
  if (clothing.exposedZones?.length) condition.push(`exposed at ${clothing.exposedZones.join(', ')}`)

  const description = item.description?.trim()
  return `${item.name}${description ? ` (${description})` : ''}${condition.length ? ` [${condition.join('; ')}]` : ''}`
}

/**
 * Builds prompt-ready appearance for one character.
 * Static descriptors remain the character's baseline identity; their current outfit is
 * derived from that character's owned, equipped clothing so equipment changes stay current.
 */
export function formatCharacterAppearance(
  character: Pick<Character, 'id' | 'visualDescriptors'>,
  items: Item[],
): string {
  const baseline = formatDescriptorsForPrompt(character.visualDescriptors)
  const outfit = items
    .filter((item) => isEquippedClothingForCharacter(item, character.id))
    .map(formatOutfitItem)

  if (outfit.length === 0) return baseline
  const sections = [baseline && `Baseline appearance: ${baseline}`, `Current outfit: ${outfit.join('; ')}`]
  return sections.filter(Boolean).join('\n  ')
}

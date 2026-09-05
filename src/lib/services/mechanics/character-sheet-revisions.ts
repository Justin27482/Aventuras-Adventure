import type { CharacterSheet, CharacterSheetRevision } from '$lib/types'

export interface CreateCharacterSheetRevisionInput {
  id?: string
  sheet: CharacterSheet
  parentRevisionId?: string | null
  authorType: CharacterSheetRevision['authorType']
  authorAIPlayerId?: string | null
  source: string
  createdAt?: number
}

export function createCharacterSheetRevisionSnapshot(
  input: CreateCharacterSheetRevisionInput,
): CharacterSheetRevision {
  const authorAIPlayerId = input.authorAIPlayerId ?? null
  if (
    (input.authorType === 'gm' && authorAIPlayerId !== null) ||
    (input.authorType === 'ai_player' && authorAIPlayerId === null)
  ) {
    throw new Error('Character sheet revision author metadata is inconsistent')
  }
  const source = input.source.trim()
  if (!source) throw new Error('Character sheet revision source is required')

  return {
    id: input.id ?? crypto.randomUUID(),
    characterId: input.sheet.characterId,
    parentRevisionId: input.parentRevisionId ?? null,
    authorType: input.authorType,
    authorAIPlayerId,
    source,
    snapshot: structuredClone(input.sheet),
    createdAt: input.createdAt ?? Date.now(),
  }
}

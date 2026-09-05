import type {
  Character,
  CharacterSheet,
  CharacterSheetDraft,
  CharacterSheetProposal,
  CharacterSheetRevision,
  FullRuleset,
} from '$lib/types'
import { database } from '$lib/services/database'
import { createCharacterSheetRevisionSnapshot } from './character-sheet-revisions'

export function validateCharacterSheetDraft(
  draft: CharacterSheetDraft,
  ruleset: FullRuleset,
): void {
  if (!draft.name.trim()) throw new Error('Character name is required')
  if (draft.sheet.rulesetId !== ruleset.ruleset.id)
    throw new Error('Character sheet ruleset does not match')
  const stats = new Map(ruleset.stats.map((stat) => [stat.key, stat]))
  for (const [key, value] of Object.entries(draft.sheet.statValues)) {
    const stat = stats.get(key)
    if (!stat) throw new Error(`Unknown stat ${key}`)
    const minValue = stat.minValue ?? Number.NEGATIVE_INFINITY
    const maxValue = stat.maxValue ?? Number.POSITIVE_INFINITY
    if (!Number.isFinite(value) || value < minValue || value > maxValue) {
      throw new Error(`${stat.label} must be between ${minValue} and ${maxValue}`)
    }
  }
  const resourceKeys = new Set(ruleset.resources.map((resource) => resource.key))
  for (const [key, value] of Object.entries(draft.sheet.resourceValues)) {
    if (!resourceKeys.has(key)) throw new Error(`Unknown resource ${key}`)
    if (value.max < 0 || value.current < 0 || value.current > value.max) {
      throw new Error(`Resource ${key} must remain between zero and its maximum`)
    }
  }
  const conditionKeys = new Set(ruleset.conditions.map((condition) => condition.key))
  for (const key of Object.keys(draft.sheet.conditionStates)) {
    if (!conditionKeys.has(key)) throw new Error(`Unknown condition ${key}`)
  }
}

export class CharacterSheetEditorService {
  async saveGMEdit(input: {
    character: Character
    sheet: CharacterSheet
    ruleset: FullRuleset
    parentRevisionId?: string | null
    source: string
  }): Promise<CharacterSheetRevision> {
    validateCharacterSheetDraft(
      {
        name: input.character.name,
        description: input.character.description ?? '',
        traits: input.character.traits,
        visualDescriptors: input.character.visualDescriptors,
        sheet: {
          rulesetId: input.sheet.rulesetId,
          statValues: input.sheet.statValues,
          resourceValues: input.sheet.resourceValues,
          conditionStates: input.sheet.conditionStates,
          level: input.sheet.level,
          xp: input.sheet.xp,
        },
      },
      input.ruleset,
    )
    const revision = createCharacterSheetRevisionSnapshot({
      sheet: input.sheet,
      parentRevisionId: input.parentRevisionId,
      authorType: 'gm',
      source: input.source,
    })
    await database.saveGMCharacterSheetEdit(input.character, input.sheet, revision)
    return revision
  }

  async approveProposal(input: {
    proposal: CharacterSheetProposal
    editedDraft: CharacterSheetDraft
    storyId: string
    ruleset: FullRuleset
  }): Promise<{ characterId: string; revisionId: string }> {
    if (input.proposal.status !== 'pending')
      throw new Error('Only pending proposals can be approved')
    validateCharacterSheetDraft(input.editedDraft, input.ruleset)
    return database.approveCharacterSheetProposal(input.proposal, input.editedDraft, input.storyId)
  }

  async declineProposal(proposal: CharacterSheetProposal, notes?: string): Promise<void> {
    await database.upsertCharacterSheetProposal({
      ...proposal,
      status: 'declined',
      reviewNotes: notes?.trim() || null,
      reviewedAt: Date.now(),
    })
  }
}

export const characterSheetEditorService = new CharacterSheetEditorService()

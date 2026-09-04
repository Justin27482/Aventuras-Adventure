import type { CharacterSheetDraft } from '$lib/types'

export function copyCharacterSheetDraft(draft: CharacterSheetDraft): CharacterSheetDraft {
  return {
    name: draft.name,
    description: draft.description,
    traits: [...draft.traits],
    visualDescriptors: { ...draft.visualDescriptors },
    sheet: {
      rulesetId: draft.sheet.rulesetId,
      statValues: { ...draft.sheet.statValues },
      resourceValues: Object.fromEntries(
        Object.entries(draft.sheet.resourceValues).map(([key, value]) => [key, { ...value }]),
      ),
      conditionStates: Object.fromEntries(
        Object.entries(draft.sheet.conditionStates).map(([key, value]) => [key, { ...value }]),
      ),
      level: draft.sheet.level,
      xp: draft.sheet.xp,
    },
  }
}
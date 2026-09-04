import type { RulesetAbility } from '$lib/types'

export const SCENE_RELEVANCE_OPTIONS = [
  'combat',
  'social',
  'dungeon',
  'exploration',
  'travel',
  'settlement',
  'camp',
  'downtime',
] as const

export function normalizeSceneRelevance(values?: string[] | null): string[] {
  if (!Array.isArray(values)) return []

  return [...new Set(values.map((value) => value.trim()).filter(Boolean).map((value) => value.toLowerCase()))]
}

export function filterAbilitiesForScene(
  abilities: RulesetAbility[],
  sceneMode: string,
): RulesetAbility[] {
  const normalizedScene = sceneMode.trim().toLowerCase()
  if (!normalizedScene) return abilities

  return abilities.filter((ability) => {
    const relevance = normalizeSceneRelevance(ability.sceneRelevance)
    return relevance.length === 0 || relevance.some((scene) => scene === normalizedScene)
  })
}

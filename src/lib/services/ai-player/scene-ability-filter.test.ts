import { describe, expect, it } from 'vitest'
import type { RulesetAbility } from '$lib/types'
import {
  SCENE_RELEVANCE_OPTIONS,
  filterAbilitiesForScene,
  normalizeSceneRelevance,
} from './scene-ability-filter'

function ability(key: string, sceneRelevance?: string[]): RulesetAbility {
  return {
    id: key,
    rulesetId: 'ruleset-1',
    key,
    label: key,
    description: null,
    resourceKey: null,
    resourceCost: 0,
    sceneRelevance,
    sortOrder: 0,
  }
}

describe('filterAbilitiesForScene', () => {
  it('keeps scene-relevant abilities and legacy untagged abilities', () => {
    expect(
      filterAbilitiesForScene(
        [ability('persuade', ['social']), ability('fireball', ['combat']), ability('legacy')],
        'social',
      ).map((item) => item.key),
    ).toEqual(['persuade', 'legacy'])
  })

  it('matches scene names case-insensitively', () => {
    expect(
      filterAbilitiesForScene([ability('travel', ['Travel'])], ' travel ').map((item) => item.key),
    ).toEqual(['travel'])
  })

  it('normalizes multi-select scene tags and exposes the allowed options', () => {
    expect(normalizeSceneRelevance(['Combat', ' social ', 'combat'])).toEqual(['combat', 'social'])
    expect(SCENE_RELEVANCE_OPTIONS).toContain('combat')
    expect(SCENE_RELEVANCE_OPTIONS).toContain('social')
  })

  it('returns all abilities when no scene is known', () => {
    const abilities = [ability('a', ['combat']), ability('b', ['social'])]
    expect(filterAbilitiesForScene(abilities, '')).toBe(abilities)
  })
})

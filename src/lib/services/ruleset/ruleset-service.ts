/**
 * Ruleset Service (Phase 2, task 2.4)
 *
 * Seeds built-in ruleset templates and provides accessors for loading a
 * ruleset's full structural definition. Mirrors the pack-service pattern:
 * idempotent seeding, safe to call repeatedly.
 */

import { database } from '$lib/services/database'
import type { FullRuleset, Ruleset } from '$lib/types'
import { BUILTIN_RULESETS, type BuiltinRulesetSeed } from './builtin-rulesets'

class RulesetService {
  private initialized = false

  /** Seed all built-in rulesets. Call on app startup after database is ready. */
  async initialize(): Promise<void> {
    if (this.initialized) return
    for (const seed of BUILTIN_RULESETS) {
      await this.seedRuleset(seed)
    }
    this.initialized = true
  }

  private async seedRuleset(seed: BuiltinRulesetSeed): Promise<void> {
    const now = Date.now()
    await database.upsertRuleset({
      id: seed.id,
      name: seed.name,
      description: seed.description,
      isBuiltin: true,
      diceSystem: seed.diceSystem,
      defaultCheckRuleKey: seed.defaultCheckRuleKey,
      createdAt: now,
      updatedAt: now,
    })

    await Promise.all([
      ...seed.stats.map((stat, sortOrder) =>
        database.upsertRulesetStat({
          id: crypto.randomUUID(),
          rulesetId: seed.id,
          key: stat.key,
          label: stat.label,
          defaultValue: stat.defaultValue,
          minValue: stat.minValue,
          maxValue: stat.maxValue,
          sortOrder,
        }),
      ),
      ...seed.skills.map((skill, sortOrder) =>
        database.upsertRulesetSkill({
          id: crypto.randomUUID(),
          rulesetId: seed.id,
          key: skill.key,
          label: skill.label,
          governingStatKey: skill.governingStatKey,
          sortOrder,
        }),
      ),
      ...seed.checkRules.map((rule, sortOrder) =>
        database.upsertRulesetCheckRule({
          id: crypto.randomUUID(),
          rulesetId: seed.id,
          key: rule.key,
          label: rule.label,
          notation: rule.notation,
          criticalSuccessThreshold: rule.criticalSuccessThreshold,
          criticalFailureThreshold: rule.criticalFailureThreshold,
          outcomeBands: rule.outcomeBands,
          sortOrder,
        }),
      ),
      ...seed.conditions.map((condition, sortOrder) =>
        database.upsertRulesetCondition({
          id: crypto.randomUUID(),
          rulesetId: seed.id,
          key: condition.key,
          label: condition.label,
          description: condition.description,
          sortOrder,
        }),
      ),
      ...seed.slots.map((slot, sortOrder) =>
        database.upsertRulesetSlot({
          id: crypto.randomUUID(),
          rulesetId: seed.id,
          key: slot.key,
          label: slot.label,
          sortOrder,
        }),
      ),
      ...seed.abilities.map((ability, sortOrder) =>
        database.upsertRulesetAbility({
          id: crypto.randomUUID(),
          rulesetId: seed.id,
          key: ability.key,
          label: ability.label,
          description: ability.description,
          resourceKey: ability.resourceKey,
          resourceCost: ability.resourceCost,
          sortOrder,
        }),
      ),
      ...seed.levels.map((level) =>
        database.upsertRulesetLevel({
          id: crypto.randomUUID(),
          rulesetId: seed.id,
          level: level.level,
          label: level.label,
          xpThreshold: level.xpThreshold,
          statBonuses: null,
        }),
      ),
      ...seed.resources.map((resource, sortOrder) =>
        database.upsertRulesetResource({
          id: crypto.randomUUID(),
          rulesetId: seed.id,
          key: resource.key,
          label: resource.label,
          maxFormula: resource.maxFormula,
          minValue: resource.minValue,
          sortOrder,
        }),
      ),
    ])
  }

  async getAllRulesets(): Promise<Ruleset[]> {
    return database.getAllRulesets()
  }

  async getFullRuleset(id: string): Promise<FullRuleset | null> {
    const rulesetRow = await database.getRuleset(id)
    if (!rulesetRow) return null

    const [stats, skills, checkRules, conditions, slots, abilities, levels, resources] =
      await Promise.all([
        database.getRulesetStats(id),
        database.getRulesetSkills(id),
        database.getRulesetCheckRules(id),
        database.getRulesetConditions(id),
        database.getRulesetSlots(id),
        database.getRulesetAbilities(id),
        database.getRulesetLevels(id),
        database.getRulesetResources(id),
      ])

    return { ruleset: rulesetRow, stats, skills, checkRules, conditions, slots, abilities, levels, resources }
  }
}

export const rulesetService = new RulesetService()

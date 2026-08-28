import { rulesetService } from '$lib/services/ruleset/ruleset-service'
import type { FullRuleset, Ruleset } from '$lib/types'

class RulesetStore {
  all = $state<Ruleset[]>([])
  current = $state<FullRuleset | null>(null)
  loaded = $state(false)
  error = $state<string | null>(null)

  /** Seeds built-ins (idempotent) and loads the list of all available rulesets. */
  async loadAll(): Promise<void> {
    this.error = null
    try {
      await rulesetService.initialize()
      this.all = await rulesetService.getAllRulesets()
      this.loaded = true
    } catch (reason) {
      this.error = reason instanceof Error ? reason.message : 'Failed to load rulesets'
      this.loaded = false
      throw reason
    }
  }

  /** Loads a campaign's active ruleset definition, or clears it if none assigned. */
  async loadForCampaign(rulesetId: string | null): Promise<void> {
    if (!rulesetId) {
      this.current = null
      return
    }
    this.current = await rulesetService.getFullRuleset(rulesetId)
  }

  reset(): void {
    this.current = null
  }
}

export const ruleset = new RulesetStore()

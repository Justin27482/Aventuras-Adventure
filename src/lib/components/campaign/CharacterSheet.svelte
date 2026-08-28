<script lang="ts">
  import { onMount } from 'svelte'
  import { campaign } from '$lib/stores/campaign.svelte'
  import { story } from '$lib/stores/story.svelte'
  import { rulesetService } from '$lib/services/ruleset/ruleset-service'
  import { mechanicsService } from '$lib/services/mechanics'
  import type { CharacterSheet, FullRuleset } from '$lib/types'
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card'
  import { Button } from '$lib/components/ui/button'
  import { Badge } from '$lib/components/ui/badge'
  import { Shield, Zap, Plus, Minus, Flame, Heart } from 'lucide-svelte'

  interface Props {
    characterId: string
  }

  let { characterId }: Props = $props()

  let fullRuleset = $state<FullRuleset | null>(null)
  let sheet = $state<CharacterSheet | null>(null)
  let isLoading = $state(false)
  let error = $state<string | null>(null)

  const character = $derived(story.characters.find((c) => c.id === characterId) ?? null)
  const ownedItems = $derived(story.items.filter((item) => item.ownerCharacterId === characterId))
  const equippedItems = $derived(ownedItems.filter((item) => item.equipped))
  const carriedItems = $derived(ownedItems.filter((item) => !item.equipped && item.location === 'inventory'))

  async function loadSheet() {
    if (!campaign.current?.rulesetId) return
    isLoading = true
    error = null
    try {
      const rs = await rulesetService.getFullRuleset(campaign.current.rulesetId)
      fullRuleset = rs
      if (rs) {
        sheet = await mechanicsService.getOrCreateSheet(characterId, rs)
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load character sheet'
    } finally {
      isLoading = false
    }
  }

  async function adjustResource(resourceKey: string, delta: number) {
    if (!sheet) return
    try {
      sheet = await mechanicsService.applyResourceDelta(characterId, resourceKey, delta)
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to adjust resource'
    }
  }

  async function toggleCondition(conditionKey: string, active: boolean) {
    if (!sheet) return
    try {
      sheet = await mechanicsService.setCondition(characterId, conditionKey, !active)
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to toggle condition'
    }
  }

  onMount(() => {
    void loadSheet()
  })

  $effect(() => {
    if (characterId && campaign.current?.rulesetId) {
      void loadSheet()
    }
  })
</script>

<div class="space-y-4">
  {#if error}
    <p class="text-destructive rounded-md border border-destructive/30 p-2 text-xs">{error}</p>
  {/if}

  {#if sheet && fullRuleset && character}
    <Card>
      <CardHeader class="px-3 py-2">
        <div class="flex items-center justify-between">
          <CardTitle class="flex items-center gap-2 text-base">
            <Shield class="text-primary h-4 w-4" />
            {character.name}
          </CardTitle>
          <div class="flex items-center gap-1.5">
            <Badge variant="outline" class="text-xs">Level {sheet.level}</Badge>
            <Badge variant="secondary" class="text-xs">{sheet.xp} XP</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent class="space-y-4 px-3 pb-3">
        <!-- Stats Grid -->
        {#if fullRuleset.stats.length > 0}
          <div class="grid grid-cols-3 gap-2">
            {#each fullRuleset.stats as stat (stat.id)}
              {@const val = sheet.statValues[stat.key] ?? stat.defaultValue}
              <div class="rounded border border-border/50 bg-muted/20 p-2 text-center">
                <span class="text-muted-foreground block text-[10px] uppercase font-semibold">{stat.label}</span>
                <span class="text-foreground text-sm font-bold tabular-nums">{val}</span>
              </div>
            {/each}
          </div>
        {/if}

        <!-- Resources -->
        {#if fullRuleset.resources.length > 0}
          <div class="space-y-2">
            <h4 class="text-muted-foreground text-xs font-semibold uppercase tracking-wider">Resources</h4>
            {#each fullRuleset.resources as res (res.id)}
              {@const currentRes = sheet.resourceValues[res.key] ?? { current: 0, max: 0 }}
              <div class="rounded-md border border-border/40 p-2 text-xs space-y-1">
                <div class="flex items-center justify-between">
                  <span class="font-medium text-foreground">{res.label}</span>
                  <span class="font-semibold tabular-nums">{currentRes.current} / {currentRes.max}</span>
                </div>
                <div class="flex items-center gap-2 pt-1">
                  <Button variant="outline" size="icon" class="h-6 w-6" onclick={() => adjustResource(res.key, -1)}>
                    <Minus class="h-3 w-3" />
                  </Button>
                  <Button variant="outline" size="icon" class="h-6 w-6" onclick={() => adjustResource(res.key, 1)}>
                    <Plus class="h-3 w-3" />
                  </Button>
                </div>
              </div>
            {/each}
          </div>
        {/if}

        <!-- Conditions -->
        {#if fullRuleset.conditions.length > 0}
          <div class="space-y-2">
            <h4 class="text-muted-foreground text-xs font-semibold uppercase tracking-wider">Conditions</h4>
            <div class="flex flex-wrap gap-1.5">
              {#each fullRuleset.conditions as cond (cond.id)}
                {@const condState = sheet.conditionStates[cond.key]?.active ?? false}
                <Button
                  variant={condState ? 'default' : 'outline'}
                  size="sm"
                  class="h-7 text-xs"
                  onclick={() => toggleCondition(cond.key, condState)}
                >
                  {cond.label}
                </Button>
              {/each}
            </div>
          </div>
        {/if}

        <div class="space-y-2">
          <h4 class="text-muted-foreground text-xs font-semibold uppercase tracking-wider">Inventory & Clothing</h4>
          {#if ownedItems.length === 0}
            <p class="text-muted-foreground rounded-md border border-border/40 p-2 text-xs italic">No owned items.</p>
          {:else}
            <div class="grid gap-2 sm:grid-cols-2">
              <div class="rounded-md border border-border/40 p-2">
                <div class="mb-1 flex items-center justify-between text-xs">
                  <span class="font-medium text-foreground">Equipped</span>
                  <Badge variant="outline" class="text-[10px]">{equippedItems.length}</Badge>
                </div>
                {#if equippedItems.length > 0}
                  <ul class="space-y-1 text-xs text-muted-foreground">
                    {#each equippedItems as item (item.id)}
                      <li class="flex items-center justify-between gap-2">
                        <span class="truncate">{item.name}</span>
                        <span class="shrink-0 text-[10px]">x{item.quantity}</span>
                      </li>
                    {/each}
                  </ul>
                {:else}
                  <p class="text-[11px] italic text-muted-foreground/70">Nothing equipped.</p>
                {/if}
              </div>
              <div class="rounded-md border border-border/40 p-2">
                <div class="mb-1 flex items-center justify-between text-xs">
                  <span class="font-medium text-foreground">Carried</span>
                  <Badge variant="outline" class="text-[10px]">{carriedItems.length}</Badge>
                </div>
                {#if carriedItems.length > 0}
                  <ul class="space-y-1 text-xs text-muted-foreground">
                    {#each carriedItems as item (item.id)}
                      <li class="flex items-center justify-between gap-2">
                        <span class="truncate">{item.name}</span>
                        <span class="shrink-0 text-[10px]">x{item.quantity}</span>
                      </li>
                    {/each}
                  </ul>
                {:else}
                  <p class="text-[11px] italic text-muted-foreground/70">No carried items.</p>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      </CardContent>
    </Card>
  {:else if isLoading}
    <p class="text-muted-foreground text-xs">Loading character sheet...</p>
  {:else}
    <p class="text-muted-foreground rounded-md border p-3 text-sm">
      Character sheet unavailable for this character.
    </p>
  {/if}
</div>

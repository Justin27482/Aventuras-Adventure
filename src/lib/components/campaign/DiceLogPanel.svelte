<script lang="ts">
  import { onMount } from 'svelte'
  import { campaign } from '$lib/stores/campaign.svelte'
  import { database } from '$lib/services/database'
  import type { RollLedgerEntry, RollStats } from '$lib/types'
  import RollCard from './RollCard.svelte'
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card'
  import { Button } from '$lib/components/ui/button'
  import { Dice5, RefreshCw, BarChart2 } from 'lucide-svelte'

  let rolls = $state<RollLedgerEntry[]>([])
  let stats = $state<RollStats | null>(null)
  let isLoading = $state(false)

  async function loadRollHistory() {
    if (!campaign.current) return
    isLoading = true
    try {
      const [history, rollStats] = await Promise.all([
        database.getRollLedger(campaign.current.id, { limit: 30 }),
        database.getRollStats(campaign.current.id),
      ])
      rolls = history
      stats = rollStats
    } catch (err) {
      console.warn('[DiceLogPanel] Failed to load roll history:', err)
    } finally {
      isLoading = false
    }
  }

  onMount(() => {
    void loadRollHistory()
  })

  $effect(() => {
    if (campaign.current?.id) void loadRollHistory()
  })
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <Dice5 class="text-primary h-5 w-5" />
      <h2 class="text-foreground text-lg font-semibold">Dice Roll History</h2>
    </div>
    <Button variant="outline" size="sm" class="gap-1.5 text-xs" onclick={loadRollHistory} disabled={isLoading}>
      <RefreshCw class={isLoading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
      Refresh
    </Button>
  </div>

  {#if stats && stats.count > 0}
    <Card>
      <CardHeader class="px-3 py-2">
        <CardTitle class="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <BarChart2 class="h-4 w-4 text-primary" />
          Roll Dashboard
        </CardTitle>
      </CardHeader>
      <CardContent class="grid grid-cols-3 gap-2 px-3 pb-3 text-center text-xs">
        <div class="rounded bg-muted/30 p-2">
          <span class="text-muted-foreground block text-[10px]">Total Rolls</span>
          <span class="text-foreground font-bold">{stats.count}</span>
        </div>
        <div class="rounded bg-muted/30 p-2">
          <span class="text-muted-foreground block text-[10px]">Average</span>
          <span class="text-foreground font-bold">{stats.average.toFixed(1)}</span>
        </div>
        <div class="rounded bg-muted/30 p-2">
          <span class="text-muted-foreground block text-[10px]">Min / Max</span>
          <span class="text-foreground font-bold">{stats.min} / {stats.max}</span>
        </div>
      </CardContent>
    </Card>
  {/if}

  {#if rolls.length > 0}
    <div class="space-y-2">
      {#each rolls as roll (roll.id)}
        <RollCard entry={roll} compact={true} />
      {/each}
    </div>
  {:else}
    <p class="text-muted-foreground rounded-md border p-3 text-sm">
      No rolls logged for this campaign yet.
    </p>
  {/if}
</div>

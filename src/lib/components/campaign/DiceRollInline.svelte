<script lang="ts">
  import { roll } from '$lib/services/dice'
  import { campaign } from '$lib/stores/campaign.svelte'
  import { Badge } from '$lib/components/ui/badge'
  import { Button } from '$lib/components/ui/button'
  import { Dice5, CheckCircle2, XCircle, Sparkles, RefreshCw } from 'lucide-svelte'
  import { cn } from '$lib/utils/cn'
  import type { RollLedgerEntry } from '$lib/types'

  interface Props {
    notation?: string
    dc?: number | null
    reason?: string
    actorId?: string | null
    actorName?: string
    compact?: boolean
    onRollComplete?: (entry: RollLedgerEntry) => void
  }

  let {
    notation = '1d20',
    dc = null,
    reason = 'Inline Check',
    actorId = null,
    actorName,
    compact = false,
    onRollComplete,
  }: Props = $props()

  let isRolling = $state(false)
  let lastResult = $state<RollLedgerEntry | null>(null)

  async function handleRoll() {
    if (!campaign.current) return
    isRolling = true
    try {
      const res = await roll({
        campaignId: campaign.current.id,
        sessionId: campaign.activeSession?.id ?? null,
        actorId: actorId ?? campaign.sceneTurnState?.activeActorId ?? null,
        notation,
        dc,
        reason,
        visibility: 'director_only',
      })
      lastResult = res.entry
      onRollComplete?.(res.entry)
    } catch (err) {
      console.error('[DiceRollInline] Roll failed:', err)
    } finally {
      isRolling = false
    }
  }

  function outcomeColor(outcome: string | null): string {
    if (!outcome) return 'text-muted-foreground border-border'
    if (outcome === 'critical_success') return 'text-emerald-400 border-emerald-500/50 bg-emerald-500/10'
    if (outcome === 'success') return 'text-green-400 border-green-500/40 bg-green-500/10'
    if (outcome === 'critical_failure') return 'text-red-400 border-red-500/50 bg-red-500/10'
    if (outcome === 'failure') return 'text-rose-400 border-rose-500/40 bg-rose-500/10'
    return 'text-amber-400 border-amber-500/40 bg-amber-500/10'
  }
</script>

<div class={cn('inline-flex items-center gap-2 rounded-md border border-border/60 bg-card/60 px-2.5 py-1 text-xs shadow-sm', compact && 'py-0.5 px-2')}>
  <Button
    variant="ghost"
    size="sm"
    class="h-6 gap-1.5 px-1.5 font-mono text-[11px] text-primary hover:bg-primary/10"
    disabled={isRolling || !campaign.current}
    onclick={handleRoll}
  >
    <Dice5 class={cn('h-3.5 w-3.5', isRolling && 'animate-spin')} />
    <span>{notation}</span>
    {#if dc !== null}
      <span class="text-muted-foreground font-sans">vs DC {dc}</span>
    {/if}
  </Button>

  {#if actorName || reason}
    <span class="text-muted-foreground truncate max-w-[120px]">
      {actorName ?? reason}
    </span>
  {/if}

  {#if lastResult}
    <div class="flex items-center gap-1.5 border-l border-border/40 pl-2">
      <span class="font-bold text-foreground tabular-nums">{lastResult.total}</span>
      {#if lastResult.outcome}
        <Badge variant="outline" class={cn('text-[9px] px-1 py-0 uppercase tracking-wider', outcomeColor(lastResult.outcome))}>
          {lastResult.outcome.replace('_', ' ')}
        </Badge>
      {/if}
      <button
        type="button"
        class="text-muted-foreground hover:text-foreground p-0.5"
        title="Re-roll"
        onclick={handleRoll}
      >
        <RefreshCw class="h-3 w-3" />
      </button>
    </div>
  {/if}
</div>

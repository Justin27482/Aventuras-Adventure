<script lang="ts">
  import type { RollLedgerEntry, RollOutcome } from '$lib/types'
  import { story } from '$lib/stores/story.svelte'
  import { settings } from '$lib/stores/settings.svelte'
  import { Badge } from '$lib/components/ui/badge'
  import { Dice5, CheckCircle2, XCircle, Sparkles, ChevronDown, ChevronUp } from 'lucide-svelte'
  import { cn } from '$lib/utils/cn'

  interface Props {
    entry: RollLedgerEntry
    compact?: boolean
    onOverride?: (newTotal: number) => void
  }

  let { entry, compact = false, onOverride }: Props = $props()

  let expanded = $state(false)

  const actorName = $derived.by(() => {
    if (!entry.actorId) return 'Unknown Actor'
    const char = story.characters.find((c) => c.id === entry.actorId || c.name === entry.actorId)
    return char?.name ?? entry.actorId
  })

  function outcomeColor(outcome: RollOutcome): string {
    if (!outcome) return 'text-muted-foreground border-border'
    if (outcome === 'critical_success') return 'text-emerald-400 border-emerald-500/50 bg-emerald-500/10'
    if (outcome === 'success') return 'text-green-400 border-green-500/40 bg-green-500/10'
    if (outcome === 'critical_failure') return 'text-red-400 border-red-500/50 bg-red-500/10'
    if (outcome === 'failure') return 'text-rose-400 border-rose-500/40 bg-rose-500/10'
    return 'text-amber-400 border-amber-500/40 bg-amber-500/10'
  }

  function outcomeLabel(outcome: RollOutcome): string {
    if (!outcome) return 'Unchecked'
    if (outcome === 'critical_success') return 'Critical Success'
    if (outcome === 'critical_failure') return 'Critical Failure'
    return outcome.charAt(0).toUpperCase() + outcome.slice(1).replace('_', ' ')
  }
</script>

<div
  class={cn(
    'my-2 rounded-lg border border-border/60 bg-card/80 p-3 text-card-foreground shadow-sm backdrop-blur-sm transition-all',
    compact ? 'max-w-md' : 'w-full',
  )}
>
  <div class="flex items-center justify-between gap-3">
    <div class="flex items-center gap-2.5 min-w-0">
      <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Dice5 class="h-4 w-4" />
      </div>
      <div class="min-w-0">
        <div class="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <span class="truncate">{actorName}</span>
          {#if entry.reason}
            <span class="text-muted-foreground font-normal">• {entry.reason}</span>
          {/if}
        </div>
        <div class="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>{entry.notation}</span>
          {#if entry.dc !== null}
            <span>vs DC {entry.dc}</span>
          {/if}
          {#if entry.biasApplied}
            <span class="text-amber-400">({entry.biasApplied.type} +{entry.biasApplied.amount})</span>
          {/if}
        </div>
      </div>
    </div>

    <div class="flex items-center gap-2 shrink-0">
      <div class="text-right">
        <span class="text-lg font-bold tabular-nums text-foreground">{entry.total}</span>
      </div>
      {#if entry.outcome}
        <Badge variant="outline" class={cn('text-[10px] font-medium px-2 py-0.5', outcomeColor(entry.outcome))}>
          {outcomeLabel(entry.outcome)}
        </Badge>
      {/if}
      <button
        type="button"
        class="text-muted-foreground hover:text-foreground p-1 transition-colors"
        onclick={() => (expanded = !expanded)}
        aria-label="Toggle roll details"
      >
        {#if expanded}
          <ChevronUp class="h-4 w-4" />
        {:else}
          <ChevronDown class="h-4 w-4" />
        {/if}
      </button>
    </div>
  </div>

  {#if expanded}
    <div class="mt-2.5 pt-2.5 border-t border-border/40 text-xs space-y-1.5 text-muted-foreground">
      <div class="flex items-center justify-between">
        <span>Dice Breakdown:</span>
        <span class="font-mono text-foreground">[{entry.rolls.join(', ')}] {entry.modifier >= 0 ? `+ ${entry.modifier}` : `- ${Math.abs(entry.modifier)}`}</span>
      </div>
      {#if entry.seed}
        <div class="flex items-center justify-between text-[10px] text-muted-foreground/70">
          <span>RNG Seed:</span>
          <span class="font-mono truncate max-w-[180px]">{entry.seed}</span>
        </div>
      {/if}
      {#if settings.uiSettings.gmMode && onOverride}
        <div class="pt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            class="text-[11px] text-amber-400 hover:underline flex items-center gap-1"
            onclick={() => {
              const val = prompt('Override total score:', String(entry.total))
              if (val !== null) {
                const num = Number(val)
                if (Number.isFinite(num)) onOverride(num)
              }
            }}
          >
            <Sparkles class="h-3 w-3" /> GM Score Override
          </button>
        </div>
      {/if}
    </div>
  {/if}
</div>

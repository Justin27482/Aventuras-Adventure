<script lang="ts">
  import { campaign } from '$lib/stores/campaign.svelte'
  import { story } from '$lib/stores/story.svelte'
  import { Button } from '$lib/components/ui/button'
  import { Sword, Sparkles } from 'lucide-svelte'

  const activeActor = $derived(campaign.getCurrentTurnActor())

  const activeActorName = $derived(
    activeActor
      ? (story.characters.find((character) => character.id === activeActor.id)?.name ??
          activeActor.name)
      : 'No active actor',
  )

  const sceneLabel = $derived(campaign.sceneTurnState?.sceneMode ?? 'free')
  const turnOrderLabel = $derived(campaign.sceneTurnState?.turnOrderMode ?? 'free')

  async function endTurn() {
    try {
      await campaign.advanceTurn()
    } catch (error) {
      console.error('[TurnOrderStrip] Failed to advance the turn:', error)
    }
  }
</script>

{#if campaign.current && campaign.sceneTurnState && story.currentStory}
  <div class="border-border bg-card/80 border-b px-3 py-2 backdrop-blur-sm sm:px-6">
    <div class="mx-auto flex max-w-6xl items-center justify-between gap-3">
      <div class="flex min-w-0 items-center gap-2 text-sm text-slate-200">
        <div
          class="bg-primary/15 text-primary flex h-8 w-8 items-center justify-center rounded-full"
        >
          <Sword class="h-4 w-4" />
        </div>
        <div class="min-w-0">
          <div
            class="flex items-center gap-2 text-[11px] tracking-[0.12em] text-slate-400 uppercase"
          >
            <span>Scene</span>
            <span class="text-slate-300">{sceneLabel}</span>
            <span class="text-slate-500">•</span>
            <span>{turnOrderLabel}</span>
          </div>
          <div class="truncate font-medium text-slate-100">
            Acting as: {activeActorName}
          </div>
        </div>
      </div>

      <Button variant="secondary" size="sm" class="gap-2" onclick={endTurn}>
        <Sparkles class="h-4 w-4" />
        End turn
      </Button>
    </div>
  </div>
{/if}

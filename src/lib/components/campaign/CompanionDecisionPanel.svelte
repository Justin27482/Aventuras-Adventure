<script lang="ts">
  import { onMount } from 'svelte'
  import {
    eventBus,
    type CompanionDecisionProposedEvent,
    type CompanionDecisionResolvedEvent,
  } from '$lib/services/events'
  import { companionDecisionService } from '$lib/services/campaign/companion-decision-service'
  import { campaign } from '$lib/stores/campaign.svelte'
  import { story } from '$lib/stores/story.svelte'
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card'
  import { Badge } from '$lib/components/ui/badge'
  import { Brain, Check, X } from 'lucide-svelte'

  type Decision = CompanionDecisionProposedEvent & { accepted: boolean | null }

  let decisions = $state<Decision[]>([])

  function characterName(characterId: string): string {
    return story.characters.find((character) => character.id === characterId)?.name ?? 'Companion'
  }

  function addDecision(event: CompanionDecisionProposedEvent) {
    if (event.campaignId !== campaign.current?.id) return
    decisions = [
      { ...event, accepted: null },
      ...decisions.filter((decision) => decision.proposalId !== event.proposalId),
    ].slice(0, 12)
  }

  function resolveDecision(event: CompanionDecisionResolvedEvent) {
    decisions = decisions.map((decision) =>
      decision.proposalId === event.proposalId
        ? { ...decision, accepted: event.accepted }
        : decision,
    )
  }

  function decide(proposalId: string, accepted: boolean): void {
    try {
      companionDecisionService.decide(proposalId, accepted)
    } catch (error) {
      console.error('Failed to resolve companion decision', error)
    }
  }

  onMount(() => {
    const unsubscribeProposed = eventBus.subscribe<CompanionDecisionProposedEvent>(
      'CompanionDecisionProposed',
      addDecision,
    )
    const unsubscribeResolved = eventBus.subscribe<CompanionDecisionResolvedEvent>(
      'CompanionDecisionResolved',
      resolveDecision,
    )
    return () => {
      unsubscribeProposed()
      unsubscribeResolved()
    }
  })

  const visibleDecisions = $derived(
    decisions.filter((decision) => decision.campaignId === campaign.current?.id),
  )
</script>

{#if visibleDecisions.length > 0}
  <section class="pointer-events-none fixed right-4 bottom-4 z-30 w-[min(24rem,calc(100vw-2rem))]">
    <Card class="border-primary/30 bg-card/95 pointer-events-auto shadow-xl backdrop-blur-sm">
      <CardHeader class="flex flex-row items-center justify-between space-y-0 px-4 py-3">
        <CardTitle class="flex items-center gap-2 text-sm">
          <Brain class="text-primary h-4 w-4" />
          Companion Decisions
        </CardTitle>
        <Badge variant="secondary" class="text-[10px]">{visibleDecisions.length}</Badge>
      </CardHeader>
      <CardContent class="max-h-64 space-y-2 overflow-y-auto px-4 pb-4">
        {#each visibleDecisions as decision (decision.proposalId)}
          <div class="border-border bg-muted/20 rounded-md border p-2 text-xs">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="text-foreground font-medium">{characterName(decision.characterId)}</p>
                <p class="text-muted-foreground mt-0.5">
                  {decision.controlMode} · {decision.sceneMode}
                </p>
              </div>
              {#if decision.accepted === true}
                <Check class="h-3.5 w-3.5 shrink-0 text-green-400" />
              {:else if decision.accepted === false}
                <X class="h-3.5 w-3.5 shrink-0 text-red-400" />
              {/if}
            </div>
            <p class="text-foreground/90 mt-1 leading-relaxed">{decision.proposedAction}</p>
            {#if decision.accepted === null}
              <div class="mt-2 flex gap-2">
                <button
                  type="button"
                  class="inline-flex flex-1 items-center justify-center rounded-md bg-emerald-600 px-2 py-1 text-[10px] font-medium text-white transition hover:bg-emerald-500"
                  onclick={() => decide(decision.proposalId, true)}
                >
                  Accept
                </button>
                <button
                  type="button"
                  class="inline-flex flex-1 items-center justify-center rounded-md bg-red-600 px-2 py-1 text-[10px] font-medium text-white transition hover:bg-red-500"
                  onclick={() => decide(decision.proposalId, false)}
                >
                  Decline
                </button>
              </div>
            {/if}
          </div>
        {/each}
      </CardContent>
    </Card>
  </section>
{/if}

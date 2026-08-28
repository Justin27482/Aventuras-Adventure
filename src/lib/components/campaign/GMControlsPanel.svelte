<script lang="ts">
  import { campaign } from '$lib/stores/campaign.svelte'
  import { story } from '$lib/stores/story.svelte'
  import { roll, type RollResult } from '$lib/services/dice'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Label } from '$lib/components/ui/label'
  import * as Select from '$lib/components/ui/select'
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card'
  import { Crown, Dice5, FastForward, Theater } from 'lucide-svelte'
  import type { SceneMode, TurnOrderMode } from '$lib/services/campaign/turn-order-service'

  const sceneModes: Array<{ value: SceneMode; label: string }> = [
    { value: 'free', label: 'Free' },
    { value: 'exploration', label: 'Exploration' },
    { value: 'travel', label: 'Travel' },
    { value: 'camp', label: 'Camp' },
    { value: 'settlement', label: 'Settlement' },
    { value: 'combat', label: 'Combat' },
    { value: 'social', label: 'Social' },
    { value: 'downtime', label: 'Downtime' },
  ]

  const turnOrderModes: Array<{ value: TurnOrderMode; label: string }> = [
    { value: 'free', label: 'Free' },
    { value: 'spotlight', label: 'Spotlight' },
    { value: 'round_robin', label: 'Round robin' },
    { value: 'initiative', label: 'Initiative' },
    { value: 'gm_directed', label: 'GM directed' },
  ]

  let rollNotation = $state('1d20')
  let rollDc = $state('15')
  let rollReason = $state('GM QA test roll')
  let rollActorId = $state<string | null>(null)
  let isRolling = $state(false)
  let lastRoll = $state<RollResult | null>(null)
  let error = $state<string | null>(null)

  const currentSceneMode = $derived((campaign.sceneTurnState?.sceneMode ?? 'free') as SceneMode)
  const currentTurnOrderMode = $derived(
    (campaign.sceneTurnState?.turnOrderMode ?? 'free') as TurnOrderMode,
  )

  const actorOptions = $derived.by(() => {
    const ids = campaign.sceneTurnState?.actorOrder ?? []
    return ids.map((actorId) => ({
      id: actorId,
      name: story.characters.find((character) => character.id === actorId)?.name ?? actorId,
    }))
  })

  $effect(() => {
    if (rollActorId && actorOptions.some((actor) => actor.id === rollActorId)) return
    rollActorId = campaign.sceneTurnState?.activeActorId ?? actorOptions[0]?.id ?? null
  })

  function sceneModeLabel(value: string): string {
    return sceneModes.find((mode) => mode.value === value)?.label ?? value
  }

  function turnOrderModeLabel(value: string): string {
    return turnOrderModes.find((mode) => mode.value === value)?.label ?? value
  }

  function actorName(value: string | null | undefined): string {
    if (!value) return 'No active actor'
    return actorOptions.find((actor) => actor.id === value)?.name ?? value
  }

  async function setSceneMode(value: string | undefined) {
    if (!value) return
    error = null
    try {
      await campaign.setSceneMode(value as SceneMode)
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Unable to set scene mode'
    }
  }

  async function setTurnOrderMode(value: string | undefined) {
    if (!value) return
    error = null
    try {
      await campaign.setTurnOrderMode(value as TurnOrderMode)
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Unable to set turn order mode'
    }
  }

  async function setActiveActor(value: string | undefined) {
    if (!value) return
    error = null
    try {
      await campaign.setActiveActor(value)
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Unable to set active actor'
    }
  }

  async function endTurn() {
    error = null
    try {
      await campaign.advanceTurn()
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Unable to advance turn'
    }
  }

  async function testRoll() {
    if (!campaign.current) return
    const parsedDc = rollDc.trim() ? Number(rollDc) : null
    if (parsedDc !== null && !Number.isFinite(parsedDc)) {
      error = 'DC must be a number.'
      return
    }

    isRolling = true
    error = null
    try {
      lastRoll = await roll({
        campaignId: campaign.current.id,
        sessionId: campaign.activeSession?.id ?? null,
        actorId: rollActorId,
        notation: rollNotation,
        dc: parsedDc,
        reason: rollReason || 'GM QA test roll',
        visibility: 'player_safe',
      })
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Unable to roll dice'
    } finally {
      isRolling = false
    }
  }
</script>

<div class="space-y-3">
  <div class="space-y-1">
    <div class="flex items-center gap-2">
      <Crown class="text-primary h-4 w-4" />
      <h2 class="text-foreground text-sm font-semibold">GM / QA Controls</h2>
    </div>
    <p class="text-muted-foreground text-xs">
      Manual campaign controls for validating scene, turn, and roll behavior.
    </p>
  </div>

  {#if campaign.current && campaign.sceneTurnState}
    <Card>
      <CardHeader class="px-3 py-2">
        <CardTitle class="flex items-center gap-2 text-sm">
          <Theater class="text-primary h-4 w-4" />
          Scene Runtime
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-3 px-3 pb-3">
        <div class="space-y-1.5">
          <Label for="gm-scene-mode">Scene mode</Label>
          <Select.Root type="single" value={currentSceneMode} onValueChange={setSceneMode}>
            <Select.Trigger id="gm-scene-mode" class="w-full">
              {sceneModeLabel(currentSceneMode)}
            </Select.Trigger>
            <Select.Content>
              {#each sceneModes as mode (mode.value)}
                <Select.Item value={mode.value} label={mode.label}>{mode.label}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>

        <div class="space-y-1.5">
          <Label for="gm-turn-order-mode">Turn order</Label>
          <Select.Root type="single" value={currentTurnOrderMode} onValueChange={setTurnOrderMode}>
            <Select.Trigger id="gm-turn-order-mode" class="w-full">
              {turnOrderModeLabel(currentTurnOrderMode)}
            </Select.Trigger>
            <Select.Content>
              {#each turnOrderModes as mode (mode.value)}
                <Select.Item value={mode.value} label={mode.label}>{mode.label}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>

        <div class="space-y-1.5">
          <Label for="gm-active-actor">Active actor</Label>
          <Select.Root
            type="single"
            value={campaign.sceneTurnState.activeActorId ?? undefined}
            onValueChange={setActiveActor}
          >
            <Select.Trigger id="gm-active-actor" class="w-full">
              {actorName(campaign.sceneTurnState.activeActorId)}
            </Select.Trigger>
            <Select.Content>
              {#each actorOptions as actor (actor.id)}
                <Select.Item value={actor.id} label={actor.name}>{actor.name}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>

        <Button variant="secondary" size="sm" class="w-full gap-2" onclick={endTurn}>
          <FastForward class="h-4 w-4" />
          End Current Turn
        </Button>

        {#if campaign.lastSceneTransition}
          <p class="text-muted-foreground rounded-md border p-2 text-xs">
            {campaign.lastSceneTransition}
          </p>
        {/if}
      </CardContent>
    </Card>

    <Card>
      <CardHeader class="px-3 py-2">
        <CardTitle class="flex items-center gap-2 text-sm">
          <Dice5 class="text-primary h-4 w-4" />
          Test Roll
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-3 px-3 pb-3">
        <div class="grid grid-cols-[1fr_5rem] gap-2">
          <div class="space-y-1.5">
            <Label for="gm-roll-notation">Notation</Label>
            <Input id="gm-roll-notation" bind:value={rollNotation} placeholder="1d20+3" />
          </div>
          <div class="space-y-1.5">
            <Label for="gm-roll-dc">DC</Label>
            <Input id="gm-roll-dc" bind:value={rollDc} placeholder="15" />
          </div>
        </div>

        <div class="space-y-1.5">
          <Label for="gm-roll-reason">Reason</Label>
          <Input id="gm-roll-reason" bind:value={rollReason} />
        </div>

        <div class="space-y-1.5">
          <Label for="gm-roll-actor">Roll as</Label>
          <Select.Root
            type="single"
            value={rollActorId ?? undefined}
            onValueChange={(value) => (rollActorId = value ?? null)}
          >
            <Select.Trigger id="gm-roll-actor" class="w-full">
              {actorName(rollActorId)}
            </Select.Trigger>
            <Select.Content>
              {#each actorOptions as actor (actor.id)}
                <Select.Item value={actor.id} label={actor.name}>{actor.name}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>

        <Button
          variant="default"
          size="sm"
          class="w-full gap-2"
          onclick={testRoll}
          disabled={isRolling}
        >
          <Dice5 class="h-4 w-4" />
          {isRolling ? 'Rolling...' : `Roll as ${actorName(rollActorId)}`}
        </Button>

        {#if lastRoll}
          <div class="bg-muted/30 rounded-md border p-2 text-xs">
            <div class="flex items-center justify-between gap-2">
              <span class="text-muted-foreground">Total</span>
              <span class="text-foreground font-semibold">{lastRoll.entry.total}</span>
            </div>
            <div class="mt-1 flex items-center justify-between gap-2">
              <span class="text-muted-foreground">DC</span>
              <span class="text-foreground">{lastRoll.entry.dc ?? 'None'}</span>
            </div>
            <div class="mt-1 flex items-center justify-between gap-2">
              <span class="text-muted-foreground">Outcome</span>
              <span class="text-foreground">{lastRoll.entry.outcome ?? 'Not checked'}</span>
            </div>
          </div>
        {/if}
      </CardContent>
    </Card>
  {:else}
    <p class="text-muted-foreground rounded-md border p-3 text-sm">
      Open a campaign and start campaign runtime state before using GM controls.
    </p>
  {/if}

  {#if error}
    <p class="text-destructive border-destructive/30 rounded-md border p-2 text-xs">{error}</p>
  {/if}

  <p class="text-muted-foreground text-[11px]">
    These controls are gated by GM Mode and are intended for QA, recovery, and deliberate
    director-level play.
  </p>
</div>

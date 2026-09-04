<script lang="ts">
  import type { AIPlayer } from '$lib/types'
  import { Bot } from 'lucide-svelte'
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card'
  import { Label } from '$lib/components/ui/label'

  interface Props {
    characters: Array<{ name: string; relationship?: string | null }>
    aiPlayers: AIPlayer[]
    assignments: Record<string, string>
    onAssignmentChange: (characterName: string, aiPlayerId: string) => void
    partyPending?: boolean
    rosterIds?: string[]
    onRosterChange?: (aiPlayerId: string, included: boolean) => void
  }

  let {
    characters,
    aiPlayers,
    assignments,
    onAssignmentChange,
    partyPending = false,
    rosterIds = [],
    onRosterChange,
  }: Props = $props()
</script>

<div class="space-y-5">
  <div>
    <h2 class="text-lg font-semibold">Assign AI Players</h2>
    <p class="text-muted-foreground mt-1 text-sm">
      Select reusable global profiles for this campaign. Leave characters unassigned for human or GM control.
    </p>
  </div>

  {#if aiPlayers.length === 0}
    <Card>
      <CardContent class="text-muted-foreground flex min-h-32 flex-col items-center justify-center gap-2 text-center text-sm">
        <Bot class="h-7 w-7" />
        <p>No active AI Player profiles are available.</p>
        <p>Create profiles from the AI Player Library before assigning them here.</p>
      </CardContent>
    </Card>
  {:else if partyPending}
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2 text-base"><Bot class="h-4 w-4" /> Session Zero roster</CardTitle>
      </CardHeader>
      <CardContent class="space-y-3">
        <p class="text-muted-foreground text-xs">
          Select the AI Players who will create characters during private setup sessions.
        </p>
        {#each aiPlayers as player (player.id)}
          <label class="flex items-center justify-between rounded-md border p-3">
            <span class="text-sm font-medium">{player.name}</span>
            <input
              type="checkbox"
              checked={rosterIds.includes(player.id)}
              onchange={(event) => onRosterChange?.(player.id, event.currentTarget.checked)}
            />
          </label>
        {/each}
      </CardContent>
    </Card>
  {:else}
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2 text-base"><Bot class="h-4 w-4" /> Character assignments</CardTitle>
      </CardHeader>
      <CardContent class="space-y-3">
        {#each characters as character (character.name)}
          <div class="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_1fr] sm:items-center">
            <div>
              <p class="text-sm font-medium">{character.name}</p>
              <p class="text-muted-foreground text-xs">{character.relationship === 'self' ? 'Primary character' : 'Party character'}</p>
            </div>
            <div class="space-y-1">
              <Label class="sr-only" for={`ai-player-${character.name}`}>AI Player for {character.name}</Label>
              <select
                id={`ai-player-${character.name}`}
                class="bg-background border-input text-foreground h-9 w-full rounded-md border px-2 text-sm"
                value={assignments[character.name] ?? ''}
                onchange={(event) => onAssignmentChange(character.name, event.currentTarget.value)}
              >
                <option value="">No AI Player</option>
                {#each aiPlayers.filter((player) => player.id === assignments[character.name] || !Object.entries(assignments).some(([name, id]) => name !== character.name && id === player.id)) as player (player.id)}
                  <option value={player.id}>{player.name}</option>
                {/each}
              </select>
            </div>
          </div>
        {/each}
      </CardContent>
    </Card>
  {/if}
</div>

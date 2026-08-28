<script lang="ts">
  import { campaign } from '$lib/stores/campaign.svelte'
  import { story } from '$lib/stores/story.svelte'
  import { Card, CardContent } from '$lib/components/ui/card'
  import { Badge } from '$lib/components/ui/badge'
  import { Button } from '$lib/components/ui/button'
  import { Switch } from '$lib/components/ui/switch'
  import { Users, Sparkles } from 'lucide-svelte'

  let error = $state<string | null>(null)

  const activeMembers = $derived(campaign.activeParty)
  const partyMemberMap = $derived(new Map(campaign.partyMembers.map((m) => [m.characterId, m])))

  const allCharacters = $derived(
    story.characters.filter((character) => character.status !== 'deceased' && !character.deleted),
  )

  async function toggleActive(characterId: string, currentActive: boolean) {
    const character = story.characters.find((c) => c.id === characterId)
    if (!character) return
    error = null
    try {
      await campaign.setPartyMember(character, { active: !currentActive })
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to update party member'
    }
  }

  async function setSpotlight(characterId: string) {
    error = null
    try {
      const target = campaign.current?.spotlightCharacterId === characterId ? null : characterId
      await campaign.setSpotlightCharacter(target)
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to set spotlight'
    }
  }
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <Users class="text-primary h-5 w-5" />
      <h2 class="text-foreground text-lg font-semibold">Party Roster</h2>
    </div>
    <Badge variant="outline" class="text-xs">
      {activeMembers.length} / {campaign.settings?.maxPartySize ?? 6} Active
    </Badge>
  </div>

  {#if error}
    <p class="text-destructive border-destructive/30 rounded-md border p-2 text-xs">{error}</p>
  {/if}

  {#if campaign.current}
    <div class="space-y-3">
      {#each allCharacters as character (character.id)}
        {@const member = partyMemberMap.get(character.id)}
        {@const isActive = member?.active ?? false}
        {@const isPrimary = character.relationship === 'self'}
        {@const isSpotlight = campaign.spotlightCharacterId === character.id}

        <Card class={isActive ? 'border-primary/40 bg-card/95 shadow-sm' : 'opacity-70'}>
          <CardContent class="flex items-center justify-between gap-3 p-3">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="text-foreground truncate text-sm font-semibold">{character.name}</span>
                {#if isPrimary}
                  <Badge variant="default" class="text-[10px]">Lead</Badge>
                {/if}
                {#if isSpotlight}
                  <Badge variant="secondary" class="gap-1 text-[10px] text-amber-400">
                    <Sparkles class="h-3 w-3" /> Spotlight
                  </Badge>
                {/if}
              </div>
              <p class="text-muted-foreground mt-0.5 text-xs">
                {member?.actorCategory.replace('_', ' ') ?? 'available ally'} · narrative: {member?.narrativeControlMode ??
                  'autonomous'} · combat: {member?.combatControlMode ?? 'autonomous'}
              </p>
            </div>

            <div class="flex items-center gap-2">
              {#if isActive && !isPrimary}
                <Button
                  variant={isSpotlight ? 'secondary' : 'ghost'}
                  size="icon"
                  class="h-8 w-8 text-amber-400"
                  onclick={() => setSpotlight(character.id)}
                  title={isSpotlight ? 'Remove spotlight' : 'Set spotlight character'}
                >
                  <Sparkles class="h-4 w-4" />
                </Button>
              {/if}

              <Switch
                checked={isActive}
                disabled={isPrimary}
                onCheckedChange={() => toggleActive(character.id, isActive)}
                aria-label={`Include ${character.name} in party`}
              />
            </div>
          </CardContent>
        </Card>
      {/each}
    </div>
  {:else}
    <p class="text-muted-foreground rounded-md border p-3 text-sm">
      Open a campaign to manage party roster and spotlight indicators.
    </p>
  {/if}
</div>

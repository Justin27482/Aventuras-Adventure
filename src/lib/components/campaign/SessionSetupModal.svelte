<script lang="ts">
  import { campaign } from '$lib/stores/campaign.svelte'
  import { story } from '$lib/stores/story.svelte'
  import { Button } from '$lib/components/ui/button'
  import { Label } from '$lib/components/ui/label'
  import { Switch } from '$lib/components/ui/switch'
  import * as Dialog from '$lib/components/ui/dialog'
  import * as Select from '$lib/components/ui/select'
  import * as Tooltip from '$lib/components/ui/tooltip'
  import { Users, Play, Loader2 } from 'lucide-svelte'

  interface Props {
    open: boolean
    onClose: () => void
  }

  let { open, onClose }: Props = $props()
  let primaryCharacterId = $state('')
  let combatPolicy = $state<'companions_autonomous' | 'tactical_delegate' | 'tactical_player'>(
    'companions_autonomous',
  )
  let isStarting = $state(false)
  let error = $state<string | null>(null)

  const partyCharacters = $derived(
    story.characters.filter((character) => character.status !== 'deceased' && !character.deleted),
  )

  const activePartyIds = $derived(
    new Set(campaign.partyMembers.filter((member) => member.active).map((member) => member.characterId)),
  )

  function initializeSelection() {
    const existingPrimary = campaign.partyMembers.find(
      (member) => member.actorCategory === 'primary_player_character' && member.active,
    )
    primaryCharacterId = existingPrimary?.characterId ?? partyCharacters[0]?.id ?? ''
    combatPolicy = campaign.settings?.companionCombatPolicy ?? 'companions_autonomous'
    error = null
  }

  function togglePartyMember(characterId: string, active: boolean) {
    const character = story.characters.find((candidate) => candidate.id === characterId)
    if (!character) return
    const isPrimaryCharacter = character.relationship === 'self'
    void campaign.setPartyMember(character, {
      active,
      actorCategory: isPrimaryCharacter ? 'primary_player_character' : 'active_companion',
      narrativeControlMode: isPrimaryCharacter ? 'player_narrative' : 'autonomous',
      combatControlMode: isPrimaryCharacter ? 'player_narrative' : 'autonomous',
    }).catch((reason) => {
      error = reason instanceof Error ? reason.message : 'Unable to update party'
    })
  }

  async function startSession() {
    if (!primaryCharacterId) {
      error = 'Choose a primary character before starting the session.'
      return
    }
    if (!activePartyIds.has(primaryCharacterId)) {
      error = 'The primary character must be part of the active party.'
      return
    }

    isStarting = true
    error = null
    try {
      await campaign.startSession({
        primaryCharacterId,
        combatControlPolicy: combatPolicy,
      })
      onClose()
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Unable to start session'
    } finally {
      isStarting = false
    }
  }
</script>

<Dialog.Root
  open={open}
  onOpenChange={(nextOpen) => {
    if (nextOpen) initializeSelection()
    else onClose()
  }}
>
  <Dialog.Content class="max-w-xl">
    <Dialog.Header>
      <Dialog.Title>Start Campaign Session</Dialog.Title>
      <Dialog.Description>
        Choose who is travelling with you and who leads this session. Companions keep their own
        voices and decisions outside tactical combat control.
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-5">
      <div class="space-y-3">
        <div class="flex items-center gap-2">
          <Users class="text-primary h-4 w-4" />
          <h3 class="text-sm font-semibold">Active Party</h3>
        </div>
        <div class="space-y-2">
          {#each partyCharacters as character (character.id)}
            {@const member = campaign.partyMembers.find((candidate) => candidate.characterId === character.id)}
            <div class="border-border bg-muted/20 flex items-center justify-between rounded-md border p-3">
              <div class="min-w-0">
                <p class="text-foreground truncate text-sm font-medium">{character.name}</p>
                <p class="text-muted-foreground text-xs">
                  {character.relationship === 'self'
                    ? 'Lead character'
                    : member
                      ? 'Autonomous companion'
                      : 'Available ally'}
                </p>
              </div>
              <Switch
                checked={member?.active ?? false}
                onCheckedChange={(active) => togglePartyMember(character.id, active)}
                aria-label={`Include ${character.name} in active party`}
              />
            </div>
          {/each}
        </div>
      </div>

      <div class="space-y-2">
        <Label for="primary-character">Primary Character</Label>
        <Select.Root type="single" bind:value={primaryCharacterId}>
          <Select.Trigger id="primary-character" class="w-full">
            {partyCharacters.find((character) => character.id === primaryCharacterId)?.name ??
              'Choose a character'}
          </Select.Trigger>
          <Select.Content>
            {#each partyCharacters.filter((character) => activePartyIds.has(character.id)) as character (
              character.id
            )}
              <Select.Item value={character.id} label={character.name}>{character.name}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>

      <div class="space-y-2">
        <Label for="combat-policy">Companion Combat Policy</Label>
        <Select.Root type="single" bind:value={combatPolicy}>
          <Select.Trigger id="combat-policy" class="w-full">
            {combatPolicy === 'companions_autonomous'
              ? 'Autonomous companions'
              : combatPolicy === 'tactical_delegate'
                ? 'Tactical delegation'
                : 'Direct tactical control'}
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="companions_autonomous" label="Autonomous companions">
              Companions choose their own actions
            </Select.Item>
            <Select.Item value="tactical_delegate" label="Tactical delegation">
              Give intent; companions choose the action
            </Select.Item>
            <Select.Item value="tactical_player" label="Direct tactical control">
              Choose companion combat actions
            </Select.Item>
          </Select.Content>
        </Select.Root>
      </div>

      {#if error}
        <p class="text-destructive text-sm">{error}</p>
      {/if}
    </div>

    <Dialog.Footer>
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Button {...props} variant="outline" onclick={onClose} disabled={isStarting}>
              Cancel
            </Button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>Cancel and return to campaign</Tooltip.Content>
      </Tooltip.Root>
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              onclick={startSession}
              disabled={isStarting || !primaryCharacterId}
              class="gap-2"
            >
              {#if isStarting}
                <Loader2 class="h-4 w-4 animate-spin" />
                Starting...
              {:else}
                <Play class="h-4 w-4" />
                Start Session
              {/if}
            </Button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>Begin the campaign session with selected party</Tooltip.Content>
      </Tooltip.Root>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<script lang="ts">
  import { campaign } from '$lib/stores/campaign.svelte'
  import { story } from '$lib/stores/story.svelte'
  import type { Item } from '$lib/types'
  import { Input } from '$lib/components/ui/input'
  import { Label } from '$lib/components/ui/label'
  import * as Select from '$lib/components/ui/select'

  interface Props {
    item: Item
    ownerCharacterId: string | null
    slotKey: string
    containerItemId: string | null
    onOwnerChange: (value: string | null) => void
    onSlotChange: (value: string) => void
    onContainerChange: (value: string | null) => void
  }

  let {
    item,
    ownerCharacterId,
    slotKey,
    containerItemId,
    onOwnerChange,
    onSlotChange,
    onContainerChange,
  }: Props = $props()

  const ownerCharacters = $derived(
    story.characters.filter((character) =>
      campaign.partyMembers.some(
        (member) => member.characterId === character.id && member.eligibilityStatus === 'eligible',
      ),
    ),
  )

  const containerItems = $derived(story.items.filter((candidate) => candidate.id !== item.id))
</script>

{#if campaign.current}
  <div class="bg-muted/20 space-y-3 rounded-md border p-3">
    <div class="space-y-1">
      <Label class="text-xs">Item Owner</Label>
      <Select.Root
        type="single"
        value={ownerCharacterId ?? 'shared-stash'}
        onValueChange={(value) => onOwnerChange(value === 'shared-stash' ? null : value)}
      >
        <Select.Trigger class="h-8 text-xs">
          {ownerCharacters.find((character) => character.id === ownerCharacterId)?.name ??
            'Shared stash / unowned'}
        </Select.Trigger>
        <Select.Content>
          <Select.Item value="shared-stash" label="Shared stash / unowned">
            Shared stash / unowned
          </Select.Item>
          {#each ownerCharacters as character (character.id)}
            <Select.Item value={character.id} label={character.name}>{character.name}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>

    <div class="grid grid-cols-2 gap-3">
      <div class="space-y-1">
        <Label class="text-xs">Slot</Label>
        <Input
          value={slotKey}
          oninput={(event) => onSlotChange(event.currentTarget.value)}
          placeholder="e.g. main-hand"
          class="h-8 text-xs"
        />
      </div>
      <div class="space-y-1">
        <Label class="text-xs">Container</Label>
        <Select.Root
          type="single"
          value={containerItemId ?? 'none'}
          onValueChange={(value) => onContainerChange(value === 'none' ? null : value)}
        >
          <Select.Trigger class="h-8 text-xs">
            {containerItems.find((candidate) => candidate.id === containerItemId)?.name ?? 'None'}
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="none" label="None">None</Select.Item>
            {#each containerItems as container (container.id)}
              <Select.Item value={container.id} label={container.name}>{container.name}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
    </div>
  </div>
{/if}

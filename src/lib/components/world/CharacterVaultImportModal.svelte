<script lang="ts">
  import * as ResponsiveModal from '$lib/components/ui/responsive-modal'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Label } from '$lib/components/ui/label'
  import { characterVault } from '$lib/stores/characterVault.svelte'
  import * as Avatar from '$lib/components/ui/avatar'
  import { Badge } from '$lib/components/ui/badge'
  import { ScrollArea } from '$lib/components/ui/scroll-area'
  import { normalizeImageDataUrl } from '$lib/utils/image'
  import { Archive, Loader2, Search, User } from 'lucide-svelte'
  import type { VaultCharacter } from '$lib/types'

  interface ImportOptions {
    relationship?: string | null
  }

  interface Props {
    open: boolean
    onClose: () => void
    onImport: (characters: VaultCharacter[], options: ImportOptions) => Promise<void>
    existingCharacterNames?: string[]
  }

  let { open, onClose, onImport, existingCharacterNames = [] }: Props = $props()

  let searchQuery = $state('')
  let selectedCharacterIds = $state<string[]>([])
  let focusedCharacterId = $state<string | null>(null)
  let relationship = $state('')
  let importError = $state<string | null>(null)
  let importing = $state(false)

  $effect(() => {
    if (!characterVault.isLoaded) {
      void characterVault.load()
    }
  })

  const normalizedExistingNames = $derived(
    existingCharacterNames.map((name) => name.trim().toLowerCase()).filter(Boolean),
  )
  const filteredCharacters = $derived.by(() => {
    const items = [...characterVault.characters]
    const query = searchQuery.trim().toLowerCase()

    const filtered = query
      ? items.filter((character) => {
          const commonMatch =
            character.name.toLowerCase().includes(query) ||
            (character.description?.toLowerCase().includes(query) ?? false) ||
            character.tags.some((tag) => tag.toLowerCase().includes(query))

          return commonMatch || character.traits.some((trait) => trait.toLowerCase().includes(query))
        })
      : items

    return filtered.sort((a, b) => {
      if (a.favorite && !b.favorite) return -1
      if (!a.favorite && b.favorite) return 1
      return b.updatedAt - a.updatedAt
    })
  })
  const selectedCharacters = $derived(
    selectedCharacterIds
      .map((id) => characterVault.getById(id))
      .filter((character): character is VaultCharacter => Boolean(character)),
  )
  const focusedCharacter = $derived.by(() => {
    if (focusedCharacterId) {
      const focused = characterVault.getById(focusedCharacterId)
      if (focused) return focused
    }
    return selectedCharacters[selectedCharacters.length - 1] ?? null
  })
  const duplicateSelections = $derived(
    selectedCharacters.filter((character) =>
      normalizedExistingNames.includes(character.name.trim().toLowerCase()),
    ),
  )
  const hasDuplicates = $derived(duplicateSelections.length > 0)

  function isSelected(characterId: string): boolean {
    return selectedCharacterIds.includes(characterId)
  }

  function toggleSelection(character: VaultCharacter) {
    importError = null
    focusedCharacterId = character.id

    if (isSelected(character.id)) {
      const nextSelectedIds = selectedCharacterIds.filter((id) => id !== character.id)
      selectedCharacterIds = nextSelectedIds
      if (focusedCharacterId === character.id) {
        focusedCharacterId = nextSelectedIds[nextSelectedIds.length - 1] ?? null
      }
      return
    }

    selectedCharacterIds = [...selectedCharacterIds, character.id]
  }

  function resetState() {
    searchQuery = ''
    selectedCharacterIds = []
    focusedCharacterId = null
    relationship = ''
    importError = null
    importing = false
  }

  function closeModal() {
    resetState()
    onClose()
  }

  async function confirmImport() {
    if (selectedCharacters.length === 0 || importing) return

    importError = null

    importing = true

    try {
      await onImport(selectedCharacters, {
        relationship: relationship.trim() || null,
      })
      closeModal()
    } catch (error) {
      importError = error instanceof Error ? error.message : 'Failed to import character.'
      importing = false
    }
  }
</script>

<ResponsiveModal.Root {open} onOpenChange={(next) => !next && closeModal()}>
  <ResponsiveModal.Content class="flex max-h-[92vh] max-w-6xl flex-col gap-0 p-0">
    <ResponsiveModal.Header class="border-b px-6 py-4">
      <div class="flex items-center gap-2">
        <Archive class="text-primary h-5 w-5" />
        <ResponsiveModal.Title>Import Character From Vault</ResponsiveModal.Title>
      </div>
      <ResponsiveModal.Description>
        Copy one or more vault characters into this story.
      </ResponsiveModal.Description>
    </ResponsiveModal.Header>

    <div class="grid min-h-0 flex-1 gap-0 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div class="min-h-0 border-b md:border-r md:border-b-0">
        <div class="border-b px-6 py-4">
          <div class="relative">
            <Search class="text-muted-foreground absolute top-2.5 left-3 h-4 w-4" />
            <input
              type="text"
              bind:value={searchQuery}
              placeholder="Search characters..."
              class="border-input bg-background placeholder:text-muted-foreground ring-offset-background flex h-9 w-full rounded-md border py-2 pr-3 pl-9 text-sm outline-none"
            />
          </div>
        </div>

        <ScrollArea class="max-h-[58vh] px-6 py-4 xl:max-h-[68vh]">
          {#if !characterVault.isLoaded}
            <div class="text-muted-foreground flex items-center justify-center py-12 text-sm">
              Loading vault characters...
            </div>
          {:else if filteredCharacters.length === 0}
            <div class="text-muted-foreground flex items-center justify-center py-12 text-sm">
              No vault characters match this search.
            </div>
          {:else}
            <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {#each filteredCharacters as character (character.id)}
                {@const selected = isSelected(character.id)}
                <button
                  type="button"
                  class={`group bg-card hover:border-primary/50 flex min-h-48 flex-col rounded-xl border p-4 text-left transition-all ${selected
                    ? 'border-primary bg-primary/5 ring-primary ring-1'
                    : 'border-muted shadow-sm'} ${focusedCharacter?.id === character.id ? 'border-primary/60' : ''}`}
                  onclick={() => toggleSelection(character)}
                >
                  <div class="mb-3 flex items-start justify-between gap-2">
                    <Avatar.Root class="h-16 w-16 border shadow-sm">
                      <Avatar.Image
                        src={normalizeImageDataUrl(character.portrait) ?? ''}
                        alt={character.name}
                        class="object-cover"
                      />
                      <Avatar.Fallback class="bg-muted text-muted-foreground">
                        <User class="h-6 w-6" />
                      </Avatar.Fallback>
                    </Avatar.Root>

                    <div class="flex flex-col items-end gap-1">
                      {#if selected}
                        <Badge variant="default" class="text-[10px]">Selected</Badge>
                      {/if}
                      {#if character.favorite}
                        <Badge variant="secondary" class="text-[10px]">Favorite</Badge>
                      {/if}
                    </div>
                  </div>

                  <div class="flex min-h-0 flex-1 flex-col">
                    <p class="text-foreground line-clamp-2 text-sm font-medium">{character.name}</p>
                    {#if character.description}
                      <p class="text-muted-foreground mt-2 line-clamp-4 text-xs leading-relaxed">
                        {character.description}
                      </p>
                    {/if}

                    <div class="mt-auto pt-3">
                      {#if character.traits.length > 0}
                        <div class="flex flex-wrap gap-1">
                          {#each character.traits.slice(0, 4) as trait (trait)}
                            <span class="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px]">
                              {trait}
                            </span>
                          {/each}
                          {#if character.traits.length > 4}
                            <span class="text-muted-foreground text-[10px]">
                              +{character.traits.length - 4} more
                            </span>
                          {/if}
                        </div>
                      {/if}
                    </div>
                  </div>
                </button>
              {/each}
            </div>
          {/if}
        </ScrollArea>
      </div>

      <ScrollArea class="max-h-[58vh] px-6 py-4 xl:max-h-[68vh]">
        <div class="space-y-4">
          <div class="space-y-1">
            <p class="text-sm font-medium">Character details</p>
            <p class="text-muted-foreground text-xs">
              {#if focusedCharacter}
                Previewing <span class="text-foreground font-medium">{focusedCharacter.name}</span>
              {:else}
                Select one or more vault characters to preview them here.
              {/if}
            </p>
          </div>

          {#if hasDuplicates}
            <div class="bg-muted/40 text-muted-foreground rounded-md border px-3 py-2 text-xs">
              {duplicateSelections.length === 1
                ? `${duplicateSelections[0].name} already exists in the story. Importing will create another copy.`
                : `${duplicateSelections.length} selected characters already exist in the story. Importing will create additional copies.`}
            </div>
          {/if}

          {#if focusedCharacter}
            <div class="space-y-4 rounded-lg border p-4">
              <div class="flex items-start gap-3">
                <Avatar.Root class="h-16 w-16 border shadow-sm">
                  <Avatar.Image
                    src={normalizeImageDataUrl(focusedCharacter.portrait) ?? ''}
                    alt={focusedCharacter.name}
                    class="object-cover"
                  />
                  <Avatar.Fallback class="bg-muted text-muted-foreground">
                    <User class="h-6 w-6" />
                  </Avatar.Fallback>
                </Avatar.Root>

                <div class="min-w-0 flex-1">
                  <p class="text-foreground text-base font-semibold">{focusedCharacter.name}</p>
                  <div class="mt-2 flex flex-wrap gap-1">
                    {#if focusedCharacter.favorite}
                      <Badge variant="secondary" class="text-[10px]">Favorite</Badge>
                    {/if}
                    {#each focusedCharacter.tags as tag (tag)}
                      <Badge variant="outline" class="text-[10px]">{tag}</Badge>
                    {/each}
                  </div>
                </div>
              </div>

              {#if focusedCharacter.description}
                <div class="space-y-1">
                  <p class="text-sm font-medium">Description</p>
                  <p class="text-muted-foreground text-sm leading-relaxed">
                    {focusedCharacter.description}
                  </p>
                </div>
              {/if}

              {#if focusedCharacter.traits.length > 0}
                <div class="space-y-2">
                  <p class="text-sm font-medium">Traits</p>
                  <div class="flex flex-wrap gap-1.5">
                    {#each focusedCharacter.traits as trait (trait)}
                      <span class="bg-muted text-muted-foreground rounded px-2 py-1 text-xs">
                        {trait}
                      </span>
                    {/each}
                  </div>
                </div>
              {/if}

              {#if Object.keys(focusedCharacter.visualDescriptors ?? {}).length > 0}
                <div class="space-y-2">
                  <p class="text-sm font-medium">Appearance</p>
                  <div class="space-y-1.5">
                    {#each Object.entries(focusedCharacter.visualDescriptors) as [key, value] (`${focusedCharacter.id}-${key}`)}
                      {#if value}
                        <div class="bg-muted/40 rounded-md px-2 py-1.5 text-xs">
                          <span class="text-foreground font-medium capitalize">{key}:</span>
                          <span class="text-muted-foreground"> {value}</span>
                        </div>
                      {/if}
                    {/each}
                  </div>
                </div>
              {/if}

              {#if focusedCharacter.metadata?.linkedLorebookId}
                <div class="bg-muted/40 text-muted-foreground rounded-md border px-3 py-2 text-xs">
                  This vault character has a linked lorebook. It is not imported automatically by this modal.
                </div>
              {/if}
            </div>
          {:else}
            <div class="text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-sm">
              Select a character tile to preview its vault data.
            </div>
          {/if}

          {#if selectedCharacters.length > 0}
            <div class="bg-muted/20 rounded-md border px-3 py-2 text-xs">
              {selectedCharacters.length} character{selectedCharacters.length === 1 ? '' : 's'} selected for import.
            </div>
          {/if}

          {#if importError}
            <p class="text-destructive text-xs">{importError}</p>
          {/if}
        </div>
      </ScrollArea>
    </div>

    <ResponsiveModal.Footer class="border-t px-6 py-3">
      <div class="flex w-full flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div class="w-full lg:max-w-xs">
          <Label for="import-character-relationship" class="mb-1.5 block text-sm">Relationship</Label>
          <Input
            id="import-character-relationship"
            bind:value={relationship}
            placeholder="e.g. ally, enemy, mentor"
            disabled={importing}
          />
          <p class="text-muted-foreground mt-1 text-xs">
            Optional. The same relationship label will be applied to all imported characters.
          </p>
        </div>

        <div class="flex items-center justify-end gap-2">
          <Button variant="outline" onclick={closeModal} disabled={importing}>Cancel</Button>
          <Button onclick={confirmImport} disabled={selectedCharacters.length === 0 || importing}>
            {#if importing}
              <Loader2 class="h-4 w-4 animate-spin" />
              Importing...
          {:else}
              Add Character{selectedCharacters.length === 1 ? '' : 's'}
            {/if}
          </Button>
        </div>
      </div>
    </ResponsiveModal.Footer>
  </ResponsiveModal.Content>
</ResponsiveModal.Root>
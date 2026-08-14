<script lang="ts">
  import { Trash2, Clock, Copy, Folder } from 'lucide-svelte'
  import { Button } from '$lib/components/ui/button'
  import * as Select from '$lib/components/ui/select'
  import * as Card from '$lib/components/ui/card'
  import TagBadge from '$lib/components/tags/TagBadge.svelte'
  import type { Story, StoryFolder } from '$lib/types'

  interface Props {
    story: Story
    folders: StoryFolder[]
    onOpen: (id: string) => void
    onDelete: (id: string, event: MouseEvent) => void
    onDuplicate: (story: Story, event: MouseEvent) => void
    onAssignFolder: (storyId: string, folderId: string | null) => Promise<void>
  }

  let { story: s, folders, onOpen, onDelete, onDuplicate, onAssignFolder }: Props = $props()
  let folderValue = $state('__none')
  let previousFolderValue = $state('__none')

  $effect(() => {
    const nextValue = s.folderId ?? '__none'
    folderValue = nextValue
    previousFolderValue = nextValue
  })

  async function handleFolderChange(nextValue: string) {
    if (nextValue === previousFolderValue) return
    previousFolderValue = nextValue
    const targetFolderId = nextValue === '__none' ? null : nextValue
    try {
      await onAssignFolder(s.id, targetFolderId)
    } catch {
      folderValue = s.folderId ?? '__none'
      previousFolderValue = folderValue
    }
  }

  const currentFolderLabel = $derived(
    folderValue === '__none'
      ? 'No folder'
      : (folders.find((folder) => folder.id === folderValue)?.name ?? 'Folder'),
  )

  function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  function getGenreColor(genre: string | null): string {
    switch (genre) {
      case 'Fantasy':
        return 'bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/20'
      case 'Sci-Fi':
        return 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-500/20'
      case 'Mystery':
        return 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20'
      case 'Horror':
        return 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/20'
      case 'Slice of Life':
        return 'bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20'
      case 'Historical':
        return 'bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/20'
      default:
        return 'bg-secondary text-secondary-foreground border-border'
    }
  }
</script>

<div
  role="button"
  tabindex="0"
  title={s.title}
  onclick={() => onOpen(s.id)}
  onkeydown={(e) => e.key === 'Enter' && onOpen(s.id)}
  class="h-full"
>
  <Card.Root
    class="group hover:border-primary relative h-full cursor-pointer overflow-hidden transition-all hover:shadow-md"
  >
    <Card.Header>
      <div class="flex items-center justify-between gap-2">
        <Card.Title class="truncate text-lg leading-tight font-semibold">
          {s.title}
        </Card.Title>
        <div class="flex items-center gap-1">
          <Button
            icon={Copy}
            variant="ghost"
            class="text-muted-foreground hover:text-foreground h-8 w-8 hover:bg-transparent"
            size="icon"
            onclick={(e) => onDuplicate(s, e)}
            title="Duplicate story into wizard"
          />
          <Button
            icon={Trash2}
            variant="ghost"
            class="text-muted-foreground hover:text-foreground h-8 w-8 hover:bg-transparent"
            size="icon"
            onclick={(e) => onDelete(s.id, e)}
            title="Delete story"
          />
        </div>
      </div>
      {#if s.genre}
        <div>
          <TagBadge name={s.genre} color={getGenreColor(s.genre)} />
        </div>
      {/if}
    </Card.Header>
    <Card.Content>
      {#if s.description}
        <p class="text-muted-foreground line-clamp-3 text-sm">
          {s.description}
        </p>
      {:else}
        <p class="text-muted-foreground text-sm italic">No description</p>
      {/if}
    </Card.Content>
    <Card.Footer class="text-muted-foreground mt-auto pt-0 text-xs">
      <div class="flex w-full flex-col gap-2">
        <div class="flex items-center gap-1">
          <Clock class="h-3 w-3" />
          <span>Updated {formatDate(s.updatedAt)}</span>
        </div>
        <div class="flex items-center gap-2">
          <Folder class="h-3.5 w-3.5 shrink-0" />
          <Select.Root
            type="single"
            bind:value={folderValue}
            onValueChange={(next) => void handleFolderChange(next)}
          >
            <Select.Trigger class="h-7 text-xs" onclick={(e) => e.stopPropagation()}>
              <span class="truncate">{currentFolderLabel}</span>
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="__none" label="No folder" />
              {#each folders as folder (folder.id)}
                <Select.Item value={folder.id} label={folder.name} />
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
      </div>
    </Card.Footer>
  </Card.Root>
</div>

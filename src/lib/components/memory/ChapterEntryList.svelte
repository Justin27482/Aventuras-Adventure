<script lang="ts">
  import type { StoryEntry } from '$lib/types'
  import { slide } from 'svelte/transition'
  import * as ResponsiveModal from '$lib/components/ui/responsive-modal'
  import { Button } from '$lib/components/ui/button'
  import { MessageSquare, Scroll } from 'lucide-svelte'
  import { Badge } from '$lib/components/ui/badge'

  interface Props {
    entries: StoryEntry[]
    expanded: boolean
  }

  let { entries, expanded }: Props = $props()
  let readerOpen = $state(false)
  let selectedNarrativeEntry = $state<StoryEntry | null>(null)

  function truncate(text: string, maxLength: number = 100): string {
    if (text.length <= maxLength) return text
    return text.slice(0, maxLength).trim() + '...'
  }

  function getEntryIcon(type: StoryEntry['type']) {
    switch (type) {
      case 'user_action':
        return MessageSquare
      case 'narration':
        return Scroll
      default:
        return Scroll
    }
  }

  function getEntryLabel(type: StoryEntry['type']): string {
    switch (type) {
      case 'user_action':
        return 'ACTION'
      case 'narration':
        return 'NARRATIVE'
      default:
        return 'ENTRY'
    }
  }

  function openNarrativeReader(entry: StoryEntry) {
    selectedNarrativeEntry = entry
    readerOpen = true
  }

  function closeNarrativeReader() {
    readerOpen = false
    selectedNarrativeEntry = null
  }
</script>

{#if expanded && entries.length > 0}
  <div class="mt-2 space-y-1 border-l-2 pl-2" transition:slide={{ duration: 200 }}>
    {#each entries.slice(0, 10) as entry (entry.id)}
      {@const Icon = getEntryIcon(entry.type)}
      <div class="flex items-start gap-2 py-1 text-xs">
        <Badge
          variant={entry.type === 'user_action' ? 'secondary' : 'outline'}
          class="flex h-5 shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium"
        >
          <Icon class="h-3 w-3" />
          <span>{getEntryLabel(entry.type)}</span>
        </Badge>
        {#if entry.type === 'narration'}
          <button
            type="button"
            class="text-muted-foreground hover:text-foreground mt-0.5 text-left leading-relaxed underline-offset-2 hover:underline"
            onclick={() => openNarrativeReader(entry)}
            title="Open full narrative text"
          >
            {truncate(entry.content, 120)}
          </button>
        {:else}
          <span class="text-muted-foreground mt-0.5 leading-relaxed">
            {truncate(entry.content, 120)}
          </span>
        {/if}
      </div>
    {/each}
    {#if entries.length > 10}
      <div class="text-muted-foreground py-1 text-xs">
        ... {entries.length - 10} more entries
      </div>
    {/if}
  </div>
{/if}

<ResponsiveModal.Root open={readerOpen} onOpenChange={(open) => !open && closeNarrativeReader()}>
  <ResponsiveModal.Content class="flex max-h-[90vh] w-[95vw] max-w-4xl flex-col gap-0 overflow-hidden p-0">
    <ResponsiveModal.Header class="border-b px-5 py-4">
      <ResponsiveModal.Title>Chapter Narrative</ResponsiveModal.Title>
      <ResponsiveModal.Description>
        Full narrative text for entry #{(selectedNarrativeEntry?.position ?? 0) + 1}
      </ResponsiveModal.Description>
    </ResponsiveModal.Header>

    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
      {#if selectedNarrativeEntry}
        <article class="text-foreground whitespace-pre-wrap text-sm leading-relaxed">
          {selectedNarrativeEntry.content}
        </article>
      {/if}
    </div>

    <ResponsiveModal.Footer class="border-t px-5 py-3">
      <Button variant="outline" onclick={closeNarrativeReader}>Close</Button>
    </ResponsiveModal.Footer>
  </ResponsiveModal.Content>
</ResponsiveModal.Root>

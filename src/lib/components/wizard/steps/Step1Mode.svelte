<script lang="ts">
  import { Sword, Feather } from 'lucide-svelte'
  import * as Card from '$lib/components/ui/card'
  import type { StoryMode } from '$lib/types'

  interface Props {
    selectedMode: StoryMode
    onModeChange: (mode: StoryMode) => void
  }

  let { selectedMode, onModeChange }: Props = $props()
</script>

<div class="space-y-4">
  <p class="text-muted-foreground">How do you want to experience your story?</p>
  <div class="grid gap-4 sm:grid-cols-2">
    <button class="group w-full text-left focus:outline-none" onclick={() => onModeChange('adventure')}>
      <Card.Root
        class="border-border hover:border-primary hover:shadow-primary/5 h-full transition-all duration-200 hover:shadow-md {selectedMode ===
        'adventure'
          ? 'ring-primary border-primary ring-2'
          : ''}"
      >
        <Card.Header>
          <div class="flex items-center gap-4">
            <div class="bg-primary/10 rounded-lg p-3">
              <Sword class="text-primary h-6 w-6" />
            </div>
            <Card.Title>Adventure Mode</Card.Title>
          </div>
        </Card.Header>
        <Card.Content>
          <p class="text-muted-foreground text-sm">
            <strong>You are the protagonist.</strong> Take actions in-world while the AI narrates outcomes,
            NPC reactions, and evolving consequences.
          </p>
        </Card.Content>
      </Card.Root>
    </button>

    <Card.Root class="border-border h-full opacity-60">
      <Card.Header>
        <div class="flex items-center gap-4">
          <div class="bg-muted rounded-lg p-3">
            <Feather class="text-muted-foreground h-6 w-6" />
          </div>
          <Card.Title>Creative Writing</Card.Title>
        </div>
      </Card.Header>
      <Card.Content>
        <p class="text-muted-foreground text-sm">
          Disabled in this branch. Use Aventuras-Creative for author-directed workflows.
        </p>
      </Card.Content>
    </Card.Root>
  </div>
</div>

<script lang="ts">
  import { ui } from '$lib/stores/ui.svelte'
  import { settings } from '$lib/stores/settings.svelte'
  import {
    Users,
    MapPin,
    Backpack,
    Scroll,
    Clock,
    GitBranch,
    BookOpen,
    BookMarked,
    Brain,
    Coins,
  } from 'lucide-svelte'
  import { story } from '$lib/stores/story.svelte'
  import CharacterPanel from '$lib/components/world/CharacterPanel.svelte'

  import LocationPanel from '$lib/components/world/LocationPanel.svelte'
  import InventoryPanel from '$lib/components/world/InventoryPanel.svelte'
  import ClothingPanel from '$lib/components/world/ClothingPanel.svelte'
  import QuestPanel from '$lib/components/world/QuestPanel.svelte'
  import TimePanel from '$lib/components/world/TimePanel.svelte'
  import BranchPanel from '$lib/components/branch/BranchPanel.svelte'
  import { swipe } from '$lib/utils/swipe'
  import { DESKTOP_BREAKPOINT, MAX_SIDEBAR_WIDTH, MAX_SIDEBAR_RATIO } from '$lib/constants/layout'

  import * as Tabs from '$lib/components/ui/tabs'
  import { Button } from '$lib/components/ui/button'

  const tabs = [
    { id: 'characters' as const, icon: Users, label: 'Characters' },
    { id: 'locations' as const, icon: MapPin, label: 'Locations' },
    { id: 'inventory' as const, icon: Backpack, label: 'Inventory' },
    { id: 'quests' as const, icon: Scroll, label: 'Quests' },
    { id: 'time' as const, icon: Clock, label: 'Time' },
    { id: 'branches' as const, icon: GitBranch, label: 'Branches' },
  ]

  function handleSwipeLeft() {
    // Navigate to next tab
    const currentIndex = tabs.findIndex((t) => t.id === ui.sidebarTab)
    if (currentIndex < tabs.length - 1) {
      ui.setSidebarTab(tabs[currentIndex + 1].id)
    }
  }

  function handleSwipeRight() {
    // Navigate to previous tab, or close sidebar if on first tab
    const currentIndex = tabs.findIndex((t) => t.id === ui.sidebarTab)
    if (currentIndex > 0) {
      ui.setSidebarTab(tabs[currentIndex - 1].id)
    } else {
      // On first tab, swipe right closes sidebar (swiping towards the right edge)
      ui.toggleSidebar()
    }
  }

  let innerWidth = $state(0)
  let scrollContainer = $state<HTMLDivElement | null>(null)

  const showClothingPanel = $derived(
    !!story.currentStory &&
      story.storyMode === 'adventure' &&
      (story.currentStory.settings?.clothingSystemEnabled ?? false),
  )

  const showMoneyPanel = $derived(
    !!story.currentStory &&
      story.storyMode === 'adventure' &&
      (story.currentStory.settings?.moneySystemEnabled ?? false),
  )

  function formatDelta(delta: number): string {
    if (delta > 0) return `+${Math.abs(delta)}`
    if (delta < 0) return `-${Math.abs(delta)}`
    return '0'
  }

  function deltaClass(delta: number): string {
    if (delta > 0) return 'text-green-600 dark:text-green-400'
    if (delta < 0) return 'text-red-600 dark:text-red-400'
    return 'text-muted-foreground'
  }

  $effect(() => {
    void ui.sidebarTab
    if (scrollContainer) scrollContainer.scrollTop = 0
  })
</script>

<svelte:window bind:innerWidth />
<aside
  class="border-border bg-card/80 flex h-full w-[calc(100vw-3rem)] flex-col border-l backdrop-blur-[2px]"
  style:width={innerWidth > DESKTOP_BREAKPOINT ? settings.uiSettings.sidebarWidth + 'px' : ''}
  style:max-width={innerWidth > DESKTOP_BREAKPOINT
    ? Math.min(MAX_SIDEBAR_WIDTH, innerWidth * MAX_SIDEBAR_RATIO) + 'px'
    : '288px'}
  use:swipe={{ onSwipeLeft: handleSwipeLeft, onSwipeRight: handleSwipeRight, threshold: 50 }}
>
  {#if showMoneyPanel}
    <div class="border-border bg-muted/40 relative border-b px-3 py-2">
      <div class="group relative flex items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <Coins class="text-muted-foreground h-4 w-4" />
          <div class="leading-tight">
            <p class="text-foreground text-xs font-semibold uppercase">Money</p>
            <p class="text-muted-foreground text-[11px]">{story.moneyName}</p>
          </div>
        </div>

        <div class="text-right leading-tight">
          <p class="text-foreground text-sm font-semibold">{story.moneyAmount}</p>
          {#if story.lastMoneyDelta !== null}
            <p class={`text-[11px] font-medium ${deltaClass(story.lastMoneyDelta)}`}>
              {formatDelta(story.lastMoneyDelta)} last change
            </p>
          {:else}
            <p class="text-muted-foreground text-[11px]">No recent changes</p>
          {/if}
        </div>

        {#if story.moneyHistory.length > 0}
          <div
            class="bg-popover text-popover-foreground pointer-events-none invisible absolute top-full left-0 z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-md border p-2 opacity-0 shadow-md transition-all duration-150 group-hover:visible group-hover:pointer-events-auto group-hover:opacity-100"
          >
            <p class="text-muted-foreground mb-1 text-[11px] font-semibold uppercase">Recent Changes</p>
            <div class="space-y-1">
              {#each story.moneyHistory as entry (entry.id)}
                <div class="flex items-start justify-between gap-2 rounded-sm px-1 py-0.5 text-xs">
                  <p class="min-w-0 flex-1 truncate" title={entry.reason}>{entry.reason}</p>
                  <span class={`shrink-0 font-semibold ${deltaClass(entry.delta)}`}>
                    {formatDelta(entry.delta)}
                  </span>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Tab navigation -->
  <Tabs.Root
    value={ui.sidebarTab}
    onValueChange={(v) => ui.setSidebarTab(v as any)}
    class="flex min-h-0 flex-1 flex-col"
  >
    <div class="border-border bg-muted/60 flex-shrink-0 border-b px-0">
      <Tabs.List class="flex h-auto w-full justify-start rounded-none bg-transparent p-0">
        {#each tabs as tab (tab.id)}
          <Tabs.Trigger
            value={tab.id}
            class="data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-muted/30 hover:bg-muted/20 text-muted-foreground flex-1 rounded-none border-b-2 border-transparent bg-transparent py-3 transition-colors"
            title={tab.label}
          >
            <tab.icon class="h-4 w-4" />
          </Tabs.Trigger>
        {/each}
      </Tabs.List>
    </div>

    <!-- Panel content -->
    <div bind:this={scrollContainer} class="min-h-0 flex-1 overflow-y-auto p-3">
      <Tabs.Content value="characters" class="mt-0 h-full space-y-4">
        <CharacterPanel />
      </Tabs.Content>
      <Tabs.Content value="locations" class="mt-0 h-full space-y-4">
        <LocationPanel />
      </Tabs.Content>
      <Tabs.Content value="inventory" class="mt-0 h-full space-y-4">
        <InventoryPanel />
        {#if showClothingPanel} <ClothingPanel /> {/if}
      </Tabs.Content>
      <Tabs.Content value="quests" class="mt-0 h-full space-y-4">
        <QuestPanel />
      </Tabs.Content>
      <Tabs.Content value="time" class="mt-0 h-full space-y-4">
        <TimePanel />
      </Tabs.Content>
      <Tabs.Content value="branches" class="mt-0 h-full space-y-4">
        <BranchPanel />
      </Tabs.Content>
    </div>
  </Tabs.Root>

  <!-- Bottom Context Navigation -->
  <div
    class="bottom-context-nav border-border bg-muted flex flex-shrink-0 items-center gap-1 border-t p-2"
  >
    <Button
      variant="ghost"
      class="text-muted-foreground hover:bg-muted/40 hover:text-foreground h-auto min-h-12 flex-1 flex-col gap-1 py-2 text-xs {ui.activePanel ===
      'story'
        ? '!bg-primary/10 !text-primary'
        : ''}"
      onclick={() => ui.setActivePanel('story')}
      title="Story"
    >
      <BookOpen class="h-4 w-4" />
      <span>Story</span>
    </Button>
    <Button
      variant="ghost"
      class="text-muted-foreground hover:bg-muted/40 hover:text-foreground h-auto min-h-12 flex-1 flex-col gap-1 py-2 text-xs {ui.activePanel ===
      'lorebook'
        ? '!bg-primary/10 !text-primary'
        : ''}"
      onclick={() => ui.setActivePanel('lorebook')}
      title="Lorebook"
    >
      <BookMarked class="h-4 w-4" />
      <span>Lorebook</span>
    </Button>
    <Button
      variant="ghost"
      class="text-muted-foreground hover:bg-muted/40 hover:text-foreground h-auto min-h-12 flex-1 flex-col gap-1 py-2 text-xs {ui.activePanel ===
      'memory'
        ? '!bg-primary/10 !text-primary'
        : ''}"
      onclick={() => ui.setActivePanel('memory')}
      title="Memory"
    >
      <Brain class="h-4 w-4" />
      <span>Memory</span>
    </Button>
  </div>
</aside>

<style>
  .bottom-context-nav {
    padding-bottom: 0.5rem;
  }
</style>

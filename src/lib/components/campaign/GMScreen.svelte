<script lang="ts">
  import { onMount } from 'svelte'
  import { campaign } from '$lib/stores/campaign.svelte'
  import { story } from '$lib/stores/story.svelte'
  import { database } from '$lib/services/database'
  import GMControlsPanel from '$lib/components/campaign/GMControlsPanel.svelte'
   import WorldCharterPanel from '$lib/components/campaign/WorldCharterPanel.svelte'
  import { generateSessionRecap } from '$lib/services/campaign/session-recap-service'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Textarea } from '$lib/components/ui/textarea'
  import { Label } from '$lib/components/ui/label'
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card'
  import { Badge } from '$lib/components/ui/badge'
  import { Crown, Eye, EyeOff, ListChecks, Plus, RefreshCw, Timer } from 'lucide-svelte'
  import type { CampaignThread, CampaignThreadBeat, CampaignThreadStatus, CampaignThreadType, CampaignThreadVisibility } from '$lib/types'

  const threadTypes: CampaignThreadType[] = ['plot', 'quest', 'faction', 'mystery', 'character', 'threat', 'custom']
  const threadStatuses: CampaignThreadStatus[] = ['active', 'dormant', 'resolved', 'abandoned']

  let threads = $state<CampaignThread[]>([])
  let beats = $state<CampaignThreadBeat[]>([])
  let isLoading = $state(false)
  let error = $state<string | null>(null)
  let sessionRecap = $state('')
  let isGeneratingRecap = $state(false)

  let newTitle = $state('')
  let newSummary = $state('')
  let newThreadType = $state<CampaignThreadType>('plot')
  let newVisibility = $state<CampaignThreadVisibility>('player_safe')
  let newPriority = $state('0')

  let selectedThreadId = $state<string | null>(null)
  let newBeatTitle = $state('')
  let newBeatSummary = $state('')
  let newBeatVisibility = $state<CampaignThreadVisibility>('player_safe')

  const playerSafeThreads = $derived(threads.filter((thread) => thread.visibility === 'player_safe'))
  const directorOnlyThreads = $derived(threads.filter((thread) => thread.visibility === 'director_only'))
  const selectedThread = $derived(threads.find((thread) => thread.id === selectedThreadId) ?? null)

  function threadBeats(threadId: string): CampaignThreadBeat[] {
    return beats.filter((beat) => beat.threadId === threadId).slice(-3)
  }

  async function loadThreads() {
    if (!campaign.current) return
    isLoading = true
    error = null
    try {
      const [nextThreads, nextBeats] = await Promise.all([
        database.getCampaignThreads(campaign.current.id),
        database.getCampaignThreadBeats(campaign.current.id),
      ])
      threads = nextThreads
      beats = nextBeats
      if (selectedThreadId && !nextThreads.some((thread) => thread.id === selectedThreadId)) {
        selectedThreadId = null
      }
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Failed to load GM planning data'
    } finally {
      isLoading = false
    }
  }

  async function createThread() {
    if (!campaign.current || !newTitle.trim()) return
    const now = Date.now()
    const priority = Number(newPriority)
    const thread: CampaignThread = {
      id: crypto.randomUUID(),
      campaignId: campaign.current.id,
      title: newTitle.trim(),
      summary: newSummary.trim() || null,
      threadType: newThreadType,
      status: 'active',
      visibility: newVisibility,
      priority: Number.isFinite(priority) ? Math.floor(priority) : 0,
      clockValue: 0,
      clockMax: null,
      stakes: null,
      createdAt: now,
      updatedAt: now,
    }
    await database.upsertCampaignThread(thread)
    newTitle = ''
    newSummary = ''
    newPriority = '0'
    selectedThreadId = thread.id
    await loadThreads()
  }

  async function updateThread(thread: CampaignThread, updates: Partial<CampaignThread>) {
    const next = { ...thread, ...updates, updatedAt: Date.now() }
    await database.upsertCampaignThread(next)
    await loadThreads()
  }

  function selectThread(threadId: string) {
    selectedThreadId = threadId
  }

  async function createBeat() {
    if (!campaign.current || !selectedThread || !newBeatTitle.trim()) return
    const now = Date.now()
    const beat: CampaignThreadBeat = {
      id: crypto.randomUUID(),
      campaignId: campaign.current.id,
      threadId: selectedThread.id,
      title: newBeatTitle.trim(),
      summary: newBeatSummary.trim() || null,
      beatType: 'note',
      visibility: newBeatVisibility,
      sortOrder: threadBeats(selectedThread.id).length,
      occurredAt: now,
      createdAt: now,
      updatedAt: now,
    }
    await database.upsertCampaignThreadBeat(beat)
    newBeatTitle = ''
    newBeatSummary = ''
    await loadThreads()
  }

  async function generateRecap() {
    if (!campaign.current || !story.currentStory) return
    isGeneratingRecap = true
    error = null
    try {
      const [chapters, rolls, nextThreads] = await Promise.all([
        database.getChapters(story.currentStory.id),
        database.getRollLedger(campaign.current.id, {
          sessionId: campaign.activeSession?.id,
          limit: 50,
        }),
        database.getCampaignThreads(campaign.current.id),
      ])
      sessionRecap = await generateSessionRecap({
        story: story.currentStory,
        entries: story.entries,
        chapters,
        rolls,
        threads: nextThreads,
        sessionNumber: campaign.activeSession?.sessionNumber,
      })
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Failed to generate session recap'
    } finally {
      isGeneratingRecap = false
    }
  }

  async function prepareScene(sceneMode: 'downtime' | 'camp') {
    try {
      await campaign.setSceneMode(sceneMode)
      await loadThreads()
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Failed to prepare scene workflow'
    }
  }

  onMount(() => {
    void loadThreads()
  })

  $effect(() => {
    if (campaign.current?.id) void loadThreads()
  })
</script>

<div class="bg-background h-full overflow-y-auto p-4 sm:p-6">
  <div class="mx-auto max-w-6xl space-y-5">
    <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div class="flex items-center gap-2">
          <Crown class="text-primary h-5 w-5" />
          <h1 class="text-foreground text-2xl font-semibold">GM Screen</h1>
        </div>
        <p class="text-muted-foreground mt-1 text-sm">
          Director-only planning and manual campaign controls for {story.currentStory?.title ?? 'this campaign'}.
        </p>
      </div>
      <Button variant="outline" size="sm" class="gap-2" onclick={loadThreads} disabled={isLoading}>
        <RefreshCw class="h-4 w-4" />
        Refresh
      </Button>
    </div>

    {#if error}
      <p class="text-destructive rounded-md border border-destructive/30 p-3 text-sm">{error}</p>
    {/if}

    <div class="grid gap-4 xl:grid-cols-[20rem_1fr]">
      <div class="space-y-4">
        <GMControlsPanel />
        <WorldCharterPanel />

        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2 text-base">
              <RefreshCw class="text-primary h-4 w-4" />
              Session Recap
            </CardTitle>
          </CardHeader>
          <CardContent class="space-y-3">
            <p class="text-muted-foreground text-xs">
              Generate a reviewable recap from story entries, chapters, rolls, and campaign threads.
            </p>
            <Button class="w-full gap-2" onclick={generateRecap} disabled={isGeneratingRecap}>
              <RefreshCw class={isGeneratingRecap ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
              {isGeneratingRecap ? 'Generating...' : 'Generate Recap'}
            </Button>
            {#if sessionRecap}
              <Textarea bind:value={sessionRecap} class="min-h-72 text-xs" />
            {/if}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2 text-base">
              <Timer class="text-primary h-4 w-4" />
              Downtime / Montage
            </CardTitle>
          </CardHeader>
          <CardContent class="space-y-3">
            <p class="text-muted-foreground text-xs">
              Prepare a quieter scene mode before resolving downtime or a montage through the narrative flow.
            </p>
            <div class="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" onclick={() => prepareScene('downtime')}>Downtime</Button>
              <Button variant="outline" size="sm" onclick={() => prepareScene('camp')}>Montage / Camp</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div class="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2 text-base">
              <Plus class="text-primary h-4 w-4" />
              Add Campaign Thread
            </CardTitle>
          </CardHeader>
          <CardContent class="grid gap-3 lg:grid-cols-[1fr_9rem_9rem_6rem_auto] lg:items-end">
            <div class="space-y-1.5">
              <Label for="gm-thread-title">Title</Label>
              <Input id="gm-thread-title" bind:value={newTitle} placeholder="Faction moves against the party" />
            </div>
            <div class="space-y-1.5">
              <Label for="gm-thread-type">Type</Label>
              <select id="gm-thread-type" bind:value={newThreadType} class="border-input bg-background h-10 w-full rounded-md border px-3 text-sm">
                {#each threadTypes as type}
                  <option value={type}>{type}</option>
                {/each}
              </select>
            </div>
            <div class="space-y-1.5">
              <Label for="gm-thread-visibility">Visibility</Label>
              <select id="gm-thread-visibility" bind:value={newVisibility} class="border-input bg-background h-10 w-full rounded-md border px-3 text-sm">
                <option value="player_safe">player_safe</option>
                <option value="director_only">director_only</option>
              </select>
            </div>
            <div class="space-y-1.5">
              <Label for="gm-thread-priority">Priority</Label>
              <Input id="gm-thread-priority" bind:value={newPriority} type="number" />
            </div>
            <Button onclick={createThread} disabled={!newTitle.trim()}>Add</Button>
            <div class="space-y-1.5 lg:col-span-5">
              <Label for="gm-thread-summary">Summary</Label>
              <Textarea id="gm-thread-summary" bind:value={newSummary} class="min-h-20" autosize={false} />
            </div>
          </CardContent>
        </Card>

        <div class="grid gap-4 lg:grid-cols-2">
          {@render ThreadColumn('Player-Safe Threads', 'visible', playerSafeThreads, threadStatuses, threadBeats, selectedThreadId, selectThread, updateThread)}
          {@render ThreadColumn('Director-Only Planning', 'hidden', directorOnlyThreads, threadStatuses, threadBeats, selectedThreadId, selectThread, updateThread)}
        </div>

        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2 text-base">
              <ListChecks class="text-primary h-4 w-4" />
              Add Thread Beat
            </CardTitle>
          </CardHeader>
          <CardContent class="space-y-3">
            <div class="grid gap-3 lg:grid-cols-[1fr_10rem_auto] lg:items-end">
              <div class="space-y-1.5">
                <Label for="gm-beat-title">Beat</Label>
                <Input id="gm-beat-title" bind:value={newBeatTitle} placeholder="A clue surfaces" />
              </div>
              <div class="space-y-1.5">
                <Label for="gm-beat-visibility">Visibility</Label>
                <select id="gm-beat-visibility" bind:value={newBeatVisibility} class="border-input bg-background h-10 w-full rounded-md border px-3 text-sm">
                  <option value="player_safe">player_safe</option>
                  <option value="director_only">director_only</option>
                </select>
              </div>
              <Button onclick={createBeat} disabled={!selectedThread || !newBeatTitle.trim()}>Add Beat</Button>
            </div>
            <div class="space-y-1.5">
              <Label for="gm-beat-summary">Summary</Label>
              <Textarea id="gm-beat-summary" bind:value={newBeatSummary} class="min-h-20" autosize={false} />
            </div>
            <p class="text-muted-foreground text-xs">
              {#if selectedThread}
                Adding to: {selectedThread.title}
              {:else}
                Select a thread first.
              {/if}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
</div>

{#snippet ThreadColumn(title: string, icon: 'visible' | 'hidden', items: CampaignThread[], threadStatuses: CampaignThreadStatus[], threadBeats: (threadId: string) => CampaignThreadBeat[], selectedThreadId: string | null, onSelect: (id: string) => void, onUpdate: (thread: CampaignThread, updates: Partial<CampaignThread>) => Promise<void>)}
  <Card>
    <CardHeader>
      <CardTitle class="flex items-center gap-2 text-base">
        {#if icon === 'visible'}
          <Eye class="text-primary h-4 w-4" />
        {:else}
          <EyeOff class="text-primary h-4 w-4" />
        {/if}
        {title}
      </CardTitle>
    </CardHeader>
    <CardContent class="space-y-3">
      {#if items.length === 0}
        <p class="text-muted-foreground rounded-md border p-3 text-sm">No threads yet.</p>
      {:else}
        {#each items as thread (thread.id)}
          <button
            type="button"
            class="border-border bg-muted/20 hover:bg-muted/40 w-full rounded-md border p-3 text-left transition {selectedThreadId === thread.id ? 'border-primary bg-primary/10' : ''}"
            onclick={() => onSelect(thread.id)}
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="text-foreground truncate text-sm font-medium">{thread.title}</p>
                <p class="text-muted-foreground mt-0.5 text-xs">{thread.threadType} · priority {thread.priority}</p>
              </div>
              <Badge variant="secondary" class="text-[10px]">{thread.status}</Badge>
            </div>
            {#if thread.summary}
              <p class="text-muted-foreground mt-2 line-clamp-3 text-xs">{thread.summary}</p>
            {/if}
            <div class="mt-3 grid gap-2 sm:grid-cols-3">
              <select
                value={thread.status}
                class="border-input bg-background h-8 rounded-md border px-2 text-xs"
                onclick={(event) => event.stopPropagation()}
                onchange={(event) => onUpdate(thread, { status: event.currentTarget.value as CampaignThreadStatus })}
              >
                {#each threadStatuses as status}
                  <option value={status}>{status}</option>
                {/each}
              </select>
              <Input
                value={thread.clockValue.toString()}
                type="number"
                class="h-8 text-xs"
                onclick={(event) => event.stopPropagation()}
                onblur={(event) => onUpdate(thread, { clockValue: Math.max(0, Math.floor(Number(event.currentTarget.value) || 0)) })}
              />
              <Input
                value={thread.clockMax?.toString() ?? ''}
                type="number"
                placeholder="max"
                class="h-8 text-xs"
                onclick={(event) => event.stopPropagation()}
                onblur={(event) => {
                  const value = event.currentTarget.value.trim()
                  onUpdate(thread, { clockMax: value ? Math.max(1, Math.floor(Number(value) || 1)) : null })
                }}
              />
            </div>
            {#if threadBeats(thread.id).length > 0}
              <div class="mt-2 space-y-1">
                {#each threadBeats(thread.id) as beat (beat.id)}
                  <p class="text-muted-foreground text-[11px]">- {beat.title}{beat.summary ? `: ${beat.summary}` : ''}</p>
                {/each}
              </div>
            {/if}
          </button>
        {/each}
      {/if}
    </CardContent>
  </Card>
{/snippet}

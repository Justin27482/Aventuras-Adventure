<script lang="ts">
  import { onMount } from 'svelte'
  import { campaign } from '$lib/stores/campaign.svelte'
  import { database } from '$lib/services/database'
  import type { CampaignThread, CampaignThreadBeat } from '$lib/types'
  import { Badge } from '$lib/components/ui/badge'
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card'
  import { ListChecks } from 'lucide-svelte'

  let threads = $state<CampaignThread[]>([])
  let beats = $state<CampaignThreadBeat[]>([])

  async function load() {
    if (!campaign.current) return
    try {
      const [nextThreads, nextBeats] = await Promise.all([
        database.getCampaignThreads(campaign.current.id, { visibility: 'player_safe' }),
        database.getCampaignThreadBeats(campaign.current.id, { visibility: 'player_safe' }),
      ])
      threads = nextThreads.filter((thread) => thread.status === 'active' || thread.status === 'dormant')
      beats = nextBeats
    } catch (error) {
      console.warn('[CampaignQuestPanel] Failed to load campaign threads:', error)
    }
  }

  function threadBeats(threadId: string) {
    return beats.filter((beat) => beat.threadId === threadId).slice(-3)
  }

  onMount(() => {
    void load()
  })

  $effect(() => {
    if (campaign.current?.id) void load()
  })
</script>

{#if threads.length > 0}
  <Card>
    <CardHeader class="px-3 py-2">
      <CardTitle class="flex items-center gap-2 text-sm">
        <ListChecks class="text-primary h-4 w-4" />
        Campaign Threads
      </CardTitle>
    </CardHeader>
    <CardContent class="space-y-2 px-3 pb-3">
      {#each threads as thread (thread.id)}
        <div class="border-border rounded-md border p-2">
          <div class="flex items-start justify-between gap-2">
            <p class="text-foreground min-w-0 truncate text-xs font-medium">{thread.title}</p>
            <Badge variant="secondary" class="shrink-0 text-[10px]">{thread.status}</Badge>
          </div>
          {#if thread.summary}
            <p class="text-muted-foreground mt-1 text-xs">{thread.summary}</p>
          {/if}
          {#if thread.clockMax !== null}
            <p class="text-muted-foreground mt-1 text-[11px]">Progress: {thread.clockValue}/{thread.clockMax}</p>
          {/if}
          {#if threadBeats(thread.id).length > 0}
            <div class="mt-2 space-y-1">
              {#each threadBeats(thread.id) as beat (beat.id)}
                <p class="text-muted-foreground text-[11px]">- {beat.title}</p>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </CardContent>
  </Card>
{/if}

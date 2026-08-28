<script lang="ts">
  import { campaign } from '$lib/stores/campaign.svelte'
  import { story } from '$lib/stores/story.svelte'
  import { Button } from '$lib/components/ui/button'
  import { Textarea } from '$lib/components/ui/textarea'
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card'
  import { BookOpenText, Check, Loader2, Sparkles } from 'lucide-svelte'
  import { buildWorldCharterDraft, expandWorldCharterDraft } from '$lib/services/campaign/world-charter-service'

  let draft = $state('')
  let saving = $state(false)
  let expanding = $state(false)
  let saved = $state(false)
  let error = $state<string | null>(null)

  $effect(() => {
    draft = campaign.settings?.worldCharter ?? ''
  })

  const input = $derived.by(() => {
    if (!story.currentStory) return null
    return {
      story: story.currentStory,
      characters: story.characters,
      locations: story.locations,
      lorebookEntries: story.lorebookEntries,
      storyBeats: story.storyBeats,
      entries: story.entries,
      existingCharter: draft,
    }
  })

  async function save() {
    if (!campaign.settings) return
    saving = true
    saved = false
    error = null
    try {
      await campaign.updateSettings({ worldCharter: draft.trim() || null })
      saved = true
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Failed to save world charter'
    } finally {
      saving = false
    }
  }

  function draftFromCampaign() {
    if (!input) return
    draft = buildWorldCharterDraft(input)
    void save()
  }

  async function expandWithAI() {
    if (!input) return
    expanding = true
    error = null
    try {
      draft = await expandWorldCharterDraft(input)
      await save()
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Failed to expand world charter'
    } finally {
      expanding = false
    }
  }
</script>

<Card>
  <CardHeader>
    <CardTitle class="flex items-center gap-2 text-base">
      <BookOpenText class="text-primary h-4 w-4" />
      World Charter
    </CardTitle>
  </CardHeader>
  <CardContent class="space-y-3">
    <p class="text-muted-foreground text-xs">Campaign truths, boundaries, faction tensions, open mysteries, and director guidance.</p>
    <div class="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onclick={draftFromCampaign} disabled={!input || saving || expanding}>
        {#if saving}<Loader2 class="h-3.5 w-3.5 animate-spin" />{:else}<Sparkles class="h-3.5 w-3.5" />{/if}
        Draft from Campaign
      </Button>
      <Button variant="outline" size="sm" onclick={expandWithAI} disabled={!input || saving || expanding}>
        {#if expanding}<Loader2 class="h-3.5 w-3.5 animate-spin" />{:else}<Sparkles class="h-3.5 w-3.5" />{/if}
        Expand with AI
      </Button>
    </div>
    <Textarea bind:value={draft} rows={12} placeholder="Define the campaign premise, immutable facts, factions, open questions, and boundaries the GM should preserve." />
    <div class="flex items-center justify-between gap-3">
      {#if error}<p class="text-destructive text-xs">{error}</p>{:else if saved}<p class="inline-flex items-center gap-1 text-xs text-emerald-500"><Check class="h-3 w-3" /> Saved</p>{:else}<span></span>{/if}
      <Button size="sm" onclick={() => void save()} disabled={!campaign.settings || saving || expanding}>Save Charter</Button>
    </div>
  </CardContent>
</Card>

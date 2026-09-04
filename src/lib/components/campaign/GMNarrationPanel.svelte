<script lang="ts">
  import { story } from '$lib/stores/story.svelte'
  import { ui } from '$lib/stores/ui.svelte'
  import {
    buildNarrativeHelperMetadata,
    narrativeHelperService,
  } from '$lib/services/ai-player/narrative-helper-service'
  import { Button } from '$lib/components/ui/button'
  import { Textarea } from '$lib/components/ui/textarea'
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card'
  import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs'
  import { BookOpenText, Check, Loader2, RefreshCw, Sparkles, Wand2 } from 'lucide-svelte'

  let activeTab = $state<'raw' | 'summary'>('raw')
  let summary = $state('')
  let polishedDraft = $state('')
  let isGenerating = $state(false)
  let isAccepting = $state(false)
  let error = $state<string | null>(null)

  const sceneSummary = $derived(story.entries.at(-1)?.content ?? '')

  async function polishSummary() {
    const nextSummary = summary.trim()
    if (!nextSummary) return

    isGenerating = true
    error = null
    try {
      if (!story.currentStory) throw new Error('Open a story before polishing narration.')
      polishedDraft = await narrativeHelperService.expandSummary({
        storyId: story.currentStory.id,
        summary: nextSummary,
        sceneSummary,
        mood: 'neutral',
        audience: 'full_table',
        includeFactCheck: true,
      })
      activeTab = 'summary'
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Failed to polish the summary.'
    } finally {
      isGenerating = false
    }
  }

  async function regenerate() {
    const nextSummary = summary.trim()
    if (!nextSummary || !polishedDraft.trim()) return

    isGenerating = true
    error = null
    try {
      if (!story.currentStory) throw new Error('Open a story before regenerating narration.')
      polishedDraft = await narrativeHelperService.regenerate({
        storyId: story.currentStory.id,
        summary: nextSummary,
        previousText: polishedDraft,
        tone: 'more_direct',
      })
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Failed to regenerate the narration.'
    } finally {
      isGenerating = false
    }
  }

  async function acceptNarration() {
    const nextText = polishedDraft.trim() || summary.trim()
    if (!nextText) return

    isAccepting = true
    error = null
    try {
      const metadata = buildNarrativeHelperMetadata(summary.trim(), nextText)
      await story.addEntry('narration', nextText, metadata)
      ui.showToast('Narration was added to the campaign log', 'info')
      summary = ''
      polishedDraft = ''
      activeTab = 'raw'
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Failed to add narration to the story.'
    } finally {
      isAccepting = false
    }
  }
</script>

<Card>
  <CardHeader>
    <CardTitle class="flex items-center gap-2 text-base">
      <BookOpenText class="text-primary h-4 w-4" /> GM Narration Helper
    </CardTitle>
  </CardHeader>
  <CardContent class="space-y-3">
    <p class="text-muted-foreground text-xs">
      Capture a GM summary and polish it into narration without inventing scene facts.
    </p>

    <Tabs bind:value={activeTab} class="space-y-3">
      <TabsList class="grid w-full grid-cols-2">
        <TabsTrigger value="raw">Raw</TabsTrigger>
        <TabsTrigger value="summary">Summary &amp; Polish</TabsTrigger>
      </TabsList>

      <TabsContent value="raw" class="space-y-3">
        <Textarea bind:value={summary} class="min-h-32 text-sm" placeholder="Write the scene summary or GM notes here..." />
        <div class="flex gap-2">
          <Button class="gap-2" onclick={polishSummary} disabled={isGenerating || !summary.trim()}>
            {#if isGenerating}<Loader2 class="h-4 w-4 animate-spin" />{:else}<Sparkles class="h-4 w-4" />{/if}
            {isGenerating ? 'Polishing...' : 'Polish Summary'}
          </Button>
        </div>
      </TabsContent>

      <TabsContent value="summary" class="space-y-3">
        <Textarea bind:value={polishedDraft} class="min-h-32 text-sm" placeholder="Polished narration will appear here..." />
        <div class="flex flex-wrap gap-2">
          <Button variant="outline" class="gap-2" onclick={regenerate} disabled={isGenerating || !polishedDraft.trim()}>
            {#if isGenerating}<Loader2 class="h-4 w-4 animate-spin" />{:else}<RefreshCw class="h-4 w-4" />{/if}
            {isGenerating ? 'Regenerating...' : 'Regenerate'}
          </Button>
          <Button class="gap-2" onclick={acceptNarration} disabled={isAccepting || !polishedDraft.trim()}>
            {#if isAccepting}<Loader2 class="h-4 w-4 animate-spin" />{:else}<Check class="h-4 w-4" />{/if}
            {isAccepting ? 'Saving...' : 'Accept into Story'}
          </Button>
        </div>
      </TabsContent>
    </Tabs>

    {#if error}
      <p class="text-destructive rounded-md border border-destructive/30 p-2 text-xs">{error}</p>
    {/if}
  </CardContent>
</Card>

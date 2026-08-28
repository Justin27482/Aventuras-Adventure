<script lang="ts">
  import { ui } from '$lib/stores/ui.svelte'
  import { generatePlainText } from '$lib/services/ai/sdk'
  import { WorldbuildingAssistantService, type WorldbuildingDraft } from '$lib/services/ai/worldbuilding/WorldbuildingAssistantService'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Textarea } from '$lib/components/ui/textarea'
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card'
  import { ArrowLeft, BookOpenText, Loader2, Sparkles, Send, Check, X, MessageCircle } from 'lucide-svelte'

  let title = $state('')
  let premise = $state('')
  let genre = $state('Fantasy')
  let tone = $state('')
  let powerScale = $state('')
  let magicTechnology = $state('')
  let factions = $state('')
  let calendar = $state('')
  let themes = $state('')
  let boundaries = $state('')
  let charter = $state('')
  let isExpanding = $state(false)
  let error = $state<string | null>(null)
  let assistantInput = $state('')
  let assistantLoading = $state(false)
  let assistantError = $state<string | null>(null)
  let assistantMessages = $state<Array<{ role: 'user' | 'assistant'; content: string }>>([
    { role: 'assistant', content: 'Tell me what kind of world you want to make. I can brainstorm options, ask focused questions, and prepare edits for your review.' },
  ])
  let pendingProposal = $state<Partial<WorldbuildingDraft> | null>(null)
  const worldbuildingAssistant = new WorldbuildingAssistantService()

  function currentDraft(): WorldbuildingDraft {
    return { title, premise, genre, tone, powerScale, magicTechnology, factions, calendar, themes, boundaries }
  }

  function applyProposal() {
    if (!pendingProposal) return
    title = pendingProposal.title ?? title
    premise = pendingProposal.premise ?? premise
    genre = pendingProposal.genre ?? genre
    tone = pendingProposal.tone ?? tone
    powerScale = pendingProposal.powerScale ?? powerScale
    magicTechnology = pendingProposal.magicTechnology ?? magicTechnology
    factions = pendingProposal.factions ?? factions
    calendar = pendingProposal.calendar ?? calendar
    themes = pendingProposal.themes ?? themes
    boundaries = pendingProposal.boundaries ?? boundaries
    pendingProposal = null
    charter = buildDraft()
  }

  function discardProposal() {
    pendingProposal = null
  }

  async function sendAssistantMessage() {
    const message = assistantInput.trim()
    if (!message || assistantLoading) return
    assistantInput = ''
    assistantMessages = [...assistantMessages, { role: 'user', content: message }]
    assistantLoading = true
    assistantError = null
    try {
      const response = await worldbuildingAssistant.respond(currentDraft(), message)
      assistantMessages = [...assistantMessages, { role: 'assistant', content: response.reply }]
      pendingProposal = Object.keys(response.proposal).length > 0 ? response.proposal : null
    } catch (reason) {
      assistantError = reason instanceof Error ? reason.message : 'The worldbuilding assistant could not respond.'
    } finally {
      assistantLoading = false
    }
  }

  function buildDraft(): string {
    const lines = [
      '# World Charter',
      title.trim() ? `World: ${title.trim()}` : null,
      genre.trim() ? `Genre: ${genre.trim()}` : null,
      premise.trim() ? `Premise: ${premise.trim()}` : null,
      '',
      '## Tone and Themes',
      tone.trim() ? `- Tone: ${tone.trim()}` : '- Define the desired narrative tone.',
      themes.trim() ? `- Themes: ${themes.trim()}` : '- Define the themes the campaign should explore.',
      '',
      '## Power and Technology',
      powerScale.trim() ? `- Power scale: ${powerScale.trim()}` : '- Define the expected power scale.',
      magicTechnology.trim() ? `- Magic and technology: ${magicTechnology.trim()}` : '- Define the role and limits of magic or technology.',
      '',
      '## Factions and Pressures',
      factions.trim() ? factions.trim().split('\n').map((value) => `- ${value.trim()}`).join('\n') : '- Add factions, institutions, or forces with competing agendas.',
      '',
      '## Calendar and Continuity',
      calendar.trim() ? `- ${calendar.trim()}` : '- Define calendar, seasons, holidays, or timekeeping conventions.',
      '',
      '## Boundaries',
      boundaries.trim() ? boundaries.trim().split('\n').map((value) => `- ${value.trim()}`).join('\n') : '- Add content and setting boundaries the GM must preserve.',
      '',
      '## Director Notes',
      '- Preserve established facts and surface contradictions before introducing new canon.',
    ]
    return lines.filter((line): line is string => line !== null).join('\n')
  }

  function createDraft() {
    error = null
    charter = buildDraft()
  }

  async function expandDraft() {
    if (!charter.trim()) createDraft()
    isExpanding = true
    error = null
    try {
      charter = await generatePlainText(
        {
          presetId: 'agentic',
          system: 'You are a careful tabletop worldbuilding assistant. Expand the supplied world charter into comprehensive GM-facing guidance. Preserve all provided facts, identify open questions, and do not add contradictions. Return only markdown.',
          prompt: `Expand this world charter with useful sections for geography, history, factions, conflicts, character hooks, calendar continuity, power limits, and player-facing boundaries.\n\n${charter}`,
        },
        'worldbuildingAssistant',
      )
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Failed to expand world charter'
    } finally {
      isExpanding = false
    }
  }
</script>

<div class="h-full min-h-0 overflow-y-auto p-4 sm:p-6">
  <div class="mx-auto max-w-6xl space-y-6 pb-8">
    <div class="flex items-start justify-between gap-3">
      <div>
        <h1 class="text-foreground flex items-center gap-2 text-xl font-semibold"><BookOpenText class="text-primary h-5 w-5" /> Worldbuilding Assistant</h1>
        <p class="text-muted-foreground mt-1 text-sm">Shape the setting before creating a campaign.</p>
      </div>
      <Button variant="outline" size="sm" class="gap-1.5" onclick={() => ui.setActivePanel('library')}><ArrowLeft class="h-3.5 w-3.5" /> Library</Button>
    </div>

    <div class="grid gap-4 xl:grid-cols-2 xl:items-stretch">
      <Card>
        <CardHeader><CardTitle class="text-sm">Interview</CardTitle></CardHeader>
        <CardContent class="space-y-3">
          <div class="space-y-1"><label for="world-title" class="text-xs font-medium">World name</label><Input id="world-title" bind:value={title} placeholder="The Shattered Realms" /></div>
          <div class="space-y-1"><label for="world-premise" class="text-xs font-medium">Core premise</label><Textarea id="world-premise" bind:value={premise} rows={3} placeholder="What is changing in this world, and why does it matter now?" /></div>
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="space-y-1"><label for="world-genre" class="text-xs font-medium">Genre</label><Input id="world-genre" bind:value={genre} /></div>
            <div class="space-y-1"><label for="world-tone" class="text-xs font-medium">Tone</label><Input id="world-tone" bind:value={tone} placeholder="Hopeful, eerie, political" /></div>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="space-y-1"><label for="world-power" class="text-xs font-medium">Power scale</label><Input id="world-power" bind:value={powerScale} placeholder="Low, heroic, mythic" /></div>
            <div class="space-y-1"><label for="world-magic" class="text-xs font-medium">Magic / technology</label><Input id="world-magic" bind:value={magicTechnology} placeholder="Rare magic, early industry" /></div>
          </div>
          <div class="space-y-1"><label for="world-factions" class="text-xs font-medium">Factions and pressures</label><Textarea id="world-factions" bind:value={factions} rows={4} placeholder="One faction or pressure per line" /></div>
          <div class="space-y-1"><label for="world-calendar" class="text-xs font-medium">Calendar and continuity</label><Textarea id="world-calendar" bind:value={calendar} rows={2} placeholder="Seasons, holidays, eras, timekeeping" /></div>
          <div class="space-y-1"><label for="world-themes" class="text-xs font-medium">Themes</label><Input id="world-themes" bind:value={themes} placeholder="Freedom, identity, sacrifice" /></div>
          <div class="space-y-1"><label for="world-boundaries" class="text-xs font-medium">Boundaries</label><Textarea id="world-boundaries" bind:value={boundaries} rows={3} placeholder="One boundary or hard limit per line" /></div>
          <div class="flex flex-wrap gap-2 pt-2"><Button onclick={createDraft} class="gap-2"><BookOpenText class="h-3.5 w-3.5" /> Build Charter</Button><Button variant="outline" onclick={expandDraft} disabled={isExpanding} class="gap-2">{#if isExpanding}<Loader2 class="h-3.5 w-3.5 animate-spin" />{:else}<Sparkles class="h-3.5 w-3.5" />{/if} Expand with AI</Button></div>
        </CardContent>
      </Card>

      <Card class="flex h-full min-h-[34rem] flex-col xl:min-w-0">
          <CardHeader><CardTitle class="flex items-center gap-2 text-sm"><MessageCircle class="h-4 w-4" /> Brainstorm together</CardTitle></CardHeader>
          <CardContent class="flex min-h-0 flex-1 flex-col gap-3">
            <div class="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-md border p-3">
              {#each assistantMessages as message}
                <div class={`rounded-md p-2 text-sm ${message.role === 'user' ? 'bg-primary/10 ml-6' : 'bg-muted mr-6'}`}>
                  <div class="text-muted-foreground mb-1 text-[10px] font-semibold uppercase">{message.role === 'user' ? 'You' : 'Assistant'}</div>
                  <p class="whitespace-pre-wrap">{message.content}</p>
                </div>
              {/each}
              {#if assistantLoading}<div class="text-muted-foreground flex items-center gap-2 text-xs"><Loader2 class="h-3.5 w-3.5 animate-spin" /> Thinking about the next question...</div>{/if}
            </div>
            {#if pendingProposal}
              <div class="border-primary/40 bg-primary/5 rounded-md border p-3">
                <div class="mb-2 flex items-center justify-between gap-2"><p class="text-xs font-semibold">Proposed draft updates</p><span class="text-muted-foreground text-[10px]">Review before applying</span></div>
                <div class="max-h-32 space-y-1 overflow-y-auto text-xs">
                  {#each Object.entries(pendingProposal) as [field, value]}
                    <p><span class="font-medium">{field}:</span> {value}</p>
                  {/each}
                </div>
                <div class="mt-3 flex gap-2"><Button size="sm" onclick={applyProposal} class="gap-1.5"><Check class="h-3.5 w-3.5" /> Apply updates</Button><Button size="sm" variant="outline" onclick={discardProposal} class="gap-1.5"><X class="h-3.5 w-3.5" /> Discard</Button></div>
              </div>
            {/if}
            {#if assistantError}<p class="text-destructive text-xs">{assistantError}</p>{/if}
            <div class="flex items-end gap-2"><Textarea bind:value={assistantInput} rows={3} placeholder="Brainstorm, answer a question, or ask the assistant to revise a world detail..." onkeydown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void sendAssistantMessage() } }} /><Button aria-label="Send message" title="Send message" disabled={assistantLoading || !assistantInput.trim()} onclick={() => void sendAssistantMessage()}><Send class="h-4 w-4" /></Button></div>
            <p class="text-muted-foreground text-[10px]">The assistant can propose edits, but it never changes the charter until you approve them.</p>
          </CardContent>
      </Card>

      <Card class="xl:col-span-2">
        <CardHeader><CardTitle class="text-sm">Charter Draft</CardTitle></CardHeader>
        <CardContent class="space-y-3">
          <Textarea bind:value={charter} rows={18} class="font-mono text-xs" placeholder="Your world charter will appear here." />
          {#if error}<p class="text-destructive rounded-md border border-destructive/30 p-2 text-xs">{error}</p>{/if}
          <p class="text-muted-foreground text-xs">This pre-campaign draft is not saved to a campaign. Copy it into a new campaign's World Charter after creation.</p>
        </CardContent>
      </Card>
    </div>
  </div>
</div>

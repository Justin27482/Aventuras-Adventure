<script lang="ts">
  import { database } from '$lib/services/database'
  import type { AIPlayer, AIPlayerPersonality } from '$lib/types'
  import { ArrowLeft, Archive, Bot, Copy, Pencil, Plus, Save, Trash2, X } from 'lucide-svelte'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Textarea } from '$lib/components/ui/textarea'
  import { Label } from '$lib/components/ui/label'
  import { Switch } from '$lib/components/ui/switch'
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card'
  import AIPlayerMemoryPanel from './AIPlayerMemoryPanel.svelte'
  import { ui } from '$lib/stores/ui.svelte'

  const defaultPersonality = (): AIPlayerPersonality => ({
    coreMotivation: '',
    primaryPlaystyle: 'hybrid',
    riskTolerance: 5,
    immersion: 6,
    arousal: 1,
    humorStyle: '',
    decisionSpeed: 'balanced',
    combatApproach: '',
    socialPriorities: [],
    redLines: [],
  })

  let players = $state<AIPlayer[]>([])
  let selectedId = $state<string | null>(null)
  let name = $state('')
  let basePromptProfile = $state('')
  let personality = $state<AIPlayerPersonality>(defaultPersonality())
  let socialPrioritiesText = $state('')
  let redLinesText = $state('')
  let loading = $state(true)
  let saving = $state(false)
  let error = $state<string | null>(null)
  let showArchived = $state(false)

  const selectedPlayer = $derived(players.find((player) => player.id === selectedId) ?? null)
  const isEditing = $derived(selectedId !== null)
  const visiblePlayers = $derived(
    showArchived ? players : players.filter((player) => player.archivedAt === null),
  )

  $effect(() => {
    void loadPlayers()
  })

  async function loadPlayers() {
    loading = true
    error = null
    try {
      players = await database.listAIPlayers(true)
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Failed to load AI Players'
    } finally {
      loading = false
    }
  }

  function resetForm() {
    selectedId = null
    name = ''
    basePromptProfile = ''
    personality = defaultPersonality()
    socialPrioritiesText = ''
    redLinesText = ''
    error = null
  }

  function editPlayer(player: AIPlayer) {
    selectedId = player.id
    name = player.name
    basePromptProfile = player.basePromptProfile ?? ''
    personality = { ...defaultPersonality(), ...player.basePersonality }
    socialPrioritiesText = personality.socialPriorities.join(', ')
    redLinesText = personality.redLines.join(', ')
    error = null
  }

  function buildPersonality(): AIPlayerPersonality {
    return {
      ...personality,
      riskTolerance: Math.max(0, Math.min(10, Math.floor(Number(personality.riskTolerance) || 0))),
      immersion: Math.max(0, Math.min(10, Math.floor(Number(personality.immersion) || 0))),
      arousal: Math.max(0, Math.min(10, Math.floor(Number(personality.arousal) || 0))),
      socialPriorities: socialPrioritiesText
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      redLines: redLinesText
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    }
  }

  async function savePlayer() {
    if (saving) return
    if (!name.trim()) {
      error = 'AI Player name is required'
      return
    }
    saving = true
    error = null
    const now = Date.now()
    try {
      await database.upsertAIPlayer({
        id: selectedId ?? crypto.randomUUID(),
        name: name.trim(),
        basePersonality: buildPersonality(),
        basePromptProfile: basePromptProfile.trim() || null,
        archivedAt: selectedPlayer?.archivedAt ?? null,
        createdAt: selectedPlayer?.createdAt ?? now,
        updatedAt: now,
      })
      await loadPlayers()
      resetForm()
      ui.showToast('AI Player saved', 'info')
    } catch (cause) {
      error = cause instanceof Error ? `Failed to save AI Player: ${cause.message}` : String(cause)
    } finally {
      saving = false
    }
  }

  async function duplicatePlayer(player: AIPlayer) {
    try {
      await database.duplicateAIPlayer(player)
      await loadPlayers()
      ui.showToast('AI Player duplicated', 'info')
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Failed to duplicate AI Player'
    }
  }

  async function toggleArchive(player: AIPlayer) {
    try {
      await database.archiveAIPlayer(player.id, player.archivedAt ? null : Date.now())
      await loadPlayers()
      if (selectedId === player.id) resetForm()
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Failed to update AI Player'
    }
  }

  async function deletePlayer(player: AIPlayer) {
    try {
      await database.deleteAIPlayer(player.id)
      await loadPlayers()
      if (selectedId === player.id) resetForm()
      ui.showToast('AI Player deleted', 'info')
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'AI Player could not be deleted'
    }
  }
</script>

<div class="bg-background h-full overflow-y-auto p-4 sm:p-6">
  <div class="mx-auto max-w-6xl space-y-6">
    <div class="flex items-start justify-between gap-4">
      <div>
        <Button variant="ghost" size="sm" onclick={() => ui.setActivePanel('library')}>
          <ArrowLeft class="h-4 w-4" /> Back to Library
        </Button>
        <h1 class="mt-3 text-2xl font-bold">AI Player Library</h1>
        <p class="text-muted-foreground mt-1 text-sm">Reusable player personalities for multiple campaigns.</p>
      </div>
      <Button icon={Plus} label="New AI Player" onclick={resetForm} />
    </div>

    {#if error}
      <div class="border-destructive/30 bg-destructive/10 text-destructive rounded-md border p-3 text-sm">{error}</div>
    {/if}

    <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
      <Card>
        <CardHeader>
          <div class="flex items-center justify-between gap-3">
            <CardTitle>Global Profiles</CardTitle>
            <label class="text-muted-foreground flex items-center gap-2 text-xs">
              <Switch checked={showArchived} onCheckedChange={(checked) => (showArchived = checked)} />
              Show archived
            </label>
          </div>
        </CardHeader>
        <CardContent class="space-y-2">
          {#if loading}
            <p class="text-muted-foreground text-sm">Loading AI Players...</p>
          {:else if visiblePlayers.length === 0}
            <div class="text-muted-foreground flex min-h-40 flex-col items-center justify-center gap-3 text-center">
              <Bot class="h-8 w-8" />
              <p>{showArchived ? 'No AI Player profiles yet.' : 'No active AI Player profiles.'}</p>
              <Button icon={Plus} label="Create AI Player" onclick={resetForm} />
            </div>
          {:else}
            {#each visiblePlayers as player (player.id)}
              <div class="border-border flex items-center gap-3 rounded-md border p-3">
                <Bot class="text-primary h-5 w-5 shrink-0" />
                <div class="min-w-0 flex-1">
                  <p class="truncate font-medium">{player.name}</p>
                  <p class="text-muted-foreground text-xs">{player.basePersonality.primaryPlaystyle} · risk {player.basePersonality.riskTolerance}/10 · immersion {player.basePersonality.immersion ?? 5}/10 · arousal {player.basePersonality.arousal ?? 0}/10</p>
                </div>
                {#if player.archivedAt}<span class="text-muted-foreground text-xs">Archived</span>{/if}
                <Button variant="ghost" size="icon" title="Edit AI Player" onclick={() => editPlayer(player)}><Pencil class="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" title="Duplicate AI Player" onclick={() => duplicatePlayer(player)}><Copy class="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" title={player.archivedAt ? 'Restore AI Player' : 'Archive AI Player'} onclick={() => toggleArchive(player)}><Archive class="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" title="Delete AI Player" onclick={() => deletePlayer(player)}><Trash2 class="h-4 w-4" /></Button>
              </div>
            {/each}
          {/if}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{isEditing ? 'Edit AI Player' : 'Create AI Player'}</CardTitle></CardHeader>
        <CardContent>
          <form class="space-y-4" onsubmit={(event) => { event.preventDefault(); void savePlayer() }}>
            <div class="space-y-2"><Label for="ai-player-name">Name</Label><Input id="ai-player-name" bind:value={name} placeholder="e.g. The Tactical Mage" /></div>
            <div class="space-y-2"><Label for="ai-player-motivation">Core motivation</Label><Textarea id="ai-player-motivation" bind:value={personality.coreMotivation} /></div>
            <div class="grid grid-cols-2 gap-3">
              <div class="space-y-2"><Label for="ai-player-playstyle">Playstyle</Label><Input id="ai-player-playstyle" bind:value={personality.primaryPlaystyle} /></div>
              <div class="space-y-2"><Label for="ai-player-risk">Risk tolerance (0-10)</Label><Input id="ai-player-risk" type="number" min="0" max="10" bind:value={personality.riskTolerance} /></div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div class="space-y-2"><Label for="ai-player-immersion">Immersion (0-10)</Label><Input id="ai-player-immersion" type="number" min="0" max="10" bind:value={personality.immersion} /></div>
              <div class="space-y-2"><Label for="ai-player-arousal">Arousal (0-10)</Label><Input id="ai-player-arousal" type="number" min="0" max="10" bind:value={personality.arousal} /></div>
            </div>
            <div class="space-y-2"><Label for="ai-player-humor">Humor style</Label><Input id="ai-player-humor" bind:value={personality.humorStyle} /></div>
            <div class="space-y-2"><Label for="ai-player-combat">Combat approach</Label><Textarea id="ai-player-combat" bind:value={personality.combatApproach} /></div>
            <div class="space-y-2"><Label for="ai-player-social">Social priorities</Label><Input id="ai-player-social" bind:value={socialPrioritiesText} placeholder="trust, mercy, discovery" /></div>
            <div class="space-y-2"><Label for="ai-player-red-lines">Red lines</Label><Input id="ai-player-red-lines" bind:value={redLinesText} placeholder="betrayal, cruelty" /></div>
            <div class="space-y-2"><Label for="ai-player-profile">Prompt profile</Label><Textarea id="ai-player-profile" bind:value={basePromptProfile} /></div>
            <div class="flex justify-end gap-2">
              {#if isEditing}<Button type="button" variant="outline" icon={X} label="Cancel" onclick={resetForm} />{/if}
              <Button type="submit" icon={Save} label={saving ? 'Saving...' : 'Save AI Player'} disabled={saving} />
            </div>
          </form>
        </CardContent>
      </Card>

      {#if selectedPlayer}
        <AIPlayerMemoryPanel aiPlayerId={selectedPlayer.id} aiPlayerName={selectedPlayer.name} />
      {/if}
    </div>
  </div>
</div>

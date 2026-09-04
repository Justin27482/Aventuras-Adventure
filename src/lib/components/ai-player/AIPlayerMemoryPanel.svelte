<script lang="ts">
  import { database } from '$lib/services/database'
  import type { AIPlayerMemory, AIPlayerMemoryInjectionMode, AIPlayerMemoryScope } from '$lib/types'
  import { Brain, Pin, Plus, Save, Trash2, X } from 'lucide-svelte'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Textarea } from '$lib/components/ui/textarea'
  import { Label } from '$lib/components/ui/label'
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card'
  import { ui } from '$lib/stores/ui.svelte'

  interface Props {
    aiPlayerId: string
    aiPlayerName: string
  }

  let { aiPlayerId, aiPlayerName }: Props = $props()

  let memories = $state<AIPlayerMemory[]>([])
  let loading = $state(true)
  let saving = $state(false)
  let error = $state<string | null>(null)
  let editingId = $state<string | null>(null)
  let title = $state('')
  let content = $state('')
  let keywordsText = $state('')
  let scope = $state<AIPlayerMemoryScope>('campaign')
  let injectionMode = $state<AIPlayerMemoryInjectionMode>('keyword')
  let priority = $state(5)
  let pinned = $state(false)

  const editing = $derived(memories.find((memory) => memory.id === editingId) ?? null)

  $effect(() => {
    void loadMemories(aiPlayerId)
  })

  async function loadMemories(playerId: string) {
    loading = true
    error = null
    try {
      memories = await database.getAIPlayerMemories(playerId)
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Failed to load memories'
    } finally {
      loading = false
    }
  }

  function resetForm() {
    editingId = null
    title = ''
    content = ''
    keywordsText = ''
    scope = 'campaign'
    injectionMode = 'keyword'
    priority = 5
    pinned = false
    error = null
  }

  function editMemory(memory: AIPlayerMemory) {
    editingId = memory.id
    title = memory.title
    content = memory.content
    keywordsText = memory.keywords.join(', ')
    scope = memory.scope
    injectionMode = memory.injectionMode
    priority = memory.priority
    pinned = memory.pinned
    error = null
  }

  async function saveMemory() {
    if (saving) return
    if (!content.trim()) {
      error = 'Memory content is required'
      return
    }
    saving = true
    error = null
    const now = Date.now()
    try {
      await database.upsertAIPlayerMemory({
        id: editingId ?? crypto.randomUUID(),
        aiPlayerId,
        // Manually authored memories have no campaign origin unless they came from play.
        originCampaignId: editing?.originCampaignId ?? null,
        originCampaignTitle: editing?.originCampaignTitle ?? null,
        originSetupSessionId: editing?.originSetupSessionId ?? null,
        originSessionId: editing?.originSessionId ?? null,
        characterId: editing?.characterId ?? null,
        characterName: editing?.characterName ?? null,
        source: editing?.source ?? 'gm_authored',
        title: title.trim(),
        content: content.trim(),
        keywords: keywordsText
          .split(',')
          .map((keyword) => keyword.trim())
          .filter(Boolean),
        scope,
        injectionMode,
        priority: Math.max(0, Math.min(10, Math.floor(Number(priority) || 0))),
        pinned,
        createdAt: editing?.createdAt ?? now,
        updatedAt: now,
      })
      await loadMemories(aiPlayerId)
      resetForm()
      ui.showToast('Memory saved', 'info')
    } catch (cause) {
      error = cause instanceof Error ? `Failed to save memory: ${cause.message}` : String(cause)
    } finally {
      saving = false
    }
  }

  async function deleteMemory(memory: AIPlayerMemory) {
    try {
      await database.deleteAIPlayerMemory(memory.id)
      if (editingId === memory.id) resetForm()
      await loadMemories(aiPlayerId)
      ui.showToast('Memory deleted', 'info')
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Failed to delete memory'
    }
  }

  function originLabel(memory: AIPlayerMemory): string {
    return memory.originCampaignTitle?.trim() || (memory.originCampaignId ? 'Unknown campaign' : 'No campaign')
  }
</script>

<Card>
  <CardHeader>
    <CardTitle class="flex items-center gap-2 text-base">
      <Brain class="text-primary h-4 w-4" />
      Memories for {aiPlayerName}
    </CardTitle>
  </CardHeader>
  <CardContent class="space-y-4">
    <p class="text-muted-foreground text-xs">
      Memories are this player's own remembered experiences, separate from GM-authored secrets.
      Campaign-scoped memories are only recalled inside the campaign they happened in.
    </p>

    {#if error}<p class="text-destructive text-sm">{error}</p>{/if}

    {#if loading}
      <p class="text-muted-foreground text-sm">Loading memories...</p>
    {:else if memories.length === 0}
      <p class="text-muted-foreground text-sm">No memories recorded yet.</p>
    {:else}
      <div class="max-h-80 space-y-2 overflow-y-auto">
        {#each memories as memory (memory.id)}
          <div class="border-border rounded-md border p-3">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="truncate text-sm font-medium">
                  {memory.pinned ? '📌 ' : ''}{memory.title || 'Untitled memory'}
                </p>
                <p class="text-muted-foreground text-xs">
                  {originLabel(memory)}
                  {memory.characterName ? ` · as ${memory.characterName}` : ''}
                  · {memory.scope === 'cross_campaign' ? 'carries across campaigns' : memory.scope === 'never' ? 'never recalled' : 'this campaign only'}
                  · {memory.injectionMode}
                  · priority {memory.priority}
                </p>
              </div>
              <div class="flex shrink-0 gap-1">
                <Button variant="ghost" size="icon" title="Edit memory" onclick={() => editMemory(memory)}>
                  <Pin class="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" title="Delete memory" onclick={() => void deleteMemory(memory)}>
                  <Trash2 class="h-4 w-4" />
                </Button>
              </div>
            </div>
            <p class="text-muted-foreground mt-2 text-xs whitespace-pre-wrap">{memory.content}</p>
          </div>
        {/each}
      </div>
    {/if}

    <form class="space-y-3 border-t pt-3" onsubmit={(event) => { event.preventDefault(); void saveMemory() }}>
      <div class="space-y-2">
        <Label for="memory-title">Title</Label>
        <Input id="memory-title" bind:value={title} placeholder="e.g. The missing ledger" />
      </div>
      <div class="space-y-2">
        <Label for="memory-content">Memory</Label>
        <Textarea id="memory-content" rows={3} bind:value={content} placeholder="What this player remembers, in their own words..." />
      </div>
      <div class="space-y-2">
        <Label for="memory-keywords">Recall keywords</Label>
        <Input id="memory-keywords" bind:value={keywordsText} placeholder="ledger, darkroom, Elena" />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="space-y-2">
          <Label for="memory-scope">Campaign scope</Label>
          <select id="memory-scope" class="bg-background h-9 w-full rounded-md border px-2 text-sm" bind:value={scope}>
            <option value="campaign">This campaign only</option>
            <option value="cross_campaign">Carries across campaigns</option>
            <option value="never">Never recall</option>
          </select>
        </div>
        <div class="space-y-2">
          <Label for="memory-injection">Recall mode</Label>
          <select id="memory-injection" class="bg-background h-9 w-full rounded-md border px-2 text-sm" bind:value={injectionMode}>
            <option value="keyword">On keyword match</option>
            <option value="always">Always</option>
            <option value="never">Never</option>
          </select>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="space-y-2">
          <Label for="memory-priority">Priority (0-10)</Label>
          <Input id="memory-priority" type="number" min="0" max="10" bind:value={priority} />
        </div>
        <label class="flex items-end gap-2 text-sm">
          <input type="checkbox" bind:checked={pinned} />
          Pin (always recall first)
        </label>
      </div>
      <div class="flex justify-end gap-2">
        {#if editingId}
          <Button type="button" variant="outline" icon={X} label="Cancel" onclick={resetForm} />
        {/if}
        <Button
          type="submit"
          icon={editingId ? Save : Plus}
          label={saving ? 'Saving...' : editingId ? 'Save Memory' : 'Add Memory'}
          disabled={saving}
        />
      </div>
    </form>
  </CardContent>
</Card>

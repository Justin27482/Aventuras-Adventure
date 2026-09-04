<script lang="ts">
  import type { CharacterSheetDraft, CharacterSheetRevision, FullRuleset } from '$lib/types'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Textarea } from '$lib/components/ui/textarea'
  import * as Dialog from '$lib/components/ui/dialog'
  import { History, Save, X } from 'lucide-svelte'
  import { copyCharacterSheetDraft } from '$lib/services/mechanics/character-sheet-draft'

  interface Props {
    open: boolean
    title: string
    draft: CharacterSheetDraft
    ruleset: FullRuleset
    revisions?: CharacterSheetRevision[]
    busy?: boolean
    saveLabel?: string
    onSave: (draft: CharacterSheetDraft) => Promise<void>
    onRestore?: (revision: CharacterSheetRevision) => Promise<void>
    onClose: () => void
  }

  let { open, title, draft, ruleset, revisions = [], busy = false, saveLabel = 'Save Changes', onSave, onRestore, onClose }: Props = $props()
  let editing = $state<CharacterSheetDraft>(copyCharacterSheetDraft(draft))
  let traitsText = $state(draft.traits.join(', '))
  let appearanceText = $state(JSON.stringify(draft.visualDescriptors, null, 2))
  let error = $state<string | null>(null)

  $effect(() => {
    if (!open) return
    editing = copyCharacterSheetDraft(draft)
    traitsText = draft.traits.join(', ')
    appearanceText = JSON.stringify(draft.visualDescriptors, null, 2)
    error = null
  })

  async function save() {
    try {
      const visualDescriptors = JSON.parse(appearanceText || '{}')
      const savedDraft = copyCharacterSheetDraft(editing)
      await onSave({
        ...savedDraft,
        traits: traitsText.split(',').map((trait) => trait.trim()).filter(Boolean),
        visualDescriptors,
      })
    } catch (reason) {
      console.error('[FullCharacterSheetEditor] Unable to save character sheet:', reason)
      error = reason instanceof Error ? reason.message : String(reason || 'Unable to save character sheet')
    }
  }
</script>

<Dialog.Root {open} onOpenChange={(value) => !value && onClose()}>
  <Dialog.Content class="flex max-h-[92vh] flex-col sm:max-w-5xl">
    <Dialog.Header>
      <Dialog.Title>{title}</Dialog.Title>
      <Dialog.Description>Review and edit the complete character definition and mechanical sheet.</Dialog.Description>
    </Dialog.Header>
    <div class="grid min-h-0 flex-1 gap-4 overflow-y-auto lg:grid-cols-[1.4fr_0.6fr]">
      <div class="space-y-4">
        <section class="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
          <label class="space-y-1 text-xs font-medium">Name<Input bind:value={editing.name} /></label>
          <label class="space-y-1 text-xs font-medium">Traits<Input bind:value={traitsText} placeholder="Comma separated" /></label>
          <label class="space-y-1 text-xs font-medium sm:col-span-2">Description<Textarea bind:value={editing.description} rows={4} /></label>
          <label class="space-y-1 text-xs font-medium sm:col-span-2">Appearance values (JSON)<Textarea bind:value={appearanceText} rows={7} class="font-mono text-xs" /></label>
        </section>

        <section class="space-y-3 rounded-md border p-3">
          <h3 class="text-sm font-semibold">Stats</h3>
          <div class="grid gap-3 sm:grid-cols-3">
            {#each ruleset.stats as stat (stat.key)}
              <label class="space-y-1 text-xs font-medium">{stat.label}
                <Input type="number" min={stat.minValue} max={stat.maxValue} bind:value={editing.sheet.statValues[stat.key]} />
              </label>
            {/each}
          </div>
        </section>

        <section class="space-y-3 rounded-md border p-3">
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="space-y-1 text-xs font-medium">Level<Input type="number" min="1" bind:value={editing.sheet.level} /></label>
            <label class="space-y-1 text-xs font-medium">XP<Input type="number" min="0" bind:value={editing.sheet.xp} /></label>
          </div>
          <h3 class="text-sm font-semibold">Resources</h3>
          <div class="grid gap-3 sm:grid-cols-2">
            {#each ruleset.resources as resource (resource.key)}
              <div class="grid grid-cols-2 gap-2 rounded-md border p-2">
                <label class="space-y-1 text-xs">{resource.label} current<Input type="number" min="0" bind:value={editing.sheet.resourceValues[resource.key].current} /></label>
                <label class="space-y-1 text-xs">Maximum<Input type="number" min="0" bind:value={editing.sheet.resourceValues[resource.key].max} /></label>
              </div>
            {/each}
          </div>
          <h3 class="text-sm font-semibold">Conditions</h3>
          <div class="space-y-2">
            {#each ruleset.conditions as condition (condition.key)}
              <label class="flex items-center gap-2 rounded-md border p-2 text-xs">
                <input type="checkbox" bind:checked={editing.sheet.conditionStates[condition.key].active} />
                <span class="min-w-28 font-medium">{condition.label}</span>
                <Input bind:value={editing.sheet.conditionStates[condition.key].note} placeholder="Optional note" />
              </label>
            {/each}
          </div>
        </section>
      </div>

      <aside class="space-y-2 rounded-md border p-3">
        <h3 class="flex items-center gap-2 text-sm font-semibold"><History class="h-4 w-4" /> Revision History</h3>
        {#if revisions.length === 0}
          <p class="text-muted-foreground text-xs">No saved revisions yet.</p>
        {:else}
          {#each [...revisions].reverse() as revision (revision.id)}
            <div class="space-y-1 rounded-md border p-2 text-xs">
              <div class="font-medium">{revision.authorType === 'gm' ? 'GM edit' : 'Approved AI proposal'}</div>
              <div class="text-muted-foreground">{revision.source} · {new Date(revision.createdAt).toLocaleString()}</div>
              {#if onRestore}<Button variant="outline" size="sm" onclick={() => onRestore?.(revision)} disabled={busy}>Restore</Button>{/if}
            </div>
          {/each}
        {/if}
      </aside>
    </div>
    {#if error}<p class="text-destructive text-xs">{error}</p>{/if}
    <Dialog.Footer>
      <Button variant="outline" onclick={onClose}><X class="h-4 w-4" /> Cancel</Button>
      <Button onclick={() => void save()} disabled={busy}><Save class="h-4 w-4" /> {busy ? 'Saving...' : saveLabel}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

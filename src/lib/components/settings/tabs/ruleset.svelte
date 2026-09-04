<script lang="ts">
  import { onMount } from 'svelte'
  import { ask } from '@tauri-apps/plugin-dialog'
  import { ruleset } from '$lib/stores/ruleset.svelte'
  import { ui } from '$lib/stores/ui.svelte'
  import { database } from '$lib/services/database'
  import type {
    Ruleset,
    RulesetStat,
    RulesetSkill,
    RulesetCheckRule,
    RulesetCondition,
    RulesetSlot,
    RulesetAbility,
    RulesetLevel,
    RulesetResource,
    RulesetSpell,
    RulesetCreature,
    FullRuleset,
  } from '$lib/types'
  import { rulesetService } from '$lib/services/ruleset/ruleset-service'
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Textarea } from '$lib/components/ui/textarea'
  import { Badge } from '$lib/components/ui/badge'
  import * as Select from '$lib/components/ui/select'
  import { SCENE_RELEVANCE_OPTIONS, normalizeSceneRelevance } from '$lib/services/ai-player/scene-ability-filter'
  import { Check, Copy, Plus, Save, Settings2, Trash2, X } from 'lucide-svelte'

  type DefinitionKind =
    | 'stat'
    | 'skill'
    | 'check_rule'
    | 'condition'
    | 'slot'
    | 'ability'
    | 'level'
    | 'resource'
    | 'spell'
    | 'creature'
  type DefinitionDraft = {
    kind: DefinitionKind
    id: string | null
    key: string
    label: string
    description: string
    notation: string
    defaultValue: string
    minValue: string
    maxValue: string
    governingStatKey: string
    resourceKey: string
    resourceCost: string
    sceneRelevance: string[]
    level: string
    xpThreshold: string
    maxFormula: string
    creatureType: string
    statBlock: string
    slotType: 'wearable' | 'inventory'
  }

  let selectedId = $state<string | null>(null)
  let name = $state('')
  let description = $state('')
  let diceSystem = $state('d20')
  let defaultCheckRuleKey = $state('')
  let encumbranceMode = $state<'slot' | 'weight'>('slot')
  let encumbranceCapacityFormula = $state('10 + strength + constitution + level')
  let inventorySlotCapacityFormula = $state('10 + strength + constitution + level')
  let isSaving = $state(false)
  let error = $state<string | null>(null)
  let saved = $state(false)
  let draft = $state<DefinitionDraft | null>(null)

  const selectedRuleset = $derived(
    ruleset.all.find((candidate) => candidate.id === selectedId) ?? null,
  )
  const selectedFullRuleset = $derived(
    ruleset.current?.ruleset.id === selectedId ? ruleset.current : null,
  )

  function selectRuleset(candidate: Ruleset) {
    selectedId = candidate.id
    name = candidate.name
    description = candidate.description ?? ''
    diceSystem = candidate.diceSystem
    defaultCheckRuleKey = candidate.defaultCheckRuleKey ?? ''
    encumbranceMode = candidate.encumbranceMode
    encumbranceCapacityFormula = candidate.encumbranceCapacityFormula
    inventorySlotCapacityFormula = candidate.inventorySlotCapacityFormula
    saved = false
    error = null
    void ruleset.loadForCampaign(candidate.id)
  }

  function newRuleset() {
    selectedId = null
    name = 'New Ruleset'
    description = ''
    diceSystem = 'd20'
    defaultCheckRuleKey = ''
    encumbranceMode = 'slot'
    encumbranceCapacityFormula = '10 + strength + constitution + level'
    inventorySlotCapacityFormula = '10 + strength + constitution + level'
    saved = false
    error = null
    ruleset.current = null
  }

  function emptyDraft(kind: DefinitionKind): DefinitionDraft {
    return {
      kind,
      id: null,
      key: '',
      label: '',
      description: '',
      notation: '1d20',
      defaultValue: '10',
      minValue: '',
      maxValue: '',
      governingStatKey: '',
      resourceKey: '',
      resourceCost: '0',
      sceneRelevance: [],
      level: '1',
      xpThreshold: '0',
      maxFormula: '10 + level',
      creatureType: '',
      statBlock: '{}',
      slotType: 'wearable',
    }
  }

  function editDefinition(kind: DefinitionKind, value?: Record<string, unknown>) {
    const next = emptyDraft(kind)
    if (value) {
      Object.assign(next, value)
      next.id = typeof value.id === 'string' ? value.id : null
      next.description = typeof value.description === 'string' ? value.description : ''
      for (const field of [
        'defaultValue',
        'minValue',
        'maxValue',
        'resourceCost',
        'level',
        'xpThreshold',
      ] as const) {
        const current = value[field] as string | number | null | undefined
        if (current !== undefined) next[field] = current === null ? '' : String(current)
      }
      if (Array.isArray(value.sceneRelevance)) {
        next.sceneRelevance = normalizeSceneRelevance(value.sceneRelevance)
      }
    }
    draft = next
  }

  function numberOrNull(value: string): number | null {
    if (!value.trim()) return null
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  async function saveDefinition() {
    if (!draft || !selectedId || selectedRuleset?.isBuiltin) return
    if (!draft.key.trim() || !draft.label.trim()) {
      error = 'Definition key and label are required.'
      return
    }
    const id = draft.id ?? crypto.randomUUID()
    const base = {
      id,
      rulesetId: selectedId,
      key: draft.key.trim(),
      label: draft.label.trim(),
      sortOrder: 999,
    }
    try {
      if (draft.kind === 'stat')
        await database.upsertRulesetStat({
          ...base,
          defaultValue: Number(draft.defaultValue) || 0,
          minValue: numberOrNull(draft.minValue),
          maxValue: numberOrNull(draft.maxValue),
        } as RulesetStat)
      if (draft.kind === 'skill')
        await database.upsertRulesetSkill({
          ...base,
          governingStatKey: draft.governingStatKey.trim() || null,
        } as RulesetSkill)
      if (draft.kind === 'condition')
        await database.upsertRulesetCondition({
          ...base,
          description: draft.description.trim() || null,
        } as RulesetCondition)
      if (draft.kind === 'slot')
        await database.upsertRulesetSlot({ ...base, slotType: draft.slotType } as RulesetSlot)
      if (draft.kind === 'ability')
        await database.upsertRulesetAbility({
          ...base,
          description: draft.description.trim() || null,
          resourceKey: draft.resourceKey.trim() || null,
          resourceCost: Number(draft.resourceCost) || 0,
          sceneRelevance: normalizeSceneRelevance(draft.sceneRelevance),
        } as RulesetAbility)
      if (draft.kind === 'level')
        await database.upsertRulesetLevel({
          id,
          rulesetId: selectedId,
          level: Number(draft.level) || 1,
          label: draft.label.trim() || null,
          xpThreshold: numberOrNull(draft.xpThreshold),
          statBonuses: null,
        } as RulesetLevel)
      if (draft.kind === 'resource')
        await database.upsertRulesetResource({
          ...base,
          maxFormula: draft.maxFormula.trim() || '0',
          minValue: Number(draft.minValue) || 0,
        } as RulesetResource)
      if (draft.kind === 'check_rule')
        await database.upsertRulesetCheckRule({
          ...base,
          notation: draft.notation.trim() || '1d20',
          criticalSuccessThreshold: numberOrNull(draft.maxValue),
          criticalFailureThreshold: numberOrNull(draft.minValue),
          outcomeBands: [],
        } as RulesetCheckRule)
      if (draft.kind === 'spell')
        await database.upsertRulesetSpell({
          ...base,
          description: draft.description.trim() || null,
          level: Number(draft.level) || 0,
          notation: draft.notation.trim() || null,
          resourceCost: Number(draft.resourceCost) || 0,
        } as RulesetSpell)
      if (draft.kind === 'creature') {
        let statBlock: Record<string, unknown> = {}
        try {
          const parsed = JSON.parse(draft.statBlock)
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
            throw new Error('Monster stat block must be a JSON object.')
          statBlock = parsed
        } catch (reason) {
          error =
            reason instanceof Error ? reason.message : 'Monster stat block must be valid JSON.'
          return
        }
        await database.upsertRulesetCreature({
          ...base,
          description: draft.description.trim() || null,
          creatureType: draft.creatureType.trim() || null,
          statBlock,
        } as RulesetCreature)
      }
      await ruleset.loadForCampaign(selectedId)
      draft = null
      saved = true
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Failed to save definition'
    }
  }

  async function deleteDefinition(kind: DefinitionKind, id: string) {
    if (!selectedId || selectedRuleset?.isBuiltin) return
    await database.deleteRulesetDefinition(kind, id)
    await ruleset.loadForCampaign(selectedId)
  }

  async function deleteSelectedRuleset() {
    if (!selectedRuleset || selectedRuleset.isBuiltin) return
    const confirmed = await ask(
      `Delete the custom ruleset "${selectedRuleset.name}"? Its definitions will be deleted. This cannot be undone.`,
      { title: 'Delete Ruleset', kind: 'warning' },
    )
    if (!confirmed) return
    isSaving = true
    error = null
    try {
      await database.deleteRuleset(selectedRuleset.id)
      selectedId = null
      ruleset.current = null
      await ruleset.loadAll()
      newRuleset()
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Failed to delete ruleset'
    } finally {
      isSaving = false
    }
  }

  function exportSelectedRuleset() {
    if (!selectedFullRuleset) return
    const blob = new Blob([JSON.stringify(selectedFullRuleset, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${selectedFullRuleset.ruleset.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.ruleset.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  async function importRuleset(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    isSaving = true
    error = null
    try {
      const bundle = JSON.parse(await file.text()) as FullRuleset
      if (!bundle.ruleset || !Array.isArray(bundle.stats) || !Array.isArray(bundle.abilities)) {
        throw new Error('Invalid ruleset package')
      }
      await rulesetService.importFullRuleset(bundle)
      await ruleset.loadAll()
      const imported = ruleset.all.find(
        (candidate) =>
          candidate.name ===
          (bundle.ruleset.isBuiltin ? `${bundle.ruleset.name} (Imported)` : bundle.ruleset.name),
      )
      if (imported) selectRuleset(imported)
      saved = true
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Failed to import ruleset'
    } finally {
      isSaving = false
    }
  }

  async function customizeBuiltIn() {
    if (!selectedRuleset?.isBuiltin || !selectedFullRuleset) return
    isSaving = true
    error = null
    const now = Date.now()
    const id = `custom-${crypto.randomUUID()}`
    try {
      await database.upsertRuleset({
        id,
        name: `${selectedFullRuleset.ruleset.name} (Custom)`,
        description: selectedFullRuleset.ruleset.description,
        isBuiltin: false,
        diceSystem: selectedFullRuleset.ruleset.diceSystem,
        defaultCheckRuleKey: selectedFullRuleset.ruleset.defaultCheckRuleKey,
        encumbranceMode: selectedFullRuleset.ruleset.encumbranceMode,
        encumbranceCapacityFormula: selectedFullRuleset.ruleset.encumbranceCapacityFormula,
        inventorySlotCapacityFormula: selectedFullRuleset.ruleset.inventorySlotCapacityFormula,
        createdAt: now,
        updatedAt: now,
      })
      for (const stat of selectedFullRuleset.stats) {
        await database.upsertRulesetStat({ ...stat, id: crypto.randomUUID(), rulesetId: id })
      }
      for (const skill of selectedFullRuleset.skills) {
        await database.upsertRulesetSkill({ ...skill, id: crypto.randomUUID(), rulesetId: id })
      }
      for (const checkRule of selectedFullRuleset.checkRules) {
        await database.upsertRulesetCheckRule({
          ...checkRule,
          id: crypto.randomUUID(),
          rulesetId: id,
        })
      }
      for (const condition of selectedFullRuleset.conditions) {
        await database.upsertRulesetCondition({
          ...condition,
          id: crypto.randomUUID(),
          rulesetId: id,
        })
      }
      for (const slot of selectedFullRuleset.slots) {
        await database.upsertRulesetSlot({ ...slot, id: crypto.randomUUID(), rulesetId: id })
      }
      for (const ability of selectedFullRuleset.abilities) {
        await database.upsertRulesetAbility({ ...ability, id: crypto.randomUUID(), rulesetId: id })
      }
      for (const level of selectedFullRuleset.levels) {
        await database.upsertRulesetLevel({ ...level, id: crypto.randomUUID(), rulesetId: id })
      }
      for (const resource of selectedFullRuleset.resources) {
        await database.upsertRulesetResource({
          ...resource,
          id: crypto.randomUUID(),
          rulesetId: id,
        })
      }
      for (const spell of selectedFullRuleset.spells) {
        await database.upsertRulesetSpell({ ...spell, id: crypto.randomUUID(), rulesetId: id })
      }
      for (const creature of selectedFullRuleset.creatures) {
        await database.upsertRulesetCreature({
          ...creature,
          id: crypto.randomUUID(),
          rulesetId: id,
        })
      }
      await ruleset.loadAll()
      const cloned = ruleset.all.find((candidate) => candidate.id === id)
      if (cloned) selectRuleset(cloned)
      saved = true
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Failed to create editable ruleset copy'
    } finally {
      isSaving = false
    }
  }

  const definitionGroups = $derived([
    { kind: 'stat' as const, label: 'Stats', items: selectedFullRuleset?.stats ?? [] },
    { kind: 'skill' as const, label: 'Skills', items: selectedFullRuleset?.skills ?? [] },
    { kind: 'check_rule' as const, label: 'Checks', items: selectedFullRuleset?.checkRules ?? [] },
    {
      kind: 'condition' as const,
      label: 'Conditions',
      items: selectedFullRuleset?.conditions ?? [],
    },
    { kind: 'slot' as const, label: 'Slots', items: selectedFullRuleset?.slots ?? [] },
    { kind: 'ability' as const, label: 'Abilities', items: selectedFullRuleset?.abilities ?? [] },
    { kind: 'level' as const, label: 'Levels', items: selectedFullRuleset?.levels ?? [] },
    { kind: 'resource' as const, label: 'Resources', items: selectedFullRuleset?.resources ?? [] },
    { kind: 'spell' as const, label: 'Spells', items: selectedFullRuleset?.spells ?? [] },
    { kind: 'creature' as const, label: 'Monsters', items: selectedFullRuleset?.creatures ?? [] },
  ])

  async function saveRuleset() {
    if (!name.trim()) {
      error = 'Ruleset name is required.'
      return
    }
    isSaving = true
    saved = false
    error = null
    const id = selectedId ?? `custom-${crypto.randomUUID()}`
    const now = Date.now()
    try {
      await database.upsertRuleset({
        id,
        name: name.trim(),
        description: description.trim() || null,
        isBuiltin: selectedRuleset?.isBuiltin ?? false,
        diceSystem: diceSystem.trim() || 'd20',
        defaultCheckRuleKey: defaultCheckRuleKey.trim() || null,
        encumbranceMode: selectedRuleset?.encumbranceMode ?? 'slot',
        encumbranceCapacityFormula,
        inventorySlotCapacityFormula,
        createdAt: selectedRuleset?.createdAt ?? now,
        updatedAt: now,
      })
      selectedId = id
      await ruleset.loadAll()
      const updated = ruleset.all.find((candidate) => candidate.id === id)
      if (updated) selectRuleset(updated)
      saved = true
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Failed to save ruleset'
    } finally {
      isSaving = false
    }
  }

  onMount(() => {
    void ruleset.loadAll()
  })
</script>

<div class="h-full min-h-0 space-y-6 overflow-y-auto p-1 pb-8">
  <div class="flex items-start justify-between gap-3">
    <div>
      <h2 class="text-foreground text-xl font-semibold">Ruleset Authoring</h2>
      <p class="text-muted-foreground mt-1 text-sm">
        Create and maintain the mechanical foundation used by campaign character sheets and checks.
      </p>
    </div>
    <div class="flex flex-wrap justify-end gap-2">
      <input
        id="ruleset-import"
        class="hidden"
        type="file"
        accept="application/json,.json"
        onchange={importRuleset}
      />
      <Button
        variant="outline"
        size="sm"
        onclick={() => document.getElementById('ruleset-import')?.click()}
        disabled={isSaving}>Import</Button
      >
      <Button
        variant="outline"
        size="sm"
        onclick={exportSelectedRuleset}
        disabled={!selectedFullRuleset}>Export</Button
      >
      <Button variant="outline" size="sm" onclick={() => ui.setActivePanel('library')}
        >Back to Library</Button
      >
    </div>
  </div>

  <div class="grid gap-4 lg:grid-cols-[minmax(14rem,20rem)_1fr]">
    <Card>
      <CardHeader class="flex-row items-center justify-between space-y-0">
        <CardTitle class="text-sm">Rulesets</CardTitle>
        <Button
          variant="outline"
          size="icon"
          class="h-7 w-7"
          onclick={newRuleset}
          title="Create ruleset"
        >
          <Plus class="h-3.5 w-3.5" />
        </Button>
      </CardHeader>
      <CardContent class="space-y-1 px-3 pb-3">
        {#if ruleset.error}
          <div class="space-y-2 p-2">
            <p class="text-destructive text-xs">{ruleset.error}</p>
            <Button
              variant="outline"
              size="sm"
              class="h-7 text-xs"
              onclick={() => void ruleset.loadAll()}>Retry</Button
            >
          </div>
        {:else if ruleset.all.length === 0}
          <p class="text-muted-foreground p-2 text-xs">Loading rulesets...</p>
        {:else}
          {#each ruleset.all as candidate (candidate.id)}
            <button
              type="button"
              class="hover:bg-muted flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm {selectedId ===
              candidate.id
                ? 'bg-primary/10 text-primary'
                : ''}"
              onclick={() => selectRuleset(candidate)}
            >
              <span class="truncate">{candidate.name}</span>
              {#if candidate.isBuiltin}<Badge variant="outline" class="shrink-0 text-[10px]"
                  >Built-in</Badge
                >{/if}
            </button>
          {/each}
        {/if}
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2 text-sm">
          <Settings2 class="text-primary h-4 w-4" />
          {selectedId ? 'Ruleset Details' : 'New Ruleset'}
          {#if selectedRuleset?.isBuiltin}<Badge variant="secondary" class="text-[10px]"
              >Read-only structure</Badge
            >{/if}
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        {#if error}<p class="text-destructive border-destructive/30 rounded-md border p-2 text-xs">
            {error}
          </p>{/if}
        <div class="space-y-1.5">
          <label for="ruleset-name" class="text-sm font-medium">Name</label>
          <Input
            id="ruleset-name"
            bind:value={name}
            disabled={selectedRuleset?.isBuiltin ?? false}
          />
        </div>
        <div class="space-y-1.5">
          <label for="ruleset-description" class="text-sm font-medium">Description</label>
          <Textarea
            id="ruleset-description"
            bind:value={description}
            disabled={selectedRuleset?.isBuiltin ?? false}
            rows={3}
          />
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="space-y-1.5">
            <label for="ruleset-dice" class="text-sm font-medium">Dice system</label>
            <Input
              id="ruleset-dice"
              bind:value={diceSystem}
              disabled={selectedRuleset?.isBuiltin ?? false}
              placeholder="d20"
            />
          </div>
          <div class="space-y-1.5">
            <label for="ruleset-default-check" class="text-sm font-medium">Default check key</label>
            <Input
              id="ruleset-default-check"
              bind:value={defaultCheckRuleKey}
              disabled={selectedRuleset?.isBuiltin ?? false}
              placeholder="standard-check"
            />
          </div>
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="space-y-1.5">
            <label for="ruleset-encumbrance-mode" class="text-sm font-medium"
              >Encumbrance mode</label
            >
            <Select.Root
              type="single"
              value={encumbranceMode}
              onValueChange={(value) => (encumbranceMode = value as 'slot' | 'weight')}
              disabled={selectedRuleset?.isBuiltin ?? false}
            >
              <Select.Trigger id="ruleset-encumbrance-mode" class="w-full"
                >{encumbranceMode === 'weight' ? 'Weight based' : 'Inventory slots'}</Select.Trigger
              >
              <Select.Content>
                <Select.Item value="slot" label="Inventory slots">Inventory slots</Select.Item>
                <Select.Item value="weight" label="Weight based">Weight based</Select.Item>
              </Select.Content>
            </Select.Root>
          </div>
          {#if encumbranceMode === 'weight'}
            <div class="space-y-1.5">
              <label for="ruleset-capacity" class="text-sm font-medium">Capacity formula</label>
              <Input
                id="ruleset-capacity"
                bind:value={encumbranceCapacityFormula}
                disabled={selectedRuleset?.isBuiltin ?? false}
                placeholder="10 + strength + constitution + level"
              />
            </div>
          {/if}
        </div>
        {#if selectedFullRuleset}
          <div
            class="border-border/50 bg-muted/20 text-muted-foreground rounded-md border p-3 text-xs"
          >
            {selectedFullRuleset.stats.length} stats · {selectedFullRuleset.skills.length} skills · {selectedFullRuleset
              .checkRules.length} checks · {selectedFullRuleset.conditions.length} conditions · {selectedFullRuleset
              .abilities.length} abilities
          </div>
        {/if}
        {#if selectedRuleset?.isBuiltin && selectedFullRuleset}
          <div
            class="flex items-center justify-between gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs"
          >
            <span class="text-muted-foreground"
              >Built-in definitions are protected. Create an editable copy to add or change rules.</span
            >
            <Button
              variant="outline"
              size="sm"
              class="shrink-0 gap-1.5"
              onclick={() => void customizeBuiltIn()}
              disabled={isSaving}
            >
              <Copy class="h-3.5 w-3.5" /> Customize
            </Button>
          </div>
        {/if}
        <div class="flex items-center justify-between gap-3 border-t pt-3">
          {#if saved}<span class="inline-flex items-center gap-1 text-xs text-emerald-500"
              ><Check class="h-3 w-3" /> Saved</span
            >{:else}<span></span>{/if}
          <div class="flex gap-2">
            {#if selectedRuleset && !selectedRuleset.isBuiltin}
              <Button
                variant="outline"
                onclick={() => void deleteSelectedRuleset()}
                disabled={isSaving}
                class="text-destructive gap-2"
              >
                <Trash2 class="h-3.5 w-3.5" /> Delete
              </Button>
            {/if}
            <Button
              onclick={saveRuleset}
              disabled={isSaving || (selectedRuleset?.isBuiltin ?? false)}
              class="gap-2"
            >
              <Save class="h-3.5 w-3.5" />
              {isSaving ? 'Saving...' : 'Save Ruleset'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>

  {#if selectedFullRuleset}
    <div class="grid gap-4 md:grid-cols-2">
      {#each definitionGroups as group (group.kind)}
        <Card>
          <CardHeader class="flex-row items-center justify-between space-y-0 py-3">
            <CardTitle class="text-sm">{group.label} ({group.items.length})</CardTitle>
            <Button
              variant="outline"
              size="icon"
              class="h-7 w-7"
              disabled={selectedRuleset?.isBuiltin ?? true}
              onclick={() => editDefinition(group.kind)}
              title={`Add ${group.label.toLowerCase()}`}
            >
              <Plus class="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent class="space-y-1 px-3 pb-3">
            {#if group.items.length === 0}
              <p class="text-muted-foreground text-xs">No {group.label.toLowerCase()} defined.</p>
            {:else}
              {#each group.items as item (item.id)}
                <div
                  class="border-border/40 flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-xs"
                >
                  <div class="min-w-0">
                    <span class="text-foreground font-medium"
                      >{'key' in item ? item.key : `Level ${item.level}`}</span
                    >
                    <span class="text-muted-foreground ml-2">{item.label ?? ''}</span>
                  </div>
                  <div class="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-6 w-6"
                      disabled={selectedRuleset?.isBuiltin ?? true}
                      onclick={() =>
                        editDefinition(group.kind, item as unknown as Record<string, unknown>)}
                      title="Edit definition"
                    >
                      <Settings2 class="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="text-destructive h-6 w-6"
                      disabled={selectedRuleset?.isBuiltin ?? true}
                      onclick={() => void deleteDefinition(group.kind, item.id)}
                      title="Delete definition"
                    >
                      <Trash2 class="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              {/each}
            {/if}
          </CardContent>
        </Card>
      {/each}
    </div>
  {/if}

  {#if draft}
    <Card>
      <CardHeader class="flex-row items-center justify-between space-y-0">
        <CardTitle class="text-sm"
          >{draft.id ? 'Edit' : 'Add'} {draft.kind.replace('_', ' ')}</CardTitle
        >
        <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7"
          onclick={() => (draft = null)}
          title="Cancel"><X class="h-4 w-4" /></Button
        >
      </CardHeader>
      <CardContent class="grid gap-3 sm:grid-cols-2">
        <div class="space-y-1">
          <label for="definition-key" class="text-xs font-medium">Key</label><Input
            id="definition-key"
            bind:value={draft.key}
          />
        </div>
        <div class="space-y-1">
          <label for="definition-label" class="text-xs font-medium">Label</label><Input
            id="definition-label"
            bind:value={draft.label}
          />
        </div>
        {#if draft.kind === 'stat'}
          <div class="space-y-1">
            <label for="definition-default" class="text-xs font-medium">Default value</label><Input
              id="definition-default"
              type="number"
              bind:value={draft.defaultValue}
            />
          </div>
          <div class="space-y-1">
            <label for="definition-min" class="text-xs font-medium">Minimum</label><Input
              id="definition-min"
              type="number"
              bind:value={draft.minValue}
            />
          </div>
          <div class="space-y-1">
            <label for="definition-max" class="text-xs font-medium">Maximum</label><Input
              id="definition-max"
              type="number"
              bind:value={draft.maxValue}
            />
          </div>
        {:else if draft.kind === 'skill'}
          <div class="space-y-1">
            <label for="definition-stat" class="text-xs font-medium">Governing stat key</label
            ><Input id="definition-stat" bind:value={draft.governingStatKey} />
          </div>
        {:else if draft.kind === 'slot'}
          <div class="space-y-1">
            <label for="definition-slot-type" class="text-xs font-medium">Slot type</label
            ><Select.Root
              type="single"
              value={draft!.slotType}
              onValueChange={(value) => (draft!.slotType = value as 'wearable' | 'inventory')}
              ><Select.Trigger id="definition-slot-type" class="w-full"
                >{draft!.slotType === 'wearable'
                  ? 'Wearable equipment'
                  : 'Carried inventory'}</Select.Trigger
              ><Select.Content
                ><Select.Item value="wearable" label="Wearable equipment"
                  >Wearable equipment</Select.Item
                ><Select.Item value="inventory" label="Carried inventory"
                  >Carried inventory</Select.Item
                ></Select.Content
              ></Select.Root
            >
          </div>
        {:else if draft.kind === 'condition' || draft.kind === 'ability'}
          <div class="space-y-1 sm:col-span-2">
            <label for="definition-description" class="text-xs font-medium">Description</label
            ><Textarea id="definition-description" bind:value={draft.description} rows={2} />
          </div>
          {#if draft.kind === 'ability'}
            <div class="space-y-1">
              <label for="definition-resource" class="text-xs font-medium">Resource key</label
              ><Input id="definition-resource" bind:value={draft.resourceKey} />
            </div>
            <div class="space-y-1">
              <label for="definition-cost" class="text-xs font-medium">Resource cost</label><Input
                id="definition-cost"
                type="number"
                bind:value={draft.resourceCost}
              />
            </div>
            <div class="space-y-2 sm:col-span-2">
              <span class="text-xs font-medium">Scene relevance</span>
              <div class="flex flex-wrap gap-2" role="group" aria-label="Scene relevance">
                {#each SCENE_RELEVANCE_OPTIONS as scene (scene)}
                  <label class="border-border flex items-center gap-2 rounded-md border px-2 py-1 text-[11px]">
                    <input
                      type="checkbox"
                      checked={draft?.sceneRelevance.includes(scene) ?? false}
                      onchange={(event) => {
                        if (!draft) return
                        const checked = (event.currentTarget as HTMLInputElement).checked
                        draft.sceneRelevance = checked
                          ? [...new Set([...draft.sceneRelevance, scene])]
                          : draft.sceneRelevance.filter((value) => value !== scene)
                      }}
                    />
                    {scene}
                  </label>
                {/each}
              </div>
            </div>
          {/if}
        {:else if draft.kind === 'check_rule'}
          <div class="space-y-1">
            <label for="definition-notation" class="text-xs font-medium">Notation</label><Input
              id="definition-notation"
              bind:value={draft.notation}
            />
          </div>
          <div class="space-y-1">
            <label for="definition-critical-success" class="text-xs font-medium"
              >Critical success threshold</label
            ><Input id="definition-critical-success" type="number" bind:value={draft.maxValue} />
          </div>
          <div class="space-y-1">
            <label for="definition-critical-failure" class="text-xs font-medium"
              >Critical failure threshold</label
            ><Input id="definition-critical-failure" type="number" bind:value={draft.minValue} />
          </div>
        {:else if draft.kind === 'level'}
          <div class="space-y-1">
            <label for="definition-level" class="text-xs font-medium">Level</label><Input
              id="definition-level"
              type="number"
              bind:value={draft.level}
            />
          </div>
          <div class="space-y-1">
            <label for="definition-xp" class="text-xs font-medium">XP threshold</label><Input
              id="definition-xp"
              type="number"
              bind:value={draft.xpThreshold}
            />
          </div>
        {:else if draft.kind === 'resource'}
          <div class="space-y-1 sm:col-span-2">
            <label for="definition-formula" class="text-xs font-medium">Maximum formula</label
            ><Input
              id="definition-formula"
              bind:value={draft.maxFormula}
              placeholder="10 + constitution + level * 5"
            />
          </div>
          <div class="space-y-1">
            <label for="definition-min-resource" class="text-xs font-medium">Minimum value</label
            ><Input id="definition-min-resource" type="number" bind:value={draft.minValue} />
          </div>
        {:else if draft.kind === 'spell'}
          <div class="space-y-1">
            <label for="definition-spell-level" class="text-xs font-medium">Spell level</label
            ><Input id="definition-spell-level" type="number" bind:value={draft.level} />
          </div>
          <div class="space-y-1">
            <label for="definition-spell-notation" class="text-xs font-medium"
              >Effect notation</label
            ><Input id="definition-spell-notation" bind:value={draft.notation} placeholder="1d8" />
          </div>
          <div class="space-y-1 sm:col-span-2">
            <label for="definition-spell-description" class="text-xs font-medium">Description</label
            ><Textarea id="definition-spell-description" bind:value={draft.description} rows={2} />
          </div>
          <div class="space-y-1">
            <label for="definition-spell-cost" class="text-xs font-medium">Resource cost</label
            ><Input id="definition-spell-cost" type="number" bind:value={draft.resourceCost} />
          </div>
        {:else if draft.kind === 'creature'}
          <div class="space-y-1">
            <label for="definition-creature-type" class="text-xs font-medium">Creature type</label
            ><Input
              id="definition-creature-type"
              bind:value={draft.creatureType}
              placeholder="beast, undead, humanoid"
            />
          </div>
          <div class="space-y-1 sm:col-span-2">
            <label for="definition-creature-description" class="text-xs font-medium"
              >Description</label
            ><Textarea
              id="definition-creature-description"
              bind:value={draft.description}
              rows={2}
            />
          </div>
          <div class="space-y-1 sm:col-span-2">
            <label for="definition-stat-block" class="text-xs font-medium">Stat block JSON</label
            ><Textarea
              id="definition-stat-block"
              bind:value={draft.statBlock}
              rows={6}
              class="font-mono text-xs"
              placeholder={'{"health": 10, "defense": 12}'}
            />
          </div>
        {/if}
        <div class="flex justify-end gap-2 sm:col-span-2">
          <Button variant="ghost" onclick={() => (draft = null)}>Cancel</Button><Button
            onclick={() => void saveDefinition()}
            class="gap-2"><Save class="h-3.5 w-3.5" />Save Definition</Button
          >
        </div>
      </CardContent>
    </Card>
  {/if}
</div>

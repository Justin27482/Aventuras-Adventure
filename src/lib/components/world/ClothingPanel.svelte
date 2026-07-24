<script lang="ts">
  import { story } from '$lib/stores/story.svelte'
  import type { Item } from '$lib/types'
  import { Label } from '$lib/components/ui/label'
  import { Button } from '$lib/components/ui/button'
  import { Checkbox } from '$lib/components/ui/checkbox'
  import { Shirt, Wrench, Scissors } from 'lucide-svelte'

  type ClothingMeta = {
    isClothing?: boolean
    coveredZones?: string[]
    exposedZones?: string[]
    durability?: number
    maxDurability?: number
    unusable?: boolean
  }

  const DEFAULT_ZONES = ['torso', 'chest', 'hips', 'legs', 'arms', 'hands', 'feet']

  const clothingEnabled = $derived(story.currentStory?.settings?.clothingSystemEnabled ?? false)
  const showClothingPanel = $derived(story.storyMode === 'adventure' && clothingEnabled)
  const zones = $derived(story.currentStory?.settings?.clothingZones ?? DEFAULT_ZONES)
  const maxDurabilityDefault = $derived(story.currentStory?.settings?.clothingMaxDurability ?? 100)
  const repairAmount = $derived(story.currentStory?.settings?.clothingRepairAmount ?? 20)

  const equippedInventoryItems = $derived(
    story.items.filter((item) => item.location === 'inventory' && item.equipped),
  )

  function getMeta(item: Item): ClothingMeta {
    const metadata = (item.metadata ?? {}) as Record<string, unknown>
    const clothing = metadata.clothing
    if (clothing && typeof clothing === 'object') {
      return clothing as ClothingMeta
    }
    return {}
  }

  function inferCoveredZones(name: string): string[] {
    const n = name.toLowerCase()
    if (/\b(dress)\b/.test(n)) return ['torso', 'chest', 'hips', 'legs']
    if (/\b(bodysuit|leotard|catsuit)\b/.test(n)) return ['torso', 'chest', 'hips', 'legs']
    if (/\b(blouse|shirt|top|jacket|coat|hoodie|robe)\b/.test(n)) return ['torso', 'chest', 'arms']
    if (/\b(skirt|pants|shorts|trousers|leggings)\b/.test(n)) return ['hips', 'legs']
    if (/\b(bra|bralette|corset)\b/.test(n)) return ['chest']
    if (/\b(panties|underwear|briefs|thong)\b/.test(n)) return ['hips']
    if (/\b(shoes|boots|heels|sandals)\b/.test(n)) return ['feet']
    if (/\b(gloves|gauntlets|mittens)\b/.test(n)) return ['hands']
    if (/\b(armor|breastplate|cuirass|chainmail|plate)\b/.test(n)) return ['torso', 'chest']
    return []
  }

  function looksLikeClothing(name: string): boolean {
    return inferCoveredZones(name).length > 0
  }

  function isClothing(item: Item): boolean {
    const meta = getMeta(item)
    if (meta.isClothing !== undefined) return !!meta.isClothing
    return looksLikeClothing(item.name)
  }

  function getCoveredZones(item: Item): string[] {
    const meta = getMeta(item)
    const coveredZones = meta.coveredZones ?? []
    if (coveredZones.length > 0) return coveredZones
    return inferCoveredZones(item.name)
  }

  function getExposedZones(item: Item): string[] {
    return [...(getMeta(item).exposedZones ?? [])]
  }

  function getEffectiveZones(item: Item): string[] {
    const exposedZones = new Set(getExposedZones(item))
    return getCoveredZones(item).filter((zone) => !exposedZones.has(zone))
  }

  function getMaxDurability(item: Item): number {
    const meta = getMeta(item)
    return Math.max(1, meta.maxDurability ?? maxDurabilityDefault)
  }

  function getDurability(item: Item): number {
    const meta = getMeta(item)
    return Math.max(0, Math.min(getMaxDurability(item), meta.durability ?? getMaxDurability(item)))
  }

  function isUnusable(item: Item): boolean {
    const meta = getMeta(item)
    return !!meta.unusable || getDurability(item) <= 0
  }

  async function updateClothingMeta(item: Item, patch: Partial<ClothingMeta>) {
    const metadata = (item.metadata ?? {}) as Record<string, unknown>
    const current = getMeta(item)
    await story.updateItem(item.id, {
      metadata: {
        ...metadata,
        clothing: {
          ...current,
          ...patch,
        },
      },
    })
  }

  async function setClothing(item: Item, checked: boolean) {
    const inferredZones = inferCoveredZones(item.name)
    await updateClothingMeta(item, {
      isClothing: checked,
      coveredZones: checked ? getCoveredZones(item).length > 0 ? getCoveredZones(item) : inferredZones : [],
      exposedZones: checked ? getExposedZones(item) : [],
      durability: checked ? getDurability(item) : undefined,
      maxDurability: checked ? getMaxDurability(item) : undefined,
      unusable: checked ? isUnusable(item) : undefined,
    })
  }

  async function toggleCoveredZone(item: Item, zone: string, checked: boolean) {
    const nextCoveredZones = checked
      ? Array.from(new Set([...getCoveredZones(item), zone]))
      : getCoveredZones(item).filter((currentZone) => currentZone !== zone)
    const nextExposedZones = getExposedZones(item).filter((currentZone) => nextCoveredZones.includes(currentZone))

    await updateClothingMeta(item, {
      isClothing: true,
      coveredZones: nextCoveredZones,
      exposedZones: nextExposedZones,
    })
  }

  async function repairItem(item: Item) {
    await story.repairClothingItem(item.id)
  }

  async function applyDamage(item: Item, amount: number) {
    await story.applyClothingDamage(item.id, amount)
  }

  async function exposeZone(item: Item, zone: string) {
    await story.exposeClothingZone(item.id, zone)
  }

  function durabilityPct(item: Item): number {
    const max = getMaxDurability(item)
    return Math.round((getDurability(item) / max) * 100)
  }

  function itemsCoveringZone(zone: string): Item[] {
    return equippedInventoryItems.filter((item) => isClothing(item) && getEffectiveZones(item).includes(zone))
  }

  const canRepair = $derived(story.canRepairClothing())

  async function enableClothingSystem() {
    await story.updateStorySettings({
      clothingSystemEnabled: true,
      clothingZones: story.currentStory?.settings?.clothingZones ?? DEFAULT_ZONES,
      clothingMaxDurability: story.currentStory?.settings?.clothingMaxDurability ?? 100,
      clothingRepairAmount: story.currentStory?.settings?.clothingRepairAmount ?? 20,
    })
  }
</script>

{#if showClothingPanel}
  <div class="space-y-3 rounded-lg border p-3">
    <div class="flex items-center justify-between">
      <h4 class="flex items-center gap-2 text-sm font-semibold tracking-wide uppercase">
        <Shirt class="h-4 w-4" />
        Clothing & Armor
      </h4>
      <span class="text-muted-foreground text-xs">{zones.length} zones</span>
    </div>

    <div class="space-y-2">
      {#each zones as zone (zone)}
        {@const coveredBy = itemsCoveringZone(zone)}
        <div class="bg-muted/20 rounded-md border px-2.5 py-2">
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-semibold uppercase">{zone}</span>
            {#if coveredBy.length > 0}
              <span class="text-right text-xs">{coveredBy.map((item) => item.name).join(', ')}</span>
            {:else}
              <span class="text-red-500 text-xs italic">exposed</span>
            {/if}
          </div>
        </div>
      {/each}
    </div>

    <div class="space-y-2 border-t pt-2">
      <Label class="text-xs font-semibold uppercase">Equipped Item Coverage</Label>
      {#if equippedInventoryItems.length === 0}
        <p class="text-muted-foreground text-xs italic">No equipped inventory items.</p>
      {:else}
        <div class="space-y-2">
          {#each equippedInventoryItems as item (item.id)}
            <div class="rounded-md border p-2">
              <div class="mb-2 flex items-center justify-between">
                <span class="text-sm font-medium">{item.name}</span>
                <div class="flex items-center gap-2">
                  <Checkbox
                    id={`is-clothing-${item.id}`}
                    checked={isClothing(item)}
                    onCheckedChange={(v) => setClothing(item, v)}
                  />
                  <Label for={`is-clothing-${item.id}`} class="text-xs">Clothing</Label>
                </div>
              </div>
              {#if isClothing(item)}
                <div class="space-y-2">
                  <div class="flex flex-wrap gap-2">
                    {#each zones as zone (zone)}
                      <label class="flex items-center gap-1 rounded border px-2 py-1 text-xs">
                        <Checkbox
                          id={`${item.id}-${zone}`}
                          checked={getCoveredZones(item).includes(zone)}
                          onCheckedChange={(checked) => toggleCoveredZone(item, zone, checked)}
                        />
                        <span class="capitalize">{zone}</span>
                      </label>
                    {/each}
                  </div>

                  <div class="text-muted-foreground flex flex-wrap gap-2 text-xs">
                    <span>Covered: {getCoveredZones(item).join(', ') || 'none'}</span>
                    <span>Exposed: {getExposedZones(item).join(', ') || 'none'}</span>
                  </div>

                  <div class="h-2 w-full overflow-hidden rounded bg-black/10">
                    <div
                      class="h-full transition-all {durabilityPct(item) <= 20
                        ? 'bg-red-500'
                        : durabilityPct(item) <= 50
                          ? 'bg-amber-500'
                          : 'bg-green-500'}"
                      style="width: {durabilityPct(item)}%"
                    ></div>
                  </div>

                  <div class="text-muted-foreground flex items-center justify-between text-xs">
                    <span>{getDurability(item)} / {getMaxDurability(item)} durability</span>
                    {#if isUnusable(item)}
                      <span class="text-red-500">unusable</span>
                    {/if}
                  </div>

                  <div class="flex flex-wrap gap-2">
                    {#each getEffectiveZones(item) as zone (zone)}
                      <Button
                        size="sm"
                        variant="outline"
                        class="h-7 text-xs"
                        onclick={() => exposeZone(item, zone)}
                      >
                        <Scissors class="mr-1 h-3 w-3" />
                        Expose {zone}
                      </Button>
                    {/each}
                    <Button size="sm" variant="outline" class="h-7 text-xs" onclick={() => applyDamage(item, 10)}>
                      <Scissors class="mr-1 h-3 w-3" />
                      Wear -10
                    </Button>
                    <Button size="sm" variant="outline" class="h-7 text-xs" onclick={() => repairItem(item)}>
                      <Wrench class="mr-1 h-3 w-3" />
                      Repair {Math.max(1, repairAmount)}
                    </Button>
                  </div>

                  {#if !canRepair}
                    <p class="text-muted-foreground text-xs italic">Requires a sewing kit in inventory.</p>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}

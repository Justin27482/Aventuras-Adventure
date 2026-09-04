<script lang="ts">
  import { Sparkles, Wand2 } from 'lucide-svelte'
  import * as ResponsiveModal from '$lib/components/ui/responsive-modal'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Label } from '$lib/components/ui/label'
  import { Textarea } from '$lib/components/ui/textarea'
  import { enhanceAppearance } from '$lib/services/prompts'
  import { database } from '$lib/services/database'
  import { campaign } from '$lib/stores/campaign.svelte'
  import {
    APPEARANCE_DESCRIPTOR_LABELS_SETTING_KEY,
    DEFAULT_VISUAL_DESCRIPTOR_LABELS,
    getAvailableVisualDescriptorLabels,
    parseVisualDescriptors,
  } from '$lib/utils/visualDescriptors'
  import type { VisualDescriptorLabel, VisualDescriptors } from '$lib/types'

  interface Props {
    open: boolean
    value?: string
    storyId: string
    characterName: string
    onApply: (value: string) => void
    onClose: () => void
  }

  let {
    open = $bindable(false),
    value = '',
    storyId,
    characterName,
    onApply,
    onClose,
  }: Props = $props()

  let fields = $state<VisualDescriptors>({})
  let labels = $state<VisualDescriptorLabel[]>(DEFAULT_VISUAL_DESCRIPTOR_LABELS)
  let extraNotes = $state('')
  let isEnhancing = $state(false)
  let error = $state<string | null>(null)
  let wasOpen = false
  let hasUserEdited = false

  const nsfwIntensity = $derived(campaign.settings?.nsfwIntensity ?? 0)
  const availableLabels = $derived(getAvailableVisualDescriptorLabels(labels, nsfwIntensity))
  const canEnhance = $derived(Boolean(descriptorText().trim() || extraNotes.trim()))

  $effect(() => {
    if (!open) {
      wasOpen = false
      return
    }
    if (wasOpen) return

    wasOpen = true
    hasUserEdited = false
    fields = parseVisualDescriptors(value, labels)
    extraNotes = ''
    error = null
    void loadLabels()
  })

  function close() {
    onClose()
  }

  function descriptorText() {
    return availableLabels
      .filter((label) => fields[label.key])
      .map((label) => `${label.label}: ${fields[label.key]}`)
      .join(', ')
  }

  async function loadLabels() {
    try {
      const stored = await database.getSetting(APPEARANCE_DESCRIPTOR_LABELS_SETTING_KEY)
      const parsed = stored ? (JSON.parse(stored) as VisualDescriptorLabel[]) : []
      const customLabels = parsed.filter(
        (label) =>
          typeof label.key === 'string' &&
          typeof label.label === 'string' &&
          Number.isInteger(label.minNsfwIntensity),
      )
      labels = [...DEFAULT_VISUAL_DESCRIPTOR_LABELS, ...customLabels]
      // Do not replace text entered while the asynchronous configuration load was pending.
      if (!hasUserEdited) {
        fields = parseVisualDescriptors(value, labels)
      }
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Unable to load appearance labels.'
    }
  }

  function descriptorHint(descriptor: VisualDescriptorLabel): string {
    if (descriptor.hint) return descriptor.hint
    if (descriptor.key === 'face') return 'Shape, complexion, defining features'
    if (descriptor.key === 'hair') return 'Color, length, texture, style'
    if (descriptor.key === 'eyes') return 'Color, shape, expression'
    if (descriptor.key === 'build') return 'Height, physique, posture'
    if (descriptor.key === 'clothing') return 'Style, colors, notable garments'
    if (descriptor.key === 'accessories') return 'Jewelry, tools, keepsakes'
    return 'Scars, marks, mannerisms'
  }

  function apply() {
    const text = descriptorText()
    if (!text) {
      error = 'Add at least one appearance detail before applying.'
      return
    }
    onApply(text)
    close()
  }

  function updateField(key: string, value: string) {
    hasUserEdited = true
    fields = { ...fields, [key]: value }
  }

  async function enhance() {
    const current = descriptorText()
    if ((!current && !extraNotes.trim()) || isEnhancing) return

    isEnhancing = true
    error = null
    try {
      const enhanced = await enhanceAppearance({
        storyId,
        characterName,
        currentAppearance: current,
        appearanceGuidance: extraNotes.trim(),
        descriptorLabels: availableLabels.map((label) => label.label),
      })
      fields = parseVisualDescriptors(enhanced, availableLabels)
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Unable to enhance appearance details.'
    } finally {
      isEnhancing = false
    }
  }
</script>

<ResponsiveModal.Root {open} onOpenChange={(next) => !next && close()}>
  <ResponsiveModal.Content class="max-h-[90vh] max-w-2xl overflow-y-auto">
    <ResponsiveModal.Header>
      <div class="flex items-center gap-2">
        <Sparkles class="text-primary h-5 w-5" />
        <ResponsiveModal.Title>Appearance Assistant</ResponsiveModal.Title>
      </div>
      <ResponsiveModal.Description>
        Build a clear visual reference for {characterName}. Structured details produce more reliable
        portrait prompts.
      </ResponsiveModal.Description>
    </ResponsiveModal.Header>

    <div class="bg-primary/5 border-primary/20 mt-2 space-y-1.5 rounded-md border p-3">
      <Label for="appearance-guidance">AI Guidance</Label>
      <Textarea
        id="appearance-guidance"
        bind:value={extraNotes}
        rows={3}
        placeholder="Describe the character's visual impression, style, or details to develop..."
      />
      <p class="text-muted-foreground text-xs">
        Optional. You can use guidance on its own, or refine the labeled details below.
      </p>
    </div>

    <div class="grid gap-4 py-2 sm:grid-cols-2">
      {#each availableLabels as descriptor (descriptor.key)}
        <div class="space-y-1.5">
          <Label for={`appearance-${descriptor.key}`}>{descriptor.label}</Label>
          <Input
            id={`appearance-${descriptor.key}`}
            value={fields[descriptor.key] ?? ''}
            oninput={(event) => {
              updateField(descriptor.key, event.currentTarget.value)
            }}
            placeholder={descriptorHint(descriptor)}
          />
        </div>
      {/each}
    </div>

    <p class="text-muted-foreground mt-1 text-xs">
      Label availability is configured in Settings → Advanced → Appearance Labels. Current campaign
      level: {nsfwIntensity}/8.
    </p>

    <div class="bg-muted/50 mt-4 rounded-md border p-3">
      <p class="text-muted-foreground text-xs font-medium">Preview</p>
      <p class="text-foreground mt-1 text-sm">
        {descriptorText() || 'Add visual details to build a preview.'}
      </p>
    </div>

    {#if error}
      <p class="text-destructive mt-3 text-sm">{error}</p>
    {/if}

    <ResponsiveModal.Footer class="mt-5 gap-2 sm:justify-between">
      <Button variant="outline" onclick={enhance} disabled={!canEnhance || isEnhancing}>
        <Wand2 class="h-4 w-4" />
        {isEnhancing ? 'Enhancing...' : 'Enhance with AI'}
      </Button>
      <div class="flex gap-2">
        <ResponsiveModal.Close><Button variant="outline">Cancel</Button></ResponsiveModal.Close>
        <Button onclick={apply}>Apply Appearance</Button>
      </div>
    </ResponsiveModal.Footer>
  </ResponsiveModal.Content>
</ResponsiveModal.Root>

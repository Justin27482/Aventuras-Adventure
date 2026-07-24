<script lang="ts">
  import { Sword, Feather, MessageSquare, FileText } from 'lucide-svelte'
  import * as Card from '$lib/components/ui/card'
  import { Label } from '$lib/components/ui/label'
  import { ScrollArea } from '$lib/components/ui/scroll-area'
  import { Switch } from '$lib/components/ui/switch'
  import WritingStyleFields from '$lib/components/shared/WritingStyleFields.svelte'
  import { hasRequiredCredentials } from '$lib/services/ai/image'
  import type { StoryMode, POV } from '$lib/types'
  import type { Tense } from '$lib/services/ai/wizard/ScenarioService'

  interface Props {
    selectedMode: StoryMode
    selectedPOV: POV
    selectedTense: Tense
    tone: string
    visualProseMode: boolean
    imageGenerationMode: 'none' | 'agentic' | 'inline'
    backgroundImagesEnabled: boolean
    referenceMode: boolean
    importChatAsEntries: boolean
    hasChatFile: boolean
    hasCardOpening: boolean
    chatMessageCount: number
    detectedPOV: POV | null
    detectedTense: Tense | null
    styleDetectionConfidence: 'low' | 'medium' | 'high' | null
    styleDetectionRationale: string | null
    isDetectingStyle: boolean
    styleDetectionError: string | null
    enableStyleRewritePass: boolean
    enableCreativeCleanupPass: boolean
    onModeChange: (mode: StoryMode) => void
    onPOVChange: (v: POV) => void
    onTenseChange: (v: Tense) => void
    onToneChange: (v: string) => void
    onVisualProseModeChange: (v: boolean) => void
    onImageGenerationModeChange: (v: 'none' | 'agentic' | 'inline') => void
    onBackgroundImagesEnabledChange: (v: boolean) => void
    onReferenceModeChange: (v: boolean) => void
    onImportChatToggle: (v: boolean) => void
    onStyleRewritePassChange: (v: boolean) => void
    onCreativeCleanupPassChange: (v: boolean) => void
  }

  let {
    selectedMode,
    selectedPOV,
    selectedTense,
    tone,
    visualProseMode,
    imageGenerationMode,
    backgroundImagesEnabled,
    referenceMode,
    importChatAsEntries,
    hasChatFile,
    hasCardOpening,
    chatMessageCount,
    detectedPOV,
    detectedTense,
    styleDetectionConfidence,
    styleDetectionRationale,
    isDetectingStyle,
    styleDetectionError,
    enableStyleRewritePass,
    enableCreativeCleanupPass,
    onModeChange,
    onPOVChange,
    onTenseChange,
    onToneChange,
    onVisualProseModeChange,
    onImageGenerationModeChange,
    onBackgroundImagesEnabledChange,
    onReferenceModeChange,
    onImportChatToggle,
    onStyleRewritePassChange,
    onCreativeCleanupPassChange,
  }: Props = $props()

  const imageGenerationEnabled = $derived(hasRequiredCredentials())

  $effect(() => {
    if (!imageGenerationEnabled && imageGenerationMode !== 'none') {
      onImageGenerationModeChange('none')
    }
  })
</script>

<div class="flex h-full flex-col gap-5">
  <div class="space-y-2">
    <Label>Story Mode</Label>
    <div class="grid gap-3 sm:grid-cols-2">
      <button class="w-full text-left focus:outline-none" onclick={() => onModeChange('adventure')}>
        <Card.Root
          class="border-border hover:border-primary hover:shadow-primary/5 h-full transition-all duration-200 hover:shadow-md {selectedMode ===
          'adventure'
            ? 'ring-primary border-primary ring-2'
            : ''}"
        >
          <Card.Header>
            <div class="flex items-center gap-4">
              <div class="bg-primary/10 rounded-lg p-3">
                <Sword class="text-primary h-6 w-6" />
              </div>
              <Card.Title>Adventure Mode</Card.Title>
            </div>
          </Card.Header>
          <Card.Content>
            <p class="text-muted-foreground text-sm">
              <strong>You are the protagonist.</strong> Imported stories run with adventure narration
              and action-first progression.
            </p>
          </Card.Content>
        </Card.Root>
      </button>

      <Card.Root class="border-border h-full opacity-60">
        <Card.Header>
          <div class="flex items-center gap-4">
            <div class="bg-muted rounded-lg p-3">
              <Feather class="text-muted-foreground h-6 w-6" />
            </div>
            <Card.Title>Creative Writing</Card.Title>
          </div>
        </Card.Header>
        <Card.Content>
          <p class="text-muted-foreground text-sm">
            Disabled in this branch. Use Aventuras-Creative for author-directed mode.
          </p>
        </Card.Content>
      </Card.Root>
    </div>
  </div>

  <div class="space-y-2">
    <Label>Chat History</Label>
    <div class="grid grid-cols-2 gap-3">
      <button
        class="w-full text-left focus:outline-none"
        onclick={() => onImportChatToggle(true)}
        disabled={!hasChatFile}
      >
        <Card.Root
          class="h-full transition-all {importChatAsEntries
            ? 'ring-primary border-primary ring-2'
            : 'border-border hover:border-primary/40'} {!hasChatFile
            ? 'cursor-not-allowed opacity-50'
            : ''}"
        >
          <Card.Content class="flex items-center gap-3 p-3">
            <MessageSquare
              class="h-5 w-5 {importChatAsEntries ? 'text-primary' : 'text-muted-foreground'}"
            />
            <div>
              <p class="text-sm font-medium">Import Chat</p>
              <p class="text-muted-foreground text-xs">
                {#if hasChatFile}
                  {chatMessageCount} messages as story entries
                {:else}
                  No chat file uploaded
                {/if}
              </p>
            </div>
          </Card.Content>
        </Card.Root>
      </button>
      <button
        class="w-full text-left focus:outline-none"
        onclick={() => onImportChatToggle(false)}
        disabled={!hasCardOpening}
      >
        <Card.Root
          class="h-full transition-all {!importChatAsEntries
            ? 'ring-primary border-primary ring-2'
            : 'border-border hover:border-primary/40'} {!hasCardOpening ? 'opacity-50' : ''}"
        >
          <Card.Content class="flex items-center gap-3 p-3">
            <FileText
              class="h-5 w-5 {!importChatAsEntries ? 'text-primary' : 'text-muted-foreground'}"
            />
            <div>
              <p class="text-sm font-medium">Fresh Start</p>
              <p class="text-muted-foreground text-xs">
                {#if hasCardOpening}
                  Use card's opening message
                {:else}
                  Requires character card with greeting
                {/if}
              </p>
            </div>
          </Card.Content>
        </Card.Root>
      </button>
    </div>
  </div>

  {#if hasChatFile}
    <div class="space-y-2">
      <Label>Detected Chat Style</Label>
      <Card.Root>
        <Card.Content class="space-y-2 p-3">
          {#if isDetectingStyle}
            <p class="text-muted-foreground text-sm">Detecting POV and tense from imported chat...</p>
          {:else if styleDetectionError}
            <p class="text-destructive text-sm">Detection failed: {styleDetectionError}</p>
          {:else if detectedPOV && detectedTense}
            <p class="text-sm">
              Detected <span class="font-medium">{detectedPOV} person</span> and
              <span class="font-medium">{detectedTense} tense</span>
              {#if styleDetectionConfidence}
                (<span class="font-medium">{styleDetectionConfidence}</span> confidence)
              {/if}
            </p>
            {#if styleDetectionRationale}
              <p class="text-muted-foreground text-xs">{styleDetectionRationale}</p>
            {/if}
          {:else}
            <p class="text-muted-foreground text-sm">No detection result yet.</p>
          {/if}
        </Card.Content>
      </Card.Root>
    </div>

    {#if importChatAsEntries}
      <div class="space-y-2">
        <Label>Optional Import Processing</Label>
        <Card.Root>
          <Card.Content class="space-y-4 p-3">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-sm font-medium">Rewrite to selected POV and tense</p>
                <p class="text-muted-foreground text-xs">
                  Runs an editing pass over imported messages to normalize voice consistency.
                </p>
              </div>
              <Switch
                checked={enableStyleRewritePass}
                onCheckedChange={(v) => onStyleRewritePassChange(!!v)}
              />
            </div>
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-sm font-medium">Creative-writing cleanup</p>
                <p class="text-muted-foreground text-xs">
                  Removes out-of-story AI/meta chatter while preserving story canon.
                </p>
              </div>
              <Switch
                checked={enableCreativeCleanupPass}
                onCheckedChange={(v) => onCreativeCleanupPassChange(!!v)}
              />
            </div>
          </Card.Content>
        </Card.Root>
      </div>
    {/if}
  {/if}

  <ScrollArea class="h-full pr-4">
    <WritingStyleFields
      {selectedPOV}
      {selectedTense}
      {tone}
      {visualProseMode}
      {imageGenerationEnabled}
      {imageGenerationMode}
      {backgroundImagesEnabled}
      {referenceMode}
      {onPOVChange}
      {onTenseChange}
      {onToneChange}
      {onVisualProseModeChange}
      {onImageGenerationModeChange}
      {onBackgroundImagesEnabledChange}
      {onReferenceModeChange}
    />
  </ScrollArea>
</div>

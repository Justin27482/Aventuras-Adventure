<script lang="ts">
  import * as Card from '$lib/components/ui/card'
  import { Switch } from '$lib/components/ui/switch'

  interface Props {
    chapterizeAfterImport: boolean
    chapterizeIncludeLorebook: boolean
    chapterizeIncludeTimeline: boolean
    chapterizeIncludeClassification: boolean
    onChapterizeAfterImportChange: (value: boolean) => void
    onChapterizeIncludeLorebookChange: (value: boolean) => void
    onChapterizeIncludeTimelineChange: (value: boolean) => void
    onChapterizeIncludeClassificationChange: (value: boolean) => void
  }

  let {
    chapterizeAfterImport,
    chapterizeIncludeLorebook,
    chapterizeIncludeTimeline,
    chapterizeIncludeClassification,
    onChapterizeAfterImportChange,
    onChapterizeIncludeLorebookChange,
    onChapterizeIncludeTimelineChange,
    onChapterizeIncludeClassificationChange,
  }: Props = $props()
</script>

<Card.Root>
  <Card.Content class="space-y-3 p-3">
    <div class="flex items-center justify-between gap-3">
      <div>
        <p class="text-sm font-medium">Chapterize after import</p>
        <p class="text-muted-foreground text-xs">
          Split the imported history into chapters using the selected processing options.
        </p>
      </div>
      <Switch checked={chapterizeAfterImport} onCheckedChange={(value) => onChapterizeAfterImportChange(value)} />
    </div>

    {#if chapterizeAfterImport}
      <div class="space-y-3 border-t pt-3">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-sm font-medium">Include lorebook update</p>
            <p class="text-muted-foreground text-xs">Run a final lorebook pass after chapterization.</p>
          </div>
          <Switch checked={chapterizeIncludeLorebook} onCheckedChange={(value) => onChapterizeIncludeLorebookChange(value)} />
        </div>

        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-sm font-medium">Estimate timeline</p>
            <p class="text-muted-foreground text-xs">Track in-story time progression for each chapter.</p>
          </div>
          <Switch checked={chapterizeIncludeTimeline} onCheckedChange={(value) => onChapterizeIncludeTimelineChange(value)} />
        </div>

        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-sm font-medium">Classify chapters</p>
            <p class="text-muted-foreground text-xs">Extract world-state changes from each chapter.</p>
          </div>
          <Switch checked={chapterizeIncludeClassification} onCheckedChange={(value) => onChapterizeIncludeClassificationChange(value)} />
        </div>
      </div>
    {/if}
  </Card.Content>
</Card.Root>
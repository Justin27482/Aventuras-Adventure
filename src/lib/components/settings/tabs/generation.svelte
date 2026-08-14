<script lang="ts">
  import MainNarrative from '../MainNarrative.svelte'
  import AgentProfiles from '../AgentProfiles.svelte'
  import { settings } from '$lib/stores/settings.svelte'
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from '$lib/components/ui/card'
  import { Input } from '$lib/components/ui/input'
  import { Label } from '$lib/components/ui/label'
  import { Slider } from '$lib/components/ui/slider'
  import { Switch } from '$lib/components/ui/switch'
  import {
    LLM_TIMEOUT_MIN,
    LLM_TIMEOUT_MAX,
    LLM_TIMEOUT_STEP,
    LLM_TIMEOUT_MIN_SECONDS,
    LLM_TIMEOUT_MAX_SECONDS,
  } from '$lib/constants/timeout'

  interface Props {
    onOpenManualBodyEditor: (title: string, value: string, onSave: (v: string) => void) => void
  }

  let { onOpenManualBodyEditor }: Props = $props()

  // Timeout slider state
  let timeoutValue = $derived(settings.apiSettings.llmTimeoutMs)

  function updateTimeout(v: number) {
    settings.setLlmTimeout(v)
  }

  async function updateEpistemic<K extends keyof typeof settings.experimentalFeatures>(
    key: K,
    value: (typeof settings.experimentalFeatures)[K],
  ) {
    await settings.updateExperimentalFeatures({ [key]: value })
  }
</script>

<div class="space-y-6">
  <!-- Global API Settings -->
  <Card>
    <CardHeader>
      <CardTitle>Global API Settings</CardTitle>
      <CardDescription>Settings that apply to all API requests</CardDescription>
    </CardHeader>
    <CardContent class="space-y-4">
      <!-- Request Timeout -->
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <div class="space-y-1">
            <Label>Request Timeout</Label>
            <p class="text-muted-foreground text-xs">
              Maximum time to wait for any LLM response (applies to all services)
            </p>
          </div>
          <span class="text-muted-foreground text-xs font-medium">
            {(settings.apiSettings.llmTimeoutMs / 1000).toFixed(0)}s
          </span>
        </div>
        <div class="flex items-center gap-4">
          <div class="flex flex-1 flex-col gap-4">
            <Slider
              type="single"
              value={timeoutValue}
              min={LLM_TIMEOUT_MIN}
              max={LLM_TIMEOUT_MAX}
              step={LLM_TIMEOUT_STEP}
              onValueChange={updateTimeout}
            />
            <div class="text-muted-foreground flex justify-between text-xs">
              <span>{LLM_TIMEOUT_MIN_SECONDS}s</span>
              <span>{Math.floor(LLM_TIMEOUT_MAX_SECONDS / 60)}min</span>
            </div>
          </div>
          <div>
            <Input
              type="number"
              class="h-9 w-24 text-left"
              value={Math.round(settings.apiSettings.llmTimeoutMs / 1000)}
              oninput={(e) => {
                const seconds = parseInt(e.currentTarget.value, 10)
                if (
                  !isNaN(seconds) &&
                  seconds >= LLM_TIMEOUT_MIN_SECONDS &&
                  seconds <= LLM_TIMEOUT_MAX_SECONDS
                ) {
                  settings.setLlmTimeout(seconds * 1000)
                }
              }}
              onchange={(e) => {
                const seconds = parseInt(e.currentTarget.value, 10)
                if (isNaN(seconds) || seconds < LLM_TIMEOUT_MIN_SECONDS) {
                  settings.setLlmTimeout(LLM_TIMEOUT_MIN)
                } else if (seconds > LLM_TIMEOUT_MAX_SECONDS) {
                  settings.setLlmTimeout(LLM_TIMEOUT_MAX)
                }
              }}
            />
          </div>
        </div>
      </div>
    </CardContent>
  </Card>

  <Card>
    <CardHeader>
      <CardTitle>Epistemic Workflow</CardTitle>
      <CardDescription>
        Optional multi-agent secrecy and reveal controls for Adventure and Creative Writing modes.
      </CardDescription>
    </CardHeader>
    <CardContent class="space-y-4">
      <div class="flex items-start justify-between gap-4 rounded-lg border px-3 py-3">
        <div class="space-y-1">
          <Label>Enable Epistemic Workflow</Label>
          <p class="text-muted-foreground text-xs">
            Master toggle for knowledge-silo stages, disclosure gating, and director-planning flow.
          </p>
        </div>
        <Switch
          checked={settings.experimentalFeatures.epistemicWorkflowEnabled}
          onCheckedChange={(checked) => updateEpistemic('epistemicWorkflowEnabled', checked)}
        />
      </div>

      <div class="grid gap-3 rounded-lg border p-3">
        <div class="flex items-start justify-between gap-4">
          <div class="space-y-1">
            <Label>Adventure Gating</Label>
            <p class="text-muted-foreground text-xs">
              Apply perception and knowledge checks for Adventure narration.
            </p>
          </div>
          <Switch
            checked={settings.experimentalFeatures.epistemicGateAdventureEnabled}
            disabled={!settings.experimentalFeatures.epistemicWorkflowEnabled}
            onCheckedChange={(checked) => updateEpistemic('epistemicGateAdventureEnabled', checked)}
          />
        </div>

        <div class="flex items-start justify-between gap-4">
          <div class="space-y-1">
            <Label>Disclosure Gatekeeper</Label>
            <p class="text-muted-foreground text-xs">
              Validate reveal plausibility before final prose. Always enabled in Fast mode.
            </p>
          </div>
          <Switch
            checked={settings.experimentalFeatures.epistemicDisclosureGateEnabled}
            disabled={!settings.experimentalFeatures.epistemicWorkflowEnabled ||
              settings.experimentalFeatures.epistemicExecutionMode === 'fast'}
            onCheckedChange={(checked) => updateEpistemic('epistemicDisclosureGateEnabled', checked)}
          />
        </div>

        <div class="flex items-start justify-between gap-4">
          <div class="space-y-1">
            <Label>Director Outlining Assistant</Label>
            <p class="text-muted-foreground text-xs">
              Enable assistant support for drafting secret facts and outline proposals.
            </p>
          </div>
          <Switch
            checked={settings.experimentalFeatures.directorOutliningAssistantEnabled}
            disabled={!settings.experimentalFeatures.epistemicWorkflowEnabled}
            onCheckedChange={(checked) =>
              updateEpistemic('directorOutliningAssistantEnabled', checked)}
          />
        </div>

        <div class="flex items-start justify-between gap-4">
          <div class="space-y-1">
            <Label>Cost and Latency Overlay</Label>
            <p class="text-muted-foreground text-xs">
              Show per-turn overhead estimates for epistemic stages.
            </p>
          </div>
          <Switch
            checked={settings.experimentalFeatures.epistemicCostOverlayEnabled}
            disabled={!settings.experimentalFeatures.epistemicWorkflowEnabled}
            onCheckedChange={(checked) => updateEpistemic('epistemicCostOverlayEnabled', checked)}
          />
        </div>

        <div class="grid gap-2">
          <Label for="epistemic-execution-mode">Execution Mode</Label>
          <select
            id="epistemic-execution-mode"
            class="bg-background border-input h-9 rounded-md border px-3 text-sm"
            value={settings.experimentalFeatures.epistemicExecutionMode}
            disabled={!settings.experimentalFeatures.epistemicWorkflowEnabled}
            onchange={(e) =>
              updateEpistemic(
                'epistemicExecutionMode',
                (e.currentTarget.value as 'quality' | 'fast') ?? 'quality',
              )}
          >
            <option value="quality">Quality (full staged passes)</option>
            <option value="fast">Fast (reduced passes)</option>
          </select>
        </div>
      </div>
    </CardContent>
  </Card>

  <MainNarrative {onOpenManualBodyEditor} />
  <AgentProfiles />
</div>

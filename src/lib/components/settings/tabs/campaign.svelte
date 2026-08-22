<script lang="ts">
  import { campaign } from '$lib/stores/campaign.svelte'
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card'
  import { Label } from '$lib/components/ui/label'
  import { Input } from '$lib/components/ui/input'
  import * as Select from '$lib/components/ui/select'
  import { Users, Swords } from 'lucide-svelte'

  const combatPolicies = [
    {
      value: 'companions_autonomous',
      label: 'Autonomous companions',
      description: 'Companions choose sensible combat actions from their own priorities.',
    },
    {
      value: 'tactical_delegate',
      label: 'Tactical delegation',
      description: 'You give intent; the companion chooses the concrete action.',
    },
    {
      value: 'tactical_player',
      label: 'Direct tactical control',
      description: 'You choose companion combat actions directly when the session starts.',
    },
  ] as const

  async function updatePartySize(value: string) {
    const parsed = Math.max(1, Math.min(12, Math.floor(Number(value))))
    if (!Number.isFinite(parsed) || !campaign.settings) return
    const maxPartySize = Math.max(parsed, campaign.settings.maxPartySize)
    await campaign.updateSettings({ defaultPartySize: parsed, maxPartySize })
  }

  async function updateMaxPartySize(value: string) {
    const parsed = Math.max(1, Math.min(12, Math.floor(Number(value))))
    if (!Number.isFinite(parsed) || !campaign.settings) return
    const defaultPartySize = Math.min(campaign.settings.defaultPartySize, parsed)
    await campaign.updateSettings({ defaultPartySize, maxPartySize: parsed })
  }

  // If campaign exists but settings haven't loaded yet, reload them
  $effect(() => {
    if (campaign.current?.storyId && !campaign.settings) {
      campaign.loadForStory(campaign.current.storyId).catch((error) => {
        console.error('[CampaignSettings] Failed to load campaign settings:', error)
      })
    }
  })
</script>

{#if campaign.current && campaign.settings}
  <div class="space-y-6">
    <div>
      <h2 class="text-foreground text-xl font-semibold">Campaign Settings</h2>
      <p class="text-muted-foreground mt-1 text-sm">
        Configure party capacity and how autonomous companions behave in future sessions.
      </p>
    </div>

    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2 text-base">
          <Users class="text-primary h-4 w-4" />
          Party Capacity
        </CardTitle>
      </CardHeader>
      <CardContent class="grid gap-4 sm:grid-cols-2">
        <div class="space-y-2">
          <Label for="default-party-size">Default party size</Label>
          <Input
            id="default-party-size"
            type="number"
            min="1"
            max="12"
            value={campaign.settings.defaultPartySize}
            oninput={(event) => updatePartySize(event.currentTarget.value)}
          />
          <p class="text-muted-foreground text-xs">Suggested size when starting a new session.</p>
        </div>
        <div class="space-y-2">
          <Label for="max-party-size">Maximum active party size</Label>
          <Input
            id="max-party-size"
            type="number"
            min="1"
            max="12"
            value={campaign.settings.maxPartySize}
            oninput={(event) => updateMaxPartySize(event.currentTarget.value)}
          />
          <p class="text-muted-foreground text-xs">The active party cannot exceed this limit.</p>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2 text-base">
          <Swords class="text-primary h-4 w-4" />
          Companion Combat Policy
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-3">
        <Label for="default-combat-policy">Default for new sessions</Label>
        <Select.Root
          type="single"
          value={campaign.settings.companionCombatPolicy}
          onValueChange={(value) =>
            value && campaign.updateSettings({ companionCombatPolicy: value as typeof campaign.settings.companionCombatPolicy })}
        >
          <Select.Trigger id="default-combat-policy" class="w-full">
            {combatPolicies.find((policy) =>
              policy.value === campaign.settings?.companionCombatPolicy)?.label ?? 'Autonomous companions'}
          </Select.Trigger>
          <Select.Content>
            {#each combatPolicies as policy (policy.value)}
              <Select.Item value={policy.value} label={policy.label}>
                <div class="flex flex-col items-start">
                  <span>{policy.label}</span>
                  <span class="text-muted-foreground text-xs">{policy.description}</span>
                </div>
              </Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </CardContent>
    </Card>
  </div>
{:else}
  <p class="text-muted-foreground text-sm">Campaign settings are available for active Campaign Engine campaigns.</p>
{/if}

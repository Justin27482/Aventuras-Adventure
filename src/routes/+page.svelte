<script lang="ts">
  import { onMount } from 'svelte'
  import { database } from '$lib/services/database'
  import { settings } from '$lib/stores/settings.svelte'
  import { grammarService } from '$lib/services/grammar'
  import { updaterService } from '$lib/services/updater'
  import { packService } from '$lib/services/packs/pack-service'
  import { rulesetService } from '$lib/services/ruleset/ruleset-service'
  import { warmupAllProfiles } from '$lib/services/modelHealthOrchestrator'
  import { bootstrapSplitDatabase } from '$lib/services/splitDatabaseBootstrap'
  import AppShell from '$lib/components/layout/AppShell.svelte'
  import WelcomeScreen from '$lib/components/intro/WelcomeScreen.svelte'

  let initialized = $state(false)
  let error = $state<string | null>(null)
  let showProviderSetup = $state(false)

  onMount(async () => {
    try {
      // Ensure split DB is isolated; if missing, bootstrap from legacy Aventuras DB.
      await bootstrapSplitDatabase('adventure')

      // Initialize database connection
      await database.init()

      // Seed prompt templates into the database (idempotent)
      await packService.initialize().catch((err) => {
        console.warn('[startup] pack initialization failed', err)
      })

      // Seed built-in ruleset templates into the database (idempotent)
      await rulesetService.initialize().catch((err) => {
        console.warn('[startup] ruleset initialization failed', err)
      })

      // Initialize settings from database
      await settings.init()

      // Warm up model health cache now that settings (profiles, models) are loaded
      warmupAllProfiles().catch((err) => console.warn('[health] warmup failed', err))

      // Check if this is a first-run (new user)
      if (!settings.firstRunComplete) {
        showProviderSetup = true
        // Don't fully initialize until provider is selected
        return
      }

      // Pre-load grammar checker WASM in background (don't await)
      grammarService.setup().catch((err) => console.warn('[startup] grammar setup failed', err))

      // Check for updates on startup if enabled (don't await, run in background)
      if (settings.updateSettings.autoCheck) {
        const { checkInterval, lastChecked, autoDownload } = settings.updateSettings
        const now = Date.now()
        const shouldCheck =
          checkInterval <= 0
            ? true
            : !lastChecked || now - lastChecked >= checkInterval * 60 * 60 * 1000

        if (shouldCheck) {
          updaterService
            .checkForUpdates()
            .then(async (updateInfo) => {
              await settings.setLastChecked(Date.now())
              if (updateInfo.available) {
                console.log(`[Updater] Update available: v${updateInfo.version}`)

                // Auto-download if enabled
                if (autoDownload) {
                  console.log('[Updater] Auto-downloading update...')
                  updaterService.downloadAndInstall().catch(console.error)
                }
              }
            })
            .catch((err) => console.warn('[startup] update check failed', err))
        }
      }

      initialized = true
    } catch (e) {
      console.error('Initialization error:', e)
      error = e instanceof Error ? e.message : 'Failed to initialize application'
    }
  })

  async function handleProviderSetupComplete() {
    showProviderSetup = false
    // Ensure templates are seeded (idempotent, safe to call again)
    await packService.initialize()
    // Continue with initialization
    grammarService.setup().catch(console.error)
    initialized = true
  }
</script>

{#if error}
  <div class="bg-surface-900 flex h-screen w-screen items-center justify-center">
    <div class="card max-w-md text-center">
      <h1 class="text-xl font-semibold text-red-400">Initialization Error</h1>
      <p class="text-surface-400 mt-2">{error}</p>
      <button class="btn btn-primary mt-4" onclick={() => window.location.reload()}> Retry </button>
    </div>
  </div>
{:else if showProviderSetup}
  <WelcomeScreen onComplete={handleProviderSetupComplete} />
{:else if !initialized}
  <div
    class="bg-background relative flex h-screen w-screen items-center justify-center overflow-hidden"
  >
    <div
      class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,hsl(32_92%_54%_/_0.12),transparent_42%)]"
    ></div>
    <div class="relative flex flex-col items-center gap-5">
      <div
        class="border-primary/30 bg-card/80 h-24 w-24 animate-pulse rounded-2xl border p-4 shadow-[0_0_60px_hsl(32_92%_54%_/_0.18)]"
      >
        <img src="/campaign-engine-mark.svg" alt="Campaign Engine" class="h-full w-full" />
      </div>
      <div class="flex flex-col items-center gap-1">
        <p class="text-foreground text-sm font-semibold tracking-[0.18em] uppercase">
          Campaign Engine
        </p>
        <p class="text-muted-foreground text-xs">Preparing your campaign workspace...</p>
      </div>
    </div>
  </div>
{:else}
  <AppShell>
    <!-- Default slot content if needed -->
  </AppShell>
{/if}

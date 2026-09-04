<script lang="ts">
  import { onMount } from 'svelte'
  import { database } from '$lib/services/database'
  import { MIGRATION_CATALOG, type MigrationCatalogEntry } from '$lib/services/migrations/migration-catalog'
  import type { MigrationStatus } from '$lib/types'
  import { ArrowLeft, CheckCircle2, ChevronDown, ChevronRight, CircleAlert, Code2, RefreshCw } from 'lucide-svelte'
  import * as ResponsiveModal from '$lib/components/ui/responsive-modal'
  import * as Dialog from '$lib/components/ui/dialog'
  import { Button } from '$lib/components/ui/button'
  import { Badge } from '$lib/components/ui/badge'
  import { ui } from '$lib/stores/ui.svelte'

  let statuses = $state<MigrationStatus[]>([])
  let loading = $state(false)
  let error = $state<string | null>(null)
  let expanded = $state<Set<number>>(new Set())
  let selectedSql = $state<MigrationCatalogEntry | null>(null)
  let showSql = $state(false)
  let missingVersions = $state<number[] | null>(null)
  let installingVersion = $state<number | null>(null)
  let installMessage = $state<string | null>(null)

  const rows = $derived(
    statuses.map((status) => ({
      status,
      catalog: MIGRATION_CATALOG.find((migration) => migration.version === status.version) ?? null,
    })),
  )

  onMount(() => {
    void loadMigrations()
  })

  async function loadMigrations() {
    loading = true
    error = null
    try {
      statuses = await database.getMigrationStatuses()
      missingVersions = null
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause)
    } finally {
      loading = false
    }
  }

  async function checkMissingMigrations() {
    await loadMigrations()
    const appliedVersions = new Set(statuses.filter((status) => status.success).map((status) => status.version))
    missingVersions = MIGRATION_CATALOG
      .filter((migration) => !appliedVersions.has(migration.version))
      .map((migration) => migration.version)
    installMessage = null
  }

  async function installNextMigration() {
    const version = missingVersions?.[0]
    const catalog = MIGRATION_CATALOG.find((migration) => migration.version === version)
    if (!version || !catalog || installingVersion !== null) return

    installingVersion = version
    installMessage = null
    try {
      const digest = await crypto.subtle.digest('SHA-384', new TextEncoder().encode(catalog.sql))
      await database.installMigration({
        version,
        description: catalog.description,
        sql: catalog.sql,
        checksum: Array.from(new Uint8Array(digest)),
        previousVersions: MIGRATION_CATALOG
          .filter((migration) => migration.version < version)
          .map((migration) => migration.version),
      })
      installMessage = `Migration ${version} installed successfully. Run the check again to verify the remaining sequence.`
      await checkMissingMigrations()
    } catch (cause) {
      installMessage = cause instanceof Error ? cause.message : String(cause)
    } finally {
      installingVersion = null
    }
  }

  function toggle(version: number) {
    const next = new Set(expanded)
    if (next.has(version)) next.delete(version)
    else next.add(version)
    expanded = next
  }

  function openSql(catalog: MigrationCatalogEntry) {
    selectedSql = catalog
    showSql = true
  }

  function backToSettings() {
    ui.closeMigrationLog()
    ui.setSettingsTab('advanced')
    ui.openSettings()
  }
</script>

<ResponsiveModal.Root
  open={ui.migrationLogOpen}
  onOpenChange={(open) => !open && backToSettings()}
>
  <ResponsiveModal.Content class="flex h-[85vh] max-h-[85vh] flex-col gap-0 p-0 sm:max-w-5xl">
    <ResponsiveModal.Header class="border-border border-b px-6 py-4">
      <div class="flex items-center justify-between gap-4">
        <Button variant="ghost" size="icon" onclick={backToSettings} title="Back to Settings" aria-label="Back to Settings">
          <ArrowLeft class="h-4 w-4" />
        </Button>
        <div class="min-w-0 flex-1">
          <ResponsiveModal.Title>Database Migration Log</ResponsiveModal.Title>
          <ResponsiveModal.Description>
            Applied SQL migrations and their recorded execution status.
          </ResponsiveModal.Description>
        </div>
        <Button variant="outline" size="sm" onclick={() => loadMigrations()} disabled={loading} title="Refresh migration log">
          <RefreshCw class={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /> Refresh
        </Button>
        <Button variant="outline" size="sm" onclick={checkMissingMigrations} disabled={loading} title="Compare migration files with the applied ledger">
          <CircleAlert class="h-4 w-4" /> Check for Missing Migrations
        </Button>
      </div>
    </ResponsiveModal.Header>

    <div class="flex-1 overflow-auto p-4 sm:p-6">
      {#if loading && statuses.length === 0}
        <p class="text-muted-foreground text-sm">Loading migration ledger...</p>
      {:else if error}
        <div class="border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-2 rounded-md border p-3 text-sm">
          <CircleAlert class="mt-0.5 h-4 w-4 shrink-0" />
          <span class="whitespace-pre-wrap">{error}</span>
        </div>
      {:else if rows.length === 0 && missingVersions === null}
        <p class="text-muted-foreground text-sm">No migration records were found.</p>
      {:else}
        {#if missingVersions !== null}
          <div class={`mb-4 rounded-md border p-3 text-sm ${missingVersions.length > 0 ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}`}>
            {#if missingVersions.length > 0}
              <p class="font-medium">{missingVersions.length} migration{missingVersions.length === 1 ? '' : 's'} missing from the applied ledger.</p>
              <p class="mt-1 text-xs">Missing versions: {missingVersions.join(', ')}</p>
              <p class="mt-1 text-xs">Only the next missing migration can be installed, one at a time. New migrations use retry-safe incremental execution so a lock retry can resume without repeating destructive work.</p>
              <p class="mt-1 text-xs">An attempt can fail when an earlier migration is missing, the migration is already recorded, a required table or column is absent, the SQL is incompatible with the current database, or the checksum cannot be recorded. The error below will identify the reason.</p>
              <Button class="mt-3" onclick={installNextMigration} disabled={installingVersion !== null}>
                <RefreshCw class={installingVersion !== null ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
                {installingVersion !== null ? `Installing ${installingVersion}...` : `Attempt Install Migration ${missingVersions[0]}`}
              </Button>
              {#if installMessage}
                <div class="mt-3 rounded border border-amber-500/30 bg-black/10 p-2 text-xs whitespace-pre-wrap">{installMessage}</div>
              {/if}
              <div class="mt-3 space-y-1">
                {#each missingVersions as version (version)}
                  {@const catalog = MIGRATION_CATALOG.find((migration) => migration.version === version)}
                  {#if catalog}
                    <div class="flex items-center gap-2 rounded border border-amber-500/20 px-2 py-1.5">
                      <button class="text-muted-foreground" onclick={() => toggle(version)} title="Expand missing migration details">
                        {#if expanded.has(version)}<ChevronDown class="h-4 w-4" />{:else}<ChevronRight class="h-4 w-4" />{/if}
                      </button>
                      <span class="font-mono text-xs">{version}</span>
                      <span class="flex-1 text-xs">{catalog.description}</span>
                      <Button variant="outline" size="sm" onclick={() => openSql(catalog)}><Code2 class="h-3.5 w-3.5" /> View SQL</Button>
                    </div>
                    {#if expanded.has(version)}
                      <div class="bg-black/10 space-y-2 rounded border border-amber-500/20 px-8 py-2 text-xs">
                        <div><span class="text-muted-foreground">Status:</span> Not applied</div>
                        <div><span class="text-muted-foreground">Affected objects:</span> {catalog.affectedObjects.join(', ') || 'None detected'}</div>
                      </div>
                    {/if}
                  {/if}
                {/each}
              </div>
            {:else}
              <p class="font-medium">All bundled migrations are present in the applied ledger.</p>
            {/if}
          </div>
        {/if}
        <div class="border-border overflow-hidden rounded-md border">
          {#each rows as row (row.status.version)}
            <div class="border-border border-b last:border-b-0">
              <div class="hover:bg-muted/40 flex items-center gap-3 px-3 py-2.5">
                <button class="text-muted-foreground shrink-0" onclick={() => toggle(row.status.version)} title="Expand migration details">
                  {#if expanded.has(row.status.version)}<ChevronDown class="h-4 w-4" />{:else}<ChevronRight class="h-4 w-4" />{/if}
                </button>
                {#if row.status.success}<CheckCircle2 class="h-4 w-4 shrink-0 text-emerald-500" />{:else}<CircleAlert class="text-destructive h-4 w-4 shrink-0" />{/if}
                <span class="w-12 shrink-0 font-mono text-xs">{row.status.version}</span>
                <span class="min-w-0 flex-1 truncate text-sm font-medium">{row.status.description || row.catalog?.description || 'Unknown migration'}</span>
                <Badge variant={row.status.success ? 'secondary' : 'destructive'}>{row.status.success ? 'Applied' : 'Failed'}</Badge>
                <span class="text-muted-foreground hidden text-xs sm:inline">{row.status.executionTimeMs ?? '?'} ms</span>
              </div>
              {#if expanded.has(row.status.version)}
                <div class="bg-muted/20 space-y-3 border-t px-10 py-3 text-xs">
                  <div class="grid gap-2 sm:grid-cols-2">
                    <div><span class="text-muted-foreground">Installed:</span> {row.status.installedOn ?? 'Unknown'}</div>
                    <div><span class="text-muted-foreground">Checksum:</span> <span class="font-mono">{row.status.checksum ?? 'Unavailable'}</span></div>
                  </div>
                  <div><span class="text-muted-foreground">Affected objects:</span> {row.catalog?.affectedObjects.join(', ') || 'Catalog unavailable'}</div>
                  {#if row.catalog}
                    <Button variant="outline" size="sm" onclick={() => openSql(row.catalog!)}>
                      <Code2 class="h-3.5 w-3.5" /> View migration SQL
                    </Button>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </ResponsiveModal.Content>
</ResponsiveModal.Root>

<Dialog.Root bind:open={showSql}>
  <Dialog.Content class="flex max-h-[85vh] flex-col sm:max-w-4xl">
    <Dialog.Header>
      <Dialog.Title class="flex items-center gap-2"><Code2 class="h-4 w-4" /> Migration {selectedSql?.version} SQL</Dialog.Title>
      <Dialog.Description>{selectedSql?.filename}</Dialog.Description>
    </Dialog.Header>
    <pre class="bg-muted max-h-[60vh] overflow-auto rounded-md p-4 text-left font-mono text-xs leading-relaxed whitespace-pre-wrap">{selectedSql?.sql}</pre>
    <Dialog.Footer><Button variant="outline" onclick={() => (showSql = false)}>Close</Button></Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

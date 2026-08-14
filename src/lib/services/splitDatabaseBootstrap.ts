type StoryMode = 'adventure'

interface SplitDatabaseBootstrapResult {
  status: string
  imported: boolean
  target_path: string
  legacy_path: string | null
  stories_before: number
  stories_after: number
  stories_removed: number
}

/**
 * One-time split bootstrap:
 * - If split DB already exists, no-op.
 * - If split DB does not exist and legacy Aventuras DB exists, copy it.
 * - Keep full vault data and filter stories to the requested mode.
 */
export async function bootstrapSplitDatabase(mode: StoryMode): Promise<void> {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const result = await invoke<SplitDatabaseBootstrapResult>('bootstrap_split_database', {
      mode,
    })

    if (result.imported) {
      console.info('[split-db] Imported legacy Aventuras database into split database', {
        mode,
        targetPath: result.target_path,
        legacyPath: result.legacy_path,
        storiesBefore: result.stories_before,
        storiesAfter: result.stories_after,
        storiesRemoved: result.stories_removed,
      })
    } else {
      console.info('[split-db] Bootstrap skipped', {
        mode,
        status: result.status,
        targetPath: result.target_path,
      })
    }
  } catch (error) {
    // Non-fatal: app should still start with an empty split DB.
    console.warn('[split-db] Bootstrap failed, continuing with split DB initialization', error)
  }
}

import type { CampaignFormationSnapshot } from '$lib/types'

export function stableFormationSnapshotJson(snapshot: CampaignFormationSnapshot): string {
  const orderedTables = Object.fromEntries(
    Object.entries(snapshot.tables)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([table, rows]) => [
        table,
        [...rows].sort((left, right) =>
          String(left.id ?? '').localeCompare(String(right.id ?? '')),
        ),
      ]),
  )
  return JSON.stringify({ ...snapshot, tables: orderedTables })
}

export async function checksumFormationSnapshot(
  snapshot: CampaignFormationSnapshot,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(stableFormationSnapshotJson(snapshot)),
  )
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')
}

export function canRestoreFormationBackup(input: {
  restoredAt: number | null
  liveCharacterCount: number
  normalSessionCount: number
  setupSessionCount: number
}): boolean {
  return (
    input.restoredAt === null &&
    input.liveCharacterCount === 0 &&
    input.normalSessionCount === 0 &&
    input.setupSessionCount === 0
  )
}

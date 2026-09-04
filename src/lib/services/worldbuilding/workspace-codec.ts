import type { WorldbuildingWorkspace } from '$lib/types'

export function encodeWorldbuildingDraft(
  workspace: WorldbuildingWorkspace,
): Record<string, string> {
  return {
    ...workspace.draft,
    __workspaceTitle: workspace.title,
    __promptPackId: workspace.promptPackId,
  }
}

export function decodeWorldbuildingWorkspace(row: {
  id: string
  draft: string
  charter: string | null
  conversation: string
  updated_at: number
}): WorldbuildingWorkspace {
  const storedDraft = JSON.parse(row.draft || '{}') as Record<string, string>
  const title =
    storedDraft.__workspaceTitle?.trim() || storedDraft.title?.trim() || 'Untitled World'
  const promptPackId = storedDraft.__promptPackId?.trim() || 'default-pack'
  delete storedDraft.__workspaceTitle
  delete storedDraft.__promptPackId
  return {
    id: row.id,
    title,
    promptPackId,
    draft: storedDraft,
    charter: row.charter || '',
    conversation: JSON.parse(row.conversation || '[]'),
    updatedAt: row.updated_at,
  }
}

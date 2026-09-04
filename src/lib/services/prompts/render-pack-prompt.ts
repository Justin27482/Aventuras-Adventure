import { database } from '$lib/services/database'
import { packService } from '$lib/services/packs/pack-service'
import { templateEngine } from '$lib/services/templates/engine'

export async function renderPackPrompt(
  packId: string,
  templateId: string,
  values: Record<string, unknown>,
): Promise<{ system: string; user: string }> {
  await packService.ensurePromptTemplateComplete(packId, templateId)
  const [systemTemplate, userTemplate, variables] = await Promise.all([
    database.getPackTemplate(packId, templateId),
    database.getPackTemplate(packId, `${templateId}-user`),
    database.getPackVariables(packId),
  ])
  const context: Record<string, unknown> = { ...values }
  for (const variable of variables) {
    if (!(variable.variableName in context))
      context[variable.variableName] = variable.defaultValue ?? ''
  }
  const system = systemTemplate?.content
    ? (templateEngine.render(systemTemplate.content, context) ?? '')
    : ''
  const user = userTemplate?.content
    ? (templateEngine.render(userTemplate.content, context) ?? '')
    : ''
  if (!system.trim() || !user.trim()) {
    throw new Error(`Prompt pack is missing required template content for ${templateId}`)
  }
  return { system, user }
}

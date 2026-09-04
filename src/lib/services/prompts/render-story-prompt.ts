import { ContextBuilder } from '$lib/services/context/context-builder'
import { packService } from '$lib/services/packs/pack-service'

export async function renderStoryPrompt(
  storyId: string,
  templateId: string,
  values: Record<string, unknown>,
  options: { requireUser?: boolean } = {},
): Promise<{ system: string; user: string }> {
  const context = await ContextBuilder.forStory(storyId)
  await packService.ensurePromptTemplateComplete(context.getPackId(), templateId)
  context.add(values)
  const rendered = await context.render(templateId)
  if (!rendered.system.trim()) {
    throw new Error(`Prompt pack is missing required system content for ${templateId}`)
  }
  if (options.requireUser !== false && !rendered.user.trim()) {
    throw new Error(`Prompt pack is missing required user content for ${templateId}`)
  }
  return rendered
}
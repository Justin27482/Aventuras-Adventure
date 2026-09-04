import { z } from 'zod'
import { generateStructured } from '../sdk/generate'
import { renderPackPrompt } from '$lib/services/prompts'

export const worldbuildingFields = [
  'title',
  'premise',
  'genre',
  'tone',
  'powerScale',
  'magicTechnology',
  'factions',
  'calendar',
  'themes',
  'boundaries',
] as const

export type WorldbuildingField = (typeof worldbuildingFields)[number]
export type WorldbuildingDraft = Record<WorldbuildingField, string>

const updateSchema = z.object({
  title: z.string().optional(),
  premise: z.string().optional(),
  genre: z.string().optional(),
  tone: z.string().optional(),
  powerScale: z.string().optional(),
  magicTechnology: z.string().optional(),
  factions: z.string().optional(),
  calendar: z.string().optional(),
  themes: z.string().optional(),
  boundaries: z.string().optional(),
})

const responseSchema = z.object({
  reply: z
    .string()
    .describe(
      'A warm, concise response to the user. Ask one useful next question when appropriate.',
    ),
  proposal: updateSchema.describe(
    'Only include fields that should be added or changed. Omit fields that should remain unchanged.',
  ),
})

export type WorldbuildingResponse = z.infer<typeof responseSchema>

export class WorldbuildingAssistantService {
  async respond(
    draft: WorldbuildingDraft,
    userMessage: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    promptPackId: string,
  ): Promise<WorldbuildingResponse> {
    const prompt = await renderPackPrompt(promptPackId, 'worldbuilding-assistant', {
      worldbuildingDraft: JSON.stringify(draft, null, 2),
      worldbuildingConversation: JSON.stringify(
        [...history, { role: 'user', content: userMessage }],
        null,
        2,
      ),
      worldbuildingUserMessage: userMessage,
    })
    const response = await generateStructured(
      {
        presetId: 'agentic',
        schema: responseSchema,
        system: prompt.system,
        prompt: prompt.user,
      },
      'worldbuildingAssistant',
    )
    return response
  }
}

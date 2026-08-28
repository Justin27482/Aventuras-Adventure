import { z } from 'zod'
import { generateStructured } from '../sdk'

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
  reply: z.string().describe('A warm, concise response to the user. Ask one useful next question when appropriate.'),
  proposal: updateSchema.describe('Only include fields that should be added or changed. Omit fields that should remain unchanged.'),
})

export type WorldbuildingResponse = z.infer<typeof responseSchema>

export class WorldbuildingAssistantService {
  private history: Array<{ role: 'user' | 'assistant'; content: string }> = []

  reset() {
    this.history = []
  }

  async respond(draft: WorldbuildingDraft, userMessage: string): Promise<WorldbuildingResponse> {
    const response = await generateStructured(
      {
        presetId: 'agentic',
        schema: responseSchema,
        system: `You are an interview-driven tabletop worldbuilding assistant. Help the user brainstorm and make decisions through natural discussion. Ask focused follow-up questions, offer several contrasting options when they are undecided, and explain implications for play. You have one explicit tool-like operation: update_worldbuilding_draft. Use it only to propose concrete updates derived from the conversation; never invent a user preference silently. The application will show the proposal for approval, so omit unchanged fields. Preserve hard boundaries and never weaken them. Return only the requested structured response.`,
        prompt: JSON.stringify({
          operation: 'update_worldbuilding_draft',
          currentDraft: draft,
          conversation: [...this.history, { role: 'user', content: userMessage }],
          instruction: 'Respond to the latest message and propose only changes the user clearly requested or accepted.',
        }),
      },
      'worldbuildingAssistant',
    )
    this.history.push({ role: 'user', content: userMessage }, { role: 'assistant', content: response.reply })
    return response
  }
}

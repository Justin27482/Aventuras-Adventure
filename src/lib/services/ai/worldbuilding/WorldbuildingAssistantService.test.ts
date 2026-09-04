import { beforeEach, describe, expect, it, vi } from 'vitest'

const { generateStructured, renderPackPrompt } = vi.hoisted(() => ({
  generateStructured: vi.fn(),
  renderPackPrompt: vi.fn(),
}))

vi.mock('../sdk', () => ({ generateStructured }))
vi.mock('$lib/services/prompts', () => ({ renderPackPrompt }))

import { WorldbuildingAssistantService } from './WorldbuildingAssistantService'

describe('WorldbuildingAssistantService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    renderPackPrompt.mockResolvedValue({ system: 'DARK WORLD SYSTEM', user: 'DARK WORLD TASK' })
    generateStructured.mockResolvedValue({
      reply: 'Let us define the cost of magic.',
      proposal: {},
    })
  })

  it('uses the conversation-selected prompt pack and restored history', async () => {
    const service = new WorldbuildingAssistantService()
    await service.respond(
      {
        title: 'Ashfall',
        premise: '',
        genre: 'Fantasy',
        tone: '',
        powerScale: '',
        magicTechnology: '',
        factions: '',
        calendar: '',
        themes: '',
        boundaries: 'No coercion',
      },
      'Make the magic dangerous.',
      [{ role: 'assistant', content: 'What should magic cost?' }],
      'dark-worlds',
    )

    expect(renderPackPrompt).toHaveBeenCalledWith(
      'dark-worlds',
      'worldbuilding-assistant',
      expect.objectContaining({
        worldbuildingConversation: expect.stringContaining('What should magic cost?'),
        worldbuildingUserMessage: 'Make the magic dangerous.',
      }),
    )
    expect(generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({ system: 'DARK WORLD SYSTEM', prompt: 'DARK WORLD TASK' }),
      'worldbuildingAssistant',
    )
  })
})

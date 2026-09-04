import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  generatePlainText,
  generateStructured,
  renderStoryPrompt,
  contextFactory,
  contextAdd,
  contextRender,
  ensurePromptTemplateComplete,
  mockDatabase,
} = vi.hoisted(() => ({
  generatePlainText: vi.fn(),
  generateStructured: vi.fn(),
  renderStoryPrompt: vi.fn(),
  contextFactory: vi.fn(),
  contextAdd: vi.fn(),
  contextRender: vi.fn(),
  ensurePromptTemplateComplete: vi.fn(),
  mockDatabase: {
    getStory: vi.fn(),
    getEntriesForBranch: vi.fn(),
  },
}))

vi.mock('$lib/services/ai/sdk', () => ({ generatePlainText, generateStructured }))
vi.mock('$lib/services/prompts/render-story-prompt', () => ({ renderStoryPrompt }))
vi.mock('$lib/services/context/context-builder', () => ({
  ContextBuilder: { forAIPlayer: contextFactory },
}))
vi.mock('$lib/services/packs/pack-service', () => ({
  packService: { ensurePromptTemplateComplete },
}))
vi.mock('$lib/services/database', () => ({ database: mockDatabase }))

import { TableTalkOrchestrator } from './table-talk-orchestrator'

describe('TableTalkOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    renderStoryPrompt.mockImplementation(async (_storyId: string, templateId: string) => ({
      system:
        templateId === 'ai-player-decision'
          ? 'CUSTOM PACK DECISION CONTRACT'
          : 'CUSTOM PACK TABLE TALK SYSTEM',
      user: 'CUSTOM PACK TABLE TALK TASK',
    }))
    contextFactory.mockResolvedValue({
      getContext: () => ({ aiPlayerProfileContext: 'ASSIGNED CHARACTER CONTEXT' }),
      getPackId: () => 'custom-pack',
      add: contextAdd,
      render: contextRender,
    })
    contextRender.mockResolvedValue({ system: 'CUSTOM PACK DECISION CONTRACT', user: '' })
    mockDatabase.getStory.mockResolvedValue({ currentBranchId: null })
    mockDatabase.getEntriesForBranch.mockResolvedValue([])
  })

  it('does not call the language model while table talk is silent', async () => {
    const reaction = await TableTalkOrchestrator.generateReaction({
      storyId: 'story-1',
      campaignId: 'campaign-1',
      aiPlayerId: 'ai-player-1',
      character: { name: 'Mara' },
      recentAction: 'Mara succeeds at a difficult check.',
      otherCharacters: [{ name: 'Rowan' }],
      sceneContext: 'social',
      tableTalkIntensity: 0,
    })

    expect(reaction.content).toBe('')
    expect(generatePlainText).not.toHaveBeenCalled()
  })

  it('generates a concise reaction using the plain-text SDK', async () => {
    generatePlainText.mockResolvedValue('Nice work, that was a clutch roll.')

    const reaction = await TableTalkOrchestrator.generateReaction({
      storyId: 'story-1',
      campaignId: 'campaign-1',
      aiPlayerId: 'ai-player-1',
      character: { name: 'Mara', personality: { primaryPlaystyle: 'social' } },
      recentAction: 'Mara succeeds at a difficult check.',
      otherCharacters: [{ name: 'Rowan' }],
      sceneContext: 'social',
      tableTalkIntensity: 5,
    })

    expect(reaction.content).toBe('Nice work, that was a clutch roll.')
    expect(reaction.characterName).toBe('Mara')
    expect(contextFactory).toHaveBeenCalledWith(
      'story-1',
      'ai-player-1',
      undefined,
      { kind: 'full_table' },
      undefined,
    )
    expect(contextAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        aiPlayerName: 'Mara',
        aiPlayerProfileContext: expect.stringContaining('ASSIGNED CHARACTER CONTEXT'),
      }),
    )
    expect(renderStoryPrompt).toHaveBeenCalledWith(
      'story-1',
      'ai-player-table-talk-reaction',
      expect.objectContaining({
        aiPlayerDecisionPrompt: 'CUSTOM PACK DECISION CONTRACT',
      }),
    )
    expect(generatePlainText).toHaveBeenCalledWith(
      expect.objectContaining({
        presetId: 'agentic',
        system: 'CUSTOM PACK DECISION CONTRACT\n\nCUSTOM PACK TABLE TALK SYSTEM',
      }),
      'tableTalkReaction',
    )
  })

  it('forwards the recent transcript into the AI Player context so replies see prior chat', async () => {
    generatePlainText.mockResolvedValue('Ha, classic Mara.')

    await TableTalkOrchestrator.generateReaction({
      storyId: 'story-1',
      campaignId: 'campaign-1',
      aiPlayerId: 'ai-player-1',
      character: { name: 'Mara' },
      recentAction: 'Mara succeeds at a difficult check.',
      otherCharacters: [{ name: 'Rowan' }],
      sceneContext: 'social',
      tableTalkIntensity: 5,
      recentTranscript: ['GM: The door creaks open.', 'Rowan: I step through first.'],
    })

    expect(contextFactory).toHaveBeenCalledWith(
      'story-1',
      'ai-player-1',
      undefined,
      { kind: 'full_table' },
      ['GM: The door creaks open.', 'Rowan: I step through first.'],
    )
  })

  it('adds relevant public lore to assigned-player context without hidden information', async () => {
    generatePlainText.mockResolvedValue('The old gate belongs to my character history.')
    mockDatabase.getEntriesForBranch.mockResolvedValue([
      {
        id: 'lore-1',
        storyId: 'story-1',
        name: 'Old Gate',
        type: 'location',
        description: 'A sealed gate marked with the party crest.',
        hiddenInfo: 'The gate is secretly a mimic.',
        aliases: ['sealed gate'],
        injection: { mode: 'keyword', keywords: ['gate'], priority: 8 },
        deleted: false,
      },
      {
        id: 'lore-2',
        storyId: 'story-1',
        name: 'Unrelated Crown',
        type: 'item',
        description: 'A distant royal relic.',
        hiddenInfo: null,
        aliases: [],
        injection: { mode: 'keyword', keywords: ['crown'], priority: 3 },
        deleted: false,
      },
    ])

    await TableTalkOrchestrator.generateReaction({
      storyId: 'story-1',
      campaignId: 'campaign-1',
      aiPlayerId: 'ai-player-1',
      character: { name: 'Mara' },
      recentAction: 'What does Mara know about the gate?',
      otherCharacters: [],
      sceneContext: 'exploration',
      tableTalkIntensity: 5,
      forceResponse: true,
    })

    const profileContext = contextAdd.mock.calls.at(-1)?.[0]?.aiPlayerProfileContext as string
    expect(profileContext).toContain('Old Gate: A sealed gate marked with the party crest.')
    expect(profileContext).not.toContain('secretly a mimic')
    expect(profileContext).not.toContain('Unrelated Crown')
  })

  it('responds to directed table talk below guaranteed intensity', async () => {
    generatePlainText.mockResolvedValue('I am in. What boundaries should we keep in view?')

    const reaction = await TableTalkOrchestrator.generateReaction({
      storyId: 'story-1',
      campaignId: 'campaign-1',
      aiPlayerId: 'ai-player-2',
      character: {
        name: 'Megan Whimple',
        playerName: 'Felicia Day',
        personality: { primaryPlaystyle: 'roleplay' },
      },
      recentAction: 'Felicia, what do you think about the premise?',
      otherCharacters: [{ name: 'Emily Star' }],
      sceneContext: 'session zero',
      tableTalkIntensity: 4,
      forceResponse: true,
      recentTranscript: ['GM: Let us talk about the premise.'],
    })

    expect(reaction.content).toContain('I am in')
    expect(reaction.characterName).toBe('Felicia Day (Megan Whimple)')
    expect(renderStoryPrompt).toHaveBeenCalledWith(
      'story-1',
      'ai-player-table-talk-reaction',
      expect.objectContaining({
        recentTableTalkTranscript: 'GM: Let us talk about the premise.',
        tableTalkPlayerName: 'Felicia Day',
      }),
    )
  })

  it('selects multiple relevant responders with a lightweight structured call', async () => {
    generateStructured.mockResolvedValue({
      responderIds: ['ai-player-1', 'ai-player-2'],
      conversationEnded: false,
    })

    const responders = await TableTalkOrchestrator.selectResponders({
      storyId: 'story-1',
      gmMessage: 'Mara and Rowan, what do both of you think?',
      candidates: [
        { id: 'ai-player-1', name: 'Mara' },
        { id: 'ai-player-2', name: 'Rowan' },
        { id: 'ai-player-3', name: 'Tamsin' },
      ],
      recentTranscript: ['GM: We need to settle the route.'],
      maximumResponders: 3,
    })

    expect(responders).toEqual(['ai-player-1', 'ai-player-2'])
    expect(renderStoryPrompt).toHaveBeenCalledWith(
      'story-1',
      'ai-player-table-talk-routing',
      expect.objectContaining({ maximumResponders: 3 }),
    )
    expect(generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({ presetId: 'suggestions' }),
      'tableTalkResponderSelection',
    )
  })

  it('selects no responder when the GM has ended the conversation', async () => {
    generateStructured.mockResolvedValue({
      responderIds: ['ai-player-1'],
      conversationEnded: true,
    })

    const responders = await TableTalkOrchestrator.selectResponders({
      storyId: 'story-1',
      gmMessage: 'Thanks, that settles it. Let us move on.',
      candidates: [{ id: 'ai-player-1', name: 'Mara' }],
      maximumResponders: 2,
    })

    expect(responders).toEqual([])
  })

  describe('getIntensityLabel', () => {
    it('returns correct intensity labels', () => {
      // Access private method through test
      const getLabel = (intensity: number) => {
        switch (true) {
          case intensity === 0:
            return 'Silent'
          case intensity <= 2:
            return 'Minimal'
          case intensity <= 4:
            return 'Moderate'
          case intensity <= 6:
            return 'High'
          default:
            return 'Very High'
        }
      }

      expect(getLabel(0)).toBe('Silent')
      expect(getLabel(1)).toBe('Minimal')
      expect(getLabel(3)).toBe('Moderate')
      expect(getLabel(5)).toBe('High')
      expect(getLabel(8)).toBe('Very High')
    })
  })

  describe('getReactionDelayMs', () => {
    it('returns 0 for intensity 0 (silent)', () => {
      const delay = TableTalkOrchestrator.getReactionDelayMs(0)
      expect(delay).toBe(0)
    })

    it('returns 3-6 seconds for minimal intensity (1-2)', () => {
      const delay = TableTalkOrchestrator.getReactionDelayMs(1)
      expect(delay).toBeGreaterThanOrEqual(3000)
      expect(delay).toBeLessThanOrEqual(6000)
    })

    it('returns 1.5-3.5 seconds for moderate intensity (3-4)', () => {
      const delay = TableTalkOrchestrator.getReactionDelayMs(3)
      expect(delay).toBeGreaterThanOrEqual(1500)
      expect(delay).toBeLessThanOrEqual(3500)
    })

    it('returns 0.5-2 seconds for high intensity (5-6)', () => {
      const delay = TableTalkOrchestrator.getReactionDelayMs(5)
      expect(delay).toBeGreaterThanOrEqual(500)
      expect(delay).toBeLessThanOrEqual(2000)
    })

    it('returns 0-1 second for very high intensity (7-8)', () => {
      const delay = TableTalkOrchestrator.getReactionDelayMs(8)
      expect(delay).toBeGreaterThanOrEqual(0)
      expect(delay).toBeLessThanOrEqual(1000)
    })
  })
})

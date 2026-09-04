import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SessionZeroOrchestrator } from './session-zero-orchestrator'
import * as sdk from '$lib/services/ai/sdk'
import type { CharacterStats } from '$lib/types'

// Mock the AI SDK
vi.mock('$lib/services/ai/sdk', () => ({
  generateText: vi.fn(),
  generateStructured: vi.fn(),
}))

// Mock TableTalkOrchestrator
vi.mock('./table-talk-orchestrator', () => ({
  TableTalkOrchestrator: {
    generateReaction: vi.fn().mockResolvedValue({
      characterName: 'Test Player',
      content: 'Great introduction!',
    }),
  },
}))

describe('SessionZeroOrchestrator', () => {
  const mockPlayers: CharacterStats[] = [
    {
      id: 'player-1',
      name: 'Mara',
      background: 'Rogue',
      personality: 'Quick-witted and charming',
      health: { current: 15, max: 20 },
      energy: { current: 5, max: 8 },
    },
    {
      id: 'player-2',
      name: 'Rowan',
      background: 'Cleric',
      personality: 'Thoughtful and protective',
      health: { current: 18, max: 22 },
      energy: { current: 6, max: 10 },
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('startIntroductions', () => {
    it('should generate introductions for all AI players', async () => {
      vi.mocked(sdk.generateText).mockResolvedValue(
        "I'm a nimble rogue with sharp wit and sharper blades.",
      )

      const phases = await SessionZeroOrchestrator.startIntroductions(mockPlayers)

      expect(phases.length).toBeGreaterThan(0)
      expect(phases[0].phase).toBe('introductions')
      expect(phases[0].type).toBe('narration')
      expect(phases[0].content).toContain('Introductions')
    })

    it('should include player-specific introductions', async () => {
      vi.mocked(sdk.generateText).mockResolvedValue('My introduction text')

      const phases = await SessionZeroOrchestrator.startIntroductions(mockPlayers)

      const introPhases = phases.filter((p) => p.type === 'interaction')
      expect(introPhases.length).toBeGreaterThanOrEqual(mockPlayers.length)
    })

    it('should call generateText for each player', async () => {
      vi.mocked(sdk.generateText).mockResolvedValue('Mock introduction')

      await SessionZeroOrchestrator.startIntroductions(mockPlayers)

      expect(sdk.generateText).toHaveBeenCalledWith(
        expect.stringContaining('Mara'),
        expect.any(Object),
      )
      expect(sdk.generateText).toHaveBeenCalledWith(
        expect.stringContaining('Rowan'),
        expect.any(Object),
      )
    })

    it('should handle empty player list', async () => {
      const phases = await SessionZeroOrchestrator.startIntroductions([])

      expect(phases.length).toBeGreaterThan(0)
      expect(phases[0].type).toBe('narration')
    })
  })

  describe('startPremises', () => {
    it('should generate questions for each AI player', async () => {
      vi.mocked(sdk.generateText).mockResolvedValue('What is the current threat?')

      const premiseText = 'The kingdom faces a dragon threat.'
      const phases = await SessionZeroOrchestrator.startPremises(premiseText, mockPlayers)

      const questionPhases = phases.filter((p) => p.content?.includes('💭'))
      expect(questionPhases.length).toBeGreaterThan(0)
    })

    it('should start with narration containing premise', async () => {
      const premiseText = 'A new adventure begins.'
      const phases = await SessionZeroOrchestrator.startPremises(premiseText, mockPlayers)

      expect(phases[0].type).toBe('narration')
      expect(phases[0].content).toContain('Premises')
      expect(phases[0].content).toContain(premiseText)
    })

    it('should include completion narration after premises', async () => {
      vi.mocked(sdk.generateText).mockResolvedValue('Question')

      const phases = await SessionZeroOrchestrator.startPremises('Setting', mockPlayers)

      const lastPhase = phases[phases.length - 1]
      expect(lastPhase.type).toBe('narration')
    })
  })

  describe('startCharacterCreation', () => {
    it('should generate character stats for each player', async () => {
      const phases = await SessionZeroOrchestrator.startCharacterCreation(mockPlayers)

      const sheetPhases = phases.filter((p) => p.type === 'character_sheet_modal')
      expect(sheetPhases.length).toBe(mockPlayers.length)
    })

    it('should include character sheet modal type', async () => {
      const phases = await SessionZeroOrchestrator.startCharacterCreation(mockPlayers)

      const modalPhase = phases.find((p) => p.type === 'character_sheet_modal')
      expect(modalPhase).toBeDefined()
      expect(modalPhase?.characterToAdjust).toBeDefined()
      expect(modalPhase?.proposedAdjustments).toBeDefined()
    })

    it('should include confirmation narrations after each character', async () => {
      const phases = await SessionZeroOrchestrator.startCharacterCreation(mockPlayers)

      const readyMessages = phases.filter(
        (p) => p.type === 'narration' && p.content?.includes('ready'),
      )
      expect(readyMessages.length).toBe(mockPlayers.length)
    })
  })

  describe('startPartyBonding', () => {
    it('should generate bonding dialogue', async () => {
      vi.mocked(sdk.generateText).mockResolvedValue('Great to meet you all!')

      const phases = await SessionZeroOrchestrator.startPartyBonding(mockPlayers)

      const dialoguePhases = phases.filter((p) => p.type === 'interaction')
      expect(dialoguePhases.length).toBeGreaterThan(0)
    })

    it('should start with bonding phase narration', async () => {
      const phases = await SessionZeroOrchestrator.startPartyBonding(mockPlayers)

      expect(phases[0].type).toBe('narration')
      expect(phases[0].content).toContain('Bonding')
    })

    it('should include multiple rounds of dialogue', async () => {
      vi.mocked(sdk.generateText).mockResolvedValue('Dialogue text')

      const phases = await SessionZeroOrchestrator.startPartyBonding(mockPlayers)

      expect(phases.length).toBeGreaterThanOrEqual(4) // intro + at least 3 dialogue rounds
    })
  })

  describe('startSecrets', () => {
    it('should generate secrets for each character', async () => {
      vi.mocked(sdk.generateText).mockResolvedValue('Secret text about loyalty')

      const phases = await SessionZeroOrchestrator.startSecrets(mockPlayers)

      const secretPhases = phases.filter((p) => p.content?.includes('might have secret'))
      expect(secretPhases.length).toBe(mockPlayers.length)
    })

    it('should include completion message', async () => {
      vi.mocked(sdk.generateText).mockResolvedValue('Secret')

      const phases = await SessionZeroOrchestrator.startSecrets(mockPlayers)

      const completeMsg = phases.find((p) => p.content?.includes('Complete'))
      expect(completeMsg).toBeDefined()
      expect(completeMsg?.phase).toBe('complete')
    })

    it('should mark phase as complete', async () => {
      vi.mocked(sdk.generateText).mockResolvedValue('Secret')

      const phases = await SessionZeroOrchestrator.startSecrets(mockPlayers)

      const lastPhase = phases[phases.length - 1]
      expect(lastPhase.phase).toBe('complete')
    })
  })

  describe('integration', () => {
    it('should handle full session zero flow', async () => {
      vi.mocked(sdk.generateText).mockResolvedValue('Mock response')

      // Phase 1: Introductions
      const intro = await SessionZeroOrchestrator.startIntroductions(mockPlayers)
      expect(intro[0].phase).toBe('introductions')

      // Phase 2: Premises
      const premises = await SessionZeroOrchestrator.startPremises('Dragon threat', mockPlayers)
      expect(premises[0].phase).toBe('premises')

      // Phase 3: Character Creation
      const charCreation = await SessionZeroOrchestrator.startCharacterCreation(mockPlayers)
      expect(charCreation.some((p) => p.type === 'character_sheet_modal')).toBe(true)

      // Phase 4: Party Bonding
      const bonding = await SessionZeroOrchestrator.startPartyBonding(mockPlayers)
      expect(bonding[0].phase).toBe('bonding')

      // Phase 5: Secrets
      const secrets = await SessionZeroOrchestrator.startSecrets(mockPlayers)
      expect(secrets.some((p) => p.phase === 'complete')).toBe(true)
    })

    it('should generate reasonable volumes of content per phase', async () => {
      vi.mocked(sdk.generateText).mockResolvedValue('Content')

      const intro = await SessionZeroOrchestrator.startIntroductions(mockPlayers)
      const premises = await SessionZeroOrchestrator.startPremises('Setting', mockPlayers)
      const chars = await SessionZeroOrchestrator.startCharacterCreation(mockPlayers)
      const bonding = await SessionZeroOrchestrator.startPartyBonding(mockPlayers)
      const secrets = await SessionZeroOrchestrator.startSecrets(mockPlayers)

      // Each phase should have multiple content items
      expect(intro.length).toBeGreaterThanOrEqual(2)
      expect(premises.length).toBeGreaterThanOrEqual(3)
      expect(chars.length).toBeGreaterThanOrEqual(3)
      expect(bonding.length).toBeGreaterThanOrEqual(3)
      expect(secrets.length).toBeGreaterThanOrEqual(2)
    })
  })
})

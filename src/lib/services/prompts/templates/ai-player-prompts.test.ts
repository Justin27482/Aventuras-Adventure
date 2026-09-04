import { describe, expect, it } from 'vitest'
import { PROMPT_TEMPLATES } from './index'

const requiredAIPlayerTemplates = [
  'ai-player-decision',
  'ai-player-voice',
  'ai-player-proposal',
  'ai-player-table-talk-routing',
  'ai-player-table-talk-reaction',
  'ai-player-session-zero-introduction',
  'ai-player-session-zero-question',
  'ai-player-consensus',
  'private-prologue-memory',
]

describe('AI Player prompt pack contract', () => {
  it('exposes every active AI Player behavior prompt in the pack', () => {
    for (const templateId of requiredAIPlayerTemplates) {
      expect(PROMPT_TEMPLATES.find((template) => template.id === templateId)).toBeDefined()
    }
  })

  it('keeps personality-preserving participation guidance configurable', () => {
    const decision = PROMPT_TEMPLATES.find((template) => template.id === 'ai-player-decision')

    expect(decision?.content).toContain('Disagreement is not disengagement')
    expect(decision?.content).toContain('offer a safe playable alternative')
    expect(decision?.content).toContain('{{ aiPlayerProfileContext }}')
  })

  it('composes the full decision contract into Table Talk reactions', () => {
    const reaction = PROMPT_TEMPLATES.find(
      (template) => template.id === 'ai-player-table-talk-reaction',
    )

    expect(reaction?.content).toContain('{{ aiPlayerDecisionPrompt }}')
    expect(reaction?.content).toContain('Respond as the AI Player out of character')
  })

  it('makes distinct voice guidance configurable and composes it into introductions', () => {
    const voice = PROMPT_TEMPLATES.find((template) => template.id === 'ai-player-voice')
    const introduction = PROMPT_TEMPLATES.find(
      (template) => template.id === 'ai-player-session-zero-introduction',
    )

    expect(voice?.content).toContain('{{ aiPlayerVoiceProfile }}')
    expect(voice?.content).toContain('{{ priorAIPlayerMessages }}')
    expect(voice?.content).toContain('Do not imitate another player')
    expect(introduction?.content).toContain('{{ aiPlayerVoicePrompt }}')
  })

  it('summarizes a completed private prologue into a memory only that AI Player retains', () => {
    const memory = PROMPT_TEMPLATES.find((template) => template.id === 'private-prologue-memory')

    expect(memory?.userContent).toContain('{{ privatePrologueTranscript }}')
    expect(memory?.content).toContain('first person')
    expect(memory?.content).toContain('never shown to other players')
  })

  it('provides editable system and user content for each model call', () => {
    for (const templateId of requiredAIPlayerTemplates.filter(
      (templateId) => templateId !== 'ai-player-decision' && templateId !== 'ai-player-voice',
    )) {
      const template = PROMPT_TEMPLATES.find((entry) => entry.id === templateId)
      expect(template?.content.trim()).toBeTruthy()
      expect(template?.userContent?.trim()).toBeTruthy()
    }
  })
})

import { describe, it, expect } from 'vitest'
import { RollDetectionService } from './roll-detection-service'

describe('RollDetectionService', () => {
  describe('detectRoll', () => {
    it('detects "Roll for [skill]" pattern', () => {
      const result = RollDetectionService.detectRoll('Roll for Persuasion')
      expect(result.found).toBe(true)
      expect(result.skillName).toBe('Persuasion')
      expect(result.rollNotation).toBe('d20')
    })

    it('detects "Make a [ability] check" pattern', () => {
      const result = RollDetectionService.detectRoll('Make a Dexterity check')
      expect(result.found).toBe(true)
      expect(result.abilityScore).toBe('Dexterity')
      expect(result.rollNotation).toBe('d20')
    })

    it('detects abbreviated ability rolls with an action', () => {
      const result = RollDetectionService.detectRoll('Roll Dex to turn off the tablet')
      expect(result.found).toBe(true)
      expect(result.abilityScore).toBe('Dexterity')
      expect(result.rollNotation).toBe('d20')
    })

    it('detects "Roll Initiative" pattern', () => {
      const result = RollDetectionService.detectRoll('Roll Initiative')
      expect(result.found).toBe(true)
      expect(result.skillName).toBe('Initiative')
    })

    it('detects "[Skill] check vs DC [N]" pattern', () => {
      const result = RollDetectionService.detectRoll('Acrobatics check vs DC 15')
      expect(result.found).toBe(true)
      expect(result.skillName).toBe('Acrobatics')
      expect(result.dc).toBe(15)
    })

    it('detects custom dice notation', () => {
      const result = RollDetectionService.detectRoll('Let me roll 2d6 + 3')
      expect(result.found).toBe(true)
      expect(result.rollNotation).toBe('2d6+3')
    })

    it('returns no roll for plain text', () => {
      const result = RollDetectionService.detectRoll('The dragon looks very angry')
      expect(result.found).toBe(false)
    })

    it('is case-insensitive', () => {
      const result = RollDetectionService.detectRoll('ROLL FOR STEALTH')
      expect(result.found).toBe(true)
      expect(result.skillName).toBe('STEALTH')
    })
  })

  describe('toNotation', () => {
    it('converts detected roll to notation string', () => {
      const detected = RollDetectionService.detectRoll('Roll for Persuasion vs DC 13')
      const notation = RollDetectionService.toNotation(detected)
      expect(notation).toContain('d20')
      expect(notation).toContain('dc:13')
    })

    it('returns empty string for undetected rolls', () => {
      const detected = RollDetectionService.detectRoll('No roll here')
      const notation = RollDetectionService.toNotation(detected)
      expect(notation).toBe('')
    })
  })

  describe('toLabel', () => {
    it('formats skill name as label', () => {
      const detected = RollDetectionService.detectRoll('Roll for Persuasion')
      const label = RollDetectionService.toLabel(detected)
      expect(label).toBe('Persuasion Check')
    })

    it('formats ability as label', () => {
      const detected = RollDetectionService.detectRoll('Make a Strength check')
      const label = RollDetectionService.toLabel(detected)
      expect(label).toBe('Strength Check')
    })

    it('returns "Roll" for undetected', () => {
      const detected = RollDetectionService.detectRoll('No roll')
      const label = RollDetectionService.toLabel(detected)
      expect(label).toBe('Roll')
    })
  })

  describe('detectRolls', () => {
    it('detects rolls in multiple texts', () => {
      const texts = ['Roll for Perception', 'Make a Strength check', 'No roll here']
      const results = RollDetectionService.detectRolls(texts)
      expect(results).toHaveLength(3)
      expect(results[0].found).toBe(true)
      expect(results[1].found).toBe(true)
      expect(results[2].found).toBe(false)
    })
  })
})

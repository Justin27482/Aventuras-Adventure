/**
 * G.4-G.7: Roll Detection Service
 *
 * Parses GM narration and player input for roll requests.
 * Supports patterns like:
 * - "Roll for Persuasion"
 * - "Make a Dexterity check"
 * - "Roll Initiative"
 * - "d20 check for Acrobatics vs DC 15"
 */

export interface DetectedRoll {
  found: boolean
  skillName?: string
  abilityScore?: string
  dc?: number
  rollNotation?: string
  narrativeContext: string
}

export class RollDetectionService {
  /**
   * Parse text for roll requests
   * Returns detected roll info or indication that no roll found
   */
  static detectRoll(text: string): DetectedRoll {
    const context = text.trim()

    // Pattern 1: "Roll for [skill] (vs DC [N])?"
    const rollForPattern = /roll\s+for\s+(\w+)(?:\s+vs\s+dc\s+(\d+))?/i
    const rollForMatch = context.match(rollForPattern)
    if (rollForMatch) {
      const skillName = rollForMatch[1]
      const dc = rollForMatch[2] ? parseInt(rollForMatch[2], 10) : undefined
      return {
        found: true,
        skillName,
        dc,
        rollNotation: 'd20',
        narrativeContext: context,
      }
    }

    // Pattern 1b: short ability request, e.g. "Roll Dex to disable the tablet"
    const shortAbilityPattern = /roll\s+(str|dex|con|int|wis|cha)\b(?:\s+(?:to|for)\b)?/i
    const shortAbilityMatch = context.match(shortAbilityPattern)
    if (shortAbilityMatch) {
      const abilityNames: Record<string, string> = {
        str: 'Strength',
        dex: 'Dexterity',
        con: 'Constitution',
        int: 'Intelligence',
        wis: 'Wisdom',
        cha: 'Charisma',
      }
      return {
        found: true,
        abilityScore: abilityNames[shortAbilityMatch[1].toLowerCase()],
        rollNotation: 'd20',
        narrativeContext: context,
      }
    }

    // Pattern 2: "Make a [ability] check"
    const abilityCheckPattern = /make\s+a\s+(\w+)\s+check/i
    const abilityMatch = context.match(abilityCheckPattern)
    if (abilityMatch) {
      const ability = abilityMatch[1]
      return {
        found: true,
        abilityScore: ability,
        rollNotation: 'd20',
        narrativeContext: context,
      }
    }

    // Pattern 3: "Roll Initiative"
    const initiativePattern = /roll\s+initiative/i
    if (initiativePattern.test(context)) {
      return {
        found: true,
        skillName: 'Initiative',
        rollNotation: 'd20',
        narrativeContext: context,
      }
    }

    // Pattern 4: "[Skill] check vs DC [number]"
    const dcPattern = /(\w+)\s+check\s+vs\s+dc\s+(\d+)/i
    const dcMatch = context.match(dcPattern)
    if (dcMatch) {
      return {
        found: true,
        skillName: dcMatch[1],
        dc: parseInt(dcMatch[2], 10),
        rollNotation: 'd20',
        narrativeContext: context,
      }
    }

    // Pattern 5: "d[N] roll" or custom notation (e.g., "2d6+3")
    const customNotationPattern = /(\d*d\d+(?:\s*[+-]\s*\d+)?)/i
    const customMatch = context.match(customNotationPattern)
    if (customMatch) {
      return {
        found: true,
        rollNotation: customMatch[1].replace(/\s+/g, ''),
        narrativeContext: context,
      }
    }

    // No roll detected
    return {
      found: false,
      narrativeContext: context,
    }
  }

  /**
   * Convert detected roll info to standard d20 notation
   */
  static toNotation(detected: DetectedRoll): string {
    if (!detected.found) return ''

    const base = detected.rollNotation || 'd20'
    const dc = detected.dc ? `dc:${detected.dc}` : ''
    const parts = [base, dc].filter(Boolean)
    return parts.join(' ')
  }

  /**
   * Format detected roll as human-readable label for UI
   */
  static toLabel(detected: DetectedRoll): string {
    if (!detected.found) return 'Roll'

    if (detected.skillName) {
      return `${detected.skillName} Check`
    }

    if (detected.abilityScore) {
      return `${detected.abilityScore} Check`
    }

    return 'Roll'
  }

  /**
   * Batch detect rolls in multiple text snippets
   */
  static detectRolls(texts: string[]): DetectedRoll[] {
    return texts.map((text) => this.detectRoll(text))
  }
}

export const rollDetectionService = new RollDetectionService()

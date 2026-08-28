import { describe, expect, it } from 'vitest'
import { safetyTemplates } from './safety'
import { templateEngine } from '$lib/services/templates/engine'

const safetyContext = {
  protagonistName: 'Alex',
  activeActorName: 'Alex',
  mode: 'adventure',
  pov: 'third',
  tense: 'present',
}

describe('safety prompt-pack variants', () => {
  it('keeps the hard bans present in every safety template variant', () => {
    const rendered = safetyTemplates.map((template) =>
      templateEngine.render(template.content, safetyContext),
    )

    expect(rendered.every((content) => content !== null)).toBe(true)
    expect(rendered.join('\n').toLowerCase()).toContain('compelled sexual act')
    expect(rendered.join('\n').toLowerCase()).toContain('consent')
  })

  it('contains the mechanics boundary in the mechanics safety variant', () => {
    const template = safetyTemplates.find(
      (candidate) => candidate.id === 'safety-mechanics-constraints',
    )
    expect(template).toBeDefined()
    expect(templateEngine.render(template!.content, safetyContext)).toContain(
      'Mechanics may not mutate consent',
    )
  })

  it('enforces hard safety bans at max intensity level 8', () => {
    const maxIntensityContext = {
      ...safetyContext,
      nsfwIntensity: 8,
      nsfwIntensityLabel: 'Maximum Mature',
    }
    const template = safetyTemplates.find(
      (candidate) => candidate.id === 'safety-content-intensity',
    )
    expect(template).toBeDefined()

    const rendered = templateEngine.render(template!.content, maxIntensityContext)
    expect(rendered).toContain('Level 8')
    expect(rendered).toContain('Maximum Mature')
    expect(rendered).toContain('graphic consensual adult sexual content')
    expect(rendered).toContain('HARD BAN')
    expect(rendered).toContain(
      'Compelled sexual acts and consent override remain strictly prohibited at every intensity level',
    )
  })
})

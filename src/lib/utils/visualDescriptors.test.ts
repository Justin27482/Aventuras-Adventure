import { describe, expect, it } from 'vitest'
import {
  DEFAULT_VISUAL_DESCRIPTOR_LABELS,
  VISUAL_DESCRIPTOR_LABELS,
  descriptorsToString,
  getAvailableVisualDescriptorLabels,
  parseVisualDescriptors,
  stringToDescriptors,
} from './visualDescriptors'

describe('visual descriptors', () => {
  it('exposes the labels accepted by the descriptor parser', () => {
    expect(VISUAL_DESCRIPTOR_LABELS).toEqual({
      face: 'Face',
      hair: 'Hair',
      eyes: 'Eyes',
      build: 'Build',
      clothing: 'Clothing',
      accessories: 'Accessories',
      distinguishing: 'Distinguishing',
    })
  })

  it('parses labeled appearance categories', () => {
    expect(stringToDescriptors('Face: oval, Hair: dark brown, Eyes: green')).toEqual({
      face: 'oval',
      hair: 'dark brown',
      eyes: 'green',
    })
  })

  it('preserves freeform appearance text instead of dropping it', () => {
    const appearance = 'Short dark hair, green eyes, and a worn leather jacket'

    expect(stringToDescriptors(appearance)).toEqual({ distinguishing: appearance })
    expect(descriptorsToString(stringToDescriptors(appearance))).toBe(
      `Distinguishing: ${appearance}`,
    )
  })

  it('parses custom labels into their configured descriptor fields', () => {
    const labels = [
      ...DEFAULT_VISUAL_DESCRIPTOR_LABELS,
      { key: 'presence', label: 'Presence', minNsfwIntensity: 3 },
    ]

    expect(parseVisualDescriptors('Hair: black, Presence: composed and magnetic', labels)).toEqual({
      hair: 'black',
      presence: 'composed and magnetic',
    })
  })

  it('hides labels that exceed the campaign content intensity', () => {
    const labels = [
      ...DEFAULT_VISUAL_DESCRIPTOR_LABELS,
      { key: 'presence', label: 'Presence', minNsfwIntensity: 3 },
    ]

    expect(
      getAvailableVisualDescriptorLabels(labels, 2).some((label) => label.key === 'presence'),
    ).toBe(false)
    expect(
      getAvailableVisualDescriptorLabels(labels, 3).some((label) => label.key === 'presence'),
    ).toBe(true)
  })
})

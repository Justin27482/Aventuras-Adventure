/**
 * Visual Descriptors Utilities
 *
 * Single source of truth for converting between VisualDescriptors object
 * and display strings (for UI editing).
 */

import type { VisualDescriptorLabel, VisualDescriptors } from '$lib/types'

export const APPEARANCE_DESCRIPTOR_LABELS_SETTING_KEY = 'appearance_descriptor_labels'

const CATEGORY_ORDER = [
  'face',
  'hair',
  'eyes',
  'build',
  'clothing',
  'accessories',
  'distinguishing',
] as const

export const VISUAL_DESCRIPTOR_LABELS: Record<(typeof CATEGORY_ORDER)[number], string> = {
  face: 'Face',
  hair: 'Hair',
  eyes: 'Eyes',
  build: 'Build',
  clothing: 'Clothing',
  accessories: 'Accessories',
  distinguishing: 'Distinguishing',
}

export const DEFAULT_VISUAL_DESCRIPTOR_LABELS: VisualDescriptorLabel[] = CATEGORY_ORDER.map(
  (key) => ({ key, label: VISUAL_DESCRIPTOR_LABELS[key], minNsfwIntensity: 0 }),
)

export function getAvailableVisualDescriptorLabels(
  labels: VisualDescriptorLabel[],
  nsfwIntensity: number,
): VisualDescriptorLabel[] {
  return labels.filter((label) => label.minNsfwIntensity <= nsfwIntensity)
}

/**
 * Convert VisualDescriptors object to a display string for editing.
 */
export function descriptorsToString(descriptors: VisualDescriptors | null | undefined): string {
  if (!descriptors) return ''

  const parts: string[] = []
  for (const key of CATEGORY_ORDER) {
    if (descriptors[key]) {
      parts.push(`${VISUAL_DESCRIPTOR_LABELS[key]}: ${descriptors[key]}`)
    }
  }
  for (const [key, value] of Object.entries(descriptors)) {
    if (!value || CATEGORY_ORDER.includes(key as (typeof CATEGORY_ORDER)[number])) continue
    const label = key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (character) => character.toUpperCase())
    parts.push(`${label}: ${value}`)
  }
  return parts.join(', ')
}

/**
 * Parse an edit string back to VisualDescriptors object.
 */
export function stringToDescriptors(input: string): VisualDescriptors {
  const trimmed = input.trim()
  if (!trimmed) return {}

  const result: VisualDescriptors = {}
  const categoryPattern = /\b(Face|Hair|Eyes|Build|Clothing|Accessories|Distinguishing):\s*/gi

  const parts = trimmed.split(categoryPattern).filter(Boolean)
  for (let i = 0; i < parts.length - 1; i += 2) {
    const category = parts[i].toLowerCase() as keyof VisualDescriptors
    const value = parts[i + 1].replace(/,\s*$/, '').trim()
    if (value && category in VISUAL_DESCRIPTOR_LABELS) {
      result[category] = value
    }
  }

  // Character editing also accepts a natural-language appearance summary. Preserve it
  // rather than silently saving an empty object when it has no structured category labels.
  return Object.keys(result).length > 0 ? result : { distinguishing: trimmed }
}

export function parseVisualDescriptors(
  input: string,
  labels: VisualDescriptorLabel[] = DEFAULT_VISUAL_DESCRIPTOR_LABELS,
): VisualDescriptors {
  const trimmed = input.trim()
  if (!trimmed) return {}

  const result: VisualDescriptors = {}
  const labelsByName = new Map(labels.map((label) => [label.label.toLowerCase(), label.key]))
  const categoryPattern = new RegExp(
    `\\b(${labels.map((label) => label.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}):\\s*`,
    'gi',
  )
  const parts = trimmed.split(categoryPattern).filter(Boolean)
  for (let index = 0; index < parts.length - 1; index += 2) {
    const key = labelsByName.get(parts[index].toLowerCase())
    const value = parts[index + 1].replace(/,\s*$/, '').trim()
    if (key && value) result[key] = value
  }
  return Object.keys(result).length > 0 ? result : { distinguishing: trimmed }
}

/**
 * Check if a VisualDescriptors object has any content.
 */
export function hasDescriptors(descriptors: VisualDescriptors | null | undefined): boolean {
  if (!descriptors) return false
  return Object.values(descriptors).some((v) => v && v.trim())
}

/**
 * Format descriptors for display in prompts/context.
 */
export function formatDescriptorsForPrompt(
  descriptors: VisualDescriptors | null | undefined,
): string {
  return descriptorsToString(descriptors)
}

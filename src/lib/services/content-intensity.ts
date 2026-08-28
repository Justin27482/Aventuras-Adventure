export interface ContentIntensityLevel {
  label: string
}

export const CONTENT_INTENSITY_LEVELS: Record<number, ContentIntensityLevel> = {
  0: {
    label: 'Family Friendly (PG)',
  },
  1: {
    label: 'Mild (PG-13)',
  },
  2: {
    label: 'Teen Romance',
  },
  3: {
    label: 'Mature (R)',
  },
  4: {
    label: 'Romance Novel',
  },
  5: {
    label: 'Erotic Romance',
  },
  6: {
    label: 'Explicit with Plot',
  },
  7: {
    label: 'Total Smut',
  },
  8: {
    label: 'Maximum Mature',
  },
}

export const MAX_CONTENT_INTENSITY = Math.max(...Object.keys(CONTENT_INTENSITY_LEVELS).map(Number))

export function getContentIntensityLevel(value: number): ContentIntensityLevel {
  const level = Math.max(0, Math.min(MAX_CONTENT_INTENSITY, Math.floor(value)))
  return CONTENT_INTENSITY_LEVELS[level]
}

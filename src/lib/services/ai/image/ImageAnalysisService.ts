/**
 * Image Analysis Service
 *
 * Analyzes narrative text to identify visually striking moments for image generation.
 * Uses the Vercel AI SDK with structured output for scene identification.
 *
 * This implements the "analyzed" mode where the LLM acts as an agent to select
 * which phrases/moments should have images generated.
 */

import type { Item, VisualDescriptors } from '$lib/types'
import { formatCharacterAppearance } from '$lib/utils/characterAppearance'
import { BaseAIService } from '../BaseAIService'
import { ContextBuilder } from '$lib/services/context'
import { createLogger } from '$lib/log'
import { sceneAnalysisResultSchema, type ImageableScene } from '../sdk/schemas/imageanalysis'

const log = createLogger('ImageAnalysis')

/**
 * Context needed to analyze narrative for imageable scenes.
 */
export interface ImageAnalysisContext {
  /** The narrative text to analyze (English original) */
  narrativeResponse: string
  /** The user action that triggered this narrative */
  userAction: string
  /** Characters present in the scene with their visual descriptors */
  presentCharacters: Array<{
    id: string
    name: string
    visualDescriptors?: VisualDescriptors
    isProtagonist: boolean
  }>
  /** Current story items used to derive each character's equipped outfit. */
  items?: Item[]
  /** Current location name */
  currentLocation?: string
  /** The image style prompt to include */
  stylePrompt: string
  /** Maximum number of images (0 = unlimited) */
  maxImages: number
  /** Full chat history for comprehensive context */
  chatHistory?: string
  /** Activated lorebook entries for world context */
  lorebookContext?: string
  /** Names of characters that have portrait images available */
  charactersWithPortraits: string[]
  /** Names of characters that need portrait generation before appearing in scene images */
  charactersWithoutPortraits: string[]
  /** Translated narrative text - use this for sourceText extraction when available */
  translatedNarrative?: string
  /** Target language for translation */
  translationLanguage?: string
  /** Generate images with character references */
  referenceMode: boolean
}

/**
 * Service that identifies imageable scenes in narrative text using the Vercel AI SDK.
 */
export class ImageAnalysisService extends BaseAIService {
  /**
   * Create a new ImageAnalysisService.
   * @param serviceId - The service ID used to resolve the preset dynamically
   */
  constructor(serviceId: string) {
    super(serviceId)
  }

  /**
   * Analyze narrative text to identify visually striking moments.
   * Returns an array of imageable scenes sorted by priority (highest first).
   */
  async identifyScenes(context: ImageAnalysisContext): Promise<ImageableScene[]> {
    log('identifyScenes called', {
      narrativeLength: context.narrativeResponse.length,
      presentCharactersCount: context.presentCharacters.length,
      referenceMode: context.referenceMode,
      maxImages: context.maxImages,
      hasTranslation: !!context.translatedNarrative,
    })

    // Build character descriptors block
    const characterDescriptors = this.buildCharacterDescriptors(
      context.presentCharacters,
      context.items ?? [],
    )

    // Format portrait lists
    const charactersWithPortraitsStr =
      context.charactersWithPortraits.length > 0
        ? context.charactersWithPortraits.join(', ')
        : 'None'
    const charactersWithoutPortraitsStr =
      context.charactersWithoutPortraits.length > 0
        ? context.charactersWithoutPortraits.join(', ')
        : 'None'

    // Build translated narrative block if available
    let translatedNarrativeBlock = ''
    if (context.translatedNarrative && context.translationLanguage) {
      translatedNarrativeBlock = `## Display Narrative (${context.translationLanguage} - use this for sourceText)
${context.translatedNarrative}`
    }

    // Select template based on portrait mode
    const templateId = context.referenceMode
      ? 'image-prompt-analysis-reference'
      : 'image-prompt-analysis'

    // Build context and render
    const ctx = new ContextBuilder()
    ctx.add({
      imageStylePrompt: context.stylePrompt,
      characterDescriptors: characterDescriptors || 'No character visual descriptors available.',
      charactersWithPortraits: charactersWithPortraitsStr,
      charactersWithoutPortraits: charactersWithoutPortraitsStr,
      maxImages: context.maxImages === 0 ? '0 (unlimited)' : String(context.maxImages),
      narrativeResponse: context.narrativeResponse,
      userAction: context.userAction,
      chatHistory: context.chatHistory || '',
      lorebookContext: context.lorebookContext || '',
      translatedNarrativeBlock,
    })
    const { system, user: prompt } = await ctx.render(templateId)

    try {
      const result = await this.generate(sceneAnalysisResultSchema, system, prompt, templateId)

      // Sort by priority (highest first)
      const sortedScenes = result.scenes.sort((a, b) => b.priority - a.priority)

      log('identifyScenes complete', {
        scenesFound: sortedScenes.length,
        priorities: sortedScenes.map((s) => s.priority),
      })

      return sortedScenes as ImageableScene[]
    } catch (error) {
      log('identifyScenes failed', error)
      return []
    }
  }

  /**
   * Build a formatted string of character visual descriptors for the prompt.
   */
  private buildCharacterDescriptors(
    characters: Array<{
      id: string
      name: string
      visualDescriptors?: VisualDescriptors
      isProtagonist: boolean
    }>,
    items: Item[],
  ): string {
    const renderedCharacters = characters
      .map((char) => {
        const parts: string[] = [`**${char.name}**:`]
        const appearance = formatCharacterAppearance(char, items)
        if (!appearance) return null
        parts.push(appearance)
        if (char.isProtagonist) parts.push(` (Protagonist)`)

        return parts.join('\n  ')
      })
      .filter((entry): entry is string => entry !== null)

    if (renderedCharacters.length === 0) return ''
    return renderedCharacters.join('\n\n')
  }
}

/**
 * ExportCoordinationService - Gathers all story data in parallel for export.
 * Coordinates with the main exportService to provide complete story data.
 */

import { database } from '$lib/services/database'
import type {
  StoryEntry,
  Character,
  Location,
  Item,
  StoryBeat,
  Chapter,
  ChapterSource,
  Entry,
  Checkpoint,
  Branch,
  EmbeddedImage,
  Campaign,
  CampaignSettings,
  CampaignThread,
  CampaignThreadBeat,
  SceneTurnState,
} from '$lib/types'

/** Complete story data for export */
export interface StoryExportData {
  entries: StoryEntry[]
  characters: Character[]
  locations: Location[]
  items: Item[]
  storyBeats: StoryBeat[]
  lorebookEntries: Entry[]
  embeddedImages: EmbeddedImage[]
  checkpoints: Checkpoint[]
  branches: Branch[]
  chapters: Chapter[]
  chapterSources: ChapterSource[]
  campaign: Campaign | null
  campaignSettings: CampaignSettings | null
  campaignThreads: CampaignThread[]
  campaignThreadBeats: CampaignThreadBeat[]
  sceneTurnState: SceneTurnState | null
}

/**
 * Gather all story data in parallel for export.
 * @param storyId - The story ID to gather data for
 * @returns Complete story data ready for export
 */
export async function gatherStoryData(storyId: string): Promise<StoryExportData> {
  const campaign = await database.getCampaignByStoryId(storyId)
  const [
    entries,
    characters,
    locations,
    items,
    storyBeats,
    lorebookEntries,
    embeddedImages,
    checkpoints,
    branches,
    chapters,
    chapterSources,
    campaignSettings,
    campaignThreads,
    campaignThreadBeats,
    sceneTurnState,
  ] = await Promise.all([
    database.getStoryEntries(storyId),
    database.getCharacters(storyId),
    database.getLocations(storyId),
    database.getItems(storyId),
    database.getStoryBeats(storyId),
    database.getEntries(storyId),
    database.getEmbeddedImagesForStory(storyId),
    database.getCheckpoints(storyId),
    database.getBranches(storyId),
    database.getChapters(storyId),
    database.getChapterSources(storyId),
    campaign ? database.getCampaignSettings(campaign.id) : Promise.resolve(null),
    campaign ? database.getCampaignThreads(campaign.id) : Promise.resolve([]),
    campaign ? database.getCampaignThreadBeats(campaign.id) : Promise.resolve([]),
    campaign ? database.getSceneTurnState(campaign.id) : Promise.resolve(null),
  ])

  return {
    entries,
    characters,
    locations,
    items,
    storyBeats,
    lorebookEntries,
    embeddedImages,
    checkpoints,
    branches,
    chapters,
    chapterSources,
    campaign,
    campaignSettings,
    campaignThreads,
    campaignThreadBeats,
    sceneTurnState,
  }
}

export const exportCoordinationService = {
  gatherStoryData,
}

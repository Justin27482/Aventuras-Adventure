import { createLogger } from '$lib/log'
import { database } from '$lib/services/database'
import { templateEngine } from '$lib/services/templates/engine'
import { BaseAIService } from '../BaseAIService'
import type {
  DirectorProposalArtifact,
  Entry,
  Story,
  StoryBeat,
  Character,
  Location,
  Item,
} from '$lib/types'
import { directorProposalSchema, type DirectorProposal } from '../sdk/schemas/director'

const log = createLogger('DirectorOutliningAssistant')

export interface DirectorOutliningAssistantContext {
  story: Story
  brief: string
  recentEntries: string[]
  persist?: boolean
  worldState: {
    characters: Character[]
    locations: Location[]
    items: Item[]
    storyBeats: StoryBeat[]
    lorebookEntries: Entry[]
  }
}

export class DirectorOutliningAssistantService extends BaseAIService {
  constructor(serviceId: string = 'directorOutliningAssistant') {
    super(serviceId)
  }

  async generateProposal(
    context: DirectorOutliningAssistantContext,
  ): Promise<DirectorProposalArtifact> {
    const storyMode = context.story.mode
    const recentEntryBlock = context.recentEntries.length
      ? context.recentEntries.map((entry) => `- ${entry}`).join('\n')
      : '(none)'

    const worldBlock = [
      `Characters: ${context.worldState.characters.map((character) => character.name).join(', ') || '(none)'}`,
      `Locations: ${context.worldState.locations.map((location) => location.name).join(', ') || '(none)'}`,
      `Items: ${context.worldState.items.map((item) => item.name).join(', ') || '(none)'}`,
      `Story beats: ${context.worldState.storyBeats.map((beat) => beat.title).join(', ') || '(none)'}`,
      `Lorebook entries: ${context.worldState.lorebookEntries.map((entry) => entry.name).join(', ') || '(none)'}`,
    ].join('\n')

    const system = await this.buildSystemPrompt(context.story)

    const prompt = [
      `Story mode: ${storyMode}`,
      `Story title: ${context.story.title}`,
      '',
      '## User Brief',
      context.brief.trim() || '(no brief provided)',
      '',
      '## Recent Story Context',
      recentEntryBlock,
      '',
      '## World Snapshot',
      worldBlock,
      '',
      '## Instructions',
      '- Propose a useful outline with a clear title and concise summary.',
      '- Include any new secret atoms as draft-only structures.',
      '- Include safe reveal pathways only if they are plausibly supported by the context.',
      '- Prefer foreshadowing over direct disclosure when possible.',
    ].join('\n')

    const result = await this.generate(
      directorProposalSchema,
      system,
      prompt,
      'director-outlining-assistant',
    )

    const now = Date.now()
    const artifact: DirectorProposalArtifact = {
      id: crypto.randomUUID(),
      storyId: context.story.id,
      authorType: 'assistant',
      proposalType: 'director_outline',
      title: result.title,
      draftPayload: result as DirectorProposal,
      diffPayload: null,
      approvalState: 'pending',
      approvedBy: null,
      approvedAt: null,
      createdAt: now,
      updatedAt: now,
    }

    if (context.persist !== false) {
      await database.addDirectorProposalArtifact(artifact)
      log('Generated director proposal', { storyId: context.story.id, artifactId: artifact.id })
    } else {
      log('Generated director proposal preview', {
        storyId: context.story.id,
        artifactId: artifact.id,
      })
    }
    return artifact
  }

  async listProposals(storyId: string): Promise<DirectorProposalArtifact[]> {
    return database.getDirectorProposalArtifacts(storyId)
  }

  async approveProposal(artifact: DirectorProposalArtifact): Promise<void> {
    await database.updateDirectorProposalArtifact(artifact.id, {
      approvalState: 'approved',
      approvedBy: 'user',
      approvedAt: Date.now(),
    })
  }

  async rejectProposal(artifact: DirectorProposalArtifact): Promise<void> {
    await database.updateDirectorProposalArtifact(artifact.id, {
      approvalState: 'rejected',
      approvedBy: 'user',
      approvedAt: Date.now(),
    })
  }

  private async buildSystemPrompt(story: Story): Promise<string> {
    const packId = (await database.getStoryPackId(story.id)) ?? 'default-pack'
    const template =
      (await database.getPackTemplate(packId, 'director-outlining-assistant')) ??
      (packId !== 'default-pack'
        ? await database.getPackTemplate('default-pack', 'director-outlining-assistant')
        : null)

    if (!template?.content?.trim()) {
      return [
        'You are the Director Outlining Assistant for a fiction workflow.',
        'Draft secret atoms, reveal pathways, and outline beats without committing any change.',
        'Never overwrite or directly emit player-facing narrative.',
        'Keep hidden facts hidden and provide safe foreshadowing hints when appropriate.',
        'Return JSON only.',
      ].join('\n')
    }

    const templateVars: Record<string, string> = {
      storyTitle: String(story.title ?? ''),
      storyMode: String(story.mode ?? 'adventure'),
    }

    return templateEngine.render(template.content, templateVars) ?? ''
  }
}

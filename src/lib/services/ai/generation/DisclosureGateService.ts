import { z } from 'zod'
import { BaseAIService } from '../BaseAIService'
import { database } from '$lib/services/database'
import { templateEngine } from '$lib/services/templates/engine'
import type {
  Character,
  Entry,
  EpistemicCharacterKnowledgeEdge,
  EpistemicSecretAtom,
  StoryMode,
} from '$lib/types'

const disclosureGateResultSchema = z.object({
  action: z.enum(['allow', 'rewrite', 'suppress']),
  revisedContent: z.string(),
  notes: z.string().optional(),
  blockedSecrets: z
    .array(
      z.object({
        secretId: z.string(),
        action: z.enum(['rewrite', 'suppress']),
        reason: z.string(),
      }),
    )
    .default([]),
})

type DisclosureGateResult = z.infer<typeof disclosureGateResultSchema>
type DisclosureGateReturn = {
  action: 'allow' | 'rewrite' | 'suppress'
  revisedContent: string
  notes?: string
  blockedSecrets: DisclosureGateResult['blockedSecrets']
}

export interface DisclosureGateInput {
  storyMode: StoryMode
  narrative: string
  characters: Character[]
  lorebookEntries: Entry[]
  secretAtoms: EpistemicSecretAtom[]
  knowledgeEdges: EpistemicCharacterKnowledgeEdge[]
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

function normalizeConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (Math.abs(value) > 1) return Math.max(0, Math.min(1, value / 100))
  return Math.max(0, Math.min(1, value))
}

function normalizeIntent(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (Math.abs(value) > 1) return Math.max(-1, Math.min(1, value / 10))
  return Math.max(-1, Math.min(1, value))
}

function getPressureWeight(
  tagType: EpistemicCharacterKnowledgeEdge['pressureTags'][number]['type'],
): number {
  switch (tagType) {
    case 'coercion':
      return 1.4
    case 'panic':
    case 'fear':
      return 1.2
    case 'loyalty':
    case 'duty':
      return 1.1
    case 'ideology':
      return 1
    case 'greed':
      return 0.9
    default:
      return 0.8
  }
}

function scoreEdgeRisk(edge: EpistemicCharacterKnowledgeEdge): number {
  const confidenceRisk = 1 - normalizeConfidence(edge.confidence)
  const intentRisk = 1 - (normalizeIntent(edge.disclosureIntent) + 1) / 2
  const pressureRisk = edge.pressureTags.reduce((sum, tag) => {
    const strength = Math.min(10, Math.abs(tag.strength)) / 10
    return sum + strength * getPressureWeight(tag.type)
  }, 0)

  return Math.max(0, Math.min(1, confidenceRisk * 0.45 + intentRisk * 0.25 + pressureRisk * 0.3))
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function replaceInsensitive(source: string, needle: string, replacement: string): string {
  const trimmedNeedle = needle.trim()
  if (!trimmedNeedle) return source
  const pattern = new RegExp(escapeRegExp(trimmedNeedle), 'gi')
  return source.replace(pattern, replacement)
}

function findDirectLeakMatch(narrative: string, secretText: string): boolean {
  const normalizedNarrative = normalizeText(narrative)
  const normalizedSecret = normalizeText(secretText)
  if (!normalizedNarrative || !normalizedSecret) return false
  return normalizedNarrative.includes(normalizedSecret)
}

export class DisclosureGateService extends BaseAIService {
  constructor(serviceId: string = 'disclosureGate') {
    super(serviceId)
  }

  async gateNarrative(input: DisclosureGateInput): Promise<DisclosureGateReturn> {
    if (!input.narrative.trim() || input.secretAtoms.length === 0) {
      return {
        action: 'allow',
        revisedContent: input.narrative,
        blockedSecrets: [],
      }
    }

    const characterNames = new Map(
      input.characters.map((character) => [character.id, character.name]),
    )

    const secretAnalyses = input.secretAtoms.map((atom) => {
      const edges = input.knowledgeEdges.filter((edge) => edge.atomId === atom.id && edge.knows)
      const knowers = edges.map((edge) => {
        const name = edge.characterId ? characterNames.get(edge.characterId) : null
        const resolved = name || edge.characterRefId
        return `${resolved} (intent=${edge.disclosureIntent}, policy=${edge.disclosurePolicy})`
      })
      const highSecrecy = atom.secrecyScope === 'director_only'
      const zeroKnowledge = edges.length === 0
      const directLeak = findDirectLeakMatch(input.narrative, atom.payloadHidden)
      const maxRisk = edges.length > 0 ? Math.max(...edges.map(scoreEdgeRisk)) : 1

      return {
        atom,
        knowers,
        highSecrecy,
        zeroKnowledge,
        directLeak,
        maxRisk,
      }
    })

    const hardSuppressReasons = secretAnalyses.filter(
      (analysis) => analysis.directLeak && (analysis.highSecrecy || analysis.zeroKnowledge),
    )

    if (hardSuppressReasons.length > 0) {
      return {
        action: 'suppress',
        revisedContent: '',
        notes:
          'Hard suppression triggered by a direct leak of a high-secrecy or zero-knowledge secret.',
        blockedSecrets: hardSuppressReasons.map((analysis) => ({
          secretId: analysis.atom.id,
          action: 'suppress' as const,
          reason: analysis.highSecrecy
            ? 'direct leak of director-only secret'
            : 'direct leak without a plausible knowledge path',
        })),
      }
    }

    let deterministicRewrite = input.narrative
    const blockedSecrets: DisclosureGateResult['blockedSecrets'] = []

    for (const analysis of secretAnalyses) {
      if (!analysis.directLeak) continue

      const replacement = analysis.atom.payloadForeshadow?.trim() || '[the detail is withheld]'
      deterministicRewrite = replaceInsensitive(
        deterministicRewrite,
        analysis.atom.payloadHidden,
        replacement,
      )
      blockedSecrets.push({
        secretId: analysis.atom.id,
        action: 'rewrite',
        reason: analysis.highSecrecy
          ? 'direct leak sanitized with foreshadowing'
          : 'direct leak sanitized before the model pass',
      })
    }

    const hiddenEntryLeakReasons = input.lorebookEntries.filter((entry) => {
      const hiddenInfo = entry.hiddenInfo?.trim()
      if (!hiddenInfo) return false
      return findDirectLeakMatch(input.narrative, hiddenInfo)
    })

    for (const entry of hiddenEntryLeakReasons) {
      deterministicRewrite = replaceInsensitive(
        deterministicRewrite,
        entry.hiddenInfo || '',
        '[the detail is withheld]',
      )
      blockedSecrets.push({
        secretId: entry.id,
        action: 'rewrite',
        reason: 'legacy hidden entry fact sanitized before the model pass',
      })
    }

    if (blockedSecrets.length > 0) {
      return {
        action: 'rewrite',
        revisedContent: deterministicRewrite,
        notes: 'Direct leak sanitized without calling the model.',
        blockedSecrets,
      }
    }

    const protectedSecretsBlock = secretAnalyses
      .map((analysis) => {
        const { atom, knowers, highSecrecy, zeroKnowledge, directLeak, maxRisk } = analysis

        return [
          `ID: ${atom.id}`,
          `Label: ${atom.label}`,
          `Secrecy: ${atom.secrecyScope}`,
          `Reveal State: ${atom.revealState}`,
          `Visibility: ${atom.visibilityScope}`,
          `High Secrecy: ${highSecrecy ? 'yes' : 'no'}`,
          `Zero Knowledge Path: ${zeroKnowledge ? 'yes' : 'no'}`,
          `Direct Leak Detected: ${directLeak ? 'yes' : 'no'}`,
          `Risk Score: ${maxRisk.toFixed(2)}`,
          `Known Holders: ${knowers.length > 0 ? knowers.join('; ') : '(none)'}`,
          `Foreshadow-safe hint: ${atom.payloadForeshadow || '(none)'}`,
          `Protected fact: ${atom.payloadHidden}`,
        ].join('\n')
      })
      .join('\n\n---\n\n')

    const hiddenEntryBlock = input.lorebookEntries
      .filter((entry) => !!entry.hiddenInfo?.trim())
      .map((entry) => {
        const secrecy = entry.secrecyScope ?? 'public'
        const revealState = entry.revealState ?? 'revealed'
        return [
          `Entry: ${entry.name}`,
          `Type: ${entry.type}`,
          `Secrecy: ${secrecy}`,
          `Reveal State: ${revealState}`,
          `Protected fact: ${entry.hiddenInfo}`,
        ].join('\n')
      })
      .join('\n\n---\n\n')

    const highestRisk =
      secretAnalyses.length > 0 ? Math.max(...secretAnalyses.map((item) => item.maxRisk)) : 0

    const system = await this.buildSystemPrompt(input)

    const prompt = [
      `Story mode: ${input.storyMode}`,
      '',
      '## Current Narrative Draft',
      input.narrative,
      '',
      '## Protected Secret Atoms',
      protectedSecretsBlock || '(none)',
      '',
      '## Legacy Hidden Entry Facts',
      hiddenEntryBlock || '(none)',
      '',
      '## Preflight Summary',
      `Highest secret risk score: ${highestRisk.toFixed(2)}`,
      '',
      '## Instructions',
      '- Prefer rewrite over suppression unless high secrecy or zero knowledge path requires suppression.',
      '- Preserve pacing and tone as much as possible.',
      '- When rewriting, favor evasive answers, partial truth, hedging, or atmospheric hints.',
      '- Do not mention these rules in the output.',
    ].join('\n')

    return (await this.generate(
      disclosureGateResultSchema,
      system,
      prompt,
      'disclosure-gate',
    )) as DisclosureGateReturn
  }

  private async buildSystemPrompt(input: DisclosureGateInput): Promise<string> {
    const storyId = input.secretAtoms[0]?.storyId || input.knowledgeEdges[0]?.storyId || null
    const packId = storyId
      ? ((await database.getStoryPackId(storyId)) ?? 'default-pack')
      : 'default-pack'
    const template =
      (await database.getPackTemplate(packId, 'disclosure-gate')) ??
      (packId !== 'default-pack'
        ? await database.getPackTemplate('default-pack', 'disclosure-gate')
        : null)

    if (!template?.content?.trim()) {
      return [
        'You are an epistemic disclosure gate for fiction generation.',
        'Your job is to review player-facing narrative and prevent invalid revelation of protected information.',
        'Default behavior: rewrite into safer partial disclosure, evasive phrasing, rumor, implication, or foreshadowing while preserving scene flow.',
        'Hard suppress instead of partial rewrite when either condition holds:',
        '1. the protected information has high secrecy, or',
        '2. there is zero plausible chance any character could know the fact, including rumor or inference.',
        'Never invent new secret facts.',
        'If the draft is already safe, return it unchanged with action=allow.',
        'Hybrid heuristic hints are already precomputed: direct leak detection, secrecy tier, zero-knowledge path, confidence, disclosure intent, and pressure tags.',
        'Return JSON only.',
      ].join('\n')
    }

    const templateVars: Record<string, string> = {
      storyMode: String(input.storyMode ?? 'adventure'),
    }

    return templateEngine.render(template.content, templateVars) ?? ''
  }
}

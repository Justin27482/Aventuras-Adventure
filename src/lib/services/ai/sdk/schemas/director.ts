import { z } from 'zod'

export const directorSecretAtomDraftSchema = z.object({
  label: z.string().describe('Short label for the proposed secret atom'),
  payloadHidden: z.string().describe('The hidden fact that must remain protected'),
  payloadForeshadow: z.string().nullable().describe('Safe foreshadowing hint, if any'),
  secrecyScope: z.enum(['public', 'character_scoped', 'director_only']),
  visibilityScope: z.enum(['adventure', 'creative-writing', 'both']),
  revealState: z.enum(['hidden', 'foreshadowed', 'revealed']),
})

export const directorRevealPathSchema = z.object({
  summary: z.string().describe('Concise summary of the reveal pathway'),
  rationale: z.string().describe('Why this pathway is plausible or useful'),
  pressureNotes: z.array(z.string()).default([]).describe('Relevant pressure cues or context notes'),
})

export const directorProposalSchema = z.object({
  title: z.string().describe('Human-readable title for the proposal'),
  summary: z.string().describe('Short overview of the proposal intent'),
  outlineDraft: z.string().describe('Full draft outline or beat plan'),
  proposedSecretAtoms: z.array(directorSecretAtomDraftSchema).default([]),
  proposedRevealPaths: z.array(directorRevealPathSchema).default([]),
  approvalNotes: z.array(z.string()).default([]),
})

export type DirectorSecretAtomDraft = z.infer<typeof directorSecretAtomDraftSchema>
export type DirectorRevealPath = z.infer<typeof directorRevealPathSchema>
export type DirectorProposal = z.infer<typeof directorProposalSchema>
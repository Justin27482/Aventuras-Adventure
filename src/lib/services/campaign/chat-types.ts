/**
 * G.4-G.7.1: Chat Message Types and Infrastructure
 *
 * Unified message system for player chat pane, supporting:
 * - AI Proposals (pending GM review)
 * - Dice Rolls (inline resolution)
 * - Table Talk (OOC banter with intensity control)
 * - Narration (GM description)
 * - System Messages (game events)
 * - Consent Requests (for narrative actions)
 */

import type { RollLedgerEntry, AIPlayerProposal } from '$lib/types'

/**
 * Base chat message properties
 */
export interface ChatMessageBase {
  id: string
  campaignId: string
  sessionId: string | null
  timestamp: number
  audience: 'full_table' | 'private_subset' | 'private_player'
  visibility: 'player_safe' | 'director_only'
}

/**
 * AI Player Proposal
 * When an AI player generates an action/dialogue for GM approval
 */
export interface ChatProposal extends ChatMessageBase {
  type: 'proposal'
  actorId: string
  actorName: string
  proposal: AIPlayerProposal
  confidence: number // 1-10
  reasoning: string
  reviewStatus: 'pending' | 'approved' | 'declined' | 'edited'
  gmReviewNotes?: string
}

/**
 * Dice Roll Result
 * When a roll is executed and resolved
 */
export interface ChatRoll extends ChatMessageBase {
  type: 'roll'
  actorId: string
  actorName: string
  rollEntry: RollLedgerEntry
  displayLabel: string // e.g., "Persuasion Check", "Initiative"
  formattedResult: string // e.g., "18 + 2 = 20"
  outcome: 'success' | 'failure' | 'critical_success' | 'critical_failure' | null
  narrativeContext?: string // Why this roll was made
}

/**
 * Table Talk (OOC)
 * Out-of-character banter from any player/AI at the table
 * G.7.1: Intensity-based OOC reactions
 */
export interface ChatTableTalk extends ChatMessageBase {
  type: 'table_talk'
  actorId?: string | null
  actorName: string
  content: string
  intensity: number // 0-8 based on campaign table_talk_intensity
  sentiment: 'positive' | 'neutral' | 'negative' | 'humorous'
  emoji?: string // Optional emoji for mood
}

/**
 * GM Narration
 * Prose from the GM describing scene, NPCs, consequences
 */
export interface ChatNarration extends ChatMessageBase {
  type: 'narration'
  actorId: null // Always from GM
  actorName: 'GM'
  content: string
  narrativeWeight: 'light' | 'normal' | 'heavy' // Importance for story extraction
  canPromoteToLog: boolean // Can be exported to story log
}

/**
 * Consent Request
 * When GM requests consent for a narrative action (e.g., player romance progression)
 */
export interface ChatConsentRequest extends ChatMessageBase {
  type: 'consent_request'
  actorId: string
  actorName: string
  targetActorId: string
  targetActorName: string
  proposedAction: string
  stakes: 'low' | 'medium' | 'high' // Risk gating
  responses: Record<string, 'pending' | 'approved' | 'declined' | 'modified'>
  expiresAt: number
}

/**
 * System Message
 * Game events, turn notifications, rule clarifications
 */
export interface ChatSystemMessage extends ChatMessageBase {
  type: 'system'
  actorId: null
  actorName: 'SYSTEM'
  content: string
  severity: 'info' | 'warning' | 'error'
  icon?: string // 🎲 📖 ⚠️ etc.
}

/**
 * Union type for all chat messages
 */
export type ChatMessage =
  | ChatProposal
  | ChatRoll
  | ChatTableTalk
  | ChatNarration
  | ChatConsentRequest
  | ChatSystemMessage

/**
 * Chat store state
 */
export interface ChatState {
  campaignId: string
  sessionId: string | null
  messages: ChatMessage[]
  isLoading: boolean
  error: string | null
  unreadCount: number
  lastMessageTimestamp: number | null
}

/**
 * Input for creating messages
 */
export interface SendProposalInput {
  proposalId: string
  aiPlayerId: string
  characterId: string
  audience: 'full_table' | 'private_subset' | 'private_player'
}

export interface SendRollInput {
  rollEntryId: string
  displayLabel: string
  narrativeContext?: string
}

export interface SendTableTalkInput {
  actorId?: string | null
  actorName: string
  content: string
  sentiment: 'positive' | 'neutral' | 'negative' | 'humorous'
  emoji?: string
}

export interface SendNarrationInput {
  content: string
  narrativeWeight?: 'light' | 'normal' | 'heavy'
  canPromoteToLog?: boolean
}

export interface SendConsentRequestInput {
  actorId: string
  actorName: string
  targetActorId: string
  targetActorName: string
  proposedAction: string
  stakes: 'low' | 'medium' | 'high'
}

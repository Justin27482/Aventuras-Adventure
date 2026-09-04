import type { AIPlayerProposal } from '$lib/types'

export interface ConsensusMessage {
  id: string
  aiPlayerId: string
  content: string
  createdAt: number
}

export interface ConsensusConfig {
  maxExchanges?: number
  messageDelayMs?: number
  timeoutMs?: number
}

export interface ConsensusResult {
  proposals: AIPlayerProposal[]
  messages: ConsensusMessage[]
  timedOut: boolean
  interrupted: boolean
}

export interface ConsensusTypingState {
  aiPlayerId: string
  delayMs: number
}

export interface ConsensusInput {
  proposals: AIPlayerProposal[]
  generateMessage: (proposal: AIPlayerProposal, proposals: AIPlayerProposal[]) => Promise<string | null>
  signal?: AbortSignal
  config?: ConsensusConfig
  onMessage?: (message: ConsensusMessage) => void
  onTyping?: (state: ConsensusTypingState) => void
}

const DEFAULT_CONFIG: Required<ConsensusConfig> = {
  maxExchanges: 3,
  messageDelayMs: 1000,
  timeoutMs: 30_000,
}

export class AIPlayerConsensusService {
  async run(input: ConsensusInput): Promise<ConsensusResult> {
    const config = { ...DEFAULT_CONFIG, ...input.config }
    const messages: ConsensusMessage[] = []
    const startedAt = Date.now()
    let timedOut = false
    let interrupted = false

    for (let exchange = 0; exchange < config.maxExchanges; exchange++) {
      if (input.signal?.aborted) {
        interrupted = true
        break
      }
      if (Date.now() - startedAt >= config.timeoutMs) {
        timedOut = true
        break
      }

      for (const proposal of input.proposals) {
        if (input.signal?.aborted) {
          interrupted = true
          break
        }
        if (Date.now() - startedAt >= config.timeoutMs) {
          timedOut = true
          break
        }
        if (messages.length > 0) await this.delay(config.messageDelayMs)
        input.onTyping?.({ aiPlayerId: proposal.aiPlayerId, delayMs: config.messageDelayMs })
        const content = await input.generateMessage(proposal, input.proposals)
        if (!content?.trim()) continue
        const message: ConsensusMessage = {
          id: crypto.randomUUID(),
          aiPlayerId: proposal.aiPlayerId,
          content: content.trim(),
          createdAt: Date.now(),
        }
        messages.push(message)
        input.onMessage?.(message)
      }
      if (timedOut || interrupted) break
    }

    return { proposals: input.proposals, messages, timedOut, interrupted }
  }

  private async delay(milliseconds: number): Promise<void> {
    if (milliseconds <= 0) return
    await new Promise((resolve) => setTimeout(resolve, milliseconds))
  }
}

export const aiPlayerConsensusService = new AIPlayerConsensusService()

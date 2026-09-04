<script lang="ts">
  import { campaign } from '$lib/stores/campaign.svelte'
  import { story } from '$lib/stores/story.svelte'
  import { ui } from '$lib/stores/ui.svelte'
  import { database } from '$lib/services/database'
  import { aiPlayerProposalService } from '$lib/services/ai-player/proposal-service'
  import { aiPlayerConsensusService, type ConsensusMessage } from '$lib/services/ai-player/consensus-service'
  import {
    emitAIPlayerProposalAccepted,
    emitAIPlayerProposalConsensusEnded,
    emitAIPlayerProposalConsensusStarted,
    emitAIPlayerProposalProposed,
  } from '$lib/services/ai-player/proposal-lifecycle-events'
  import { generatePlainText } from '$lib/services/ai/sdk'
  import { ContextBuilder } from '$lib/services/context/context-builder'
  import type { AIPlayer, AIPlayerInteraction, AIPlayerProposal, InteractionAudience, PlayerCharacter } from '$lib/types'
  import { Bot, Check, Edit3, Loader2, MessageSquare, RefreshCw, X } from 'lucide-svelte'
  import { Button } from '$lib/components/ui/button'
  import { Textarea } from '$lib/components/ui/textarea'
  import { Badge } from '$lib/components/ui/badge'
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card'

  type ReviewState = 'pending' | 'accepted' | 'declined'
  type ReviewProposal = AIPlayerProposal & { playerName: string; characterName: string; review: ReviewState }

  let players = $state<AIPlayer[]>([])
  let assignments = $state<PlayerCharacter[]>([])
  let proposals = $state<ReviewProposal[]>([])
  let loading = $state(false)
  let loadingProfiles = $state(false)
  let error = $state<string | null>(null)
  let editingId = $state<string | null>(null)
  let editedActions = $state<Record<string, string>>({})
  let audienceKind = $state<InteractionAudience['kind']>('full_table')
  let selectedAudienceIds = $state<string[]>([])
  let consensusMessages = $state<ConsensusMessage[]>([])
  let consensusRunning = $state(false)
  let consensusController = $state<AbortController | null>(null)
  let typingPlayers = $state<Record<string, boolean>>({})
  let sendingId = $state<string | null>(null)
  let sentIds = $state<Set<string>>(new Set())

  const hasAssignments = $derived(assignments.length > 0)
  const pendingCount = $derived(proposals.filter((proposal) => proposal.review === 'pending').length)
  const sceneMode = $derived(campaign.sceneTurnState?.sceneMode ?? campaign.settings?.sceneMode ?? 'free')
  const sceneSummary = $derived(story.entries.at(-1)?.content ?? '')
  const audiencePlayerIds = $derived(
    audienceKind === 'full_table'
      ? assignments.map((assignment) => assignment.aiPlayerId)
      : audienceKind === 'private_player'
        ? selectedAudienceIds.slice(0, 1)
        : selectedAudienceIds,
  )
  const audienceProposals = $derived(
    proposals.filter((proposal) => audiencePlayerIds.includes(proposal.aiPlayerId)),
  )

  $effect(() => {
    const campaignId = campaign.current?.id
    if (!campaignId) return
    loadingProfiles = true
    Promise.all([database.listAIPlayers(), database.getPlayerCharactersForCampaign(campaignId)])
      .then(([nextPlayers, nextAssignments]) => {
        players = nextPlayers
        assignments = nextAssignments.filter((assignment) => assignment.leftAt === null)
        selectedAudienceIds = assignments.map((assignment) => assignment.aiPlayerId)
        return database.getAIPlayerProposals(campaignId, campaign.activeSession?.id).catch((cause) => {
          console.warn('[AIPlayerProposalPanel] Proposal table unavailable; assignments will still load', cause)
          return []
        })
      })
      .then(async (savedProposals) => {
        proposals = savedProposals.map((proposal) => ({
          ...proposal,
          playerName: playerName(proposal.aiPlayerId),
          characterName: characterName(proposal.characterId),
          review: proposal.reviewStatus,
        }))
        editedActions = Object.fromEntries(savedProposals.map((proposal) => [proposal.id, proposal.action]))
        const interactions = await database
          .getAIPlayerInteractions(campaignId, campaign.activeSession?.id)
          .catch((cause) => {
            console.warn('[AIPlayerProposalPanel] Interaction table unavailable', cause)
            return []
          })
        const latest = interactions.at(-1)
        consensusMessages = (latest?.transcript ?? [])
          .map((message) =>
            typeof message.id === 'string' &&
            typeof message.aiPlayerId === 'string' &&
            typeof message.content === 'string' &&
            typeof message.createdAt === 'number'
              ? {
                  id: message.id,
                  aiPlayerId: message.aiPlayerId,
                  content: message.content,
                  createdAt: message.createdAt,
                }
              : null,
          )
          .filter((message): message is ConsensusMessage => message !== null)
      })
      .catch((cause) => {
        error = cause instanceof Error ? cause.message : 'Failed to load AI Player assignments'
      })
      .finally(() => {
        loadingProfiles = false
      })
  })

  function playerName(id: string): string {
    return players.find((player) => player.id === id)?.name ?? 'AI Player'
  }

  function characterName(id: string): string {
    return story.characters.find((character) => character.id === id)?.name ?? 'Character'
  }

  function setAudienceKind(kind: InteractionAudience['kind']) {
    audienceKind = kind
    if (kind === 'full_table') {
      selectedAudienceIds = assignments.map((assignment) => assignment.aiPlayerId)
    }
  }

  function setAudiencePlayer(id: string, selected: boolean) {
    selectedAudienceIds = selected
      ? [...new Set([...selectedAudienceIds, id])]
      : selectedAudienceIds.filter((candidate) => candidate !== id)
  }

  async function generateProposals() {
    if (!campaign.current || !story.currentStory || loading || audiencePlayerIds.length === 0) return
    loading = true
    error = null
    try {
      const generated = await aiPlayerProposalService.generateProposals(
        assignments.filter((assignment) => audiencePlayerIds.includes(assignment.aiPlayerId)).map((assignment) => ({
          storyId: story.currentStory!.id,
          campaignId: campaign.current!.id,
          aiPlayerId: assignment.aiPlayerId,
          characterId: assignment.characterId,
          sceneMode,
          sceneSummary,
          recentActions: story.entries.slice(-5).map((entry) => entry.content),
        })),
      )
      await Promise.all(generated.map((proposal) => database.upsertAIPlayerProposal(proposal, campaign.activeSession?.id)))
      for (const proposal of generated) {
        emitAIPlayerProposalProposed({
          proposalId: proposal.id,
          aiPlayerId: proposal.aiPlayerId,
          campaignId: proposal.campaignId,
          characterId: proposal.characterId,
          sceneMode: proposal.sceneMode,
          action: proposal.action,
        })
      }
      proposals = generated.map((proposal) => ({
        ...proposal,
        playerName: playerName(proposal.aiPlayerId),
        characterName: characterName(proposal.characterId),
        review: 'pending',
      }))
      editedActions = Object.fromEntries(generated.map((proposal) => [proposal.id, proposal.action]))
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Failed to generate AI Player proposals'
    } finally {
      loading = false
    }
  }

  async function runConsensus() {
    if (consensusRunning || audienceProposals.length === 0 || !campaign.current) return
    consensusRunning = true
    consensusMessages = []
    error = null
    const controller = new AbortController()
    consensusController = controller
    const audience: InteractionAudience =
      audienceKind === 'full_table'
        ? { kind: 'full_table' }
        : audienceKind === 'private_player'
          ? { kind: 'private_player', aiPlayerId: audiencePlayerIds[0] }
          : { kind: 'player_subset', aiPlayerIds: audiencePlayerIds }
    const interaction: AIPlayerInteraction = {
      id: crypto.randomUUID(),
      campaignId: campaign.current.id,
      sessionId: campaign.activeSession?.id ?? null,
      audience,
      transcript: [],
      disclosedToAudience: audienceKind === 'full_table',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    try {
      emitAIPlayerProposalConsensusStarted({
        campaignId: campaign.current.id,
        sessionId: campaign.activeSession?.id ?? null,
        audienceKind: audienceKind,
        proposalIds: audienceProposals.map((proposal) => proposal.id),
      })
      await database.upsertAIPlayerInteraction(interaction)
      await aiPlayerConsensusService.run({
        proposals: audienceProposals,
        signal: controller.signal,
        onTyping: ({ aiPlayerId }) => {
          typingPlayers = { ...typingPlayers, [aiPlayerId]: true }
        },
        onMessage: (message) => {
          typingPlayers = { ...typingPlayers, [message.aiPlayerId]: false }
          consensusMessages = [...consensusMessages, message]
          interaction.transcript = [...interaction.transcript, { ...message }]
          interaction.updatedAt = Date.now()
          void database.upsertAIPlayerInteraction(interaction)
        },
        generateMessage: async (proposal, allProposals) => {
          if (!story.currentStory) return null
          const context = await ContextBuilder.forAIPlayer(
            story.currentStory.id,
            proposal.aiPlayerId,
            undefined,
            audience,
          )
          context.add({
            consensusCurrentAction: proposal.action,
            consensusOtherProposals: allProposals
              .filter((item) => item.id !== proposal.id)
              .map((item) => `- ${item.action}`)
              .join('\n') || '- None',
          })
          const prompt = await context.render('ai-player-consensus')
          if (!prompt.system.trim() || !prompt.user.trim()) {
            throw new Error('Prompt pack is missing required AI Player consensus content')
          }
          return generatePlainText(
            {
              presetId: 'agentic',
              system: prompt.system,
              prompt: prompt.user,
              signal: controller.signal,
            },
            'aiPlayerConsensus',
          )
        },
      })
    } catch (cause) {
      if (!controller.signal.aborted) error = cause instanceof Error ? cause.message : 'Consensus failed'
    } finally {
      emitAIPlayerProposalConsensusEnded({
        campaignId: campaign.current?.id ?? '',
        sessionId: campaign.activeSession?.id ?? null,
        audienceKind: audienceKind,
        proposalIds: audienceProposals.map((proposal) => proposal.id),
        interrupted: controller.signal.aborted,
        timedOut: false,
      })
      consensusController = null
      consensusRunning = false
    }
  }

  function stopConsensus() {
    consensusController?.abort()
  }

  // Explicit GM action: accepting a proposal never auto-narrates it.
  async function sendToNarrative(proposal: ReviewProposal) {
    if (sendingId || sentIds.has(proposal.id)) return
    sendingId = proposal.id
    error = null
    try {
      await story.addEntry('user_action', `${proposal.characterName}: ${proposal.action}`, {
        source: 'ai-player',
      })
      sentIds = new Set([...sentIds, proposal.id])
      ui.showToast(`${proposal.characterName}'s action was added to the narrative`, 'info')
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Failed to add proposal to the narrative'
    } finally {
      sendingId = null
    }
  }

  function setReview(id: string, review: ReviewState) {
    proposals = proposals.map((proposal) => (proposal.id === id ? { ...proposal, review, reviewStatus: review, updatedAt: Date.now() } : proposal))
    void database.updateAIPlayerProposalReview(id, review)
    if (review === 'accepted') {
      const target = proposals.find((proposal) => proposal.id === id)
      if (target) {
        emitAIPlayerProposalAccepted({
          proposalId: target.id,
          campaignId: campaign.current?.id ?? '',
          sessionId: campaign.activeSession?.id ?? null,
          aiPlayerId: target.aiPlayerId,
          characterId: target.characterId,
          action: target.action,
        })
      }
    }
    editingId = null
  }

  function beginEdit(proposal: ReviewProposal) {
    editingId = proposal.id
    editedActions = { ...editedActions, [proposal.id]: proposal.action }
  }

  function saveEdit(proposal: ReviewProposal) {
    const action = editedActions[proposal.id]?.trim()
    if (!action) return
    proposals = proposals.map((candidate) =>
      candidate.id === proposal.id ? { ...candidate, action, review: 'pending', reviewStatus: 'pending', updatedAt: Date.now() } : candidate,
    )
    void database.updateAIPlayerProposalReview(proposal.id, 'pending', action)
    editingId = null
  }
</script>

<Card>
  <CardHeader>
    <CardTitle class="flex items-center gap-2 text-base">
      <Bot class="text-primary h-4 w-4" /> AI Player Proposals
      {#if proposals.length > 0}<Badge variant="secondary">{pendingCount} pending</Badge>{/if}
    </CardTitle>
  </CardHeader>
  <CardContent class="space-y-3">
    <div class="space-y-2 rounded-md border p-3">
      <label class="text-muted-foreground text-xs font-medium" for="proposal-audience">Interaction audience</label>
      <select id="proposal-audience" class="bg-background border-input h-9 w-full rounded-md border px-2 text-sm" value={audienceKind} onchange={(event) => setAudienceKind(event.currentTarget.value as InteractionAudience['kind'])}>
        <option value="full_table">Full table</option>
        <option value="player_subset">Selected AI Players</option>
        <option value="private_player">Private 1:1</option>
      </select>
      {#if audienceKind !== 'full_table'}
        <div class="grid gap-2 sm:grid-cols-2">
          {#each assignments as assignment (assignment.aiPlayerId)}
            <label class="text-muted-foreground flex items-center gap-2 text-xs">
              <input type={audienceKind === 'private_player' ? 'radio' : 'checkbox'} name="proposal-audience-player" checked={selectedAudienceIds.includes(assignment.aiPlayerId)} onchange={(event) => setAudiencePlayer(assignment.aiPlayerId, event.currentTarget.checked)} />
              {playerName(assignment.aiPlayerId)} ({characterName(assignment.characterId)})
            </label>
          {/each}
        </div>
      {/if}
    </div>
    <div class="flex items-center justify-between gap-3">
      <p class="text-muted-foreground text-xs">
        Generate independent character actions for the current scene. Nothing is narrated or applied until you review it.
      </p>
      <Button size="sm" class="shrink-0 gap-2" onclick={generateProposals} disabled={loading || loadingProfiles || !hasAssignments}>
        {#if loading}<Loader2 class="h-4 w-4 animate-spin" />{:else}<RefreshCw class="h-4 w-4" />{/if}
        {loading ? 'Generating...' : 'Generate Proposals'}
      </Button>
      {#if proposals.length > 0}
        {#if consensusRunning}
          <Button size="sm" variant="outline" class="border-destructive text-destructive hover:bg-destructive/10" onclick={stopConsensus}>
            <Loader2 class="h-4 w-4 animate-spin" /> Stop Consensus
          </Button>
        {:else}
          <Button size="sm" variant="outline" onclick={runConsensus} disabled={audienceProposals.length === 0}><MessageSquare class="h-4 w-4" /> Run Consensus</Button>
        {/if}
      {/if}
    </div>

    {#if !loadingProfiles && !hasAssignments}
      <div class="text-muted-foreground rounded-md border border-dashed p-4 text-center text-xs">
        No active AI Player assignments are configured for this campaign.
      </div>
    {/if}
    {#if error}<p class="text-destructive rounded-md border border-destructive/30 p-2 text-xs">{error}</p>{/if}

    {#if consensusMessages.length > 0 || Object.values(typingPlayers).some(Boolean)}
      <div class="space-y-2 rounded-md border p-3">
        <p class="text-muted-foreground text-xs font-medium">Consensus transcript</p>
        {#each Object.entries(typingPlayers) as [aiPlayerId, isTyping] (aiPlayerId)}
          {#if isTyping}
            <div class="bg-muted/30 rounded p-2 text-xs text-muted-foreground">
              <span class="font-medium text-foreground">{playerName(aiPlayerId)}:</span> typing…
            </div>
          {/if}
        {/each}
        {#each consensusMessages as message (message.id)}
          <div class="bg-muted/30 rounded p-2 text-xs"><span class="font-medium">{playerName(message.aiPlayerId)}:</span> {message.content}</div>
        {/each}
      </div>
    {/if}

    {#if proposals.length > 0}
      <div class="max-h-[32rem] space-y-2 overflow-y-auto">
        {#each proposals as proposal (proposal.id)}
          <div class="border-border rounded-md border p-3">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="text-sm font-medium">{proposal.characterName}</p>
                <p class="text-muted-foreground text-xs">{proposal.playerName} · {proposal.sceneMode}</p>
              </div>
              <Badge variant={proposal.review === 'pending' ? 'outline' : proposal.review === 'accepted' ? 'secondary' : 'destructive'}>
                {proposal.review}
              </Badge>
            </div>
            {#if editingId === proposal.id}
              <Textarea
                class="mt-2 min-h-20 text-sm"
                value={editedActions[proposal.id] ?? proposal.action}
                oninput={(event) => (editedActions = { ...editedActions, [proposal.id]: event.currentTarget.value })}
              />
              <div class="mt-2 flex gap-2">
                <Button size="sm" onclick={() => saveEdit(proposal)}><Check class="h-3.5 w-3.5" /> Save Edit</Button>
                <Button size="sm" variant="outline" onclick={() => (editingId = null)}><X class="h-3.5 w-3.5" /> Cancel</Button>
              </div>
            {:else}
              <p class="mt-2 text-sm leading-relaxed">{proposal.action}</p>
              <p class="text-muted-foreground mt-2 flex items-center gap-1 text-xs"><MessageSquare class="h-3.5 w-3.5" /> {proposal.reasoning}</p>
              <p class="text-muted-foreground mt-1 text-xs">Confidence: {proposal.confidence}/10</p>
              <div class="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onclick={() => setReview(proposal.id, 'accepted')} disabled={proposal.review === 'accepted'}><Check class="h-3.5 w-3.5" /> Accept</Button>
                <Button size="sm" variant="outline" onclick={() => beginEdit(proposal)}><Edit3 class="h-3.5 w-3.5" /> Edit</Button>
                <Button size="sm" variant="outline" class="border-destructive text-destructive hover:bg-destructive/10" onclick={() => setReview(proposal.id, 'declined')} disabled={proposal.review === 'declined'}><X class="h-3.5 w-3.5" /> Decline</Button>
                {#if proposal.review === 'accepted'}
                  <Button size="sm" variant="secondary" onclick={() => sendToNarrative(proposal)} disabled={sendingId === proposal.id || sentIds.has(proposal.id)}>
                    {#if sendingId === proposal.id}<Loader2 class="h-3.5 w-3.5 animate-spin" />{/if}
                    {sentIds.has(proposal.id) ? 'Added to Narrative' : 'Send to Narrative'}
                  </Button>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </CardContent>
</Card>

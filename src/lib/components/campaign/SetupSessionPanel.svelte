<script lang="ts">
  import { campaign } from '$lib/stores/campaign.svelte'
  import { story } from '$lib/stores/story.svelte'
  import { database } from '$lib/services/database'
  import { setupSessions } from '$lib/stores/setup-session.svelte'
  import type {
    AIPlayer,
    CampaignAIPlayer,
    CampaignSetupSession,
    CampaignSetupSessionKind,
    Character,
    CharacterSheetDraft,
    CharacterSheetProposal,
    CharacterSheetRevision,
    FullRuleset,
  } from '$lib/types'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import * as Select from '$lib/components/ui/select'
  import { History, Loader2, Plus, Square, UsersRound } from 'lucide-svelte'
  import { rulesetService } from '$lib/services/ruleset/ruleset-service'
  import { characterSheetProposalService } from '$lib/services/ai-player/character-sheet-proposal-service'
  import { characterSheetEditorService } from '$lib/services/mechanics/character-sheet-editor'
  import FullCharacterSheetEditor from './modals/FullCharacterSheetEditor.svelte'
  import { copyCharacterSheetDraft } from '$lib/services/mechanics/character-sheet-draft'
  import { storePrivatePrologueMemory } from '$lib/services/campaign/private-prologue-memory'
  import type { ChatMessage } from '$lib/services/campaign/chat-types'

  interface Props {
    onSessionChanged?: (state: {
      session: CampaignSetupSession | null
      participantIds: string[]
      messages: ChatMessage[]
      hasSessions: boolean
    }) => void
  }

  let { onSessionChanged }: Props = $props()

  let roster = $state<CampaignAIPlayer[]>([])
  let players = $state<AIPlayer[]>([])
  let creating = $state(false)
  let title = $state('')
  let kind = $state<CampaignSetupSessionKind>('private_character_creation')
  let participantIds = $state<string[]>([])
  let busy = $state(false)
  let isGeneratingCharacter = $state(false)
  let isGeneratingMemory = $state(false)
  let loadedCampaignId = $state<string | null>(null)
  let loadedFormationVersion = $state<number | null>(null)
  let fullRuleset = $state<FullRuleset | null>(null)
  let proposals = $state<CharacterSheetProposal[]>([])
  let editorOpen = $state(false)
  let editorDraft = $state<CharacterSheetDraft | null>(null)
  let editorProposal = $state<CharacterSheetProposal | null>(null)
  let editorCharacter = $state<Character | null>(null)
  let assignedCharacterId = $state<string | null>(null)
  let revisions = $state<CharacterSheetRevision[]>([])
  let relationshipNotes = $state('')
  let secretText = $state('')
  let secretTargetId = $state('')
  let secretShared = $state(false)
  let setupRecap = $state('')
  let actionError = $state<string | null>(null)

  function notifyParent() {
    onSessionChanged?.({
      session: setupSessions.selected,
      participantIds: setupSessions.participants.map((participant) => participant.aiPlayerId),
      messages: setupSessions.messages,
      hasSessions: setupSessions.sessions.length > 0,
    })
  }

  const activePlayers = $derived(
    roster
      .filter((member) => member.leftAt === null)
      .map((member) => players.find((player) => player.id === member.aiPlayerId))
      .filter((player): player is AIPlayer => Boolean(player)),
  )
  const isPrivate = $derived(kind === 'private_character_creation' || kind === 'private_prologue')

  $effect(() => {
    const campaignId = campaign.current?.id
    const formationVersion = campaign.formationState?.updatedAt ?? null
    if (
      !campaignId ||
      (loadedCampaignId === campaignId && loadedFormationVersion === formationVersion)
    ) return
    loadedCampaignId = campaignId
    loadedFormationVersion = formationVersion
    void load(campaignId)
  })

  $effect(() => {
    const selectedId = setupSessions.selected?.id
    if (!selectedId || !campaign.current?.rulesetId) return
    void loadCharacterTools(selectedId, campaign.current.rulesetId)
  })

  async function load(campaignId: string) {
    busy = true
    try {
      ;[roster, players] = await Promise.all([
        database.getCampaignAIPlayers(campaignId),
        database.listAIPlayers(),
      ])
      if (
        !campaign.formationState &&
        campaign.current?.campaignType === 'human_gm_ai_players' &&
        story.characters.length === 0 &&
        roster.some((member) => member.leftAt === null)
      ) {
        const now = Date.now()
        await database.upsertCampaignFormationState({
          campaignId,
          status: 'party_pending',
          requiredAIPlayerIds: roster
            .filter((member) => member.leftAt === null)
            .map((member) => member.aiPlayerId),
          source: 'created_pending',
          createdAt: now,
          updatedAt: now,
        })
        campaign.formationState = await database.getCampaignFormationState(campaignId)
      }
      await setupSessions.load(campaignId)
      if (campaign.settings) await setupSessions.importLegacySessionZero(campaign.settings)
      notifyParent()
    } finally {
      busy = false
    }
  }

  async function openCreator() {
    if (!campaign.current || busy) return
    busy = true
    try {
      ;[roster, players] = await Promise.all([
        database.getCampaignAIPlayers(campaign.current.id),
        database.listAIPlayers(),
      ])
      creating = true
    } finally {
      busy = false
    }
  }

  async function loadCharacterTools(setupSessionId: string, rulesetId: string) {
    const [loadedRuleset, loadedProposals, assignments] = await Promise.all([
      rulesetService.getFullRuleset(rulesetId),
      campaign.current
        ? database.getCharacterSheetProposals(campaign.current.id, setupSessionId)
        : Promise.resolve([]),
      campaign.current
        ? database.getPlayerCharactersForCampaign(campaign.current.id)
        : Promise.resolve([]),
    ])
    fullRuleset = loadedRuleset
    proposals = loadedProposals
    const aiPlayerId = setupSessions.participants[0]?.aiPlayerId
    assignedCharacterId =
      assignments.find((item) => item.aiPlayerId === aiPlayerId && item.leftAt === null)
        ?.characterId ?? null
  }

  function buildCharacterGuidance(): string {
    const relevant = setupSessions.messages.filter(
      (message): message is Extract<ChatMessage, { type: 'narration' | 'table_talk' }> =>
        message.type === 'narration' || message.type === 'table_talk',
    )
    if (relevant.length === 0) return ''
    return relevant
      .map((message) => `${message.actorName}: ${message.content}`)
      .join('\n')
  }

  async function generateCharacterProposal() {
    const session = setupSessions.selected
    const aiPlayerId = setupSessions.participants[0]?.aiPlayerId
    if (!session || !aiPlayerId || !campaign.current?.storyId || !fullRuleset || isGeneratingCharacter) return
    isGeneratingCharacter = true
    try {
      const proposal = await characterSheetProposalService.generate({
        storyId: campaign.current.storyId,
        campaignId: campaign.current.id,
        setupSessionId: session.id,
        aiPlayerId,
        ruleset: fullRuleset,
        guidance: buildCharacterGuidance(),
      })
      proposals = [proposal, ...proposals]
      openProposal(proposal)
    } finally {
      isGeneratingCharacter = false
    }
  }

  function openProposal(proposal: CharacterSheetProposal) {
    editorProposal = proposal
    editorCharacter = null
    editorDraft = copyCharacterSheetDraft(proposal.payload)
    revisions = []
    editorOpen = true
  }

  async function openAssignedCharacter() {
    if (!assignedCharacterId || !campaign.current?.storyId || !fullRuleset || busy) return
    busy = true
    actionError = null
    try {
      const characters = await database.getCharacters(campaign.current.storyId)
      const character = characters.find((item) => item.id === assignedCharacterId)
      if (!character) throw new Error('The assigned character could not be loaded')
      const sheet = await database.getCharacterSheet(character.id)
      if (!sheet) throw new Error('The assigned character does not have a saved sheet')
      editorCharacter = character
      editorProposal = null
      editorDraft = copyCharacterSheetDraft({
        name: character.name,
        description: character.description ?? '',
        traits: character.traits,
        visualDescriptors: character.visualDescriptors,
        sheet: {
          rulesetId: sheet.rulesetId,
          statValues: sheet.statValues,
          resourceValues: sheet.resourceValues,
          conditionStates: sheet.conditionStates,
          level: sheet.level,
          xp: sheet.xp,
        },
      })
      revisions = await database.getCharacterSheetRevisions(character.id)
      editorOpen = true
    } catch (error) {
      actionError = error instanceof Error ? error.message : 'Unable to open assigned character sheet'
    } finally {
      busy = false
    }
  }

  async function saveEditor(draft: CharacterSheetDraft) {
    if (!fullRuleset || !campaign.current?.storyId) return
    busy = true
    try {
      if (editorProposal) {
        const approved = await characterSheetEditorService.approveProposal({
          proposal: editorProposal,
          editedDraft: draft,
          storyId: campaign.current.storyId,
          ruleset: fullRuleset,
        })
        assignedCharacterId = approved.characterId
        proposals = proposals.map((item) =>
          item.id === editorProposal?.id ? { ...item, status: 'approved' } : item,
        )
        campaign.formationState = await database.reconcileCampaignFormationReadiness(
          campaign.current.id,
        )
      } else if (editorCharacter) {
        const currentSheet = await database.getCharacterSheet(editorCharacter.id)
        if (!currentSheet) throw new Error('Character sheet not found')
        const now = Date.now()
        await characterSheetEditorService.saveGMEdit({
          character: {
            ...editorCharacter,
            name: draft.name,
            description: draft.description,
            traits: draft.traits,
            visualDescriptors: draft.visualDescriptors,
          },
          sheet: {
            characterId: editorCharacter.id,
            ...draft.sheet,
            createdAt: currentSheet.createdAt,
            updatedAt: now,
          },
          ruleset: fullRuleset,
          parentRevisionId: revisions.at(-1)?.id ?? null,
          source: 'gm-full-sheet-editor',
        })
      }
      await story.loadStory(campaign.current.storyId)
      await campaign.loadForStory(campaign.current.storyId)
      if (
        campaign.formationState?.status === 'ready' &&
        !campaign.current?.spotlightCharacterId &&
        campaign.activeParty[0]
      ) {
        await campaign.setSpotlightCharacter(campaign.activeParty[0].characterId)
      }
      editorOpen = false
    } finally {
      busy = false
    }
  }

  async function declineProposal(proposal: CharacterSheetProposal) {
    await characterSheetEditorService.declineProposal(proposal)
    proposals = proposals.map((item) =>
      item.id === proposal.id ? { ...item, status: 'declined' } : item,
    )
  }

  async function restoreRevision(revision: CharacterSheetRevision) {
    if (!editorCharacter || !fullRuleset) return
    await characterSheetEditorService.saveGMEdit({
      character: editorCharacter,
      sheet: { ...revision.snapshot, updatedAt: Date.now() },
      ruleset: fullRuleset,
      parentRevisionId: revisions.at(-1)?.id ?? null,
      source: `restore:${revision.id}`,
    })
    revisions = await database.getCharacterSheetRevisions(editorCharacter.id)
  }

  function toggleParticipant(aiPlayerId: string, included: boolean) {
    if (isPrivate) {
      participantIds = included ? [aiPlayerId] : []
      return
    }
    participantIds = included
      ? [...new Set([...participantIds, aiPlayerId])]
      : participantIds.filter((id) => id !== aiPlayerId)
  }

  async function createAndStart() {
    if (!campaign.current || participantIds.length === 0 || busy) return
    busy = true
    try {
      if (kind === 'private_prologue') {
        const assignments = await database.getPlayerCharactersForCampaign(campaign.current.id)
        const assignment = assignments.find(
          (item) => item.aiPlayerId === participantIds[0] && item.leftAt === null,
        )
        if (!assignment || !(await database.getCharacterSheet(assignment.characterId))) {
          throw new Error('Approve this AI Player’s character before starting a private prologue')
        }
      }
      const audience = isPrivate
        ? ({ kind: 'private_player', aiPlayerId: participantIds[0] } as const)
        : participantIds.length === activePlayers.length
          ? ({ kind: 'full_table' } as const)
          : ({ kind: 'player_subset', aiPlayerIds: participantIds } as const)
      const session = await setupSessions.create({ title, kind, audience, participantIds })
      await setupSessions.start(session.id)
      notifyParent()
      creating = false
      title = ''
      participantIds = []
    } catch (error) {
      actionError = error instanceof Error ? error.message : 'Unable to start setup session'
    } finally {
      busy = false
    }
  }

  async function finish(status: 'completed' | 'abandoned') {
    busy = true
    const completingSession = setupSessions.selected
    const completingAIPlayerId = setupSessions.participants[0]?.aiPlayerId
    const completingMessages = setupSessions.messages
    try {
      await setupSessions.finish(status)
      notifyParent()
      // Capture memory whenever a private prologue ends, not just on Complete: a GM
      // stopping the scene is the common way to end it, and the events still happened.
      if (
        completingSession?.kind === 'private_prologue' &&
        completingAIPlayerId &&
        campaign.current?.storyId
      ) {
        try {
          await storePrivatePrologueMemory({
            storyId: campaign.current.storyId,
            campaignId: campaign.current.id,
            aiPlayerId: completingAIPlayerId,
            setupSessionId: completingSession.id,
            messages: completingMessages,
          })
        } catch (memoryError) {
          console.error('[SetupSessionPanel] Unable to store private prologue memory:', memoryError)
          actionError = 'Setup session ended, but the AI Player memory could not be saved.'
        }
      }
    } catch (error) {
      actionError = error instanceof Error ? error.message : 'Unable to finish setup session'
    } finally {
      busy = false
    }
  }

  async function selectSession(id: string) {
    actionError = null
    try {
      await setupSessions.select(id)
      notifyParent()
    } catch (error) {
      actionError = error instanceof Error ? error.message : 'Unable to open setup session'
    }
  }

  async function startSelected() {
    if (!setupSessions.selected) return
    busy = true
    actionError = null
    try {
      await setupSessions.start(setupSessions.selected.id)
      notifyParent()
    } catch (error) {
      actionError = error instanceof Error ? error.message : 'Unable to start setup session'
    } finally {
      busy = false
    }
  }

  async function advancePhase() {
    busy = true
    try {
      await setupSessions.advancePhase()
    } finally {
      busy = false
    }
  }

  async function saveRelationships() {
    if (!campaign.current || !relationshipNotes.trim()) return
    const assignments = await database.getPlayerCharactersForCampaign(campaign.current.id)
    for (const assignment of assignments.filter((item) =>
      setupSessions.participants.some((participant) => participant.aiPlayerId === item.aiPlayerId),
    )) {
      await database.upsertPlayerCharacter({
        ...assignment,
        interPlayerRelationshipOverrides: {
          ...assignment.interPlayerRelationshipOverrides,
          [`setup:${setupSessions.selected?.id}`]: relationshipNotes.trim(),
        },
      })
    }
    relationshipNotes = ''
    await buildRecap()
  }

  async function saveSecret() {
    if (!campaign.current || !secretTargetId || !secretText.trim()) return
    const now = Date.now()
    await database.upsertPlayerLevelSecret({
      id: crypto.randomUUID(),
      campaignId: campaign.current.id,
      sessionId: null,
      targetAIPlayerId: secretTargetId,
      secretContent: secretText.trim(),
      revealedToAIPlayerIds: secretShared
        ? setupSessions.participants.map((participant) => participant.aiPlayerId)
        : [secretTargetId],
      visibilityScope: secretShared ? 'all_ai_players' : 'specific_ai_player',
      createdAt: now,
      updatedAt: now,
    })
    secretText = ''
    await buildRecap()
  }

  /** Rebuilds the memory for the selected private prologue, including completed ones. */
  async function generateMemoryFromSession() {
    const session = setupSessions.selected
    const aiPlayerId = setupSessions.participants[0]?.aiPlayerId
    if (
      !session ||
      session.kind !== 'private_prologue' ||
      !aiPlayerId ||
      !campaign.current?.storyId ||
      isGeneratingMemory
    ) {
      return
    }
    isGeneratingMemory = true
    actionError = null
    try {
      await storePrivatePrologueMemory({
        storyId: campaign.current.storyId,
        campaignId: campaign.current.id,
        aiPlayerId,
        setupSessionId: session.id,
        messages: setupSessions.messages,
      })
      await buildRecap()
    } catch (error) {
      actionError = error instanceof Error ? error.message : 'Unable to build the AI Player memory'
    } finally {
      isGeneratingMemory = false
    }
  }

  async function buildRecap() {
    if (!campaign.current) return
    const campaignId = campaign.current.id
    const participantIds = setupSessions.participants.map((participant) => participant.aiPlayerId)
    const participantIdSet = new Set(participantIds)
    const [assignments, secrets, memoryLists] = await Promise.all([
      database.getPlayerCharactersForCampaign(campaignId),
      database.getPlayerLevelSecrets(campaignId),
      Promise.all(
        participantIds.map((aiPlayerId) =>
          database
            .getRecallableAIPlayerMemories(aiPlayerId, campaignId)
            .then((memories) => memories.map((memory) => ({ aiPlayerId, memory })))
            .catch(() => []),
        ),
      ),
    ])
    const relationships = assignments
      .filter((assignment) => participantIdSet.has(assignment.aiPlayerId))
      .flatMap((assignment) => Object.values(assignment.interPlayerRelationshipOverrides))
      .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
    const visibleSecrets = secrets.filter(
      (secret) =>
        participantIdSet.has(secret.targetAIPlayerId) || secret.visibilityScope === 'all_ai_players',
    )
    const memories = memoryLists.flat()
    setupRecap = [
      `Setup: ${setupSessions.selected?.title ?? 'Session Zero'}`,
      `Participants: ${setupSessions.participants.map((participant) => players.find((player) => player.id === participant.aiPlayerId)?.name ?? participant.aiPlayerId).join(', ')}`,
      `Relationships: ${relationships.join(' | ') || 'None recorded'}`,
      `Secrets/hooks: ${visibleSecrets.map((secret) => secret.secretContent).join(' | ') || 'None recorded'}`,
      `AI Player memories: ${
        memories
          .map(
            ({ aiPlayerId, memory }) =>
              `${players.find((player) => player.id === aiPlayerId)?.name ?? aiPlayerId}: ${memory.content}`,
          )
          .join(' | ') || 'None recorded'
      }`,
    ].join('\n')
  }
</script>

<div class="border-border bg-card shrink-0 space-y-2 border-b px-3 py-2">
  <div class="flex flex-wrap items-center gap-2">
    <UsersRound class="text-primary h-4 w-4" />
    <span class="text-xs font-semibold">Setup Sessions</span>
    {#if setupSessions.sessions.length > 0}
      <Select.Root
        type="single"
        value={setupSessions.selected?.id}
        onValueChange={(id) => id && void selectSession(id)}
        disabled={busy}
      >
        <Select.Trigger class="h-8 min-w-56 text-xs">
          {setupSessions.selected ? setupSessions.label(setupSessions.selected) : 'Select history'}
        </Select.Trigger>
        <Select.Content>
          {#each setupSessions.sessions as session (session.id)}
            <Select.Item value={session.id} label={setupSessions.label(session)}>
              {setupSessions.label(session)} · {session.status}
            </Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    {/if}
    <div class="ml-auto flex items-center gap-2">
      {#if setupSessions.selected?.status === 'planned' || setupSessions.selected?.status === 'abandoned'}
        <Button
          variant="outline"
          size="sm"
          onclick={() => void startSelected()}
          disabled={busy || Boolean(setupSessions.active)}
        >
          {setupSessions.selected.status === 'abandoned' ? 'Restart' : 'Start'}
        </Button>
      {/if}
      {#if setupSessions.selected?.status === 'active'}
        {#if setupSessions.selected.kind === 'group_session_zero'}
          <Button variant="outline" size="sm" onclick={() => void advancePhase()} disabled={busy}>
            Next Setup Phase
          </Button>
        {/if}
        <Button variant="outline" size="sm" onclick={() => void finish('completed')} disabled={busy}>
          Complete
        </Button>
        <Button variant="outline" size="sm" onclick={() => void finish('abandoned')} disabled={busy}>
          <Square class="h-3.5 w-3.5" /> Stop
        </Button>
      {/if}
      <Button variant="outline" size="sm" onclick={() => creating ? (creating = false) : void openCreator()} disabled={busy || Boolean(setupSessions.active)}>
        <Plus class="h-3.5 w-3.5" />
        New Setup Session
      </Button>
    </div>
  </div>

  {#if creating}
    <div class="grid gap-2 rounded-md border p-3 md:grid-cols-[1fr_13rem]">
      <Input bind:value={title} placeholder="Setup session title" />
      <select class="bg-background h-9 rounded-md border px-2 text-sm" bind:value={kind} onchange={() => (participantIds = [])}>
        <option value="private_character_creation">Private Character Creation</option>
        <option value="private_prologue">Private Prologue</option>
        <option value="group_session_zero">Group Session Zero</option>
        <option value="table_bonding">Session 0.5 / Table Bonding</option>
      </select>
      <div class="flex flex-wrap gap-2 md:col-span-2">
        {#each activePlayers as player (player.id)}
          <label class="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs">
            <input
              type={isPrivate ? 'radio' : 'checkbox'}
              name={isPrivate ? 'setup-private-player' : undefined}
              checked={participantIds.includes(player.id)}
              onchange={(event) => toggleParticipant(player.id, event.currentTarget.checked)}
            />
            {player.name}
          </label>
        {/each}
      </div>
      <div class="flex gap-2 md:col-span-2">
        <Button size="sm" onclick={() => void createAndStart()} disabled={busy || participantIds.length === 0}>
          Start Setup Session
        </Button>
        <Button variant="ghost" size="sm" onclick={() => (creating = false)}>Cancel</Button>
      </div>
    </div>
  {/if}

  {#if setupSessions.error}
    <p class="text-destructive text-xs">{setupSessions.error}</p>
  {:else if actionError}
    <p class="text-destructive text-xs">{actionError}</p>
  {:else if setupSessions.selected}
    <p class="text-muted-foreground flex items-center gap-1 text-xs">
      <History class="h-3.5 w-3.5" />
      {setupSessions.selected.phase} · {setupSessions.participants.length} participant{setupSessions.participants.length === 1 ? '' : 's'} · {new Date(setupSessions.selected.createdAt).toLocaleString()}
      {setupSessions.selected.status !== 'active' ? ' · Read only' : ''}
    </p>
  {/if}

  {#if setupSessions.selected?.kind === 'private_character_creation'}
    <div class="flex flex-wrap items-center gap-2 border-t pt-2">
      {#if setupSessions.selected.status === 'active'}
        <Button size="sm" onclick={() => void generateCharacterProposal()} disabled={busy || isGeneratingCharacter || !fullRuleset}>
          {#if isGeneratingCharacter}<Loader2 class="h-3.5 w-3.5 animate-spin" />{/if}
          Generate AI Character Draft
        </Button>
      {/if}
      <Button
        variant="outline"
        size="sm"
        title={assignedCharacterId
          ? 'Edit the approved live character and view its revision history'
          : 'Approve a character draft before editing the live character sheet'}
        onclick={() => void openAssignedCharacter()}
        disabled={busy || !fullRuleset || !assignedCharacterId}
      >
        Edit Approved Character Sheet
      </Button>
      {#each proposals.filter((proposal) => proposal.status === 'pending') as proposal (proposal.id)}
        <Button variant="outline" size="sm" onclick={() => openProposal(proposal)}>
          Review {proposal.payload.name}
        </Button>
        <Button variant="ghost" size="sm" onclick={() => void declineProposal(proposal)}>Decline</Button>
      {/each}
    </div>
  {/if}

  {#if setupSessions.selected && ['bonding', 'free_table'].includes(setupSessions.selected.phase)}
    <div class="grid gap-2 border-t pt-2 md:grid-cols-[1fr_auto]">
      <Input bind:value={relationshipNotes} placeholder="Record a relationship or party-dynamic outcome" />
      <Button size="sm" onclick={() => void saveRelationships()} disabled={!relationshipNotes.trim()}>Save Relationship</Button>
    </div>
  {/if}

  {#if setupSessions.selected?.phase === 'secrets'}
    <div class="grid gap-2 border-t pt-2 md:grid-cols-[12rem_1fr_auto]">
      <select class="bg-background h-9 rounded-md border px-2 text-sm" bind:value={secretTargetId}>
        <option value="">Select AI Player</option>
        {#each setupSessions.participants as participant (participant.aiPlayerId)}
          <option value={participant.aiPlayerId}>{players.find((player) => player.id === participant.aiPlayerId)?.name ?? participant.aiPlayerId}</option>
        {/each}
      </select>
      <Input bind:value={secretText} placeholder="Private hook or secret context" />
      <Button size="sm" onclick={() => void saveSecret()} disabled={!secretTargetId || !secretText.trim()}>Save Secret</Button>
      <label class="flex items-center gap-2 text-xs md:col-span-3">
        <input type="checkbox" bind:checked={secretShared} /> Share with all setup participants
      </label>
    </div>
  {/if}

  {#if setupSessions.selected}
    <div class="flex items-start gap-2 border-t pt-2">
      <Button variant="outline" size="sm" onclick={() => void buildRecap()}>Build Recap</Button>
      {#if setupSessions.selected.kind === 'private_prologue' && setupSessions.messages.length > 0}
        <Button
          variant="outline"
          size="sm"
          disabled={isGeneratingMemory}
          title="Summarize this prologue into the AI Player's private memory"
          onclick={() => void generateMemoryFromSession()}
        >
          {#if isGeneratingMemory}<Loader2 class="h-3.5 w-3.5 animate-spin" />{/if}
          Build AI Player Memory
        </Button>
      {/if}
      {#if setupRecap}<pre class="text-muted-foreground whitespace-pre-wrap text-xs">{setupRecap}</pre>{/if}
    </div>
  {/if}
</div>

{#if editorDraft && fullRuleset}
  <!-- Key by editor target so bits-ui fully remounts instead of reusing stale dialog refs across proposals -->
  {#key editorProposal?.id ?? editorCharacter?.id ?? 'editor'}
    <FullCharacterSheetEditor
      open={editorOpen}
      title={editorProposal ? `Review AI Proposal: ${editorDraft.name}` : `Edit Character: ${editorDraft.name}`}
      draft={editorDraft}
      ruleset={fullRuleset}
      {revisions}
      {busy}
      saveLabel={editorProposal ? 'Approve & Save Character' : 'Save Changes'}
      onSave={saveEditor}
      onRestore={editorCharacter ? restoreRevision : undefined}
      onClose={() => (editorOpen = false)}
    />
  {/key}
{/if}

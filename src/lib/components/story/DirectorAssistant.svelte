<script lang="ts">
  import { story } from '$lib/stores/story.svelte'
  import { ui } from '$lib/stores/ui.svelte'
  import { serviceFactory } from '$lib/services/ai/core/factory'
  import type { DirectorProposalArtifact } from '$lib/types'
  import type {
    DirectorChatMessage,
    DirectorInteractiveContext,
    DirectorToolCallDisplay,
  } from '$lib/services/ai/generation/InteractiveDirectorAssistantService'
  import * as ResponsiveModal from '$lib/components/ui/responsive-modal'
  import { Button } from '$lib/components/ui/button'
  import { Textarea } from '$lib/components/ui/textarea'
  import { Badge } from '$lib/components/ui/badge'
  import { Loader2, Shield, Check, X, RefreshCw, Send } from 'lucide-svelte'

  interface Props {
    open: boolean
    onClose: () => void
  }

  let { open, onClose }: Props = $props()

  const proposalService = serviceFactory.createDirectorOutliningAssistantService()
  const interactiveService = serviceFactory.createInteractiveDirectorAssistantService()

  let composer = $state('')
  let loading = $state(false)
  let refreshing = $state(false)
  let streamStatus = $state<string | null>(null)
  let proposals = $state<DirectorProposalArtifact[]>([])
  let chatMessages = $state<DirectorChatMessage[]>([])
  let lastStoryId = $state<string | null>(null)

  function createWelcomeMessage(campaignTitle: string | undefined): DirectorChatMessage {
    return {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: campaignTitle
        ? `Lets shape ${campaignTitle}. Tell me the premise, tone, and the secrets that should stay hidden for now.`
        : 'Open a campaign and I will help you plan pacing, reveals, and hidden structure before anything is drafted.',
      timestamp: Date.now(),
    }
  }

  function resetConversation() {
    chatMessages = [createWelcomeMessage(story.currentStory?.title)]
    interactiveService.reset()
  }

  async function refreshProposals() {
    const currentStory = story.currentStory
    if (!currentStory) {
      proposals = []
      return
    }

    refreshing = true
    try {
      proposals = await proposalService.listProposals(currentStory.id)
    } catch (error) {
      console.error('[DirectorAssistant] Failed to load proposals:', error)
      ui.showToast('Failed to load director proposals', 'error')
    } finally {
      refreshing = false
    }
  }

  $effect(() => {
    const currentStoryId = story.currentStory?.id ?? null
    if (currentStoryId !== lastStoryId) {
      lastStoryId = currentStoryId
      resetConversation()
    }
    if (open && story.currentStory) {
      void refreshProposals()
    }
  })

  function getDraftPayload(artifact: DirectorProposalArtifact): Record<string, unknown> {
    return artifact.draftPayload ?? {}
  }

  function getSummary(artifact: DirectorProposalArtifact): string {
    const payload = getDraftPayload(artifact)
    return typeof payload.summary === 'string'
      ? payload.summary
      : (artifact.title ?? 'Untitled proposal')
  }

  function getOutline(artifact: DirectorProposalArtifact): string {
    const payload = getDraftPayload(artifact)
    return typeof payload.outlineDraft === 'string' ? payload.outlineDraft : ''
  }

  function formatTimestamp(value: number | null): string {
    if (value === null) return 'n/a'
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(value)
  }

  function formatJson(value: unknown): string {
    return JSON.stringify(value, null, 2)
  }

  function buildInteractiveContext(
    currentStory = story.currentStory,
  ): DirectorInteractiveContext | null {
    if (!currentStory) return null

    const chapterEntriesByNumber: Record<string, typeof story.entries> = {}
    for (const chapter of story.chapters) {
      chapterEntriesByNumber[String(chapter.number)] = story.getChapterEntries(chapter)
    }

    return {
      story: currentStory,
      chapterSources: story.chapterSources,
      recentEntries: story.entries
        .filter((entry) => entry.type === 'user_action' || entry.type === 'narration')
        .slice(-10)
        .map((entry) => `${entry.type === 'user_action' ? 'USER' : 'ASSISTANT'}: ${entry.content}`),
      chapters: story.chapters,
      storyEntries: story.entries,
      chapterEntriesByNumber,
      worldState: {
        characters: story.characters,
        locations: story.locations,
        items: story.items,
        storyBeats: story.storyBeats,
        lorebookEntries: story.lorebookEntries,
      },
    }
  }

  function appendAssistantMessage(message: DirectorChatMessage) {
    chatMessages = [
      ...chatMessages,
      {
        ...message,
        id: message.id || crypto.randomUUID(),
        timestamp: message.timestamp || Date.now(),
      },
    ]
  }

  function appendToolResultMessage(toolCall: DirectorToolCallDisplay) {
    if (!toolCall.artifact) return
    const summary = getSummary(toolCall.artifact)
    appendAssistantMessage({
      id: crypto.randomUUID(),
      role: 'assistant',
      content: `Draft created: ${toolCall.artifact.title ?? 'Untitled proposal'}\n\n${summary}`,
      timestamp: Date.now(),
      toolCalls: [toolCall],
    })
  }

  function getToolStatusLabel(toolName: string): string {
    switch (toolName) {
      case 'search_lorebook_entries':
        return 'Searching lorebook entries...'
      case 'read_lorebook_entry':
        return 'Reading lorebook entry...'
      case 'list_chapters':
        return 'Reviewing chapter summaries...'
      case 'read_chapter':
        return 'Reading chapter context...'
      case 'search_story_text':
        return 'Searching story text...'
      case 'read_recent_story_text':
        return 'Reading recent story text...'
      case 'create_director_proposal_draft':
        return 'Drafting proposal artifact...'
      default:
        return `Using tool: ${toolName}`
    }
  }

  function summarizeToolCalls(toolCalls: DirectorToolCallDisplay[] | undefined): string {
    if (!toolCalls || toolCalls.length === 0) return ''
    const labels = toolCalls.map((call) => getToolStatusLabel(call.name).replace(/\.\.\.$/, ''))
    return `Context actions: ${labels.join('; ')}`
  }

  async function sendInteractiveMessage(messageText: string) {
    const context = buildInteractiveContext()
    if (!context || loading) return

    const userText = messageText.trim()
    if (!userText) {
      ui.showToast('Enter a prompt first', 'warning')
      return
    }

    chatMessages = [
      ...chatMessages,
      {
        id: crypto.randomUUID(),
        role: 'user',
        content: userText,
        timestamp: Date.now(),
      },
    ]

    loading = true
    streamStatus = 'Thinking...'
    try {
      for await (const event of interactiveService.sendMessageStreaming(context, userText)) {
        if (event.type === 'thinking') {
          streamStatus = 'Thinking...'
        } else if (event.type === 'tool_start') {
          streamStatus = getToolStatusLabel(event.toolName)
        } else if (event.type === 'tool_end') {
          streamStatus = null
          appendToolResultMessage(event.toolCall)
          if (event.toolCall.artifact) {
            await refreshProposals()
            ui.showToast('Director draft proposal created', 'info')
          }
        } else if (event.type === 'message') {
          if (event.message.content?.trim() || (event.message.toolCalls?.length ?? 0) > 0) {
            appendAssistantMessage({
              ...event.message,
              content: event.message.content?.trim() || summarizeToolCalls(event.message.toolCalls),
            })
          }
          streamStatus = null
        } else if (event.type === 'error') {
          streamStatus = null
          ui.showToast(event.error, 'error')
        } else if (event.type === 'done') {
          streamStatus = null
        }
      }
    } catch (error) {
      console.error('[DirectorAssistant] Interactive director failed:', error)
      ui.showToast('Failed to message director assistant', 'error')
    } finally {
      loading = false
      streamStatus = null
    }
  }

  async function sendPrompt() {
    const trimmedPrompt = composer.trim()
    if (!trimmedPrompt) return
    composer = ''
    await sendInteractiveMessage(trimmedPrompt)
  }

  async function handleComposerKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    if (!composer.trim() || loading || !story.currentStory) return
    await sendPrompt()
  }

  async function approveProposal(artifact: DirectorProposalArtifact) {
    try {
      await proposalService.approveProposal(artifact)
      await refreshProposals()
      ui.showToast('Proposal approved', 'info')
    } catch (error) {
      console.error('[DirectorAssistant] Failed to approve proposal:', error)
      ui.showToast('Failed to approve proposal', 'error')
    }
  }

  async function rejectProposal(artifact: DirectorProposalArtifact) {
    try {
      await proposalService.rejectProposal(artifact)
      await refreshProposals()
      ui.showToast('Proposal rejected', 'info')
    } catch (error) {
      console.error('[DirectorAssistant] Failed to reject proposal:', error)
      ui.showToast('Failed to reject proposal', 'error')
    }
  }
</script>

<ResponsiveModal.Root {open} onOpenChange={(v) => !v && onClose()}>
  <ResponsiveModal.Content class="max-h-[90vh] max-w-5xl overflow-hidden p-0">
    <div class="bg-background flex h-[90vh] flex-col">
      <div class="border-b px-5 py-4">
        <div class="flex items-start justify-between gap-4">
          <div>
            <div class="flex items-center gap-2">
              <Shield class="text-primary h-5 w-5" />
              <h2 class="text-lg font-semibold tracking-tight">Director Assistant</h2>
            </div>
            <p class="text-muted-foreground mt-1 text-sm">
              Plan collaboratively in chat, then create pending draft artifacts only when needed.
            </p>
          </div>
          <Button variant="ghost" size="icon" onclick={onClose} title="Close">
            <X class="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div class="grid min-h-0 flex-1 gap-4 overflow-hidden p-5 lg:grid-cols-[0.95fr_1.35fr]">
        <div class="flex min-h-0 flex-col gap-4 overflow-hidden">
          <div class="min-h-0 flex-1 overflow-hidden rounded-lg border">
            <div class="border-b px-4 py-3">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <h3 class="font-medium">Pending Artifacts</h3>
                  <p class="text-muted-foreground text-xs">
                    Drafts stay pending until you explicitly approve them.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onclick={refreshProposals}
                  disabled={refreshing}
                >
                  {#if refreshing}
                    <Loader2 class="mr-2 h-4 w-4 animate-spin" />
                  {:else}
                    <RefreshCw class="mr-2 h-4 w-4" />
                  {/if}
                  Refresh
                </Button>
              </div>
            </div>

            <div class="max-h-[calc(90vh-22rem)] space-y-3 overflow-y-auto p-4">
              {#if proposals.length === 0}
                <div class="text-muted-foreground rounded-md border border-dashed p-6 text-sm">
                  No proposals yet. Draft one from the brief above.
                </div>
              {:else}
                {#each proposals as artifact (artifact.id)}
                  <div class="rounded-lg border p-4">
                    <div class="flex items-start justify-between gap-3">
                      <div>
                        <div class="flex items-center gap-2">
                          <h4 class="font-medium">{artifact.title ?? 'Untitled proposal'}</h4>
                          <Badge
                            variant={artifact.approvalState === 'approved'
                              ? 'default'
                              : artifact.approvalState === 'rejected'
                                ? 'destructive'
                                : 'secondary'}
                          >
                            {artifact.approvalState}
                          </Badge>
                        </div>
                        <p class="text-muted-foreground mt-1 text-sm">{getSummary(artifact)}</p>
                      </div>
                    </div>

                    <div class="text-muted-foreground mt-3 grid gap-2 text-xs sm:grid-cols-2">
                      <p>
                        <span class="text-foreground font-medium">Created:</span>
                        {formatTimestamp(artifact.createdAt)}
                      </p>
                      <p>
                        <span class="text-foreground font-medium">Updated:</span>
                        {formatTimestamp(artifact.updatedAt)}
                      </p>
                      <p>
                        <span class="text-foreground font-medium">Approved by:</span>
                        {artifact.approvedBy ?? 'n/a'}
                      </p>
                      <p>
                        <span class="text-foreground font-medium">Approved at:</span>
                        {formatTimestamp(artifact.approvedAt)}
                      </p>
                    </div>

                    {#if getOutline(artifact)}
                      <pre
                        class="bg-muted/30 mt-3 max-h-44 overflow-auto rounded-md p-3 text-xs whitespace-pre-wrap">{getOutline(
                          artifact,
                        )}</pre>
                    {/if}

                    {#if artifact.diffPayload}
                      <details class="mt-3 rounded-md border border-dashed p-3">
                        <summary class="cursor-pointer text-sm font-medium">Diff Payload</summary>
                        <pre
                          class="bg-muted/30 mt-3 max-h-40 overflow-auto rounded-md p-3 text-xs whitespace-pre-wrap">{formatJson(
                            artifact.diffPayload,
                          )}</pre>
                      </details>
                    {/if}

                    {#if artifact.draftPayload}
                      <details class="mt-3 rounded-md border border-dashed p-3">
                        <summary class="cursor-pointer text-sm font-medium"
                          >Raw Draft Payload</summary
                        >
                        <pre
                          class="bg-muted/30 mt-3 max-h-52 overflow-auto rounded-md p-3 text-xs whitespace-pre-wrap">{formatJson(
                            artifact.draftPayload,
                          )}</pre>
                      </details>
                    {/if}

                    {#if artifact.approvalState === 'pending'}
                      <div class="mt-3 flex items-center gap-2">
                        <Button size="sm" onclick={() => approveProposal(artifact)}>
                          <Check class="mr-2 h-4 w-4" />
                          Approve
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onclick={() => rejectProposal(artifact)}
                        >
                          <X class="mr-2 h-4 w-4" />
                          Reject
                        </Button>
                      </div>
                    {/if}
                  </div>
                {/each}
              {/if}
            </div>
          </div>

          <div class="rounded-lg border p-4">
            <h3 class="font-medium">Story Snapshot</h3>
            {#if story.currentStory}
              <div class="text-muted-foreground mt-2 space-y-2 text-sm">
                <p>
                  <span class="text-foreground font-medium">Title:</span>
                  {story.currentStory.title}
                </p>
                <p><span class="text-foreground font-medium">Mode:</span> {story.storyMode}</p>
                <p>
                  <span class="text-foreground font-medium">Characters:</span>
                  {story.characters.length}
                </p>
                <p>
                  <span class="text-foreground font-medium">Locations:</span>
                  {story.locations.length}
                </p>
                <p><span class="text-foreground font-medium">Items:</span> {story.items.length}</p>
                <p>
                  <span class="text-foreground font-medium">Story beats:</span>
                  {story.storyBeats.length}
                </p>
                <p>
                  <span class="text-foreground font-medium">Lorebook entries:</span>
                  {story.lorebookEntries.length}
                </p>
              </div>
            {:else}
              <p class="text-muted-foreground mt-2 text-sm">Open a story to generate proposals.</p>
            {/if}

            <div class="border-muted-foreground/20 mt-4 border-t pt-4 text-xs leading-6">
              Drafts are stored as <span class="font-medium">pending artifacts</span> in the director
              proposal table. Approving them only changes approval state; it does not mutate the story
              automatically.
            </div>
          </div>
        </div>

        <div class="flex min-h-0 flex-col overflow-hidden rounded-lg border">
          <div class="border-b px-4 py-3">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h3 class="font-medium">Conversation</h3>
                <p class="text-muted-foreground text-xs">
                  Conversational planning by default. Ask for a draft in chat when you want one
                  saved.
                </p>
              </div>
              <Button variant="outline" size="sm" onclick={resetConversation} disabled={loading}>
                Reset
              </Button>
            </div>
            {#if streamStatus}
              <div
                class="text-muted-foreground mt-2 rounded-md border border-dashed px-3 py-2 text-xs"
              >
                {streamStatus}
              </div>
            {/if}
          </div>

          <div class="bg-muted/20 min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {#each chatMessages as message (message.id)}
              <div class={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  class={`max-w-[88%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background border'
                  }`}
                >
                  <div class="mb-1 text-[10px] font-semibold uppercase opacity-70">
                    {message.role === 'user' ? 'You' : 'Director'}
                  </div>
                  {message.content}
                  {#if message.toolCalls?.length}
                    <div class="mt-2 flex flex-wrap gap-1">
                      {#each message.toolCalls as call, callIndex (`${message.id}:${call.name}:${callIndex}`)}
                        <span
                          class="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px]"
                        >
                          {call.name}
                        </span>
                      {/each}
                    </div>
                  {/if}
                </div>
              </div>
            {/each}
          </div>

          <div class="border-t p-3">
            <div class="flex items-end gap-2">
              <Textarea
                bind:value={composer}
                rows={2}
                placeholder="Ask the director to shape beats, probe lore, or map future chapter arcs..."
                class="min-h-[56px] flex-1"
                disabled={!story.currentStory || loading}
                onkeydown={handleComposerKeydown}
              />
              <Button
                size="icon"
                onclick={sendPrompt}
                disabled={loading || !story.currentStory || !composer.trim()}
                title="Send"
              >
                {#if loading}
                  <Loader2 class="h-4 w-4 animate-spin" />
                {:else}
                  <Send class="h-4 w-4" />
                {/if}
              </Button>
            </div>
            <p class="text-muted-foreground mt-1 text-[10px]">
              Enter to send, Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>
    </div>
  </ResponsiveModal.Content>
</ResponsiveModal.Root>

<script lang="ts">
  /**
   * Story Log Pane
   *
   * Right sidebar showing prose narrative extracted from Player Chat.
   * GM promotes chat messages to story log by clicking "Add to Story Log".
   * Can be exported as finished story after session.
   */

  import type { ChatStore } from '$lib/stores/chat-store.svelte'

  interface Props {
    chatStore: ChatStore
    promotedMessageIds: Set<string>
  }

  let { chatStore, promotedMessageIds }: Props = $props()
  let chatState = $derived($chatStore)
  let storyEntries = $derived(
    chatState.messages.filter(
      (message): message is Extract<typeof message, { type: 'narration' | 'proposal' }> =>
        (message.type === 'narration' || message.type === 'proposal') &&
        promotedMessageIds.has(message.id),
    ),
  )

  function storyEntryContent(entry: (typeof storyEntries)[number]): string {
    return entry.type === 'proposal' ? entry.proposal.action : entry.content
  }
</script>

<div class="story-log-pane">
  <div class="story-log-header">
    <h2>Story Log</h2>
    <div class="story-log-actions">
      <button class="btn-small" title="Export story">📥</button>
      <button class="btn-small" title="Clear log">🗑️</button>
    </div>
  </div>

  <div class="story-log-content">
    {#if storyEntries.length === 0}
      <div class="empty-state">
        <p>Story log is empty.</p>
        <p class="hint">Entries appear here when you click "Add to Story Log" in chat.</p>
      </div>
    {:else}
      {#each storyEntries as entry (entry.id)}
        <div class="story-entry">
          <p>{storyEntryContent(entry)}</p>
          <div class="entry-time">
            {new Date(entry.timestamp).toLocaleTimeString()}
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <div class="story-log-footer">
    <button class="btn-primary">Export as Story</button>
    <button class="btn-secondary">Copy All</button>
  </div>
</div>

<style>
  .story-log-pane {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    background: var(--color-panel-bg, #f9f9f9);
  }

  .story-log-header {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: space-between;
    padding: 12px;
    border-bottom: 1px solid var(--color-border, #e0e0e0);
    background: var(--color-bg, #ffffff);
  }

  .story-log-header h2 {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text, #333);
  }

  .story-log-actions {
    display: flex;
    gap: 4px;
  }

  .btn-small {
    width: 28px;
    height: 28px;
    padding: 0;
    font-size: 0.875rem;
    background: transparent;
    border: 1px solid var(--color-border, #e0e0e0);
    border-radius: 3px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .btn-small:hover {
    background: var(--color-border, #e0e0e0);
  }

  .story-log-content {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--color-text-secondary, #999);
    text-align: center;
    padding: 20px;
  }

  .empty-state p {
    margin: 0;
    font-size: 0.8125rem;
    line-height: 1.4;
  }

  .empty-state .hint {
    font-size: 0.75rem;
    color: var(--color-text-secondary, #bbb);
    margin-top: 8px;
  }

  .story-entry {
    background: var(--color-bg, #ffffff);
    border: 1px solid var(--color-border, #e0e0e0);
    border-radius: 4px;
    padding: 10px;
    font-size: 0.8125rem;
    line-height: 1.5;
    color: var(--color-text, #333);
  }

  .story-entry p {
    margin: 0 0 6px 0;
  }

  .entry-time {
    font-size: 0.6875rem;
    color: var(--color-text-secondary, #999);
  }

  .story-log-footer {
    display: flex;
    flex: 0 0 auto;
    gap: 6px;
    padding: 12px;
    border-top: 1px solid var(--color-border, #e0e0e0);
    background: var(--color-bg, #ffffff);
  }

  .btn-primary,
  .btn-secondary {
    padding: 6px 10px;
    font-size: 0.75rem;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    font-weight: 500;
    flex: 1;
  }

  .btn-primary {
    background: var(--color-primary, #007acc);
    color: white;
  }

  .btn-primary:hover {
    background: var(--color-primary-hover, #005a9e);
  }

  .btn-secondary {
    background: var(--color-border, #e0e0e0);
    color: var(--color-text, #333);
  }

  .btn-secondary:hover {
    background: var(--color-border-hover, #d0d0d0);
  }
</style>

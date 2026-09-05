/**
 * G.4-G.7.1: Chat Store
 *
 * Manages chat message state for the Player Chat Pane.
 * Handles adding, filtering, and retrieving messages.
 */

import { writable, derived, type Writable, type Readable } from 'svelte/store'
import type { ChatMessage, ChatState } from '$lib/services/campaign/chat-types'

function sortMessagesByTimestamp(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort(
    (left, right) => left.timestamp - right.timestamp || left.id.localeCompare(right.id),
  )
}

function createChatStore(
  initialCampaignId: string,
  initialSessionId: string | null,
  onMessageAdded?: (message: ChatMessage) => Promise<void>,
) {
  const state: Writable<ChatState> = writable({
    campaignId: initialCampaignId,
    sessionId: initialSessionId,
    messages: [],
    isLoading: false,
    error: null,
    unreadCount: 0,
    lastMessageTimestamp: null,
  })

  /**
   * Add a message to the chat
   */
  function addMessage(message: ChatMessage) {
    state.update((s) => ({
      ...s,
      messages: sortMessagesByTimestamp([...s.messages, message]),
      lastMessageTimestamp: Math.max(s.lastMessageTimestamp ?? 0, message.timestamp),
      unreadCount: s.unreadCount + 1,
    }))
    void onMessageAdded?.(message).catch((error) => {
      console.error('[ChatStore] Failed to persist chat message:', error)
    })
  }

  /**
   * Add multiple messages
   */
  function addMessages(messages: ChatMessage[]) {
    state.update((s) => {
      const existingMessageIds = new Set(s.messages.map((message: ChatMessage) => message.id))
      const newMessages = messages.filter(
        (message: ChatMessage) => !existingMessageIds.has(message.id),
      )
      const lastTimestamp =
        newMessages.length > 0
          ? newMessages[newMessages.length - 1].timestamp
          : s.lastMessageTimestamp
      return {
        ...s,
        messages: sortMessagesByTimestamp([...s.messages, ...newMessages]),
        lastMessageTimestamp: Math.max(s.lastMessageTimestamp ?? 0, lastTimestamp ?? 0),
        unreadCount: s.unreadCount + newMessages.length,
      }
    })
  }

  function updateMessage(updatedMessage: ChatMessage) {
    state.update((s) => ({
      ...s,
      messages: sortMessagesByTimestamp(
        s.messages.map((message: ChatMessage) =>
          message.id === updatedMessage.id ? updatedMessage : message,
        ),
      ),
    }))
  }

  function removeMessage(id: string) {
    state.update((s) => ({
      ...s,
      messages: s.messages.filter((message: ChatMessage) => message.id !== id),
    }))
  }

  /**
   * Clear all messages
   */
  function clearMessages() {
    state.update((s) => ({
      ...s,
      messages: [],
      lastMessageTimestamp: null,
      unreadCount: 0,
    }))
  }

  /**
   * Mark all messages as read
   */
  function markAsRead() {
    state.update((s) => ({
      ...s,
      unreadCount: 0,
    }))
  }

  /**
   * Set loading state
   */
  function setLoading(isLoading: boolean) {
    state.update((s) => ({
      ...s,
      isLoading,
    }))
  }

  /**
   * Set error state
   */
  function setError(error: string | null) {
    state.update((s) => ({
      ...s,
      error,
    }))
  }

  /**
   * Get messages by type
   */
  const proposalMessages: Readable<ChatMessage[]> = derived(state, ($state) =>
    $state.messages.filter((m: ChatMessage) => m.type === 'proposal'),
  )

  const rollMessages: Readable<ChatMessage[]> = derived(state, ($state) =>
    $state.messages.filter((m: ChatMessage) => m.type === 'roll'),
  )

  const tableTalkMessages: Readable<ChatMessage[]> = derived(state, ($state) =>
    $state.messages.filter((m: ChatMessage) => m.type === 'table_talk'),
  )

  const narrationMessages: Readable<ChatMessage[]> = derived(state, ($state) =>
    $state.messages.filter((m: ChatMessage) => m.type === 'narration'),
  )

  /**
   * Get messages visible to current audience
   */
  function getVisibleMessages(audience: 'full_table' | 'private_subset' | 'private_player') {
    return derived(state, ($state) =>
      $state.messages.filter((m: ChatMessage) => {
        // System messages always visible
        if (m.type === 'system') return true
        // Filter by requested audience
        return m.audience === audience || m.audience === 'full_table'
      }),
    )
  }

  /**
   * Get message count
   */
  const messageCount: Readable<number> = derived(state, ($state) => $state.messages.length)

  return {
    subscribe: state.subscribe,
    addMessage,
    addMessages,
    updateMessage,
    removeMessage,
    clearMessages,
    markAsRead,
    setLoading,
    setError,
    proposalMessages,
    rollMessages,
    tableTalkMessages,
    narrationMessages,
    getVisibleMessages,
    messageCount,
  }
}

/**
 * Global chat store instance
 * Initialize with campaign and session ID
 */
export function initializeChatStore(
  campaignId: string,
  sessionId: string | null = null,
  onMessageAdded?: (message: ChatMessage) => Promise<void>,
) {
  return createChatStore(campaignId, sessionId, onMessageAdded)
}

/**
 * Type for the chat store
 */
export type ChatStore = ReturnType<typeof createChatStore>

<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import type { CharacterStats } from '$lib/types'

  interface Props {
    isOpen?: boolean
    mode?: 'session_zero' | 'mechanics'
    character?: CharacterStats | null
    proposedAdjustments?: Record<string, string | number | null>
  }

  interface StatAdjustment {
    field: string
    label: string
    currentValue: string | number
    proposedValue: string | number | null
    canEdit: boolean
  }

  const dispatch = createEventDispatcher<{
    approve: { adjustments: Record<string, string | number> }
    deny: { fields?: string[] }
    close: void
  }>()

  let {
    isOpen = false,
    mode = 'mechanics',
    character = null,
    proposedAdjustments = {},
  }: Props = $props()

  let adjustments = $state<StatAdjustment[]>([])
  let editingField = $state<string | null>(null)
  let editValue = $state<string>('')

  // Initialize adjustments when component or props change
  $effect(() => {
    if (!character) return

    adjustments = [
      {
        field: 'health',
        label: 'Health',
        currentValue: character.health?.current ?? 0,
        proposedValue: proposedAdjustments['health'] ?? null,
        canEdit: mode === 'session_zero',
      },
      {
        field: 'healthMax',
        label: 'Max Health',
        currentValue: character.health?.max ?? 20,
        proposedValue: proposedAdjustments['healthMax'] ?? null,
        canEdit: mode === 'session_zero',
      },
      {
        field: 'energy',
        label: 'Energy',
        currentValue: character.energy?.current ?? 0,
        proposedValue: proposedAdjustments['energy'] ?? null,
        canEdit: mode === 'session_zero',
      },
      {
        field: 'energyMax',
        label: 'Max Energy',
        currentValue: character.energy?.max ?? 8,
        proposedValue: proposedAdjustments['energyMax'] ?? null,
        canEdit: mode === 'session_zero',
      },
    ]
  })

  function handleEdit(field: string, currentValue: string | number) {
    editingField = field
    editValue = String(currentValue)
  }

  function handleSaveEdit(field: string) {
    const numValue = parseInt(editValue, 10)
    if (!isNaN(numValue)) {
      const adjustment = adjustments.find((a) => a.field === field)
      if (adjustment) {
        adjustment.proposedValue = numValue
      }
    }
    editingField = null
    editValue = ''
  }

  function handleCancel(_field: string) {
    editingField = null
    editValue = ''
  }

  function handleApproveField(field: string) {
    const adjustment = adjustments.find((a) => a.field === field)
    if (adjustment && adjustment.proposedValue !== null) {
      adjustment.currentValue = adjustment.proposedValue
      adjustment.proposedValue = null
    }
  }

  function handleDenyField(field: string) {
    const adjustment = adjustments.find((a) => a.field === field)
    if (adjustment) {
      adjustment.proposedValue = null
    }
  }

  function handleApproveAll() {
    adjustments.forEach((adj) => {
      if (adj.proposedValue !== null) {
        adj.currentValue = adj.proposedValue
        adj.proposedValue = null
      }
    })

    const result: Record<string, string | number> = {}
    adjustments.forEach((adj) => {
      result[adj.field] = adj.currentValue
    })

    dispatch('approve', { adjustments: result })
  }

  function handleDenyAll() {
    adjustments.forEach((adj) => {
      adj.proposedValue = null
      editingField = null
    })

    dispatch('deny', {})
  }

  function handleClose() {
    editingField = null
    dispatch('close')
  }

  function hasPendingChanges(): boolean {
    return adjustments.some((adj) => adj.proposedValue !== null)
  }

  let modeLabel = $derived(mode === 'session_zero' ? 'Character Creation' : 'Adjustments')
  let characterName = $derived(character?.name ?? 'Unknown')
</script>

{#if isOpen}
  <div
    class="modal-overlay"
    onclick={handleClose}
    onkeydown={(e) => e.key === 'Escape' && handleClose()}
    role="button"
    tabindex="0"
  >
    <div
      class="modal-container"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      tabindex="0"
      onkeydown={(e) => e.key === 'Escape' && handleClose()}
    >
      <!-- Header -->
      <div class="modal-header">
        <div class="header-content">
          <h2>{modeLabel}: {characterName}</h2>
          <div class="header-tabs">
            <button class="tab active">Stats</button>
            {#if mode === 'session_zero'}
              <button class="tab">Skills</button>
              <button class="tab">Equipment</button>
              <button class="tab">Background</button>
            {:else}
              <button class="tab">Status</button>
            {/if}
          </div>
        </div>
        <button class="close-btn" onclick={handleClose}>✕</button>
      </div>

      <!-- Content Area -->
      <div class="modal-content">
        {#each adjustments as adjustment (adjustment.field)}
          <div class="stat-adjustment">
            <div class="stat-label">
              <span class="stat-name">{adjustment.label}</span>
              {#if mode === 'session_zero'}
                <span class="stat-mode-hint">(Session Zero)</span>
              {/if}
            </div>

            <div class="stat-values">
              <div class="current-value">
                <span class="label">Current:</span>
                <span class="value">{adjustment.currentValue}</span>
              </div>

              {#if adjustment.proposedValue !== null}
                <div class="arrow">→</div>
                <div class="proposed-value">
                  <span class="label">Proposed:</span>
                  <span class="value">{adjustment.proposedValue}</span>
                </div>
              {/if}
            </div>

            {#if adjustment.proposedValue !== null && editingField !== adjustment.field}
              <!-- Proposed value present, not editing -->
              <div class="stat-actions">
                <button class="btn-approve" onclick={() => handleApproveField(adjustment.field)}>
                  Approve
                </button>
                <button
                  class="btn-edit"
                  onclick={() => handleEdit(adjustment.field, adjustment.proposedValue ?? '')}
                >
                  Edit
                </button>
                <button class="btn-deny" onclick={() => handleDenyField(adjustment.field)}>
                  Deny
                </button>
              </div>
            {:else if editingField === adjustment.field}
              <!-- Editing mode -->
              <div class="stat-edit">
                <input
                  type="number"
                  value={editValue}
                  onchange={(e) => (editValue = e.currentTarget.value)}
                  class="edit-input"
                />
                <button class="btn-save" onclick={() => handleSaveEdit(adjustment.field)}>
                  Save
                </button>
                <button class="btn-cancel" onclick={() => handleCancel(adjustment.field)}>
                  Cancel
                </button>
              </div>
            {:else if adjustment.canEdit && mode === 'session_zero'}
              <!-- No proposal, but editable (session zero) -->
              <div class="stat-actions">
                <button
                  class="btn-edit"
                  onclick={() => handleEdit(adjustment.field, adjustment.currentValue)}
                >
                  Edit Value
                </button>
              </div>
            {/if}
          </div>
        {/each}

        {#if mode === 'session_zero'}
          <div class="status-section">
            <h3>Status Effects</h3>
            <div class="status-list">
              <div class="status-item">
                <span class="status-label">Fatigued</span>
                <button class="status-btn remove">Remove</button>
              </div>
              <button class="btn-add-status">+ Add Status</button>
            </div>
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="modal-footer">
        <div class="footer-status">
          {#if hasPendingChanges()}
            <span class="pending-indicator"
              >⚠️ {adjustments.filter((a) => a.proposedValue !== null).length} pending changes</span
            >
          {/if}
        </div>
        <div class="footer-actions">
          <button class="btn-secondary" onclick={handleClose}>Close</button>
          {#if hasPendingChanges()}
            <button class="btn-secondary" onclick={handleDenyAll}>Deny All</button>
            <button class="btn-primary" onclick={handleApproveAll}>Approve All</button>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-container {
    background: var(--color-bg, #ffffff);
    border: 1px solid var(--color-border, #e0e0e0);
    border-radius: 8px;
    width: 90%;
    max-width: 600px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 16px;
    border-bottom: 1px solid var(--color-border, #e0e0e0);
    gap: 16px;
  }

  .header-content {
    flex: 1;
  }

  .modal-header h2 {
    margin: 0 0 12px 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text, #333);
  }

  .header-tabs {
    display: flex;
    gap: 4px;
  }

  .tab {
    padding: 4px 8px;
    font-size: 12px;
    background: transparent;
    border: 1px solid var(--color-border, #e0e0e0);
    border-bottom: none;
    border-radius: 3px 3px 0 0;
    cursor: pointer;
    color: var(--color-text-secondary, #666);
  }

  .tab.active {
    background: var(--color-primary, #007acc);
    color: white;
    border-color: var(--color-primary, #007acc);
  }

  .close-btn {
    background: transparent;
    border: none;
    font-size: 20px;
    cursor: pointer;
    color: var(--color-text-secondary, #666);
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .close-btn:hover {
    color: var(--color-text, #333);
  }

  .modal-content {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .stat-adjustment {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    background: var(--color-panel-bg, #f9f9f9);
    border: 1px solid var(--color-border, #e0e0e0);
    border-radius: 4px;
  }

  .stat-label {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .stat-name {
    font-weight: 600;
    color: var(--color-text, #333);
    font-size: 13px;
  }

  .stat-mode-hint {
    font-size: 11px;
    color: var(--color-text-secondary, #999);
  }

  .stat-values {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .current-value,
  .proposed-value {
    display: flex;
    gap: 4px;
    font-size: 13px;
  }

  .current-value .label,
  .proposed-value .label {
    color: var(--color-text-secondary, #666);
  }

  .current-value .value {
    font-weight: 600;
    color: var(--color-text, #333);
  }

  .proposed-value .value {
    font-weight: 600;
    color: var(--color-primary, #007acc);
  }

  .arrow {
    color: var(--color-text-secondary, #999);
    font-size: 12px;
  }

  .stat-actions {
    display: flex;
    gap: 6px;
  }

  .btn-approve,
  .btn-deny,
  .btn-edit,
  .btn-save,
  .btn-cancel {
    padding: 4px 8px;
    font-size: 11px;
    border: none;
    border-radius: 2px;
    cursor: pointer;
    font-weight: 500;
  }

  .btn-approve {
    background: #4caf50;
    color: white;
  }

  .btn-approve:hover {
    background: #45a049;
  }

  .btn-deny {
    background: #f44336;
    color: white;
  }

  .btn-deny:hover {
    background: #da190b;
  }

  .btn-edit {
    background: var(--color-primary, #007acc);
    color: white;
  }

  .btn-edit:hover {
    background: var(--color-primary-hover, #005a9e);
  }

  .btn-save {
    background: #4caf50;
    color: white;
  }

  .btn-save:hover {
    background: #45a049;
  }

  .btn-cancel {
    background: var(--color-border, #e0e0e0);
    color: var(--color-text, #333);
  }

  .btn-cancel:hover {
    background: var(--color-border-hover, #d0d0d0);
  }

  .stat-edit {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .edit-input {
    flex: 1;
    padding: 4px 8px;
    font-size: 12px;
    border: 1px solid var(--color-border, #e0e0e0);
    border-radius: 2px;
    font-family: inherit;
  }

  .status-section {
    margin-top: 8px;
  }

  .status-section h3 {
    margin: 0 0 8px 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text, #333);
  }

  .status-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .status-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px;
    background: rgba(0, 0, 0, 0.05);
    border-radius: 2px;
    font-size: 12px;
  }

  .status-label {
    color: var(--color-text, #333);
  }

  .status-btn {
    padding: 2px 6px;
    font-size: 10px;
    background: transparent;
    border: 1px solid var(--color-border, #e0e0e0);
    border-radius: 2px;
    cursor: pointer;
    color: var(--color-text-secondary, #666);
  }

  .status-btn.remove {
    border-color: #f44336;
    color: #f44336;
  }

  .status-btn:hover {
    background: rgba(244, 67, 54, 0.1);
  }

  .btn-add-status {
    padding: 4px 8px;
    font-size: 11px;
    background: var(--color-primary, #007acc);
    color: white;
    border: none;
    border-radius: 2px;
    cursor: pointer;
    font-weight: 500;
  }

  .btn-add-status:hover {
    background: var(--color-primary-hover, #005a9e);
  }

  .modal-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-top: 1px solid var(--color-border, #e0e0e0);
    background: var(--color-panel-bg, #f9f9f9);
  }

  .footer-status {
    font-size: 12px;
  }

  .pending-indicator {
    color: var(--color-primary, #007acc);
    font-weight: 500;
  }

  .footer-actions {
    display: flex;
    gap: 6px;
  }

  .btn-primary,
  .btn-secondary {
    padding: 6px 12px;
    font-size: 12px;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    font-weight: 500;
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

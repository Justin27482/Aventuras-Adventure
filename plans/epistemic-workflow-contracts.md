## Epistemic Workflow Contracts (Phase A)

This document is the binding contract for the Epistemic Secrets + Director Assistant rollout.

### 1. Authority Matrix

| Role | Read Channels | Write Scope | Cannot Do |
| --- | --- | --- | --- |
| Director | player_safe, actor_private, director_only, creative_outline_planning | Propose objective outcomes, reveal candidates, pacing decisions | Directly persist structural changes without Commit layer |
| Perception | objective state inputs and director outputs needed for visibility filtering | Produce observer-scoped perception outputs | Read or emit director-only secrets into player-safe output |
| Character | actor_private (self), player-visible scene constraints | Propose actions/dialogue from character-local knowledge | Access director_only or hidden outline payloads |
| Narrator | player_safe (+ approved foreshadow hints) | Generate final prose draft | Introduce unrevealed secret atoms or director-only facts |
| Commit | Validated stage outputs only | Persist accepted state changes atomically | Bypass approval gates for assistant structural proposals |
| Director Outlining Assistant | creative_outline_planning, director_only, approved world context | Create draft proposals for secret atoms, beats, foreshadow hooks | Auto-commit structural edits |

### 2. Canonical Context Channels

- player_safe
- actor_private
- director_only
- creative_outline_planning

Rules:
1. Any output visible to final prose must derive only from player_safe plus explicitly approved foreshadow hints.
2. actor_private may influence behavior proposals but cannot leak directly to narrator output unless gated and approved.
3. director_only must never appear in narrator or player-facing contexts unless converted through an explicit reveal decision that passes gate checks.

### 3. Feature Toggle Contract

Master toggle:
- epistemicWorkflowEnabled

Sub-toggles:
- epistemicGateAdventureEnabled
- epistemicOutlineCreativeEnabled
- epistemicDisclosureGateEnabled
- directorOutliningAssistantEnabled
- epistemicCostOverlayEnabled

Mode toggle:
- epistemicExecutionMode: quality | fast

Behavior contract:
1. Master OFF: legacy retrieval and generation path is used; epistemic stages are bypassed.
2. Master ON + quality: all enabled epistemic stages execute.
3. Master ON + fast: reduced-pass execution may skip secondary checks but must preserve channel leakage guarantees.
4. Disclosure gatekeeper must run in both quality and fast modes whenever master is ON.
4. Turning master OFF cascades sub-toggles to false.

### 4. Reveal Gate Contract

A candidate reveal is valid only if all are true:
1. Speaker knowledge edge exists with knows=true for the secret atom.
2. Disclosure intent is plausible for context (or justified by pressure/coercion/manipulation conditions).
3. Reveal channel is plausible in-scene (e.g., dialogue visibility, overheard conditions, privacy constraints).

If invalid:
- Rewrite, suppress, or defer reveal while preserving scene coherence.

Pressure taxonomy contract:
- Use a hybrid model.
- Provide built-in enum-like presets for common pressures (fear, loyalty, greed, coercion, ideology, panic, duty).
- Also allow open tags for custom pressures.
- Store pressures and strength ratings as tags/records so defaults are easy but author-specific nuance remains possible.
- Keep pressure tags empty unless explicitly authored or inferred.

### 5. Assistant Approval Contract

The Director Outlining Assistant may:
- Propose new secret atoms
- Propose foreshadow hooks
- Propose knowledge-edge seeds
- Propose reveal pathway drafts

The Director Outlining Assistant may not:
- Persist structural changes directly
- Mark reveals as committed without explicit user approval

### 6. Compatibility Contract

1. Existing stories default to master OFF.
2. New fields/tables are additive and backward-compatible.
3. With master OFF, prompt assembly should remain equivalent to baseline fixtures.

### 7. Open Items for Confirmation

Resolved decisions:
1. Character identity keys must support canonical story characters, scenario/imported NPC identities, and newly introduced runtime characters.
2. Reveal pressure taxonomy uses a hybrid strategy: built-in common pressures plus open custom tags.
3. Disclosure gatekeeper always runs in fast mode unless the epistemic workflow is fully disabled.
4. When a typed identity is later canonicalized, existing typed knowledge edges should be merged into the canonical reference without duplicate rows or dropped facts.

Implementation note for character identity:
- Knowledge edges should store both a typed character reference and optional canonical character ID.
- Typed reference supports scenario/imported/runtime entities before or without canonical story-character normalization.
# CHANGES

This file records major architectural divergence and provenance-relative changes from the original Aventuras project.

## Baseline and Provenance
- Original upstream project: https://github.com/AventurasTeam/Aventuras
- Local branch analyzed: `Multi-Agent`
- Local split anchor commit: `73a970235983cdf538977b7cb5a29680120fc8a5`
- Comparison baseline used for this document:
  - `merge-base(HEAD, upstream/main)`: none on this branch lineage
  - `merge-base(HEAD, upstream/master)`: `4c2a7481685b818fe0b5146102f0237e5f8b5c63`
- Local-only commits included in this baseline snapshot: 7

## 2026-07-24 - Initial Local Divergence Snapshot (pre-split)

### Summary
Since the practical upstream baseline above, this local codebase introduced assistant-focused narrative tooling, vault workflow upgrades, epistemic modeling infrastructure, and related schema/UI/service changes.

### Major Changes
- Added and expanded Director assistant workflows:
  - Interactive director assistant pathways and related prompt/schema tooling.
  - Supporting migrations for director assistant artifacts.
- Added Editor assistant integration:
  - Story/editor assistant service and UI integration.
  - Supporting migration for editor assistant conversations.
- Improved Vault assistant capabilities and performance:
  - Interactive vault assistant UX and merge handling improvements.
  - Conversation-switch performance improvements and follow-up fixes.
- Expanded epistemic and chapter-source infrastructure:
  - New migrations for chapter sources and epistemic secret atoms/knowledge edges.
  - Retrieval and disclosure-related service updates.
- Updated prompt/generation/settings surfaces:
  - Narrative, memory, generation, wizard, and template variable updates.
  - Settings and story-mode UX updates across story/library/import flows.

### Commit Baseline Included
- `0ff108e0` chore: checkpoint all current changes before next feature
- `e3c160d0` Aventura Working State
- `370180f9` WIP: snapshot local Aventuras changes before fork commit review
- `4ca1683f` Feat/vault assistant improvements (#282)
- `ed7d4444` Fix vault assistant merge artifact after cherry-pick test
- `b518769e` perf(vault): speed up conversation switching
- `73a97023` feat(editor-assistant): integrate testing branch changes

### Scope Note
This file is intentionally high-level. Fine-grained iterative updates should be tracked in `CHANGELOG.md` after repo split.

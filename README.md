# Campaign Engine

Campaign Engine is a GM-first tabletop adventure application for building campaigns, managing parties, and running AI-assisted sessions. It combines a local SQLite campaign workspace with configurable rulesets, deterministic dice, structured world state, and provider-agnostic narrative generation.

The active product is the Adventure split of Aventuras. Legacy material is kept behind an explicit archive boundary and is not treated as active Campaign Engine content.

## Features

### Campaigns and Sessions

- Campaign-first onboarding with a guided opening scene and campaign settings
- Session lifecycle with explicit start and end boundaries
- Primary-character selection, active party membership, party order, and spotlight tracking
- Autonomous companion agency with optional delegated or direct tactical combat control
- Session memory, checkpoints, recap generation, and in-story time tracking

### Rulesets and Dice

- Built-in ruleset templates for d20, narrative 2d6, Shadowdark-style, Savage Worlds-style, and other generic systems
- Custom ruleset authoring for stats, skills, checks, conditions, slots, abilities, resources, spells, levels, and creature stat blocks
- Slot- or weight-based encumbrance configuration and inventory capacity formulas
- Dice notation with modifiers, advantage/disadvantage, keep-high/keep-low, rerolls, exploding dice, clamps, and seeded evaluation
- Auditable roll ledger with DCs, outcomes, actor attribution, visibility, and explicit karma/fudge bias logging
- Ruleset JSON import and export

### GM Screen and Worldbuilding

- GM Screen with scene controls, turn controls, world charter editing, and session recap generation
- Campaign threads for plots, quests, factions, mysteries, character arcs, and threats
- Thread beats, clocks, stakes, player-safe visibility, and director-only planning notes
- Scene modes for exploration, travel, settlement, camp, combat, social scenes, downtime, and GM-directed flow
- Interview-driven worldbuilding assistant with reviewable draft proposals
- World charter drafting from campaign state and optional AI expansion

### Party and Mechanics

- Dynamic character sheets driven by the selected ruleset
- Resources, conditions, ability uses, experience, money, equipment, clothing durability, and inventory ownership
- Per-character inventories and shared stash semantics
- Owner-scoped item transfers, equipped-slot validation, carry limits, and negative-value protection
- Companion decision proposals with explicit accept, reject, and attribution states
- Mechanics tools for rolls, resources, conditions, abilities, items, time, scenes, turns, quests, and tables

### Narrative and AI

- Streaming narrative generation through OpenAI-compatible gateways and supported AI SDK providers
- Configurable models, temperature, token limits, reasoning effort, and reusable API profiles
- Prompt Packs for GM behavior, party context, scene modes, turn types, worldbuilding, and custom runtime variables
- Inline roll, turn, scene, and actor control tags with local resolution and safe continuation flow
- Prompt-pack compatibility checks for user-authored packs
- Local grammar checking powered by Harper.js (WebAssembly)

### Lorebook and World State

- Unified entries for characters, locations, items, factions, concepts, and events
- Relationships, dispositions, discoveries, inventory state, hidden information, aliases, and relevance-based injection
- Lorebook entries can link to ruleset abilities for mechanical reference
- AI-assisted lore management with reviewable changes rather than silent mutations
- Lorebook import/export, including Aventura and SillyTavern formats where supported
- Character portraits and generated images embedded in campaign entries

### Safety and Control

- Code-level validation at mechanics mutation boundaries
- Safety prompt packs for core rules, guardrails, intensity, content bans, and mechanics constraints
- Content intensity controls that affect narrative framing and image prompting without weakening hard bans
- Clear separation between player-safe campaign context and director-only planning data

### Import, Export, and Sync

- Campaign export/import packages containing story content, world state, settings, campaign threads, beats, and scene-turn state
- Collision-safe identifier remapping when importing a campaign
- Ruleset JSON packages for sharing custom mechanical systems
- Local network sync and QR-assisted device pairing
- Markdown and plain-text campaign exports

### Interface and Platforms

- Campaign Ember theme plus a broad selection of light, dark, retro, and high-contrast themes
- Responsive layouts for desktop and mobile-sized windows
- Desktop builds for Windows, macOS, and Linux
- Android development and APK build support through Tauri
- iOS assets and packaging configuration remain platform-dependent

## Installation

### Download Pre-built Binaries

Pre-compiled binaries are available on the [Releases](https://github.com/Justin27482/Aventuras-Adventure/releases) page:

| Platform | Download                                  |
| -------- | ----------------------------------------- |
| Windows  | `aventuras_x.x.x_x64-setup.exe`           |
| macOS    | `aventuras_x.x.x_x64.dmg`                 |
| Linux    | `aventuras_x.x.x_amd64.deb` / `.AppImage` |
| Android  | `aventuras-release.apk`                   |

## Tech Stack

- **Language**: TypeScript (strict mode)
- **Frontend Framework**: SvelteKit 2
- **State Management**: Svelte 5 runes (`$state`, `$derived`, `$props`)
- **Backend Framework**: Tauri 2 (Desktop/Android via Rust)
- **Styling**: Tailwind CSS, shadcn-svelte
- **Database**: SQLite (via `@tauri-apps/plugin-sql`)
- **AI**: OpenAI-compatible APIs through the Vercel AI SDK, Local NLP via Harper.js (WASM)
- **Package Manager**: npm

## Development

### Requirements

- Node.js 18+
- Rust (latest stable)
- (Optional) Android SDK, NDK, Java 17+ for Android builds

### Setup & Run Commands

```bash
# Clone the repository
git clone https://github.com/Justin27482/Aventuras-Adventure.git
cd Aventuras-Adventure

# Install dependencies
npm install

# Start Tauri development window (Desktop)
# Hot-reloading is fully supported for all Svelte/TypeScript code changes
npx tauri dev
```

### Scripts

Available `npm run` scripts:

- `build`: Build for production
- `check`: Run `svelte-check` (type checking)
- `check:watch`: Watch mode type checking
- `tauri`: Tauri CLI commands
- `release`: Run release script (`node scripts/release.js`)
- `lint`: Run ESLint
- `lint:fix`: Fix ESLint issues
- `format`: Format code with Prettier

### Tests

Run the complete Vitest suite:

```bash
npx vitest run
```

The current implementation also uses Svelte diagnostics and a production build as release checks:

```bash
npx svelte-check --tsconfig ./tsconfig.json
npm run build
```

### Environment Variables

API providers and keys are configured primarily through the UI in Settings. No provider key is required to install or build the application.

### Project Structure

```text
aventuras/
├── src/                  # SvelteKit frontend source
│   ├── routes/           # SvelteKit pages (+page.svelte, +layout.svelte)
│   ├── lib/              # Shared application logic and components
│   │   ├── components/   # UI components (PascalCase.svelte)
│   │   ├── services/     # Business logic classes/modules (AI, DB, etc.)
│   │   ├── stores/       # Svelte stores (*.svelte.ts for runes)
│   │   ├── types/        # TypeScript types
│   │   └── utils/        # Utility functions
├── src-tauri/            # Rust backend
│   ├── gen/android/      # Android scaffold files (DO NOT OVERWRITE)
│   ├── src/              # Rust source code
│   ├── Cargo.toml        # Rust dependencies
│   └── tauri.conf.json   # Tauri configuration
├── static/               # Static web assets
├── scripts/              # Build and utility scripts
├── package.json          # Node dependencies and scripts
```

### Building Release Binaries

<details>
<summary>Click to expand build instructions</summary>

#### Building Desktop

```bash
npx tauri build
```

#### Building Android

**IMPORTANT**: The Android project scaffold (`src-tauri/gen/android/`) is tracked in git.
**Do NOT run `npx tauri android init`** as it will overwrite customizations.

```bash
# Dev build + deploy to device/emulator
npx tauri android dev

# Release build (unsigned APK)
npx tauri android build
```

The unsigned APK will be at:

```text
src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk
```

#### Signing APK

```bash
# Create keystore (first time only)
keytool -genkey -v -keystore release.keystore -alias myalias -keyalg RSA -keysize 2048 -validity 10000

# Align APK
zipalign -v 4 app-universal-release-unsigned.apk app-aligned.apk

# Sign APK
apksigner sign --ks release.keystore --ks-key-alias myalias --out app-release.apk app-aligned.apk
```

</details>

## Acknowledgments

- [Tauri](https://tauri.app/) - Desktop/mobile app framework
- [SvelteKit](https://kit.svelte.dev/) - Frontend framework
- [OpenRouter](https://openrouter.ai/) - LLM API aggregator
- [Harper](https://writewithharper.com/) - Grammar checking
- [Lucide](https://lucide.dev/) - Icon library

## License

AGPL-3.0

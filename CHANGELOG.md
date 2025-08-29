# Changelog

All notable changes to the Ouroboros Code project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2025-08-29

### Added

#### Vision Quest Extension 🚀
- **Complete `/saga` command implementation** - Multi-phase development workflow with AI orchestration
- **Three-phase workflow system**:
  - Narrator Phase: Parallel design generation from GPT-5, Claude Opus 4.1, and Gemini 2.5 Pro
  - Sage Phase: Automated implementation with iterative refinement and validation loops
  - CodePress Phase: Interactive diff review with selective file approval
- **Interactive TUI components** using Ink.js:
  - SagaFrame: Main orchestration UI
  - NarratorView: Real-time provider status display
  - DesignViewer: Inline design document editor
  - SageProgress: Implementation monitoring with task tracking
  - CodePressReview: Color-coded diff viewer with file selection
  - FinalizeDialog: Commit message editor with validation summary
- **Core services architecture**:
  - NarratorService: Multi-provider parallel execution with thinking modes
  - ArbiterService: Design synthesis from multiple AI perspectives
  - SageService: Automated implementation with error recovery
  - WorkspaceManager: Ephemeral workspace creation with git integration
  - ValidationService: Multi-language support (TypeScript, Python, Go, JavaScript)
  - StorageManager: Session persistence in `.ouroboros/saga/`
- **State machine workflow** using XState for phase transitions
- **Command aliases**: `/saga`, `/quest`, `/vision` for starting workflows
- **Session history**: `/saga-history` command to view past sessions
- **Validation gates** for automated quality checks (tsc, lint, tests)
- **Ephemeral workspaces** for safe experimentation

#### Branding & UI Improvements
- **3D ASCII art branding** with shadow effects (░██ characters)
- **OUROBOROS branding** throughout the application
- **BETA label** added to ASCII art
- **Gradient coloring** respecting selected themes
- **Fixed TUI components**:
  - Added Primary, White, Warning properties to all theme files
  - Created WorkflowProgressDisplay.tsx component
  - Fixed VS Code extension imports to use @ouroboros/ouroboros-code-core

#### System Improvements
- **Memory system migration** from `.gemini` to `.ouroboros` directory
- **Settings migration** to `.ouroboros` configuration
- **Extension architecture** in `extensions/` directory
- **Comprehensive documentation**:
  - Vision Quest README with usage examples
  - Integration guide for extension system
  - Updated CLAUDE.md with merge instructions

### Changed
- Migrated from GEMINI to OUROBOROS branding system-wide
- Updated memory tool to use `.ouroboros` directory instead of `.gemini`
- Replaced GEMINI.md with OUROBOROS.md for user memory
- Updated all imports from @google/gemini-cli to @ouroboros/ouroboros-code

### Fixed
- TypeScript compilation errors in TUI components
- Build system failures due to missing color properties
- VS Code extension import errors
- Conflicting WorkflowProgressContext.tsx component

### Technical Details

#### Vision Quest Extension Structure
```
extensions/vision-quest/
├── manifest.json              # Extension metadata
├── package.json              # Node package configuration
├── tsconfig.json            # TypeScript configuration
├── index.ts                 # Main entry point
├── README.md                # User documentation
├── INTEGRATION.md           # Integration guide
└── src/
    ├── commands/            # Command implementations
    ├── services/           # Core service layer
    ├── state/             # State machine
    ├── storage/           # Persistence layer
    └── ui/                # TUI components
```

#### Key Technologies
- **Ink.js** for React-based terminal UI
- **XState** for state machine workflow
- **TypeScript** with strict type checking
- **Multi-provider orchestration** for diverse AI perspectives

### Dependencies
- Requires configured API keys for OpenAI, Anthropic, and Gemini
- Node.js 18+ for modern JavaScript features
- Git for version control integration

### Known Issues
- Tests for Vision Quest components pending implementation
- Some validation gates may need project-specific configuration

### Migration Guide
For users upgrading from previous versions:
1. Settings have moved from `.gemini/` to `.ouroboros/`
2. Memory files have moved from `GEMINI.md` to `OUROBOROS.md`
3. New `/saga` command requires provider API keys to be configured

---

*The Ouroboros Code project continues to evolve, bringing advanced AI orchestration directly to your terminal.*
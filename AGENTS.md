# Repository Guidelines

## Project Structure & Module Organization
The monorepo is managed through npm workspaces. `packages/core` hosts the shared runtime, agent orchestration logic, and tool adapters. `packages/cli` contains the Ink-based terminal UI, slash-command processor, and prompt pipelines. `packages/a2a-server` and `packages/vscode-ide-companion` expose the same runtime for automation and IDE integrations. Shared build utilities and release scripts live under `scripts/`, while root-level configuration files (`package.json`, `.eslintrc`, `tsconfig.*`) define repository-wide tooling.

## Build, Test, and Development Commands
Install dependencies once at the root, then use npm scripts to drive the workspace:
- `npm run build` compiles every package via `scripts/build.js`.
- `npm run test --workspaces --if-present` executes Vitest suites across packages; run targeted suites (for example `npx vitest run packages/core/src/agents/multiAgentExecutor.test.ts`) before committing agent changes.
- `npm run lint` and `npm run typecheck` enforce ESLint rules and strict TypeScript settings.
- `npm run format` applies the repository Prettier configuration.

## Coding Style & Naming Conventions
All source is TypeScript with ES modules. Use two-space indentation, descriptive camelCase identifiers, and prefer provider-neutral types surfaced in `packages/core/src/runtime`. Keep comments purposeful—add them only when behaviour is non-obvious. Shared utilities should be tree-shakeable and avoid hard dependencies on legacy `@google/genai` types; wire new functionality through `UnifiedAgentsClient` and the prompt/tool adapters.

## Testing Guidelines
Unit tests mirror source layout (`src/**/*.test.ts`) and rely on Vitest with Jest-compatible assertions. When touching multi-agent flows, extend `packages/core/src/agents` tests to capture timeline/events, and run `npm run build` afterwards to verify type compatibility. For CLI behaviour, pair component updates with corresponding snapshots or interaction tests under `packages/cli/src/ui`. Prefer fast, focused suites over monolithic end-to-end runs.

## Commit & Pull Request Guidelines
Follow conventional commits (`refactor: adjust tool injector`, `feat: stream multi-agent deltas`, etc.) so release tooling can auto-generate changelogs. Each PR should summarise behaviour, list verification steps (build/tests), and call out risks or follow-ups. When updating agents or tooling, include instructions for manual validation (e.g., `/agents on` smoke test) in the PR description to help reviewers reproduce the change.

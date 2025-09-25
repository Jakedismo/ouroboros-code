# Repository Guidelines

## Project Structure & Module Organization
The workspace follows npm workspaces with all first-party code in `packages/**`. Key areas: `packages/core` (runtime, tool adapters, prompts), `packages/cli` (Ink UI, slash commands, transport), `packages/extensions` (IDE integrations), and `packages/test-utils` (shared fixtures). Integration smoke tests live under `integration-tests/`, scripts and release tooling under `scripts/`, and design docs in `docs/` plus `ouroboros/`. Build products are written to each package’s `dist/` and the root `bundle/` directory.

## Build, Test, and Development Commands
- `npm install` — bootstrap all workspaces; rerun after dependency changes.
- `npm run build` — TypeScript + bundler pass for every package, regenerates `bundle/`.
- `npm run test` — Vitest suites across the monorepo; append `--runInBand` when debugging flaky cases.
- `npm run lint` / `npm run format` — ESLint + Prettier; use `npm run lint:fix` for quick cleanup.
- `npm run preflight` — CI-equivalent chain (clean, build, lint, typecheck, tests). Run before publishing or requesting review.

## Coding Style & Naming Conventions
Code is TypeScript-first with ES modules (`.ts` / `.tsx`). Honor the Apache 2.0 header at the top of source files. Follow Prettier defaults (two-space indent, trailing commas, single quotes) and keep imports sorted via ESLint. Use `camelCase` for variables/functions, `PascalCase` for classes and React components, and descriptive file names such as `multiAgentExecutor.ts` or `historyItemDisplay.tsx`. Avoid bypassing lint rules; prefer targeted refactors if a rule feels noisy.

## Testing Guidelines
Unit specs sit beside implementation (`*.test.ts`), while broader flows are under `integration-tests/`. When a change affects the CLI transcript renderer, add coverage in `packages/cli/src/ui/components/*.test.tsx`. Respect environment toggles: set `GEMINI_SANDBOX=false` for headless runs, and document new fixtures in `TEST_SUMMARY.md`. Target meaningful assertions and prefer table-driven tests when validating prompt permutations.

## Commit & Pull Request Guidelines
Adopt Conventional Commits (`fix(core): normalize tool arguments`). Keep commits focused, include manual verification steps, and link PRs to issues (`Fixes #123`). Update the relevant docs (`OUROBOROS.md`, `docs/architecture/*`) when behavior changes or new flags are introduced. Before requesting review, run `npm run preflight`, note any skipped steps, and attach terminal screenshots for notable CLI output changes.

## Operational Notes
Secret material never belongs in the repo; rely on `.env` or platform vaults. When editing telemetry, auth, or sandbox code paths, flag reviewers from the governance team and capture configuration updates in `docs/configuration.md`. Use `npm run build:all` to rebuild the sandbox container before exercising auto-sandbox flows.

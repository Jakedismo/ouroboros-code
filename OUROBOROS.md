# Repository Guidelines

## Project Structure & Module Organization
Ouroboros Code is a Node.js workspace targeting Node 20+, with feature areas split across `packages/*` (core engine, CLI, VS Code companion, A2A server, shared test utilities). Source lives in `packages/<name>/src`, and build outputs land in each package's `dist/` plus the root `bundle/` for the CLI. Shared scripts sit in `scripts/`, integration flows in `integration-tests/`, and docs and diagrams in `docs/` and `ouroboros/architecture`.

## Build, Test, and Development Commands
- `npm install`: install root and workspace dependencies once per toolchain change.
- `npm run build`: compile all packages and refresh `bundle/`.
- `npm run start`: execute the CLI from source via `scripts/start.js`.
- `npm run test`: run Vitest suites; `npm run test:integration:sandbox:none` skips sandbox providers.
- `npm run lint` / `npm run format`: enforce ESLint and Prettier; prefer `lint:fix` for quick cleanup.
- `npm run preflight`: mirrors CI (clean, install, format, lint, build, typecheck, tests) and should pass before release or PR hand-off.

## Coding Style & Naming Conventions
TypeScript + ES modules are standard—stick to `import`/`export`. Prettier (two-space indent, single quotes, trailing commas) and ESLint guard formatting, import order, and React hook usage; fix warnings rather than disabling rules. Name variables and functions with `camelCase`, classes/components with `PascalCase`, keep file names descriptive (e.g., `workflowProgressDisplay.tsx`), and retain the Apache 2.0 header at the top of source files.

## Testing Guidelines
Co-locate unit specs as `*.test.ts` beside the code (see `packages/cli/src/config/*.test.ts`) and run them with `npm run test`. Integration scenarios live in `integration-tests/` and respect `GEMINI_SANDBOX`; set `GEMINI_SANDBOX=false` for headless checks or supply docker/podman when validating sandbox mode. Update shared fixtures in `packages/test-utils` and note new suites in `TEST_SUMMARY.md` when behavior changes.

## Commit & Pull Request Guidelines
Use Conventional Commits (`feat(cli): add sandbox toggles`) and keep commits focused. Link every PR to an issue (`Fixes #123`), describe impact and manual verification, and run `npm run preflight` before requesting review. Include doc updates for user-facing changes (e.g., `docs/`, `OUROBOROS.md`) and add screenshots when CLI output shifts.

## Security & Configuration Tips
Build the sandbox image with `npm run build:all` when testing isolated execution, and never commit secrets—store them in `.env` or your platform vault. Coordinate with maintainers before modifying telemetry or auth logic in `packages/cli/src/config`, and document new environment knobs in `docs/configuration.md`.

## Development Practices

**CRITICAL CONSTRAINT** - Always use parallel tool calls when possible
**CRITICAL CONSTRAINT** - Always build before committing code
**CRITICAL CONSTRAINT** - Always build after a major change or milestone
**CRITICAL CONSTRAINT** - Architecture diagrams must always be produced both in SVG and interactive HTML format

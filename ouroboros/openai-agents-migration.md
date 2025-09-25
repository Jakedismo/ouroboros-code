# Migrating Ouroboros Core to Pure OpenAI Agents SDK

## Executive Summary
Ouroboros already routes most interactive flows through the OpenAI Agents SDK, yet the codebase still depends heavily on `@google/genai` types, helper utilities, and legacy execution paths. This document proposes a complete removal of Google GenAI dependencies so the CLI, IDE companion, and automation server run **exclusively** on the OpenAI Agents SDK (with optional Anthropic/Gemini support delivered through Vercel AI connectors). The end-state aligns every surface around a single abstraction layer (`UnifiedAgentsClient`), simplifying maintenance, unlocking richer tool diagnostics, and reducing bundle size.

## Current State Assessment
| Area | Observed Google/GenAI Usage |
| --- | --- |
| Core runtime (`packages/core/src/core/*`, `runtime/*`, `agents/*`) | Direct imports of `Content`, `Part`, `PartListUnion`, `FinishReason`, and helper factories from `@google/genai`. Many utilities still expect `GenerateContentResponse` shapes instead of the Agents SDK `RunStreamEvent` model. |
| Tooling layer (`packages/core/src/tools/*`) | Tool adapters produce/consume GenAI `PartUnion` structures. Dynamic MCP bindings rely on `mcpToTool` from the Google SDK. |
| CLI UI + services | Hooks (`useGeminiStream`, slash processors, tool scheduler) operate on GenAI content types, and the streaming protocol still expects Gemini-specific finish reasons. |
| A2A server & automation | `task.ts` imports GenAI parts for background execution. |
| Tests | Hundreds of unit tests mock `@google/genai` APIs to simulate turn execution, making the dependency sticky. |
| Configuration & clients | `GeminiClient`, `contentGenerator`, and `turn` classes maintain parallel code paths for GenAI.

Despite the name, the "Unified Agents" layer wraps the Agents SDK for inference, but the surrounding glue still marshals data through GenAI primitives. This is the gap we must close.

## Target Architecture
1. **Single Data Model** – Replace `Content`/`Part` types with Agents SDK equivalents (`RunItem`, `ToolCall`, `ToolResponse`, `StreamingText`) or plain JSON structures. All helper utilities (`partUtils`, `generateContentResponseUtilities`, `summarizer`, etc.) will operate on the Agents SDK payloads.
2. **Unified Tool Invocation** – Extend `toolAdapter.ts` to emit the new SDK shapes directly. Tools should consume simple POJOs (arguments/results) without detouring through GenAI-specific wrappers. MCP integration should rely on the Agents SDK tool API instead of `mcpToTool`.
3. **Config & Client Layer** – Collapse `GeminiClient`, `contentGenerator`, and related fallbacks into a single `AgentsContentClient` that encapsulates streaming, JSON schema enforcement, and provider selection. No code paths remain that instantiate `@google/genai` clients.
4. **Provider Connectors** – Continue using the Vercel AI connectors for Anthropic/Gemini, but ensure they are bootstrapped exclusively through the Agents SDK `ProviderConnectorRegistry`. Any additional provider support will plug into this extensibility point.
5. **UI & CLI Hooks** – Update all hooks to consume the normalized Agents SDK events: `text-delta`, `tool-call`, `tool-result`, `run-complete`, `error`. Remove references to Gemini-specific finish reasons, part unions, or `generateContentConfig`.
6. **Testing Strategy** – Introduce lightweight fixtures that mimic Agents SDK events. Retire all mocks/stubs referencing `@google/genai`, ensuring tests validate the new canonical payloads.

## Migration Plan
### Phase 1 – Type & Utility Refactor
- [ ] Introduce a new `AgentsTypes` module that exports shared TypeScript interfaces mirroring the SDK (`AgentMessage`, `StreamingChunk`, `ToolInvocationResult`).
- [ ] Update helper utilities (`partUtils`, `generateContentResponseUtilities`, `summarizer`, `pathReader`, etc.) to use the new types. Provide adapters that translate from the SDK run events to the simplified types.
- [ ] Deprecate `PartUnion`/`Content` usage throughout the core. Add migration shims that warn when legacy helpers are invoked.

### Phase 2 – Runtime & Tooling Alignment
- [ ] Extend `UnifiedAgentsClient` to return canonical turn events (`onText`, `onToolCall`, `onToolResult`, `onCompletion`).
- [ ] Rewrite `toolAdapter.ts`, `CoreToolScheduler`, and MCP bindings to avoid GenAI helper functions. Tool results become plain text/JSON with optional metadata for the UI.
- [ ] Remove residual imports of `@google/genai` from `multiAgentExecutor`, `conversationOrchestrator`, and the Agent selection pipeline.

### Phase 3 – Application Surfaces
- [ ] Replace `useGeminiStream`, slash processors, and prompt completion hooks with modules that consume the new event shapes.
- [ ] Update Zed integration, non-interactive CLI, and automation server to process the Agents SDK payloads.
- [ ] Provide compatibility helpers for any external extensions that expect legacy types (if necessary), with a deprecation notice.

### Phase 4 – Clean-up & Deletion
- [ ] Delete `GeminiClient`, `GeminiChat`, and any modules dedicated to `@google/genai` configuration.
- [ ] Remove the dependency from `packages/core/package.json`, `packages/cli/package.json`, and lock files. Ensure the toolchain can build without it.
- [ ] Purge remaining test doubles for GenAI and replace them with Agents SDK fixtures.

## Workstreams & Ownership
| Workstream | Modules | Primary Owner | Notes |
| --- | --- | --- | --- |
| Types & Utilities | `packages/core/src/utils/*`, `tools.ts` | Core platform team | Requires careful incremental PRs to avoid breaking tool output formatting. |
| Tool Runtime | `packages/core/src/runtime`, `tools/*`, `coreToolScheduler` | Runtime engineers | Must keep CLI tool transcripts stable to avoid UX regressions. |
| UI & CLI | `packages/cli/src/ui`, `services`, `commands` | CLI team | Coordinates with design to validate new streaming telemetry. |
| Automation & IDE | `packages/a2a-server`, `packages/cli/src/zed-integration` | Integrations team | Ensures background/IDE flows maintain feature parity. |
| Testing & QA | Entire repo | Dev Experience | Build new fixture helpers, update smoke tests to rely solely on Agents SDK. |

## Compatibility & Rollout Strategy
1. **Dual-mode Bridge (Optional)** – For the initial iterations, expose an `enableLegacyGenAi` flag (default `false`). Early adopters can disable the bridge once confident.
2. **Instrumentation** – Log provider + run metadata through Clearcut/OpenTelemetry to compare error rates between the legacy and new modes.
3. **Phased Rollout** –
   - Enable new runtime behind an environment toggle for internal testing.
   - Roll out to beta channel (CLI preview, IDE insiders).
   - Remove the toggle after stabilization and delete legacy code.

## Risk & Mitigation
| Risk | Mitigation |
| --- | --- |
| Differences in streaming semantics or finish reasons | Provide translation helpers and regression tests comparing old vs. new payloads. |
| Tool invocation regressions (output formatting, metadata) | Capture baseline CLI transcripts; assert on diff noise in CI. |
| Optional connectors (Anthropic/Gemini) diverge from expected API | Keep connector smoke tests (CI workflow + local scripts) and document install instructions in CLI output. |
| Third-party extensions expecting GenAI types | Communicate the change via release notes; if necessary, publish adapter utilities. |

## Testing & Validation
- **Unit Tests** – New fixtures for run events, tool call serialization, multi-agent orchestration.
- **Integration Tests** – Update `agents-sdk-provider-matrix` to run exclusively through Agents SDK connectors (installing optional packages on-demand).
- **Manual QA** – Use standardized prompts (including `/agents on` flows) to confirm the UI still renders tool panels, sequential orchestration, and slash command outputs correctly.
- **Performance Benchmarks** – Measure turn latency before/after migration to ensure no degradation.

## Documentation & Developer Enablement
- Update `docs/unified-agents-architecture.md`, `GEMINI.md`, CLI help, and onboarding guides to remove references to Google GenAI.
- Provide migration checklists for contributors (e.g., “Don’t import `@google/genai`; use `AgentsTypes` instead”).
- Publish release notes outlining API/SDK changes for extension developers.

## Exit Criteria
- No `@google/genai` import remains in `packages/core`, `packages/cli`, `packages/a2a-server`, or tests.
- Package manifests and lockfiles no longer list the dependency.
- Smoke tests (OpenAI, Anthropic, Gemini connectors) run successfully via the Agents SDK.
- CLI/IDE transcripts match the baseline for core scenarios (single agent, multi-agent, autonomous mode).
- Documentation reflects the new architecture and removal of legacy paths.

Once these criteria are met, Ouroboros will operate as a provider-agnostic platform entirely powered by the OpenAI Agents SDK, delivering a leaner, more maintainable codebase with consistent tooling semantics across all surfaces.

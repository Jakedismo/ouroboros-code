# Unified Agents Architecture

The Ouroboros runtime now routes every interaction through the [OpenAI Agents SDK](https://openai.com/) and the [Vercel AI SDK extension for Agents](https://openai.github.io/openai-agents-js/extensions/ai-sdk/). This document explains how the pieces fit together and how optional providers such as Anthropic Claude 4.1/Opus 4.1 and Google Gemini 2.5 connect into the system.

## Motivation
- Maintain a single execution path that works for every provider and surface (CLI, IDE companion, automation server).
- Re-use the Agents SDK tool loop so built-in Ouroboros tools keep working while gaining model-agnostic behaviour.
- Swap legacy provider SDKs for Vercel AI connectors, reducing bespoke code and duplicated telemetry hooks.

## Runtime Components
### UnifiedAgentsClient
- Owns a `ProviderConnectorRegistry` that knows how to instantiate models for supported providers (`openai`, `anthropic`, `gemini`).
- Resolves API keys via Config, CLI flags, or environment variables and injects them into the connector context.
- Converts Ouroboros conversation history into `@openai/agents` input items, streams responses, and surfaces tool-call events back to the agent loop.
- Exposes a `streamResponse` helper that normalises run events (`text-delta`, `tool-call`, `final`, `error`).

### Provider Connectors
- OpenAI connector uses the native `@openai/agents-openai` provider.
- Anthropic and Gemini connectors load `@ai-sdk/anthropic` and `@ai-sdk/google` on demand, wrap the returned language model with `AiSdkModel`, and translate missing-module errors into actionable guidance.
- Connector registry is extensible so additional providers can be registered without touching the runtime core.

### Tool Adapter
- Wraps existing `ToolRegistry` entries with the Agents SDK `tool` helper.
- Normalises argument payloads, dispatches through the existing `nonInteractiveToolExecutor`, and converts structured results back into text enforced by the runner.

### AgentsContentGenerator
- Implements the legacy `ContentGenerator` interface so the rest of the CLI can remain unchanged.
- Delegates every call to `UnifiedAgentsClient`, ensuring both streaming and non-streaming flows share the same infrastructure.
- Injects JSON-schema and MIME expectations into the system prompt when `responseJsonSchema` or `responseMimeType` is supplied, so features such as `generateJson` and agent selection keep receiving strict JSON.

## Session Lifecycle
1. Config initialises the unified runtime and stores provider/model preferences.
2. `ConversationClient.initialize` requests an `AgentsContentGenerator`; no provider-specific clients remain.
3. Each user turn constructs a `Turn` object, which calls `UnifiedAgentsClient.streamResponse` for *every* provider.
4. Stream events flow through the existing thought/content/tool event pipeline, so UI surfaces continue to behave the same way.

## Provider Configuration
To reach Anthropic or Gemini through the Agents SDK you only need optional dependencies and keys:

| Provider | Required package | Environment variable |
| --- | --- | --- |
| OpenAI | Built-in (`@openai/agents-openai`) | `OPENAI_API_KEY` |
| Anthropic | `@ai-sdk/anthropic` | `ANTHROPIC_API_KEY` |
| Google Gemini | `@ai-sdk/google` | `GEMINI_API_KEY` or `GOOGLE_API_KEY` |

```bash
npm install @ai-sdk/anthropic @ai-sdk/google
export OPENAI_API_KEY=...                # always required
export ANTHROPIC_API_KEY=...             # optional, enables Claude models
export GEMINI_API_KEY=...                # optional, enables Gemini models
```

Additional overrides (e.g. per-request keys) can be supplied through the Config API; the connector context passes `apiKey` metadata to the Agents runtime when present.

## Optional Dependencies
- When packages listed above are not installed, the associated connector throws a helpful error message but the runtime continues to function with other providers.
- The check happens at model instantiation time, so you can ship a single bundle to users and let them install only the connectors they need.

## CLI & UI Integration
- CLI commands and IDE views import the published core bundle, so they automatically use the unified runtime and its tool injections.
- Automatic agent selection and orchestration use the same `ContentGenerator` instance as interactive chat—no additional toggles or provider-specific shims are required.
- Telemetry hooks (Clearcut + console debugging) observe the same event stream for every provider because the `Turn` implementation no longer branches on provider type.

## Migration Status
- [x] Unified content generation path routed through `UnifiedAgentsClient`.
- [x] Removed legacy provider factory and per-provider SDK clients.
- [x] Added integration coverage for connector fallbacks and tool invocation via Agents.
- [x] Telemetry/metrics parity checks added for streaming + compression paths.
- [x] Manual Connector Matrix workflow runs live smoke tests when provider secrets are available.
- [ ] Broader end-to-end tests that cover multi-turn tool loops with Anthropic/Gemini connectors installed.

## TODO
1. **Docs & onboarding** – Update CLI docs to explain installing the optional Vercel AI providers and configuring `ANTHROPIC_API_KEY` / `GEMINI_API_KEY`.
2. **Connector smoke coverage** – Expand the connector matrix workflow with scripted API key rotations to exercise sandbox + proxy configurations.

## Running Live Connector Smoke Tests

The connector matrix workflow is optional and only runs when you intentionally provide provider credentials. To exercise the matrix locally:

1. Install the optional provider SDKs:

   ```bash
   npm install @ai-sdk/anthropic @ai-sdk/google
   ```

2. Export the provider keys you want to test:

   ```bash
   export OPENAI_API_KEY=sk-...
   export ANTHROPIC_API_KEY=... # optional
   export GEMINI_API_KEY=...    # optional
   ```

3. Run the smoke tests (skips providers without keys or missing SDKs):

   ```bash
   npm run test:connectors
   ```

   Set `RUN_CONNECTOR_TOOL_LOOP=true` alongside `RUN_CONNECTOR_MATRIX=true` if you want to exercise the optional multi-turn tool-loop smoke tests.

In CI, trigger `.github/workflows/connector-matrix.yml` via **Run workflow** in the Actions tab. The job automatically skips providers that do not have corresponding secrets configured.

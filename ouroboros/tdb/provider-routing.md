# Optimal Routing Design (/optimal-routing)

This document specifies the design for a new slash command, `/optimal-routing`, that routes a user’s task to the most suitable LLM and model (cloud and optionally local) using a lightweight classifier and clear heuristics. The design integrates with the existing multi‑provider architecture and slash‑command system without core refactors.

## Scope and Goals

- Add `/optimal-routing` and `/optimal-routing local` commands.
- Classify the incoming task using a cheap model and route to the optimal provider/model with a transparent rationale.
- Support a special “architecture” route that runs a triad of models in parallel and synthesizes with a dedicated synthesizer model.
- Always enable maximum thinking budgets/levels for cloud models on routed calls ("on steroids").
- Optionally include local models in routing, acknowledging their strengths (coding) and tradeoffs (slower, weaker reasoning, cheap).

## Command UX

- `/optimal-routing "question"`
  - Detects task category.
  - Selects provider/model.
  - Executes and returns result with a short routing rationale.

- `/optimal-routing local "question"`
  - Same as above, but considers local providers registered via the Extension Provider Registry.

Optional future flags:
- `--dry-run`: show route decision and rationale only.
- `--explain`: include decision factors and model metadata snapshot.
- `--force provider:model`: override routing.

## Categories and Mappings

The classifier assigns a category; routing maps that category to a target.

- large_analysis → `gemini-2.5-pro` (1M–2M context, repo‑scale analysis, multi‑tool/MCP).
- design → Claude: prefer `claude-sonnet-4-20250514` when Claude OAuth is available; otherwise `claude-opus-4-1-20250805`.
- advanced_coding (sophisticated coding/algorithms/refactors) → `gpt-5`.
- architecture → parallel triad: `gemini-2.5-pro`, `gpt-5`, `claude-opus-4-1-20250805`; synthesize with `o3`.
- other → choose best available generalist based on context size and tool usage (default to `gemini-2.5-pro` if ambiguity and long context/tools anticipated; otherwise `gpt-5`).

When `/optimal-routing local` is used, routing may instead select a suitable local model (see Local Models below), with a note about latency/quality tradeoffs.

## Classifier Selection and Fallbacks

The classifier is a short, cheap prompt with no tools, small token budget.

Classifier model selection order:
1) `gpt-5-nano` if OpenAI key present.
2) If OpenAI key missing: `claude-haiku-3-5-latest` if Anthropic credentials (API key or OAuth) are available.
3) If neither OpenAI nor Anthropic is available: `gemini-2.5-flash`.
4) Final fallback: heuristic rules (keywords + length + repository signals) when no cloud keys exist.

Classifier output schema:
```json
{
  "category": "large_analysis | design | advanced_coding | architecture | other",
  "confidence": 0.0-1.0,
  "signals": ["keywords, length, repo_size, tools_needed, etc."],
  "notes": "short rationale"
}
```

## Thinking “On Steroids”

All cloud provider calls from `/optimal-routing` explicitly enable maximum thinking capabilities regardless of global config:
- Gemini: `thinkingBudget: -1` and `includeThoughts: true` (streamed thoughts supported).
- OpenAI: `reasoning_effort: 'high'` (thoughts not streamed).
- Anthropic: `budget_tokens: 64000` (thoughts streamed when supported).

These are injected at call time using provider converters; they do not require global flags.

## Execution Flows

### A. Single‑Provider Flow (large_analysis | design | advanced_coding | other)
1) Save original provider/model from `Config`.
2) Select classifier model (per above) and classify.
3) Pick target route per mapping and environment (keys, OAuth).
4) Set provider/model (or call directly) and execute with max thinking.
5) Restore original provider/model.
6) Print header with: chosen provider/model, category, brief rationale, any tradeoffs (e.g., local selection).

### B. Architecture Flow
1) Run parallel generation with `MultiProviderOrchestrator` for:
   - `gemini-2.5-pro`, `gpt-5`, `claude-opus-4-1-20250805`.
2) Collect outputs + latency/usage.
3) Switch to OpenAI and synthesize with `o3` into a unified architecture response (sections: overview, components, tradeoffs, risks, decisions, alternatives).
4) Include an appendix with provider highlights and timing (lean, similar to `/converge`).
5) Restore original provider/model.

## Local Models

- Discovery: use `ExtensionProviderRegistry.getInstance().getAllProviders()`; filter providers with `type: 'local'`.
- Capabilities: use each provider’s `capabilities` and `defaultModel` to ensure minimum requirements (context window, tools if needed).
- Heuristics to prefer local:
  - Category ∈ {advanced_coding, other} and query is short/medium; limited tool use expected.
  - Budget-aware users (future flag) or explicit `/optimal-routing local` intent.
- Caveat surfaced to user: “Local models are strong at coding but slower and weaker at reasoning; chosen for cost/latency tradeoff.”

## Model and Provider Metadata Snapshot

The following reflects the configured defaults and capabilities in the codebase. Values are representative maxima by provider (some are model‑specific in practice):

- Gemini
  - Primary models: `gemini-2.5-pro` (context ~2M), `gemini-2.5-flash` (context ~1M, faster).
  - Capabilities: streaming, tools, function calling, vision, embedding.
  - Thinking: dynamic `thinkingBudget` with streamed thoughts.

- OpenAI
  - Primary models: `gpt-5` (context ~256k), `gpt-5-nano` (classifier), `o3` (synthesis, ~128k context typical).
  - Capabilities: streaming, tools, function calling, vision, embedding.
  - Thinking: `reasoning_effort: 'high'` (non‑streamed reasoning traces).

- Anthropic
  - Primary models: `claude-opus-4-1-20250805` (context ~500k), `claude-sonnet-4-20250514` (context ~500k), `claude-haiku-3-5-latest` (classifier fallback).
  - Capabilities: streaming, tools, function calling, vision; embeddings not supported.
  - Thinking: streamed thoughts with `budget_tokens` up to 64k.

- Local (extensions)
  - Strengths: coding tasks.
  - Tradeoffs: slower generation, weaker reasoning, cheap to run.
  - Capabilities/context: declared per extension provider (`capabilities`), used as constraints during routing.

## Integration Points

- Command file: `packages/cli/src/ui/commands/optimalRoutingCommand.ts` (new)
  - Parse args (`local` token + quoted prompt).
  - Inspect environment: OpenAI/Anthropic keys, Claude OAuth (`config.getClaudeUseOauth()` and tokens).
  - Temporarily switch to classifier model (per fallback order) for classification.
  - Execute chosen route (single or architecture triad) with explicit thinking configs.
  - Restore original provider/model.
  - Return either an info message with the result or a `SubmitPromptActionReturn` to hand off to normal generation under selected provider.

- Loader: add to `BuiltinCommandLoader` alongside existing commands (e.g., `/blindspot`, `/converge`).

- Orchestration: reuse `MultiProviderOrchestrator` for the architecture triad, then synthesize with `o3`.

## Pseudocode (Decision Core)

```
if args.startsWith('local'): considerLocal = true

classifierModel =
  hasOpenAI ? 'gpt-5-nano' :
  hasAnthropic ? 'claude-haiku-3-5-latest' :
  hasGemini ? 'gemini-2.5-flash' : null

category = classifierModel ? classify(question) : heuristicClassify(question)

switch category:
  large_analysis -> target = { provider: 'gemini', model: 'gemini-2.5-pro' }
  design -> target = anthropicOAuth ?
              { provider: 'anthropic', model: 'claude-sonnet-4-20250514' } :
              { provider: 'anthropic', model: 'claude-opus-4-1-20250805' }
  advanced_coding -> target = { provider: 'openai', model: 'gpt-5' }
  architecture -> target = parallel([gemini-2.5-pro, gpt-5, claude-opus-4-1-20250805])
  other -> target = chooseByContextAndTools(default='gemini-2.5-pro', alt='gpt-5')

if considerLocal:
  localCandidate = bestLocalProviderThatMeetsRequirements()
  if localCandidate and category in {advanced_coding, other}:
    target = localCandidate

execute target with max thinking settings
```

## Error Handling and Fallbacks

- Classifier model availability:
  - Try `gpt-5-nano` → `claude-haiku-3-5-latest` → `gemini-2.5-flash` → heuristic.
- Missing provider/model or auth errors:
  - Use `LLMProviderFactory.createWithFallback` where helpful; otherwise downgrade target to next best available.
- Synthesis (`o3`) unavailable:
  - Prefer Gemini or Claude for synthesis (whichever is available), else emit a concise consensus summary.
- All providers unavailable:
  - Emit an actionable error message listing missing credentials and how to configure them.

## Observability

- Log a compact routing record to the UI:
  - Category, chosen model, key signals (e.g., “long context”, “design keywords”, “architecture requested”).
  - Whether local was included and selected.
  - For triad runs: per‑provider latency summary.

## Testing Strategy

- Unit tests (command action):
  - Classifier selection order driven by env keys (OpenAI → Anthropic → Gemini → heuristic).
  - OAuth toggling Sonnet vs Opus in design route.
  - Local inclusion path chooses a local provider only when constraints fit.
  - Architecture triad orchestration + synthesis path.
  - Thinking configs are injected regardless of global `enableThinking`.

- Integration tests:
  - Mirror `/converge` and `/blindspot` patterns: provider switch/restore, messages contain route rationale, error states are clear.

## Consistency Notes

- Anthropic model IDs used in routing are standardized to:
  - `claude-opus-4-1-20250805` and `claude-sonnet-4-20250514`.
- The classifier fallback adds `claude-haiku-3-5-latest` between OpenAI and Gemini.
- Keep `/model` and `/switch` help/completions aligned with these IDs to avoid user confusion.

---

Author: Multi‑LLM provider integration design
Status: Proposed (no core code changes required)
Applies to: CLI commands and provider orchestration only


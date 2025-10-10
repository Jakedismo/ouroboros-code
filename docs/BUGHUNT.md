# Tool Execution Bug Hunt Report

This document summarizes issues discovered while investigating the duplicated tool execution output in the terminal UI.

## Findings

### 1. Pending tool groups are rendered twice (Critical)
* **Problem**: Tool approvals add a temporary history item via `setPendingHistoryItem`, while `pendingHistoryItems` also injects the scheduler-driven tool group state. When both are present (e.g., during confirmation), the same tool call renders twice in the TUI.【F:packages/cli/src/ui/hooks/useGeminiStream.ts†L899-L909】【F:packages/cli/src/ui/hooks/useGeminiStream.ts†L1678-L1681】【F:packages/cli/src/ui/hooks/useGeminiStream.ts†L172-L175】
* **Impact**: Every confirming or executing tool appears twice, cluttering the conversation and confusing approval prompts.
* **Fix plan**: Deduplicate pending tool entries—prefer the scheduler-sourced group when available and suppress the manual `pendingHistoryItemRef`, or merge them before rendering.

### 2. Clearing chat history drops future tool results (High)
* **Problem**: Completed tool groups reuse `toolHistoryEntryRef` entries to update existing history rows. Clearing the chat via `/clear` removes the history but does not reset that map, so subsequent tool completions attempt to update non-existent items and never render.【F:packages/cli/src/ui/hooks/useGeminiStream.ts†L1472-L1487】【F:packages/cli/src/ui/hooks/useGeminiStream.ts†L1160-L1169】【F:packages/cli/src/ui/hooks/slashCommandProcessor.ts†L164-L177】
* **Impact**: If users clear the screen while tools run, all pending tool outputs disappear permanently once they finish.
* **Fix plan**: Reset `toolHistoryEntryRef` (and related state such as `processedCompletionCallIdsRef`) whenever history is cleared or reloaded.

### 3. Tool continuations marked delivered before success (Critical)
* **Problem**: `markToolsAsSubmitted` runs before `submitQuery` completes. If the continuation call fails, the UI still believes the responses were delivered and stops tracking them.【F:packages/cli/src/ui/hooks/useGeminiStream.ts†L1607-L1655】
* **Impact**: Failed continuations leave Gemini unaware of tool results, yet the UI stops retrying or highlighting them, breaking the conversation.
* **Fix plan**: Move the `markToolsAsSubmitted` call after a successful continuation (or roll it back in the `catch` path) and surface a retry mechanism.

### 4. Multi-agent prompt routing is incorrect (High)
* **Problem**: When several tool calls finish together, the continuation request only forwards `prompt_ids[0]`, discarding the rest. Mixed prompt batches therefore respond under the wrong thread or not at all.【F:packages/cli/src/ui/hooks/useGeminiStream.ts†L1615-L1652】
* **Impact**: Multi-agent sessions can stall or misattribute tool results, leading to repeated tool execution prompts.
* **Fix plan**: Either require and assert a single `prompt_id` per continuation batch or loop over tool calls to send per-prompt continuations.

### 5. Failed continuations leak reasoning context (Medium)
* **Problem**: On continuation failure the reasoning buffer is never cleared, so stale thoughts are prepended to the next tool submission attempt.【F:packages/cli/src/ui/hooks/useGeminiStream.ts†L1654-L1665】
* **Impact**: Subsequent turns may resubmit outdated reasoning, compounding the duplication bug and confusing the model.
* **Fix plan**: Clear `reasoningItemsRef` (and undo any submitted-call bookkeeping) inside the error handler before surfacing the failure.

### 6. Scheduler can deadlock after UI handler exceptions (Critical)
* **Problem**: `CoreToolScheduler.checkAndNotifyCompletion` sets `isFinalizingToolCalls` to true before awaiting UI callbacks but never resets it if an exception bubbles up. Because `isRunning` consults that flag, the scheduler refuses to run any further tool calls.【F:packages/core/src/core/coreToolScheduler.ts†L576-L583】【F:packages/core/src/core/coreToolScheduler.ts†L1088-L1107】
* **Impact**: Any error inside the CLI’s completion handler leaves the scheduler wedged, making every subsequent tool call queue forever.
* **Fix plan**: Wrap the callback in `try/finally` (or `try/catch`) to guarantee the flag is cleared and queued work resumes even after failures.

## Next Steps
1. Prioritize a fix for Findings 1–4 and 6; they directly affect active sessions and can strand users.
2. Add regression coverage around tool continuation flows and history clearing to catch similar issues early.
3. Once the hotfixes land, re-test the TUI to confirm tool executions render once and continuations recover from transient errors.

# Agents Feature Bug Hunt Report

This section captures issues uncovered while reviewing the `/agents` feature set, including the system prompt manager, automatic agent selection, and the tool/example injection pipeline.

## Findings

### 1. Agent activation drops the base system prompt (Critical)
* **Problem**: `AgentManager.initialize` caches the "base" prompt via `config.getSystemPrompt()`, but that accessor only returns the *custom* agent prompt override (default `''`). Because the CLI wires the manager before `config.initialize()`, the cached value remains empty, so every activation builds a prompt that omits the repository’s foundational guardrails and instructions.【F:packages/core/src/agents/agentManager.ts†L32-L46】【F:packages/cli/src/gemini.tsx†L229-L236】【F:packages/core/src/config/config.ts†L613-L621】 Downstream, the prompt compositor only swaps in the agent prompt when it contains the “ACTIVE SPECIALIST AGENTS” banner, meaning the agents run with the stripped prompt once activated.【F:packages/core/src/core/prompts.ts†L313-L323】
* **Impact**: Activating any agent erases safety constraints, tool policies, and reasoning scaffolding from the live system prompt, increasing the risk of misbehavior and degrading plan quality.
* **Fix plan**: Capture the real base prompt *after* `config.initialize()` (e.g., by calling into the prompt builder) and store it separately from the mutable override. When no agents are active, clear the override instead of setting an empty string so the default prompt flows through automatically.

### 2. Tool instructions balloon per agent (High)
* **Problem**: `AgentManager.formatAgentPrompt` runs `injectToolExamples` for every active persona, and that helper appends the full core tooling playbook plus slash command appendix each time.【F:packages/core/src/agents/agentManager.ts†L190-L202】【F:packages/core/src/agents/toolInjector.ts†L188-L206】 With three specialists, the same 200+ lines repeat three times.
* **Impact**: The orchestrator prompt explodes quadratically with the number of agents, wasting context window tokens, raising latency, and increasing the chance models truncate instructions mid-run.
* **Fix plan**: Split tool guidance from persona knowledge. Keep persona-specific expertise in each section but inject the shared tool appendix once (e.g., at the top-level prompt) or reference a single shared anchor.

### 3. Slash command guidance references nonexistent commands (Medium)
* **Problem**: The injected command list advertises `/analyze`, `/testgen`, `/thinkdeep`, and other commands that the CLI never registers—only the built-in set from `BuiltinCommandLoader` is available.【F:packages/core/src/agents/toolInjector.ts†L151-L179】【F:packages/cli/src/services/BuiltinCommandLoader.ts†L37-L82】
* **Impact**: Specialists attempt to call slash commands that the UI cannot parse, producing confusing errors or idle retries instead of progressing on the user’s request.
* **Fix plan**: Either implement the advertised commands or, more feasibly, tailor the injected list to the actual command registry by querying the loader/registry at runtime.

### 4. Tool appendix ignores feature gating (Medium)
* **Problem**: The injection helper unconditionally claims that hosted web search, memory, and other tools are available, even when the runtime disables them via `isToolEnabled` or provider checks.【F:packages/core/src/agents/toolInjector.ts†L188-L206】【F:packages/core/src/agents/multiAgentExecutor.ts†L404-L458】
* **Impact**: Agents confidently call disabled tools and receive execution failures, derailing their plans and consuming approval cycles.
* **Fix plan**: Thread the active `Config` (or a capability manifest) into the injector so it only documents tools that remain enabled for the current session and provider.

### 5. Agent selection prompt gives contradictory instructions (High)
* **Problem**: The dispatcher system prompt demands “three to ten” agent IDs, while the user input template stresses “select the 1–3 most appropriate specialists,” and the validator clamps any larger selection back to three.【F:packages/core/src/agents/agentSelectorService.ts†L343-L347】【F:packages/core/src/agents/agentSelectorService.ts†L517-L579】
* **Impact**: Models oscillate between over- and under-selecting specialists, often padding results with generic fallbacks instead of the best-fit roster.
* **Fix plan**: Align the instructions and validator—decide on the desired team size (e.g., 2–4) and enforce it consistently in both prompts and post-processing. Adjust examples to match.

## Prompt & Persona Recommendations
* Refresh persona prompts once the systemic fixes land so each specialist highlights decision boundaries, collaboration etiquette, and escalation triggers that mesh with the orchestrator.
* Introduce lightweight behavioral nudges (e.g., “surface key evidence in bullet form”) in personas that routinely produce verbose prose to keep outputs compact for downstream summarization.

## Next Steps
1. Fix Findings 1–5 before widening `/agents` availability; they directly affect safety, reliability, and prompt costs.
2. Add regression coverage that snapshots the synthesized system prompt so we can detect missing base instructions or duplicate tool sections during CI.
3. After the structural fixes, run a focused prompt-engineering pass on high-traffic personas (architect, code-quality, Node.js) to ensure their guidance complements the streamlined tooling section.

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

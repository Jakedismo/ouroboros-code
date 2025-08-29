# Vision Quest (/saga): Narrator → Sage → CodePress

A multi‑phase, provider‑agnostic, end‑to‑end development flow for ouroboros‑code. The /saga command guides a user from natural‑language specification to a validated implementation, with transparent design, rigorous execution, and safe persistence.

## 1) Goals

- Turn natural‑language intent into a structured Design Document (DD) with clear deliverables, constraints, and acceptance criteria.
- Automate development against the DD until hard, language‑specific success criteria are met.
- Provide a first‑class Ink.js TUI for review, edits, diffs, and acceptance.
- Keep changes ephemeral until user acceptance; persist only after approval.
- Leverage multiple providers for stronger design (cross‑analysis + synthesis).

## 2) Phases and State Machine

- Narrator (Design) → Sage (Action) → CodePress (Review/Commit)
- States: idle → narrating → design_ready → editing → awaiting_approval_design → sage_running → results_ready → review_diffs → awaiting_approval_changes → persist_or_discard → done
- Transitions are event‑driven; each state reports progress and stats.

## 3) Provider Strategy and Prompts

### 3.1 Model Selection

- Design (Narrator, parallel fan‑out):
  - Run the same system prompt (Narrator prompt) concurrently on top models: `gpt-5`, `claude-opus-4-1-20250805`, `gemini-2.5-pro` (only those available).
  - Thinking “on steroids” enabled per provider: OpenAI `reasoning_effort:'high'`; Anthropic `budget_tokens:64000`; Gemini `thinkingBudget:-1` with streamed thoughts.
- Synthesis (Design Arbiter):
  - Aggregate with `claude-opus-4-1-20250805` if available; else `gpt-5`; else `gemini-2.5-pro`; else local (Ollama) as last resort.
- Action (Sage, automated coding):
  - Provider order preference: `gpt-5` → `claude-sonnet-4-20250514` (aka sonnet‑4) → `gemini-2.5-pro`.
  - If `claude-sonnet-4-1-2025085` is specified in environment, alias it to `claude-sonnet-4-20250514` to avoid ID mismatches.

### 3.2 Prompt Families (rewritten for ouroboros‑code)

- Narrator (design prompt outline):
  - Role: Ouroboros Narrator. Convert user intent into a precise Design Document tailored to this repository.
  - Include: problem context, scope, non‑goals, architecture outline, modules/components, file changes (new/modified/removed), data flow, external deps, APIs/CLI contracts, UX/TUI screens (if relevant), migration plan, testing strategy, acceptance criteria, metrics of success, risks + mitigations, rollout steps.
  - Output: one Markdown DD with a top summary; headings and checklists for acceptance.
  - Adhere to repository conventions (detected by reading package.json, tsconfig, linters, scripts, folder structure). Use MCP/built‑in tools where needed.

- Arbiter (design synthesis prompt outline):
  - Role: Ouroboros Arbiter. Compare multiple Narrator drafts (by provider). Identify conflicts, merge strengths, remove contradictions, and produce a single coherent DD. Resolve disagreements and note decisions succinctly in a “Design Decisions” section.

- Sage (action prompt outline):
  - Role: Ouroboros Sage. Implement the DD end‑to‑end using available tools (read/write files, run shell, install deps if permitted). Iterate until success criteria are met. Never persist to the main workspace until CodePress approval.
  - Must: compile/build passes; TypeScript projects have zero `tsc` errors; lint passes (or auto‑fix and re‑lint); tests pass (if present); docs generated (if part of DD); code matches DD; no stray files; updated docs referenced in README/navigation.
  - Produce: a clean patch set suitable for review; a short change log; how to run; and a verification report mapping DD acceptance criteria to concrete checks.

## 4) Success Criteria (Hard Gates)

- TypeScript repos:
  - `tsc --noEmit` returns 0.
  - Lint passes (e.g., `npm run lint` or detected ESLint config; otherwise `npx oxlint` if configured).
  - Tests pass (`npm test`, `pnpm test`, or `vitest` if present).
  - No untracked or unnecessary files; package.json/lock updated if deps added.
- Other languages:
  - Python: `ruff` (if detected) or `flake8`; `pytest` if present.
  - Go: `go vet`, `go test ./...`.
- Always: implementation aligns with DD; docs updated if DD demands; CI scripts updated if required.

If criteria cannot be met, Sage must continue iterating or explicitly request user input.

## 5) Storage & Persistence

- Design Documents: `.ouroboros/saga/<slugified-user-prompt>.md` (plus `.json` metadata with provider votes, synthesis notes, timing, model stats).
- Ephemeral work area:
  - If git is available: create a temporary worktree/branch (e.g., `saga/<slug>-<timestamp>`). All file edits happen there. Tests/lint/build run there. On acceptance, merge/apply patch to main.
  - If git not available: create a shadow copy under `.ouroboros/saga/tmp/<session-id>` and run all operations there; on acceptance, compute diff and apply patch to main workspace.
- Nothing is persisted to main until CodePress approval.

## 6) Ink.js TUI: Layouts and Interactions

### 6.1 Main Saga Frame

```
┌─ Vision Quest — /saga ──────────────────────────────────────────────┐
│ Project: <repo-name>          Branch: <name>      Provider: <auto> │
│ Phase: Narrator ▷ Sage ▷ CodePress                                   │
├─────────────────────────────────────────────────────────────────────┤
│ [Narrator] Generating design… (fan‑out to top models)               │
│  • gpt‑5       ✓ complete (12.3s)                                   │
│  • opus‑4‑1    ✓ complete (11.1s)                                   │
│  • gemini‑2.5  ✓ complete (10.8s)                                   │
│ [Arbiter] Synthesizing… using opus‑4‑1 (fallback: gpt‑5 → gemini)    │
├─────────────────────────────────────────────────────────────────────┤
│ [Design Document] (scrollable, editable)                             │
│  # Feature: <title>                                                  │
│  …                                                                   │
│                                                                      │
│  (↑↓ to scroll • E to edit • O open in $EDITOR • A accept • R revise)│
└──────────────────────────────────────────────────────────────────────┘
```

### 6.2 Design Editor (Inline)

```
┌─ Edit Design Document — Inline Editor ───────────────────────────────┐
│ (ESC to exit • CTRL+S save changes • CTRL+Z discard)                 │
│                                                                      │
│  ## Scope                                                            │
│  - …                                                                 │
│                                                                      │
│  ## Acceptance Criteria                                              │
│  - …                                                                 │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 6.3 Sage Progress (Action Phase)

```
┌─ Sage: Automated Implementation ─────────────────────────────────────┐
│ Plan: <DD title>                                                     │
│ Iteration: 3   Time: 02:13                                           │
├────────────────┬───────────────────────────┬─────────────────────────┤
│ Tasks          │ Live Logs                  │ Success Gates           │
│ • Create files │ $ tsc --noEmit             │ [ ] tsc clean           │
│ • Update docs  │ $ npm run lint --fix       │ [ ] lint clean          │
│ • Add tests    │ $ npm test                 │ [ ] tests passing       │
│ • Wire scripts │ …                          │ [ ] docs updated        │
├────────────────┴───────────────────────────┴─────────────────────────┤
│ (P pause • L logs • V view patch • S stop & review)                  │
└──────────────────────────────────────────────────────────────────────┘
```

### 6.4 CodePress Review (Diffs + Summary)

```
┌─ CodePress: Review Changes ──────────────────────────────────────────┐
│ Summary: 12 files changed • 3 added • 2 removed • 1 doc generated    │
├───────────────┬──────────────────────────────────────────────────────┤
│ Files         │ Diff Preview                                         │
│  ✓ src/x.ts   │ --- a/src/x.ts                                       │
│  ✓ src/y.ts   │ +++ b/src/y.ts                                       │
│  □ README.md  │ @@ -1,3 +1,7 @@                                     │
│  ✓ tests/a.ts │ …                                                    │
├───────────────┴──────────────────────────────────────────────────────┤
│ (ENTER toggle • D view full diff • A accept • R revise • X discard)  │
└──────────────────────────────────────────────────────────────────────┘
```

### 6.5 Finalization

```
┌─ Persist Changes? ───────────────────────────────────────────────────┐
│ Provider: gpt‑5  Model stats: 34.2k tokens • 4 calls • 00:02:13      │
│ Build: ✓ tsc • ✓ lint • ✓ tests • Docs: ✓ Added                      │
│ Commit message: "feat: implement <DD title>"                         │
│ (Y)es persist  (N)o discard  (E)dit message  (C)opy patch            │
└──────────────────────────────────────────────────────────────────────┘
```

## 7) Command Contract

- `/saga "<goal>"` — start a new vision quest.
- Options (future): `--provider <id>`, `--dry-run`, `--no-tests`, `--no-lint`, `--max-iterations N`, `--open-editor`.
- Design docs stored under `.ouroboros/saga/` with slugified name and timestamp.

## 8) Implementation Plan

### 8.1 CLI (packages/cli)

- Command: `ui/commands/sagaCommand.ts` with actions:
  - Parse input; create SagaSession; render TUI with Ink.
  - Drive state machine; persist design doc; handle acceptance/revision.
  - On acceptance, trigger Sage; stream progress; enforce gates; capture patch.
  - On final acceptance, persist patch to main workspace (via GitService or patch applier).
- Services:
  - `SagaService`: orchestrates phases; uses MultiProviderOrchestrator for Narrator; uses provider factory for Arbiter and Sage; manages ephemeral workspace (worktree/shadow copy); collects stats; enforces gates.
  - `PatchManager`: compute/apply patch (git or file diff). Provide export and copy.
  - `CheckRunner`: runs `tsc`, `lint`, `test` with discovery heuristics and timeouts. Returns structured results.
- Components (Ink):
  - `SagaFrame`, `DesignViewer`, `InlineEditor`, `SageProgress`, `CodePressReview`, `FinalizeDialog`.
- Config:
  - `saga` block in Config (CLI layer):
    - `maxIterations`, `tsCheckCommand`, `lintCommand`, `testCommand`, `buildCommand`, `allowInstall`, `worktreeEnabled`, `timeoutMs`.
- Telemetry: reuse session stats + add per‑phase counters (time, tokens, model calls, errors).

### 8.2 Core (packages/core)

- Reuse existing `MultiProviderOrchestrator` for parallel Narrator calls.
- Use provider converters to set thinking config per call.
- Tooling: use unified tool interface + MCP/ builtin tools for file operations and shell execution.
- No breaking changes required; optional: expose a patch utility and worktree helper (if useful across features).

### 8.3 Storage

- `.ouroboros/saga/<slug>.md` (Markdown DD)
- `.ouroboros/saga/<slug>.json` (metadata: models used, timings, votes, synthesis notes)
- `.ouroboros/saga/tmp/<session-id>/` (work dir if not using git worktree)

### 8.4 Provider Orchestration Details

- Narrator fan‑out: orchestrator.executeParallel(request, [openai, anthropic, gemini]) for available providers; collect unified responses.
- Arbiter: choose `claude-opus-4-1-20250805` else fallback order; run synthesis prompt with inputs from Narrator; output a single DD.
- Sage: choose provider order; pass DD + repository context; enable tools; enforce thinking; iterate until gates satisfied or max iterations reached.

## 9) Editing & Revision Loop

- In TUI, user can:
  - Edit DD inline or open in $EDITOR.
  - Ask for changes (sends a change request to Narrator/Arbiter prompt to update DD).
  - Accept DD to proceed.
- After Sage phase:
  - Review diffs and summary.
  - Accept to persist (apply patch/merge); or discard (keep only `.md/.json`).

## 10) Safety, Approvals, and Sandboxing

- Requires trusted folder or explicit confirmation to run shell commands and install deps.
- Unified confirmation manager flags dangerous commands (rm, chmod, networking). SagaService must request approval where needed.
- Worktree/shadow copy prevents accidental corruption of main workspace.

## 11) How to Start Developing

1) Command skeleton
   - Add `sagaCommand.ts`; register in `BuiltinCommandLoader`.
   - Wire a `SagaService` with state machine and event emitters.
2) Ink components
   - Build `SagaFrame` scaffold; stub subviews with fake data.
   - Implement `DesignViewer` + `InlineEditor` first (read `.ouroboros/saga/*.md`).
3) Narrator/Arbiter plumbing
   - Use `MultiProviderOrchestrator` for fan‑out.
   - Add synthesis step via preferred aggregator provider.
   - Write prompt templates (TS files) with placeholders (repo context, goals, acceptance scaffolds).
4) Persist design docs
   - Implement slugify(name) + timestamp.
   - Save `.md` + `.json` with provider metadata.
5) Sage loop
   - Implement `CheckRunner` (tsc/lint/test discovery).
   - Implement ephemeral workspace (git worktree helper + shadow fallback).
   - Implement patch computation (git diff or js diff lib) and application.
   - Add “iterate until gates pass or max iterations” control.
6) CodePress review
   - Implement diff listing and preview; accept/reject logic; commit/merge if accepted.
7) Tests
   - Unit tests for slugify, CheckRunner, PatchManager.
   - Integration tests with a tiny TypeScript sample project.
8) Docs
   - Add `/saga` to CLI help; link to `.ouroboros/saga` storage; describe safety and approvals.

## 12) Appendix: Prompt Skeletons (summarized)

- Narrator: “You are Ouroboros Narrator. Produce a single Markdown Design Document… [sections] … Use repository conventions … Include acceptance criteria checklists …”
- Arbiter: “You are Ouroboros Arbiter. Merge and reconcile multiple designs … produce coherent final DD … capture decisions and trade‑offs …”
- Sage: “You are Ouroboros Sage. Implement the DD end‑to‑end using tools … iterate until success gates pass … do not persist to main until approved … produce verification report mapping acceptance criteria to checks …”

---

Status: Proposed design
Author: ouroboros‑code core


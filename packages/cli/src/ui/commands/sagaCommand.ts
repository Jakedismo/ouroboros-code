/**
 * @license
 * Copyright 2025 Ouroboros
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, SlashCommand, MessageActionReturn } from './types.js';
import { MultiProviderOrchestrator, LLMProvider, SubAgentScope, ContextState } from '@ouroboros/code-cli-core';
import * as React from 'react';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

/**
 * /saga command - Vision Quest end-to-end (Narrator → Sage → CodePress)
 *
 * Minimal initial implementation:
 * - Design phase (Narrator): fan-out to available providers and synthesize a DD.
 * - Write design doc to .ouroboros/saga/<slug>.md
 * - Print next-step guidance for action/review phases (to be expanded).
 */
export const sagaCommand: SlashCommand = {
  name: 'saga',
  description: 'Run Vision Quest (Narrator → Sage → CodePress) end-to-end',
  kind: CommandKind.BUILT_IN,

  action: async (context, args): Promise<void | MessageActionReturn> => {
    const { config } = context.services;
    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Configuration not available.',
      };
    }

    const userQuery = args.trim();

    // Subcommands: action | review | accept | discard
    const tokens = userQuery.split(/\s+/).filter(Boolean);
    const sub = tokens[0]?.toLowerCase();

    if (!userQuery) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Usage: /saga "<goal or feature idea>"',
      };
    }

  if (sub === 'action') {
      return await runSagaAction(context, tokens.slice(1).join(' '));
    }
    if (sub === 'action-tui') {
      return await runSagaActionTui(context, tokens.slice(1).join(' '));
    }
  if (sub === 'review') {
      return await runSagaReview(context);
    }
    if (sub === 'review-tui') {
      return await runSagaReviewTui(context);
    }
    if (sub === 'accept') {
      return await runSagaAccept(context);
    }
    if (sub === 'discard') {
      return await runSagaDiscard(context);
    }

    // Prepare orchestrator
    const orchestrator = new MultiProviderOrchestrator({
      providers: [LLMProvider.GEMINI, LLMProvider.OPENAI, LLMProvider.ANTHROPIC],
      configInstance: config,
      parallelExecution: true,
    });

    // System instruction for Narrator (compact). The full prompt lives in agent config.
    const systemInstruction = [
      '# Ouroboros Narrator — Background Design Agent',
      'Follow <user_query>. Produce a concise Markdown design doc. No "Summary" section inside the doc.',
      'Use modeling (UML/flowcharts/Mermaid) over code. Keep ≤800 lines. Repository conventions apply.',
      'Prefer parallel reads/inspects; do not mention tools. Design file target: .ouroboros/saga/{designFileName}.md',
    ].join('\n');

    try {
      // 1) Narrator fan-out
      await orchestrator.initialize();
      const designRequest = {
        messages: [
          { role: 'user', content: userQuery },
        ],
        systemInstruction,
        temperature: 0.2,
        maxTokens: 2048,
      };
      const fanout = await orchestrator.executeParallel(designRequest);

      // Collect drafts
      const drafts = fanout
        .filter(r => !r.error && r.response)
        .map(r => `## Draft from ${r.provider}\n\n${r.response!.content}`);

      if (drafts.length === 0) {
        return {
          type: 'message',
          messageType: 'error',
          content: '❌ No design drafts could be generated from any provider.',
        };
      }

      // 2) Synthesis (Arbiter)
      const arbiterInstruction = [
        '# Ouroboros Arbiter — Design Synthesis',
        'Merge drafts into a single coherent design doc with the required structure. No "Summary" section. Keep concise; modeling over code.',
      ].join('\n');

      const synthesisInput = [
        'You are given multiple design drafts. Merge them into a single consistent Design Document.\n',
        ...drafts,
      ].join('\n\n');

      // Prefer Anthropic → OpenAI → Gemini as arbiter
      const arbiterOrder = [LLMProvider.ANTHROPIC, LLMProvider.OPENAI, LLMProvider.GEMINI];
      let synthesized = '';
      for (const p of arbiterOrder) {
        try {
          const res = await orchestrator.queryProvider(p, {
            messages: [ { role: 'user', content: synthesisInput } ],
            systemInstruction: arbiterInstruction,
            temperature: 0.2,
            maxTokens: 4096,
          });
          if (res.response?.content) {
            synthesized = res.response.content;
            break;
          }
        } catch {}
      }

      if (!synthesized) {
        synthesized = drafts.join('\n\n'); // fallback: concatenate
      }

      // 3) Write design doc
      const sagaDir = path.join(config.getProjectRoot?.() || config.getTargetDir?.() || process.cwd(), '.ouroboros', 'saga');
      await fs.mkdir(sagaDir, { recursive: true });

      const slug = userQuery.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'design';
      const designFilePath = path.join(sagaDir, `${slug}.md`);
      await fs.writeFile(designFilePath, synthesized, 'utf-8');

      // Store last-run metadata
      const meta = { slug, designFilePath, time: Date.now() };
      await fs.writeFile(path.join(sagaDir, 'last-run.json'), JSON.stringify(meta, null, 2), 'utf-8');

      const summary = [
        `✅ Design document created: ${path.relative(process.cwd(), designFilePath)}`,
        `• Drafts: ${drafts.length}  • Arbiter: ${synthesized === drafts.join('\n\n') ? 'fallback' : 'selected'}`,
        'Next: implement with /saga action, then /saga review to inspect diffs, and /saga accept or /saga discard.',
      ].join('\n');

      return {
        type: 'message',
        messageType: 'info',
        content: summary,
      };
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: `❌ /saga failed: ${(error as Error).message}`,
      };
    }
  },
};

// ----------------- Sage Action / Review / Accept / Discard -----------------

import { spawn } from 'node:child_process';

async function runSagaAction(context: CommandContext, rest: string): Promise<MessageActionReturn> {
  const { config } = context.services;
  if (!config) {
    return { type: 'message', messageType: 'error', content: 'Configuration not available.' };
  }

  // Snapshot current state via GitService (shadow repo)
  const git = await config.getGitService();
  const startHash = await git.createFileSnapshot('saga-start');

  // 0) Attempt non-interactive Sage subagent to implement the design doc
  try {
    // Load last design slug if available to hint subagent
    const projectRoot = config.getProjectRoot?.() || config.getTargetDir?.() || process.cwd();
    const sagaDir = path.join(projectRoot, '.ouroboros', 'saga');
    let designPathHint = '';
    try {
      const lr = JSON.parse(await fs.readFile(path.join(sagaDir, 'last-run.json'), 'utf-8'));
      designPathHint = lr.designFilePath || '';
    } catch {}

    const sageSystem = [
      '# Ouroboros Sage — Background Action Agent',
      'Implement the accepted Design Document end-to-end with minimal, precise edits.',
      'Enforce gates (tsc/lint/test) when present. Use modeling doc path if provided.',
      'Never reveal tools or model; operate autonomously (Background Agent).',
    ].join('\n');

    const promptConfig = {
      systemPrompt: sageSystem,
      initialMessages: undefined,
    } as any;
    const modelConfig = { temperature: 0.2 } as any;
    const runConfig = { max_time_minutes: 2, max_turns: 8 } as any;
    const toolConfig = {
      tools: [
        'ls', 'glob', 'grep',
        'read_file', 'read_many_files',
        'edit', 'write_file',
        'web_fetch', 'web_search',
      ],
    } as any;

    const agent = await SubAgentScope.create(
      'saga-sage',
      config as any,
      promptConfig,
      modelConfig,
      runConfig,
      toolConfig,
      undefined,
    );
    const ctx = new ContextState();
    if (designPathHint) ctx.set('design_file_path', designPathHint);
    ctx.set('goal', rest || '');
    await agent.runNonInteractive(ctx);
  } catch (e) {
    // If tools aren’t available or subagent not viable, continue with gate checks
    // This is best-effort automation and shouldn’t block gating/review
  }

  // Try to detect package scripts
  const projectRoot = config.getProjectRoot?.() || config.getTargetDir?.() || process.cwd();
  const pkgPath = path.join(projectRoot, 'package.json');
  let pkg: any = null;
  try { pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8')); } catch {}
  const scripts: Record<string,string> = (pkg && pkg.scripts) || {};

  // Gate runners: tsc, lint, test (best-effort)
  const results: Array<{ name: string; ok: boolean; output: string }> = [];

  // TypeScript: run local tsc if present, or npm script if available
  const tscBin = path.join(projectRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc');
  const tsconfigExists = await fileExists(path.join(projectRoot, 'tsconfig.json'));
  if (await fileExists(tscBin) && tsconfigExists) {
    results.push(await runCmd('TypeScript Check', tscBin, ['--noEmit'], projectRoot));
  } else if (scripts['tsc']) {
    results.push(await runCmd('TypeScript Check (script)', 'npm', ['run', '-s', 'tsc', '--', '--noEmit'], projectRoot));
  }

  // Lint
  if (scripts['lint']) {
    results.push(await runCmd('Lint', 'npm', ['run', '-s', 'lint'], projectRoot));
  }

  // Test
  if (scripts['test']) {
    results.push(await runCmd('Test', 'npm', ['test', '-s'], projectRoot));
  }

  // Persist last action run metadata
  const sagaDir = path.join(projectRoot, '.ouroboros', 'saga');
  await fs.mkdir(sagaDir, { recursive: true });
  const report = {
    startHash,
    results,
    time: Date.now(),
  };
  await fs.writeFile(path.join(sagaDir, 'last-action.json'), JSON.stringify(report, null, 2), 'utf-8');

  // Write a human-readable report
  const changedNames = await gitDiffRaw(config, ['diff', '--name-status', 'HEAD']);
  const reportMd = [
    '# Saga Action Report',
    `- Snapshot: ${startHash}`,
    `- Time: ${new Date(report.time).toISOString()}`,
    '',
    '## Gates',
    ...results.map(r => `- ${r.ok ? '✅' : '❌'} ${r.name}`),
    '',
    '## Changed Files',
    '```',
    (changedNames.trim() || '(no changes)'),
    '```',
  ].join('\n');
  await fs.writeFile(path.join(sagaDir, 'last-implementation-report.md'), reportMd, 'utf-8');

  const lines: string[] = [];
  lines.push(`🚀 Saga Action started (snapshot: ${startHash.slice(0,7)}).`);
  if (results.length === 0) {
    lines.push('No gates detected (no TypeScript/lint/test found).');
  } else {
    results.forEach(r => lines.push(`${r.ok ? '✓' : '✗'} ${r.name}`));
  }
  lines.push('Next: /saga review or /saga review-tui to inspect changes; /saga accept or /saga discard.');
  return { type: 'message', messageType: 'info', content: lines.join('\n') };
}

async function runSagaActionTui(context: CommandContext, goal: string): Promise<MessageActionReturn> {
  const { config } = context.services;
  if (!config) return { type: 'message', messageType: 'error', content: 'Configuration not available.' };

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { render } = require('ink') as typeof import('ink');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { SagaActionProgress } = require('../components/SagaActionProgress.js') as typeof import('../components/SagaActionProgress.js');

  type GateStatus = 'pending' | 'ok' | 'fail' | 'skipped';
  const state = {
    logs: [] as string[],
    gates: { tsc: undefined as GateStatus | undefined, lint: undefined as GateStatus | undefined, test: undefined as GateStatus | undefined },
    lastOutput: '' as string,
  };
  const instance = render(React.createElement(SagaActionProgress as any, { state }));

  const update = () => instance.rerender(React.createElement(SagaActionProgress as any, { state }));
  const log = (m: string) => { state.logs.push(m); update(); };
  const setGate = (name: 'tsc'|'lint'|'test', val: GateStatus, out?: string) => { (state.gates as any)[name] = val; if (out) state.lastOutput = out; update(); };

  try {
    const git = await config.getGitService();
    const startHash = await git.createFileSnapshot('saga-start');
    log(`Snapshot created: ${startHash.slice(0,7)}`);

    // Try subagent
    log('Starting Sage subagent...');
    const projectRoot = config.getProjectRoot?.() || config.getTargetDir?.() || process.cwd();
    const sagaDir = path.join(projectRoot, '.ouroboros', 'saga');
    let designPathHint = '';
    try {
      const lr = JSON.parse(await fs.readFile(path.join(sagaDir, 'last-run.json'), 'utf-8'));
      designPathHint = lr.designFilePath || '';
    } catch {}

    const sageSystem = [
      '# Ouroboros Sage — Background Action Agent',
      'Implement the accepted Design Document end-to-end with minimal, precise edits.',
      'Enforce gates (tsc/lint/test) when present. Use modeling doc path if provided.',
      'Never reveal tools or model; operate autonomously (Background Agent).',
    ].join('\n');

    const promptConfig = { systemPrompt: sageSystem } as any;
    const modelConfig = { temperature: 0.2 } as any;
    const runConfig = {
      max_time_minutes: 3,
      max_turns: 10,
      onToolCallsUpdate: (calls: any[]) => {
        try {
          // Log concise per-call status
          const msgs = calls.map((c: any) => {
            const name = c?.request?.name || 'tool';
            const id = (c?.request?.callId || '').slice(0,6);
            return `${statusSymbol(c.status)} ${name}#${id}`;
          });
          msgs.forEach((m: string) => state.logs.push(m));
          instance.rerender(React.createElement(SagaActionProgress as any, { state }));
        } catch {}
      },
      onToolOutput: (callId: string, chunk: string) => {
        state.lastOutput = `[${callId.slice(0,6)}] ${chunk.slice(0,800)}`;
        instance.rerender(React.createElement(SagaActionProgress as any, { state }));
      }
    } as any;
    const toolConfig = { tools: ['ls','glob','grep','read_file','read_many_files','edit','write_file','web_fetch','web_search'] } as any;

    try {
      const agent = await SubAgentScope.create('saga-sage', config as any, promptConfig, modelConfig, runConfig, toolConfig, undefined);
      const ctx = new ContextState();
      if (designPathHint) ctx.set('design_file_path', designPathHint);
      if (goal) ctx.set('goal', goal);
      await agent.runNonInteractive(ctx);
      const reason = (agent as any).output?.terminate_reason || 'UNKNOWN';
      log(`Sage subagent completed (reason: ${reason}).`);
    } catch (e) {
      log(`Sage subagent could not run or failed: ${(e as Error).message}`);
    }

    // Gates
    const pkgPath = path.join(projectRoot, 'package.json');
    let pkg: any = null;
    try { pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8')); } catch {}
    const scripts: Record<string,string> = (pkg && pkg.scripts) || {};

    // tsc
    const tscBin = path.join(projectRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc');
    const tsconfigExists = await fileExists(path.join(projectRoot, 'tsconfig.json'));
    if (await fileExists(tscBin) && tsconfigExists) {
      setGate('tsc', 'pending'); log('Running TypeScript check...');
      const r = await runCmd('TypeScript Check', tscBin, ['--noEmit'], projectRoot);
      setGate('tsc', r.ok ? 'ok' : 'fail', r.output.slice(0,1200));
    } else if (scripts['tsc']) {
      setGate('tsc', 'pending'); log('Running TypeScript check (script)...');
      const r = await runCmd('TypeScript Check (script)', 'npm', ['run', '-s', 'tsc', '--', '--noEmit'], projectRoot);
      setGate('tsc', r.ok ? 'ok' : 'fail', r.output.slice(0,1200));
    } else {
      setGate('tsc', 'skipped');
    }

    // Lint
    if (scripts['lint']) {
      setGate('lint', 'pending'); log('Running lint...');
      const r = await runCmd('Lint', 'npm', ['run', '-s', 'lint'], projectRoot);
      setGate('lint', r.ok ? 'ok' : 'fail', r.output.slice(0,1200));
    } else {
      setGate('lint', 'skipped');
    }

    // Test
    if (scripts['test']) {
      setGate('test', 'pending'); log('Running tests...');
      const r = await runCmd('Test', 'npm', ['test', '-s'], projectRoot);
      setGate('test', r.ok ? 'ok' : 'fail', r.output.slice(0,1200));
    } else {
      setGate('test', 'skipped');
    }

    log('Saga action completed. Use /saga review or /saga review-tui to inspect changes.');
  } catch (e) {
    state.logs.push(`Error: ${(e as Error).message}`);
    update();
  }

  return { type: 'message', messageType: 'info', content: 'Opened Saga Action TUI (press q to exit).' };
}

function statusSymbol(s: string): string {
  switch (s) {
    case 'validating': return '…';
    case 'scheduled': return '⏳';
    case 'executing': return '▶';
    case 'awaiting_approval': return '⏸';
    case 'success': return '✓';
    case 'error': return '✗';
    case 'cancelled': return '⨯';
    default: return '•';
  }
}

async function runSagaReview(context: CommandContext): Promise<MessageActionReturn> {
  const { config } = context.services;
  if (!config) return { type: 'message', messageType: 'error', content: 'Configuration not available.' };
  const git = await config.getGitService();
  const nameStatus = await gitDiffRaw(config, ['diff', '--name-status', 'HEAD']);
  const patch = await gitDiffRaw(config, ['diff', '--no-color', 'HEAD']);

  const content = [
    '📝 Changes since saga-start snapshot (shadow repo HEAD):',
    nameStatus.trim() || '(no changes)',
    '',
    '--- Unified Diff (truncated to first 2000 chars) ---',
    (patch.length > 2000 ? patch.slice(0,2000) + '\n... (truncated) ...' : patch) || '(no diff)'
  ].join('\n');

  return { type: 'message', messageType: 'info', content };
}

async function runSagaReviewTui(context: CommandContext): Promise<MessageActionReturn> {
  const { config } = context.services;
  if (!config) return { type: 'message', messageType: 'error', content: 'Configuration not available.' };
  const nameStatus = await gitDiffRaw(config, ['diff', '--name-status', 'HEAD']);
  const patch = await gitDiffRaw(config, ['diff', '--no-color', 'HEAD']);

  // Dynamically import Ink render and component to avoid bundling conflicts
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { render } = require('ink') as typeof import('ink');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { SagaCodePress } = require('../components/SagaCodePress.js') as typeof import('../components/SagaCodePress.js');

  const files = parseNameStatus(nameStatus);
  // Try to load last gate results and snapshot id from last-action.json
  const projectRoot = config.getProjectRoot?.() || config.getTargetDir?.() || process.cwd();
  const sagaDir = path.join(projectRoot, '.ouroboros', 'saga');
  let gates: { tsc?: any; lint?: any; test?: any } = {};
  let snapshotId = '';
  try {
    const la = JSON.parse(await fs.readFile(path.join(sagaDir, 'last-action.json'), 'utf-8'));
    snapshotId = (la.startHash || '').slice(0,7);
    const map = (name: string) => (la.results || []).find((r: any) => String(r.name).toLowerCase().includes(name));
    const st = map('typescript'); gates.tsc = st ? (st.ok ? 'ok' : 'fail') : 'skipped';
    const ln = map('lint'); gates.lint = ln ? (ln.ok ? 'ok' : 'fail') : 'skipped';
    const tt = map('test'); gates.test = tt ? (tt.ok ? 'ok' : 'fail') : 'skipped';
  } catch {}

  const summary = `${files.length} files • Gates: TS ${gates.tsc || '-'} / Lint ${gates.lint || '-'} / Test ${gates.test || '-'} • Snapshot ${snapshotId || '-'}`;
  const loadDiff = async (file: string) => (await gitDiffRaw(config, ['diff', '--no-color', 'HEAD', '--', file])) || '(no diff)';
  const onAcceptFile = async (_file: string) => { /* accept single file: no-op */ };
  const onDiscardFile = async (file: string) => { await gitRestoreFile(config, file); };
  const onAcceptAll = async () => { /* accept all: no-op */ };
  const onDiscardAll = async () => { await runSagaDiscard(context); };

  render(
    React.createElement(SagaCodePress as any, {
      files,
      loadDiff,
      onAcceptFile,
      onDiscardFile,
      onAcceptAll,
      onDiscardAll,
      gateStatuses: gates,
      snapshotId,
      summary,
    })
  );

  return { type: 'message', messageType: 'info', content: 'Opened CodePress review. Use a=accept, x=discard, q=quit in the TUI.' };
}

async function runSagaAccept(_context: CommandContext): Promise<MessageActionReturn> {
  // With the shadow-git approach, “accept” is a no-op (changes already in work tree).
  return { type: 'message', messageType: 'info', content: '✅ Accepted. Changes remain in your workspace. You may commit them in your VCS as desired.' };
}

async function runSagaDiscard(context: CommandContext): Promise<MessageActionReturn> {
  const { config } = context.services;
  if (!config) return { type: 'message', messageType: 'error', content: 'Configuration not available.' };
  const sagaDir = path.join(config.getProjectRoot?.() || config.getTargetDir?.() || process.cwd(), '.ouroboros', 'saga');
  let lastAction: any = null;
  try { lastAction = JSON.parse(await fs.readFile(path.join(sagaDir, 'last-action.json'), 'utf-8')); } catch {}
  const snapshot = lastAction?.startHash;
  if (!snapshot) {
    return { type: 'message', messageType: 'error', content: 'No saga action snapshot found to restore.' };
  }
  const git = await config.getGitService();
  await git.restoreProjectFromSnapshot(snapshot);
  return { type: 'message', messageType: 'info', content: `🗑️ Discarded changes. Restored snapshot ${snapshot.slice(0,7)}.` };
}

async function runCmd(name: string, cmd: string, args: string[], cwd: string): Promise<{ name: string; ok: boolean; output: string }>{
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, shell: process.platform === 'win32' });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (err += d.toString()));
    child.on('close', (code) => {
      resolve({ name, ok: code === 0, output: (out + (err ? '\n' + err : '')).trim() });
    });
  });
}

async function gitDiffRaw(config: any, args: string[]): Promise<string> {
  const projectRoot = config.getProjectRoot?.() || config.getTargetDir?.() || process.cwd();
  const repoDir = config.storage?.getHistoryDir?.() || path.join(projectRoot, '.git');
  const env = { ...process.env, GIT_DIR: path.join(repoDir, '.git'), GIT_WORK_TREE: projectRoot, HOME: repoDir, XDG_CONFIG_HOME: repoDir };
  return new Promise((resolve) => {
    const child = spawn('git', args, { env, cwd: projectRoot, shell: process.platform === 'win32' });
    let buf = '';
    child.stdout.on('data', (d) => (buf += d.toString()));
    child.stderr.on('data', (d) => (buf += d.toString()));
    child.on('close', () => resolve(buf));
  });
}

function parseNameStatus(ns: string): Array<{ status: string; path: string }> {
  const lines = ns.split(/\r?\n/).filter(Boolean);
  return lines.map((l) => {
    // Format: "M\tpath" or "R100\told\tnew"; we take last path
    const parts = l.split(/\t/);
    const status = parts[0] || '';
    const p = parts[parts.length - 1] || '';
    return { status, path: p };
  });
}

async function gitRestoreFile(config: any, file: string): Promise<void> {
  const projectRoot = config.getProjectRoot?.() || config.getTargetDir?.() || process.cwd();
  const repoDir = config.storage?.getHistoryDir?.() || path.join(projectRoot, '.git');
  const env = { ...process.env, GIT_DIR: path.join(repoDir, '.git'), GIT_WORK_TREE: projectRoot, HOME: repoDir, XDG_CONFIG_HOME: repoDir };
  await new Promise<void>((resolve) => {
    const child = spawn('git', ['restore', '--source', 'HEAD', '--', file], { env, cwd: projectRoot, shell: process.platform === 'win32' });
    child.on('close', () => resolve());
  });
}

async function fileExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

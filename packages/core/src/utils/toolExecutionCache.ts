/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ToolCallRequestInfo,
  ToolCallResponseInfo,
} from '../core/turn.js';

const CACHEABLE_TOOL_NAMES = new Set<string>([
  'read_file',
  'read_many_files',
  'list_directory',
  'glob',
  'find_files',
  'search_file_content',
  'ripgrep_search',
  'web_fetch',
  'google_web_search',
]);

const CACHE_INVALIDATING_TOOL_NAMES = new Set<string>([
  'replace',
  'write_file',
  'run_shell_command',
  'local_shell',
]);

const DEFAULT_TTL_MS = 5000;

interface CachedResponse {
  expiresAt: number;
  value: ToolCallResponseInfo;
}

export class ToolExecutionCache {
  private readonly ttlMs: number;
  private readonly results = new Map<string, CachedResponse>();
  private readonly inflight = new Map<string, Promise<ToolCallResponseInfo>>();

  constructor(ttlMs: number = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  static isCacheable(request: ToolCallRequestInfo): boolean {
    return CACHEABLE_TOOL_NAMES.has(request.name);
  }

  static isInvalidating(request: ToolCallRequestInfo): boolean {
    return CACHE_INVALIDATING_TOOL_NAMES.has(request.name);
  }

  static buildCacheKey(request: ToolCallRequestInfo): string | undefined {
    if (!ToolExecutionCache.isCacheable(request)) {
      return undefined;
    }
    try {
      const payload = JSON.stringify(request.args ?? {});
      return `${request.name}::${payload}`;
    } catch (_error) {
      return undefined;
    }
  }

  get(key: string): ToolCallResponseInfo | undefined {
    const entry = this.results.get(key);
    if (!entry) {
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      this.results.delete(key);
      return undefined;
    }
    return cloneResponse(entry.value);
  }

  set(key: string, response: ToolCallResponseInfo): void {
    this.results.set(key, {
      expiresAt: Date.now() + this.ttlMs,
      value: cloneResponse(response),
    });
  }

  trackPending(key: string, promise: Promise<ToolCallResponseInfo>): void {
    this.inflight.set(key, promise);
    promise.finally(() => this.inflight.delete(key)).catch(() => {
      /* swallow */
    });
  }

  getPending(key: string): Promise<ToolCallResponseInfo> | undefined {
    return this.inflight.get(key);
  }

  clear(): void {
    this.results.clear();
    this.inflight.clear();
  }
}

function cloneResponse(response: ToolCallResponseInfo): ToolCallResponseInfo {
  return typeof structuredClone === 'function'
    ? structuredClone(response)
    : JSON.parse(JSON.stringify(response)) as ToolCallResponseInfo;
}

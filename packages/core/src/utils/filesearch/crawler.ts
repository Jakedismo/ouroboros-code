// @ts-nocheck
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import type { Ignore } from './ignore.js';
import * as cache from './crawlCache.js';

export interface CrawlOptions {
  // The directory to start the crawl from.
  crawlDirectory: string;
  // The project's root directory, for path relativity.
  cwd: string;
  // The fdir maxDepth option.
  maxDepth?: number;
  // A pre-configured Ignore instance.
  ignore: Ignore;
  // Caching options.
  cache: boolean;
  cacheTtl: number;
}

function toPosixPath(p: string) {
  return p.split(path.sep).join(path.posix.sep);
}

export async function crawl(options: CrawlOptions): Promise<string[]> {
  if (options.cache) {
    const cacheKey = cache.getCacheKey(
      options.crawlDirectory,
      options.ignore.getFingerprint(),
      options.maxDepth,
    );
    const cachedResults = cache.read(cacheKey);

    if (cachedResults) {
      return cachedResults;
    }
  }

  const posixCwd = toPosixPath(options.cwd);
  const posixCrawlDirectory = toPosixPath(options.crawlDirectory);

  const dirFilter = options.ignore.getDirectoryFilter();
  const results: string[] = ['.'];
  const seen = new Set<string>(results);

  async function walk(currentDir: string, depth: number): Promise<void> {
    let entries: DirentWithPath[];
    try {
      const dirEntries = await fs.readdir(currentDir, { withFileTypes: true });
      entries = dirEntries.map((entry) => ({
        dirent: entry,
        absolute: path.join(currentDir, entry.name),
      }));
    } catch (_error) {
      return;
    }

    for (const { dirent, absolute } of entries) {
      const posixAbsolute = toPosixPath(absolute);
      const relativeFromCrawl = path.posix.relative(
        posixCrawlDirectory,
        posixAbsolute,
      );
      const relativeFromCwd = path.posix.relative(posixCwd, posixAbsolute);

      if (dirent.isDirectory()) {
        if (dirFilter(`${relativeFromCrawl}/`)) {
          continue;
        }

        const normalizedRelative =
          relativeFromCwd.length > 0 ? `${relativeFromCwd}/` : null;

        if (normalizedRelative && !seen.has(normalizedRelative)) {
          seen.add(normalizedRelative);
          results.push(normalizedRelative);
        }

        if (
          options.maxDepth === undefined ||
          depth < options.maxDepth
        ) {
          await walk(absolute, depth + 1);
        }
        continue;
      }

      const normalizedFile =
        relativeFromCwd.length > 0
          ? relativeFromCwd
          : path.posix.basename(posixAbsolute);

      if (!seen.has(normalizedFile)) {
        seen.add(normalizedFile);
        results.push(normalizedFile);
      }
    }
  }

  await walk(options.crawlDirectory, 0);

  if (options.cache) {
    const cacheKey = cache.getCacheKey(
      options.crawlDirectory,
      options.ignore.getFingerprint(),
      options.maxDepth,
    );
    cache.write(cacheKey, results, options.cacheTtl * 1000);
  }

  return results;
}

interface DirentWithPath {
  dirent: import('node:fs').Dirent;
  absolute: string;
}

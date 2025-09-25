/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Copied exactly from packages/cli/src/config/extension.ts, last PR #1026

import type { MCPServerConfig } from '@ouroboros/ouroboros-code-core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { logger } from './logger.js';

export const PRIMARY_EXTENSIONS_DIRECTORY = path.join('.gemini', 'extensions');
export const LEGACY_EXTENSIONS_DIRECTORY = path.join('.ouroboros', 'extensions');

export const PRIMARY_EXTENSION_CONFIG_FILENAME = 'gemini-extension.json';
export const LEGACY_EXTENSION_CONFIG_FILENAME = 'ouroboros-extension.json';
export const PRIMARY_INSTALL_METADATA_FILENAME = '.gemini-extension-install.json';
export const LEGACY_INSTALL_METADATA_FILENAME = '.ouroboros-extension-install.json';

export interface Extension {
  config: ExtensionConfig;
  contextFiles: string[];
}

export interface ExtensionConfig {
  name: string;
  version: string;
  mcpServers?: Record<string, MCPServerConfig>;
  contextFileName?: string | string[];
}

const EXTENSION_DIR_CANDIDATES = [
  PRIMARY_EXTENSIONS_DIRECTORY,
  LEGACY_EXTENSIONS_DIRECTORY,
];

function existingExtensionDirs(baseDir: string): string[] {
  return EXTENSION_DIR_CANDIDATES
    .map((relativeDir) => path.join(baseDir, relativeDir))
    .filter((candidate) => fs.existsSync(candidate));
}

function resolveExtensionConfigPath(extensionDir: string): string | undefined {
  const primary = path.join(extensionDir, PRIMARY_EXTENSION_CONFIG_FILENAME);
  const legacy = path.join(extensionDir, LEGACY_EXTENSION_CONFIG_FILENAME);
  if (fs.existsSync(primary)) return primary;
  if (fs.existsSync(legacy)) return legacy;
  return undefined;
}

export function loadExtensions(workspaceDir: string): Extension[] {
  const allExtensions = [
    ...loadExtensionsFromDir(workspaceDir),
    ...loadExtensionsFromDir(os.homedir()),
  ];

  const uniqueExtensions: Extension[] = [];
  const seenNames = new Set<string>();
  for (const extension of allExtensions) {
    if (!seenNames.has(extension.config.name)) {
      logger.info(
        `Loading extension: ${extension.config.name} (version: ${extension.config.version})`,
      );
      uniqueExtensions.push(extension);
      seenNames.add(extension.config.name);
    }
  }

  return uniqueExtensions;
}

function loadExtensionsFromDir(dir: string): Extension[] {
  const extensions: Extension[] = [];
  for (const extensionsRoot of existingExtensionDirs(dir)) {
    for (const subdir of fs.readdirSync(extensionsRoot)) {
      const extensionDir = path.join(extensionsRoot, subdir);
      const extension = loadExtension(extensionDir);
      if (extension != null) {
        extensions.push(extension);
      }
    }
  }
  return extensions;
}

function loadExtension(extensionDir: string): Extension | null {
  if (!fs.statSync(extensionDir).isDirectory()) {
    logger.error(
      `Warning: unexpected file ${extensionDir} in extensions directory.`,
    );
    return null;
  }

  const configFilePath = resolveExtensionConfigPath(extensionDir);
  if (!configFilePath) {
    logger.error(
      `Warning: extension directory ${extensionDir} does not contain an extension config file.`,
    );
    return null;
  }

  try {
    const configContent = fs.readFileSync(configFilePath, 'utf-8');
    const config = JSON.parse(configContent) as ExtensionConfig;
    if (!config.name || !config.version) {
      logger.error(
        `Invalid extension config in ${configFilePath}: missing name or version.`,
      );
      return null;
    }

    const contextFiles = getContextFileNames(config)
      .map((contextFileName) => path.join(extensionDir, contextFileName))
      .filter((contextFilePath) => fs.existsSync(contextFilePath));

    return {
      config,
      contextFiles,
    };
  } catch (e) {
    logger.error(
      `Warning: error parsing extension config in ${configFilePath}: ${e}`,
    );
    return null;
  }
}

function getContextFileNames(config: ExtensionConfig): string[] {
  if (!config.contextFileName) {
    return ['GEMINI.md'];
  } else if (!Array.isArray(config.contextFileName)) {
    return [config.contextFileName];
  }
  return config.contextFileName;
}

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';

import { resolveConfigDir } from '../utils/paths.js';
export const GOOGLE_ACCOUNTS_FILENAME = 'google_accounts.json';
const TMP_DIR_NAME = 'tmp';

export class Storage {
  private readonly targetDir: string;

  constructor(targetDir: string) {
    this.targetDir = targetDir;
  }

  static getGlobalGeminiDir(): string {
    const homeDir = os.homedir();
    const baseDir = homeDir || os.tmpdir();
    return resolveConfigDir(baseDir);
  }

  static getMcpOAuthTokensPath(): string {
    return path.join(Storage.getGlobalGeminiDir(), 'mcp-oauth-tokens.json');
  }

  static getGlobalSettingsPath(): string {
    return path.join(Storage.getGlobalGeminiDir(), 'settings.json');
  }

  static getInstallationIdPath(): string {
    return path.join(Storage.getGlobalGeminiDir(), 'installation_id');
  }

  static getGoogleAccountsPath(): string {
    return path.join(Storage.getGlobalGeminiDir(), GOOGLE_ACCOUNTS_FILENAME);
  }

  static getUserCommandsDir(): string {
    return path.join(Storage.getGlobalGeminiDir(), 'commands');
  }

  static getGlobalMemoryFilePath(): string {
    return path.join(Storage.getGlobalGeminiDir(), 'memory.md');
  }

  static getGlobalTempDir(): string {
    return path.join(Storage.getGlobalGeminiDir(), TMP_DIR_NAME);
  }

  static getSessionStorageDir(): string {
    return path.join(Storage.getGlobalGeminiDir(), 'sessions');
  }

  getGeminiDir(): string {
    return resolveConfigDir(this.targetDir);
  }

  getProjectTempDir(): string {
    const hash = this.getFilePathHash(this.getProjectRoot());
    const tempDir = Storage.getGlobalTempDir();
    return path.join(tempDir, hash);
  }

  ensureProjectTempDirExists(): void {
    fs.mkdirSync(this.getProjectTempDir(), { recursive: true });
  }

  static getOAuthCredsPath(): string {
    return path.join(Storage.getGlobalGeminiDir(), 'oauth_creds.json');
  }

  getProjectRoot(): string {
    return this.targetDir;
  }

  private getFilePathHash(filePath: string): string {
    return crypto.createHash('sha256').update(filePath).digest('hex');
  }

  getHistoryDir(): string {
    const hash = this.getFilePathHash(this.getProjectRoot());
    const historyDir = path.join(Storage.getGlobalGeminiDir(), 'history');
    return path.join(historyDir, hash);
  }

  getWorkspaceSettingsPath(): string {
    return path.join(this.getGeminiDir(), 'settings.json');
  }

  getProjectCommandsDir(): string {
    return path.join(this.getGeminiDir(), 'commands');
  }

  getProjectTempCheckpointsDir(): string {
    return path.join(this.getProjectTempDir(), 'checkpoints');
  }

  getExtensionsDir(): string {
    return path.join(this.getGeminiDir(), 'extensions');
  }

  getExtensionsConfigPath(): string {
    const dir = this.getExtensionsDir();
    const primary = path.join(dir, 'ouroboros-extension.json');
    const legacy = path.join(dir, 'gemini-extension.json');
    if (fs.existsSync(legacy) && !fs.existsSync(primary)) {
      return legacy;
    }
    return primary;
  }

  getHistoryFilePath(): string {
    return path.join(this.getProjectTempDir(), 'shell_history');
  }
}

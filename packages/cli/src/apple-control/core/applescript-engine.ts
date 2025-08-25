/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, exec } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, unlink, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const execAsync = promisify(exec);

/**
 * AppleScript execution results
 */
export interface AppleScriptResult {
  success: boolean;
  output: string;
  error?: string;
  executionTime: number;
}

/**
 * AppleScript permission levels
 */
export enum PermissionLevel {
  READ_ONLY = 'read-only',
  SAFE_WRITE = 'safe-write', 
  FULL_ACCESS = 'full-access'
}

/**
 * AppleScript execution options
 */
export interface ExecutionOptions {
  timeout?: number;
  permissionLevel?: PermissionLevel;
  requiresPrompt?: boolean;
  description?: string;
}

/**
 * Security validation for AppleScript commands
 */
class AppleScriptSecurityValidator {
  private static readonly DANGEROUS_COMMANDS = [
    'do shell script',
    'system events',
    'activate application "Terminal"',
    'delete',
    'remove',
    'trash',
    'move to trash'
  ];

  private static readonly READ_ONLY_COMMANDS = [
    'get',
    'count',
    'exists',
    'properties',
    'name',
    'content'
  ];

  /**
   * Validate AppleScript for security risks
   */
  static validate(script: string, permissionLevel: PermissionLevel): {
    valid: boolean;
    warnings: string[];
    errors: string[];
  } {
    const warnings: string[] = [];
    const errors: string[] = [];
    const normalizedScript = script.toLowerCase();

    // Check for dangerous commands
    for (const dangerous of this.DANGEROUS_COMMANDS) {
      if (normalizedScript.includes(dangerous)) {
        if (permissionLevel === PermissionLevel.READ_ONLY) {
          errors.push(`Dangerous command "${dangerous}" not allowed in READ_ONLY mode`);
        } else {
          warnings.push(`Potentially dangerous command detected: "${dangerous}"`);
        }
      }
    }

    // Validate read-only restrictions
    if (permissionLevel === PermissionLevel.READ_ONLY) {
      const hasReadOnlyCommand = this.READ_ONLY_COMMANDS.some(cmd => 
        normalizedScript.includes(cmd)
      );
      
      if (!hasReadOnlyCommand) {
        warnings.push('Script may not be truly read-only - no explicit read commands found');
      }
    }

    // Check for common security issues
    if (normalizedScript.includes('password')) {
      warnings.push('Script contains password reference - ensure no credentials are exposed');
    }

    if (normalizedScript.includes('admin') || normalizedScript.includes('sudo')) {
      errors.push('Administrative commands are not allowed');
    }

    return {
      valid: errors.length === 0,
      warnings,
      errors
    };
  }
}

/**
 * AppleScript execution engine with security and permission handling
 */
export class AppleScriptEngine {
  private static readonly TEMP_SCRIPT_DIR = path.join(os.tmpdir(), 'ouroboros-applescript');
  private static readonly DEFAULT_TIMEOUT = 30000; // 30 seconds
  private static readonly MAX_OUTPUT_LENGTH = 100000; // 100KB

  /**
   * Execute AppleScript with security validation
   */
  static async execute(
    script: string,
    options: ExecutionOptions = {}
  ): Promise<AppleScriptResult> {
    const startTime = Date.now();
    const {
      timeout = this.DEFAULT_TIMEOUT,
      permissionLevel = PermissionLevel.SAFE_WRITE,
      requiresPrompt = false,
      description = 'AppleScript execution'
    } = options;

    try {
      // Security validation
      const validation = AppleScriptSecurityValidator.validate(script, permissionLevel);
      
      if (!validation.valid) {
        return {
          success: false,
          output: '',
          error: `Security validation failed: ${validation.errors.join(', ')}`,
          executionTime: Date.now() - startTime
        };
      }

      // Log warnings if any
      if (validation.warnings.length > 0) {
        console.warn('⚠️  AppleScript Security Warnings:');
        validation.warnings.forEach(warning => console.warn(`   • ${warning}`));
      }

      // User confirmation for sensitive operations
      if (requiresPrompt) {
        console.log(`🔐 Permission Required: ${description}`);
        console.log('📝 Script preview:');
        console.log(script.split('\n').map(line => `   ${line}`).join('\n'));
        console.log('\n⚠️  This script will interact with your Mac system.');
        
        // In a real implementation, you'd want actual user confirmation
        // For now, we'll proceed but log the requirement
        console.log('🚀 Proceeding with execution...\n');
      }

      // Create temporary script file
      const scriptPath = await this.createTempScript(script);

      try {
        // Execute the script
        const result = await this.executeScriptFile(scriptPath, timeout);
        
        return {
          success: result.success,
          output: this.truncateOutput(result.output),
          error: result.error,
          executionTime: Date.now() - startTime
        };

      } finally {
        // Clean up temporary file
        await this.cleanupTempScript(scriptPath);
      }

    } catch (error) {
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Execute a simple AppleScript command (convenience method)
   */
  static async executeCommand(
    command: string,
    options: ExecutionOptions = {}
  ): Promise<AppleScriptResult> {
    return this.execute(command, options);
  }

  /**
   * Test AppleScript permissions and accessibility
   */
  static async testPermissions(): Promise<{
    hasAccessibility: boolean;
    hasFullDiskAccess: boolean;
    canControlApps: boolean;
    recommendations: string[];
  }> {
    const recommendations: string[] = [];
    let hasAccessibility = false;
    let hasFullDiskAccess = false;
    let canControlApps = false;

    try {
      // Test basic AppleScript execution
      const basicTest = await this.execute(
        'tell application "System Events" to get name of first process',
        { permissionLevel: PermissionLevel.READ_ONLY, timeout: 5000 }
      );

      hasAccessibility = basicTest.success;
      if (!hasAccessibility) {
        recommendations.push(
          'Enable accessibility access: System Preferences → Security & Privacy → Privacy → Accessibility → Add Terminal/ouroboros-code'
        );
      }

      // Test application control
      const appControlTest = await this.execute(
        'tell application "Finder" to get name',
        { permissionLevel: PermissionLevel.READ_ONLY, timeout: 5000 }
      );

      canControlApps = appControlTest.success;
      if (!canControlApps) {
        recommendations.push(
          'Enable app control: System Preferences → Security & Privacy → Privacy → Automation → Add ouroboros-code'
        );
      }

      // Test file access (simplified)
      const fileAccessTest = await this.execute(
        'tell application "System Events" to get name of desktop',
        { permissionLevel: PermissionLevel.READ_ONLY, timeout: 5000 }
      );

      hasFullDiskAccess = fileAccessTest.success;
      if (!hasFullDiskAccess) {
        recommendations.push(
          'For full functionality, consider enabling Full Disk Access: System Preferences → Security & Privacy → Privacy → Full Disk Access'
        );
      }

    } catch (error) {
      recommendations.push('Unable to test permissions. Ensure ouroboros-code has necessary macOS permissions.');
    }

    return {
      hasAccessibility,
      hasFullDiskAccess,
      canControlApps,
      recommendations
    };
  }

  /**
   * Create a temporary script file
   */
  private static async createTempScript(script: string): Promise<string> {
    const timestamp = Date.now();
    const filename = `script_${timestamp}_${Math.random().toString(36).substr(2, 9)}.scpt`;
    const scriptPath = path.join(this.TEMP_SCRIPT_DIR, filename);

    // Ensure temp directory exists
    try {
      await access(this.TEMP_SCRIPT_DIR);
    } catch {
      await execAsync(`mkdir -p "${this.TEMP_SCRIPT_DIR}"`);
    }

    // Write script to file
    await writeFile(scriptPath, script, 'utf8');
    
    return scriptPath;
  }

  /**
   * Execute script file using osascript
   */
  private static async executeScriptFile(
    scriptPath: string,
    timeout: number
  ): Promise<{ success: boolean; output: string; error?: string }> {
    return new Promise((resolve) => {
      const child = spawn('osascript', [scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        resolve({
          success: code === 0,
          output: stdout.trim(),
          error: stderr.trim() || undefined
        });
      });

      child.on('error', (error) => {
        resolve({
          success: false,
          output: '',
          error: error.message
        });
      });

      // Handle timeout
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGTERM');
          resolve({
            success: false,
            output: stdout.trim(),
            error: 'Script execution timed out'
          });
        }
      }, timeout);
    });
  }

  /**
   * Clean up temporary script file
   */
  private static async cleanupTempScript(scriptPath: string): Promise<void> {
    try {
      await unlink(scriptPath);
    } catch {
      // Ignore cleanup errors
    }
  }

  /**
   * Truncate output if too long
   */
  private static truncateOutput(output: string): string {
    if (output.length <= this.MAX_OUTPUT_LENGTH) {
      return output;
    }

    return output.substring(0, this.MAX_OUTPUT_LENGTH) + '\n... [Output truncated]';
  }
}
/**
 * Validation service - runs success gates for different project types
 */

import { execSync } from 'child_process';
import * as fs from 'fs-extra';
import * as path from 'path';
import type { Config } from '@ouroboros/ouroboros-code-core';

export interface ValidationResult {
  gate: string;
  passed: boolean;
  output?: string;
  error?: string;
  duration?: number;
}

export interface ValidationGates {
  typescript?: {
    tsc?: boolean;
    lint?: boolean;
    test?: boolean;
  };
  python?: {
    ruff?: boolean;
    flake8?: boolean;
    pytest?: boolean;
  };
  go?: {
    vet?: boolean;
    test?: boolean;
  };
  javascript?: {
    lint?: boolean;
    test?: boolean;
  };
}

export class ValidationService {
  private gates: ValidationGates;

  constructor(private config: Config) {
    // Load gates from config or use defaults
    this.gates = this.config.get('saga.successGates') || this.getDefaultGates();
  }

  async validate(workspace: { path: string }): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];
    const projectType = await this.detectProjectType(workspace.path);

    switch (projectType) {
      case 'typescript':
        results.push(...await this.validateTypeScript(workspace.path));
        break;
      case 'javascript':
        results.push(...await this.validateJavaScript(workspace.path));
        break;
      case 'python':
        results.push(...await this.validatePython(workspace.path));
        break;
      case 'go':
        results.push(...await this.validateGo(workspace.path));
        break;
      default:
        // No specific validation for unknown project types
        results.push({
          gate: 'basic',
          passed: true,
          output: 'No specific validation gates for this project type'
        });
    }

    return results;
  }

  private async detectProjectType(workspacePath: string): Promise<string> {
    // Check for TypeScript
    if (await fs.pathExists(path.join(workspacePath, 'tsconfig.json'))) {
      return 'typescript';
    }

    // Check for JavaScript/Node.js
    if (await fs.pathExists(path.join(workspacePath, 'package.json'))) {
      return 'javascript';
    }

    // Check for Python
    if (await fs.pathExists(path.join(workspacePath, 'pyproject.toml')) ||
        await fs.pathExists(path.join(workspacePath, 'setup.py')) ||
        await fs.pathExists(path.join(workspacePath, 'requirements.txt'))) {
      return 'python';
    }

    // Check for Go
    if (await fs.pathExists(path.join(workspacePath, 'go.mod'))) {
      return 'go';
    }

    return 'unknown';
  }

  private async validateTypeScript(workspacePath: string): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];
    const gates = this.gates.typescript || {};

    // Install dependencies first
    await this.runCommand('npm install', workspacePath, 'dependencies');

    // TypeScript compilation
    if (gates.tsc !== false) {
      results.push(await this.runValidation(
        'tsc',
        'npx tsc --noEmit',
        workspacePath,
        'TypeScript compilation'
      ));
    }

    // Linting
    if (gates.lint) {
      // Try ESLint first
      if (await this.commandExists('npx eslint', workspacePath)) {
        results.push(await this.runValidation(
          'eslint',
          'npx eslint . --ext .ts,.tsx',
          workspacePath,
          'ESLint'
        ));
      }
    }

    // Tests
    if (gates.test) {
      // Check for test runner
      const packageJson = await this.readPackageJson(workspacePath);
      if (packageJson?.scripts?.test) {
        results.push(await this.runValidation(
          'test',
          'npm test',
          workspacePath,
          'Tests'
        ));
      }
    }

    return results;
  }

  private async validateJavaScript(workspacePath: string): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];
    const gates = this.gates.javascript || {};

    // Install dependencies first
    await this.runCommand('npm install', workspacePath, 'dependencies');

    // Linting
    if (gates.lint) {
      if (await this.commandExists('npx eslint', workspacePath)) {
        results.push(await this.runValidation(
          'eslint',
          'npx eslint . --ext .js,.jsx',
          workspacePath,
          'ESLint'
        ));
      }
    }

    // Tests
    if (gates.test) {
      const packageJson = await this.readPackageJson(workspacePath);
      if (packageJson?.scripts?.test) {
        results.push(await this.runValidation(
          'test',
          'npm test',
          workspacePath,
          'Tests'
        ));
      }
    }

    return results;
  }

  private async validatePython(workspacePath: string): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];
    const gates = this.gates.python || {};

    // Install dependencies
    if (await fs.pathExists(path.join(workspacePath, 'requirements.txt'))) {
      await this.runCommand('pip install -r requirements.txt', workspacePath, 'dependencies');
    }

    // Ruff (modern Python linter)
    if (gates.ruff) {
      if (await this.commandExists('ruff', workspacePath)) {
        results.push(await this.runValidation(
          'ruff',
          'ruff check .',
          workspacePath,
          'Ruff linter'
        ));
      }
    }

    // Flake8 (fallback linter)
    if (gates.flake8 && !gates.ruff) {
      if (await this.commandExists('flake8', workspacePath)) {
        results.push(await this.runValidation(
          'flake8',
          'flake8 .',
          workspacePath,
          'Flake8 linter'
        ));
      }
    }

    // Pytest
    if (gates.pytest) {
      if (await this.commandExists('pytest', workspacePath)) {
        results.push(await this.runValidation(
          'pytest',
          'pytest',
          workspacePath,
          'Pytest'
        ));
      }
    }

    return results;
  }

  private async validateGo(workspacePath: string): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];
    const gates = this.gates.go || {};

    // Go vet
    if (gates.vet !== false) {
      results.push(await this.runValidation(
        'go-vet',
        'go vet ./...',
        workspacePath,
        'Go vet'
      ));
    }

    // Go test
    if (gates.test !== false) {
      results.push(await this.runValidation(
        'go-test',
        'go test ./...',
        workspacePath,
        'Go tests'
      ));
    }

    return results;
  }

  private async runValidation(
    gate: string,
    command: string,
    cwd: string,
    description: string
  ): Promise<ValidationResult> {
    const startTime = Date.now();
    
    try {
      const output = execSync(command, {
        cwd,
        encoding: 'utf-8',
        stdio: 'pipe',
        env: {
          ...process.env,
          CI: 'true', // Run in CI mode to avoid interactive prompts
          NODE_ENV: 'test'
        }
      });

      return {
        gate,
        passed: true,
        output: output.substring(0, 1000), // Limit output size
        duration: Date.now() - startTime
      };
    } catch (error: any) {
      return {
        gate,
        passed: false,
        error: error.message || `${description} failed`,
        output: error.stdout?.substring(0, 1000) || error.stderr?.substring(0, 1000),
        duration: Date.now() - startTime
      };
    }
  }

  private async runCommand(
    command: string,
    cwd: string,
    description: string
  ): Promise<void> {
    try {
      execSync(command, {
        cwd,
        stdio: 'ignore',
        env: {
          ...process.env,
          CI: 'true',
          NODE_ENV: 'development'
        }
      });
    } catch (error) {
      console.warn(`Failed to run ${description}:`, error);
      // Non-fatal, continue with validation
    }
  }

  private async commandExists(command: string, cwd: string): Promise<boolean> {
    try {
      execSync(`${command} --version`, {
        cwd,
        stdio: 'ignore'
      });
      return true;
    } catch {
      return false;
    }
  }

  private async readPackageJson(workspacePath: string): Promise<any> {
    try {
      const packageJsonPath = path.join(workspacePath, 'package.json');
      if (await fs.pathExists(packageJsonPath)) {
        return await fs.readJson(packageJsonPath);
      }
    } catch {
      // Ignore errors
    }
    return null;
  }

  private getDefaultGates(): ValidationGates {
    return {
      typescript: {
        tsc: true,
        lint: true,
        test: true
      },
      javascript: {
        lint: true,
        test: true
      },
      python: {
        ruff: true,
        pytest: true
      },
      go: {
        vet: true,
        test: true
      }
    };
  }
}
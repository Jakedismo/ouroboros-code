import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { getCoreSystemPrompt } from '../../prompts';
import { loadFlavour } from '../flavour-loader';

describe('Claude Code Flavour', () => {
  const originalEnv = process.env.GEMINI_SYSTEM_MD;

  beforeEach(() => {
    delete process.env.GEMINI_SYSTEM_MD;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.GEMINI_SYSTEM_MD = originalEnv;
    } else {
      delete process.env.GEMINI_SYSTEM_MD;
    }
  });

  it('should load claude-code flavour successfully', () => {
    const flavourContent = loadFlavour('claude-code');
    expect(flavourContent).not.toBeNull();
    expect(flavourContent).toContain('You are Ouroboros Code');
    expect(flavourContent).toContain('multi-agent CLI tool');
  });

  it('should apply claude-code flavour through getCoreSystemPrompt', () => {
    const result = getCoreSystemPrompt(undefined, { flavour: 'claude-code' });
    
    // Check that the flavour content is present
    expect(result).toContain('You are Ouroboros Code');
    expect(result).toContain('# Tone and style');
    expect(result).toContain('# Task Management');
    expect(result).toContain('# Following conventions');
    
    // Check that dynamic sections are applied
    expect(result).toContain('Working directory:');
    expect(result).toContain('Platform:');
    expect(result).toContain('OS Version:');
    expect(result).toContain("Today's date:");
  });

  it('should not contain template markers after processing', () => {
    const result = getCoreSystemPrompt(undefined, { flavour: 'claude-code' });
    
    // Template markers should be replaced
    expect(result).not.toContain('{{SANDBOX_SECTION}}');
    expect(result).not.toContain('{{GIT_SECTION}}');
    expect(result).not.toContain('{{WORKING_DIRECTORY}}');
    expect(result).not.toContain('{{PLATFORM}}');
    expect(result).not.toContain('{{OS_VERSION}}');
    expect(result).not.toContain('{{TODAYS_DATE}}');
  });

  it('should prioritize custom prompt over claude-code flavour', () => {
    const customPrompt = 'This is a custom prompt';
    const result = getCoreSystemPrompt(undefined, { 
      customPrompt, 
      flavour: 'claude-code' 
    });
    
    expect(result).toContain('This is a custom prompt');
    expect(result).not.toContain('You are Ouroboros Code');
  });

  it('should contain all critical instructions', () => {
    const result = getCoreSystemPrompt(undefined, { flavour: 'claude-code' });
    
    // Security instructions
    expect(result).toContain('Assist with defensive security tasks only');
    
    // Conciseness instructions
    expect(result).toContain('answer concisely with fewer than 4 lines');
    
    // Task management
    expect(result).toContain('TodoWrite tool');
    
    // Code references
    expect(result).toContain('file_path:line_number');
    
    // Tool usage policy
    expect(result).toContain('Tool usage policy');
  });

  it('should handle git repository detection in flavour', () => {
    const result = getCoreSystemPrompt(undefined, { flavour: 'claude-code' });
    
    // Should contain git-specific instructions since we're in a git repo
    expect(result).toMatch(/git status|Git repository detected/i);
  });
});
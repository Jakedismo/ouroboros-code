/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Available system prompt flavours
 * This will be expanded as new flavours are added
 */
export enum SystemPromptFlavour {
  DEFAULT = 'default',
  CLAUDE_CODE = 'claude-code',
  // Additional flavours to be added
}

/**
 * Get the flavours directory path
 * Handles both development (src) and production (dist) scenarios
 */
function getFlavoursDirectory(): string {
  // Try compiled location first (dist)
  const distPath = path.join(__dirname, 'flavours');
  if (fs.existsSync(distPath)) {
    return distPath;
  }
  
  // Try source location for development
  const srcPath = path.join(__dirname.replace('/dist/', '/src/'), 'flavours');
  if (fs.existsSync(srcPath)) {
    return srcPath;
  }
  
  // If __dirname doesn't contain /dist/, try direct source path
  const directSrcPath = path.join(process.cwd(), 'packages/core/src/core/prompts/flavours');
  if (fs.existsSync(directSrcPath)) {
    return directSrcPath;
  }
  
  // Default to dist path
  return distPath;
}

/**
 * Load a system prompt flavour from file
 * @param flavour The flavour name to load
 * @returns The system prompt content or null if not found
 */
export function loadFlavour(flavour: string): string | null {
  try {
    const flavoursDir = getFlavoursDirectory();
    const flavourPath = path.join(flavoursDir, `${flavour}.md`);
    
    // Check if flavour file exists
    if (!fs.existsSync(flavourPath)) {
      console.warn(`System prompt flavour '${flavour}' not found at ${flavourPath}`);
      return null;
    }
    
    // Read and return the flavour content
    return fs.readFileSync(flavourPath, 'utf8');
  } catch (error) {
    console.error(`Error loading system prompt flavour '${flavour}':`, error);
    return null;
  }
}

/**
 * List all available flavours
 * @returns Array of available flavour names
 */
export function listAvailableFlavours(): string[] {
  try {
    const flavoursDir = getFlavoursDirectory();
    
    if (!fs.existsSync(flavoursDir)) {
      return ['default'];
    }
    
    const files = fs.readdirSync(flavoursDir);
    const flavours = files
      .filter(file => file.endsWith('.md'))
      .map(file => file.replace('.md', ''));
    
    // Always include default
    if (!flavours.includes('default')) {
      flavours.unshift('default');
    }
    
    return flavours;
  } catch (error) {
    console.error('Error listing system prompt flavours:', error);
    return ['default'];
  }
}

/**
 * Validate if a flavour exists
 * @param flavour The flavour name to check
 * @returns True if the flavour exists
 */
export function isFlavourValid(flavour: string): boolean {
  if (flavour === 'default') {
    return true; // Default is always valid (built-in)
  }
  
  const flavoursDir = getFlavoursDirectory();
  const flavourPath = path.join(flavoursDir, `${flavour}.md`);
  return fs.existsSync(flavourPath);
}

/**
 * Get the description for a flavour (if available)
 * Looks for a comment on the first line of the flavour file
 */
export function getFlavourDescription(flavour: string): string | null {
  try {
    if (flavour === 'default') {
      return 'Comprehensive system prompt with full instructions';
    }
    
    if (flavour === 'claude-code') {
      return 'Claude Code style prompt adapted for Ouroboros - concise and direct';
    }
    
    const flavoursDir = getFlavoursDirectory();
    const flavourPath = path.join(flavoursDir, `${flavour}.md`);
    
    if (!fs.existsSync(flavourPath)) {
      return null;
    }
    
    const content = fs.readFileSync(flavourPath, 'utf8');
    const firstLine = content.split('\n')[0];
    
    // Check if first line is a comment with description
    const match = firstLine.match(/^<!--\s*(.+?)\s*-->$/);
    if (match) {
      return match[1];
    }
    
    return null;
  } catch (error) {
    return null;
  }
}
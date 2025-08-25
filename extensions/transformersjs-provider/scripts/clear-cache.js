#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { rmSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

function getDirectorySize(dirPath) {
  if (!existsSync(dirPath)) return 0;
  
  let totalSize = 0;
  
  try {
    const items = readdirSync(dirPath);
    
    for (const item of items) {
      const itemPath = join(dirPath, item);
      const stats = statSync(itemPath);
      
      if (stats.isDirectory()) {
        totalSize += getDirectorySize(itemPath);
      } else {
        totalSize += stats.size;
      }
    }
  } catch (error) {
    // Ignore permission errors
  }
  
  return totalSize;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function listCachedModels(cacheDir) {
  if (!existsSync(cacheDir)) {
    return [];
  }
  
  const models = [];
  
  try {
    const items = readdirSync(cacheDir);
    
    for (const item of items) {
      const itemPath = join(cacheDir, item);
      const stats = statSync(itemPath);
      
      if (stats.isDirectory()) {
        // Check if it looks like a model directory
        const subItems = readdirSync(itemPath);
        if (subItems.some(sub => sub.endsWith('.onnx') || sub.includes('model'))) {
          const size = getDirectorySize(itemPath);
          models.push({
            name: item,
            path: itemPath,
            size: size,
            lastModified: stats.mtime
          });
        }
      }
    }
  } catch (error) {
    // Ignore permission errors
  }
  
  return models;
}

async function main() {
  console.log(`
🗑️  Transformers.js Cache Management
==================================
`);
  
  const cacheDir = join(homedir(), '.cache', 'transformers-js');
  
  if (!existsSync(cacheDir)) {
    console.log('📦 No Transformers.js cache directory found.');
    console.log('   Cache will be created when you first use a model.');
    return;
  }
  
  console.log(`📂 Cache directory: ${cacheDir}`);
  
  // List cached models
  const models = listCachedModels(cacheDir);
  
  if (models.length === 0) {
    console.log('📦 No cached models found.');
    return;
  }
  
  console.log(`\\n📋 Found ${models.length} cached model(s):`);
  
  let totalSize = 0;
  models.forEach((model, index) => {
    totalSize += model.size;
    const lastUsed = model.lastModified.toLocaleDateString();
    console.log(`   ${index + 1}. ${model.name}`);
    console.log(`      Size: ${formatBytes(model.size)}`);
    console.log(`      Last modified: ${lastUsed}`);
  });
  
  console.log(`\\n💾 Total cache size: ${formatBytes(totalSize)}`);
  
  // Check command line arguments
  const args = process.argv.slice(2);
  
  if (args.includes('--clear') || args.includes('--force')) {
    console.log('\\n🗑️  Clearing cache...');
    
    try {
      rmSync(cacheDir, { recursive: true, force: true });
      console.log('✅ Cache cleared successfully!');
      console.log(`   Freed up ${formatBytes(totalSize)} of storage space`);
      
    } catch (error) {
      console.error(`❌ Failed to clear cache: ${error.message}`);
      console.error('   You may need to manually delete the cache directory:');
      console.error(`   rm -rf "${cacheDir}"`);
      process.exit(1);
    }
    
  } else if (args.includes('--help') || args.includes('-h')) {
    console.log(`
📖 Cache Management Options:

   node scripts/clear-cache.js                 # Show cache info (this output)
   node scripts/clear-cache.js --clear         # Clear all cached models
   node scripts/clear-cache.js --force         # Force clear without prompts
   node scripts/clear-cache.js --help          # Show this help

⚠️  Warning: Clearing cache will remove all downloaded models.
   They will need to be re-downloaded on next use (requires internet).

💡 Cached models enable offline usage and faster loading times.
   Only clear cache if you need to free up disk space.
`);
    
  } else {
    console.log(`
💡 To clear the cache, run:
   node scripts/clear-cache.js --clear

⚠️  This will remove all cached models (${formatBytes(totalSize)})
   Models will need to be re-downloaded on next use.

For more options:
   node scripts/clear-cache.js --help
`);
  }
}

main().catch(error => {
  console.error('Cache management failed:', error);
  process.exit(1);
});
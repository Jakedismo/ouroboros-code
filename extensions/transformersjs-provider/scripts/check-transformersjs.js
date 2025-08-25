#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'child_process';
import { homedir } from 'os';
import { join } from 'path';
import { existsSync, statSync } from 'fs';

const TRANSFORMERSJS_DOCS_URL = 'https://huggingface.co/docs/transformers.js';

async function checkNodeVersion() {
  return new Promise((resolve) => {
    const proc = spawn('node', ['--version'], { 
      stdio: 'pipe',
      shell: true 
    });
    
    let version = '';
    proc.stdout.on('data', (data) => {
      version += data.toString();
    });
    
    proc.on('close', (code) => {
      if (code === 0) {
        const versionMatch = version.match(/v(\d+)\.(\d+)/);
        if (versionMatch) {
          const major = parseInt(versionMatch[1]);
          const minor = parseInt(versionMatch[2]);
          resolve({ 
            available: true, 
            version: version.trim(), 
            compatible: major >= 18 || (major === 18 && minor >= 0)
          });
        } else {
          resolve({ available: true, version: version.trim(), compatible: false });
        }
      } else {
        resolve({ available: false });
      }
    });
    
    proc.on('error', () => {
      resolve({ available: false });
    });
  });
}

async function checkTransformersJS() {
  return new Promise((resolve) => {
    const proc = spawn('node', ['-e', 'const t = require("@xenova/transformers"); console.log(t.env?.version || "installed")'], { 
      stdio: 'pipe',
      shell: true 
    });
    
    let output = '';
    proc.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      output += data.toString();
    });
    
    proc.on('close', (code) => {
      if (code === 0 && !output.includes('Cannot find module')) {
        resolve({ installed: true, version: output.trim() });
      } else {
        resolve({ installed: false });
      }
    });
    
    proc.on('error', () => {
      resolve({ installed: false });
    });
  });
}

async function checkWebAssemblySupport() {
  return new Promise((resolve) => {
    const proc = spawn('node', ['-e', `
      try {
        new WebAssembly.Module(new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));
        console.log('supported');
      } catch (e) {
        console.log('not_supported');
      }
    `], { 
      stdio: 'pipe',
      shell: true 
    });
    
    let output = '';
    proc.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    proc.on('close', (code) => {
      resolve(code === 0 && output.trim() === 'supported');
    });
    
    proc.on('error', () => {
      resolve(false);
    });
  });
}

function checkCacheDirectory() {
  const cacheDir = join(homedir(), '.cache', 'transformers-js');
  
  if (!existsSync(cacheDir)) {
    return { exists: false, size: 0 };
  }
  
  try {
    const stats = statSync(cacheDir);
    return { exists: true, size: stats.size, readable: true };
  } catch (error) {
    return { exists: true, size: 0, readable: false };
  }
}

function getInstallInstructions() {
  return `
📋 Install Transformers.js:
   npm install @xenova/transformers

   # For global installation:
   npm install -g @xenova/transformers

🚀 Quick test:
   node -e "
   const { pipeline } = require('@xenova/transformers');
   pipeline('sentiment-analysis', 'Xenova/distilbert-base-uncased-finetuned-sst-2-english')
     .then(classifier => classifier('I love transformers.js!'))
     .then(console.log);
   "

📚 Popular models to try:
   • Text generation: Xenova/gpt2, Xenova/distilgpt2
   • Sentiment analysis: Xenova/distilbert-base-uncased-finetuned-sst-2-english
   • Question answering: Xenova/distilbert-base-uncased-distilled-squad
   • Summarization: Xenova/distilbart-cnn-6-6
   • Embeddings: Xenova/all-MiniLM-L6-v2

For more models: https://huggingface.co/models?library=transformers.js
`;
}

async function main() {
  console.log('🔍 Checking Transformers.js installation...');
  
  // Check Node.js version
  const nodeCheck = await checkNodeVersion();
  
  if (!nodeCheck.available) {
    console.error(`
❌ Node.js not found!

Transformers.js requires Node.js 18 or later. Please install Node.js:
   macOS: brew install node
   Linux: curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs
   Windows: Download from https://nodejs.org

${getInstallInstructions()}
`);
    process.exit(1);
  }
  
  console.log(`✅ Node.js ${nodeCheck.version} found`);
  
  if (!nodeCheck.compatible) {
    console.warn(`
⚠️  Node.js version ${nodeCheck.version} may not be compatible!

Transformers.js works best with Node.js 18 or later. Consider upgrading:
   nvm install node  # if using nvm
   # or download the latest LTS version from https://nodejs.org
`);
  }
  
  // Check WebAssembly support
  const wasmSupported = await checkWebAssemblySupport();
  
  if (!wasmSupported) {
    console.error(`
❌ WebAssembly not supported!

Transformers.js requires WebAssembly support. This usually means:
   • Very old Node.js version (upgrade to Node.js 18+)
   • Custom Node.js build without WASM support
   • System limitations

Please upgrade Node.js or check your installation.
`);
    process.exit(1);
  }
  
  console.log('✅ WebAssembly support available');
  
  // Check Transformers.js installation
  const transformersCheck = await checkTransformersJS();
  
  if (!transformersCheck.installed) {
    console.error(`
❌ Transformers.js not installed!

${getInstallInstructions()}

After installation, models will be downloaded automatically on first use.
This requires an internet connection but models are cached locally.

For offline usage, pre-download models:
   node -e "require('@xenova/transformers').pipeline('text-generation', 'Xenova/gpt2')"
`);
    process.exit(1);
  }
  
  console.log(`✅ Transformers.js installed (${transformersCheck.version})`);
  
  // Check cache directory
  const cacheInfo = checkCacheDirectory();
  
  if (cacheInfo.exists) {
    if (cacheInfo.readable) {
      console.log(`📦 Model cache directory exists: ~/.cache/transformers-js/`);
    } else {
      console.warn(`⚠️  Model cache directory exists but is not readable`);
    }
  } else {
    console.log('📦 Model cache directory will be created on first use');
  }
  
  console.log(`
🎯 Transformers.js installation check complete!

✨ Transformers.js brings Hugging Face models directly to Node.js:
   • 🔒 100% client-side processing (ultimate privacy)  
   • 🚫 No servers required
   • 🌐 Works offline after first download
   • ⚡ WebAssembly-powered performance
   • 🤖 Access to 1000+ pre-trained models

Next steps:
1. Install this extension: ouroboros-code extension install @ouroboros/transformersjs-provider
2. Try text generation: ouroboros-code --provider transformersjs "Write a poem about AI"
3. Try Q&A: ouroboros-code --provider transformersjs --task question-answering "What is AI?"
4. Browse models: https://huggingface.co/models?library=transformers.js

For documentation: ${TRANSFORMERSJS_DOCS_URL}
`);
}

main().catch(error => {
  console.error('Error checking Transformers.js installation:', error);
  process.exit(1);
});
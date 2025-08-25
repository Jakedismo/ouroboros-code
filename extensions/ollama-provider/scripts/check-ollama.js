#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'child_process';
import { platform } from 'os';

const OLLAMA_DOCS_URL = 'https://ollama.ai/download';

async function checkCommand(command) {
  return new Promise((resolve) => {
    const proc = spawn(command, ['--version'], { 
      stdio: 'pipe',
      shell: true 
    });
    
    proc.on('close', (code) => {
      resolve(code === 0);
    });
    
    proc.on('error', () => {
      resolve(false);
    });
  });
}

async function checkOllamaServer() {
  try {
    const response = await fetch('http://localhost:11434/api/version');
    return response.ok;
  } catch {
    return false;
  }
}

function getInstallInstructions() {
  const os = platform();
  
  switch (os) {
    case 'darwin':
      return `
📋 Install Ollama on macOS:
   brew install ollama
   # OR download from ${OLLAMA_DOCS_URL}
   
🚀 Start Ollama:
   ollama serve
`;
    
    case 'linux':
      return `
📋 Install Ollama on Linux:
   curl -fsSL https://ollama.ai/install.sh | sh
   
🚀 Start Ollama:
   ollama serve
`;
    
    case 'win32':
      return `
📋 Install Ollama on Windows:
   Download from ${OLLAMA_DOCS_URL}
   
🚀 Start Ollama:
   ollama serve
`;
    
    default:
      return `
📋 Install Ollama:
   Visit ${OLLAMA_DOCS_URL} for installation instructions
`;
  }
}

async function main() {
  console.log('🔍 Checking Ollama installation...');
  
  const hasOllamaCmd = await checkCommand('ollama');
  const hasServer = await checkOllamaServer();
  
  if (!hasOllamaCmd) {
    console.error(`
❌ Ollama command not found!

The Ollama provider requires Ollama to be installed on your system.
${getInstallInstructions()}

After installation, make sure to pull some models:
   ollama pull llama3.1:8b
   ollama pull llama3.1:13b
   ollama pull codellama:7b

For more information, visit: ${OLLAMA_DOCS_URL}
`);
    process.exit(1);
  }
  
  console.log('✅ Ollama command found');
  
  if (!hasServer) {
    console.warn(`
⚠️  Ollama server is not running!

Please start the Ollama server:
   ollama serve

Or start it in the background:
   nohup ollama serve &

The server needs to be running for the Ollama provider to work.
`);
  } else {
    console.log('✅ Ollama server is running');
  }
  
  console.log(`
🦙 Ollama installation check complete!

Next steps:
1. Make sure Ollama server is running: ollama serve
2. Pull your preferred models: ollama pull llama3.1:8b
3. Start using: ouroboros-code --provider ollama "Hello"

For model recommendations, see: https://ollama.ai/library
`);
}

main().catch(error => {
  console.error('Error checking Ollama installation:', error);
  process.exit(1);
});
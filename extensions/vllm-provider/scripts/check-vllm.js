#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'child_process';
import { platform } from 'os';

const VLLM_DOCS_URL = 'https://vllm.readthedocs.io/en/latest/getting_started/installation.html';

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

async function checkPython() {
  return new Promise((resolve) => {
    const proc = spawn('python', ['-c', 'import sys; print(sys.version)'], { 
      stdio: 'pipe',
      shell: true 
    });
    
    let version = '';
    proc.stdout.on('data', (data) => {
      version += data.toString();
    });
    
    proc.on('close', (code) => {
      if (code === 0) {
        const versionMatch = version.match(/^(\d+)\.(\d+)/);
        if (versionMatch) {
          const major = parseInt(versionMatch[1]);
          const minor = parseInt(versionMatch[2]);
          resolve({ available: true, version: version.trim(), compatible: major >= 3 && minor >= 8 });
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

async function checkVLLM() {
  return new Promise((resolve) => {
    const proc = spawn('python', ['-c', 'import vllm; print(vllm.__version__)'], { 
      stdio: 'pipe',
      shell: true 
    });
    
    let version = '';
    proc.stdout.on('data', (data) => {
      version += data.toString();
    });
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ installed: true, version: version.trim() });
      } else {
        resolve({ installed: false });
      }
    });
    
    proc.on('error', () => {
      resolve({ installed: false });
    });
  });
}

async function checkVLLMServer() {
  try {
    const response = await fetch('http://localhost:8000/v1/models');
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
📋 Install vLLM on macOS:
   # Install with pip
   pip install vllm
   
   # Or with conda
   conda install -c conda-forge vllm
   
   # For GPU support (if you have compatible hardware):
   pip install vllm[cuda]
   
🚀 Start vLLM server:
   python -m vllm.entrypoints.openai.api_server \\
     --model microsoft/DialoGPT-medium \\
     --port 8000
`;
    
    case 'linux':
      return `
📋 Install vLLM on Linux:
   # Install with pip
   pip install vllm
   
   # For CUDA GPU support:
   pip install vllm[cuda]
   
   # For ROCm GPU support:
   pip install vllm[rocm]
   
🚀 Start vLLM server:
   python -m vllm.entrypoints.openai.api_server \\
     --model microsoft/DialoGPT-medium \\
     --port 8000 \\
     --tensor-parallel-size 1
`;
    
    case 'win32':
      return `
📋 Install vLLM on Windows:
   # Install with pip (Windows support is limited)
   pip install vllm
   
   Note: vLLM has limited Windows support. Consider using WSL2 for better compatibility.
   
🚀 Start vLLM server:
   python -m vllm.entrypoints.openai.api_server ^
     --model microsoft/DialoGPT-medium ^
     --port 8000
`;
    
    default:
      return `
📋 Install vLLM:
   Visit ${VLLM_DOCS_URL} for installation instructions
`;
  }
}

async function main() {
  console.log('🔍 Checking vLLM installation...');
  
  // Check Python
  const pythonCheck = await checkPython();
  
  if (!pythonCheck.available) {
    console.error(`
❌ Python not found!

vLLM requires Python 3.8 or later. Please install Python first:
   macOS: brew install python
   Linux: sudo apt-get install python3 python3-pip
   Windows: Download from https://python.org

${getInstallInstructions()}

For more information, visit: ${VLLM_DOCS_URL}
`);
    process.exit(1);
  }
  
  console.log(`✅ Python ${pythonCheck.version} found`);
  
  if (!pythonCheck.compatible) {
    console.warn(`
⚠️  Python version ${pythonCheck.version} may not be compatible!

vLLM requires Python 3.8 or later. Please upgrade Python:
   pyenv install 3.11  # or another recent version
   pyenv global 3.11
`);
  }
  
  // Check vLLM installation
  const vllmCheck = await checkVLLM();
  
  if (!vllmCheck.installed) {
    console.error(`
❌ vLLM not installed!

${getInstallInstructions()}

After installation, you can start a server with popular models:
   python -m vllm.entrypoints.openai.api_server --model microsoft/DialoGPT-medium
   python -m vllm.entrypoints.openai.api_server --model meta-llama/Llama-2-7b-chat-hf
   python -m vllm.entrypoints.openai.api_server --model codellama/CodeLlama-7b-Python-hf

For more models: https://huggingface.co/models
`);
    process.exit(1);
  }
  
  console.log(`✅ vLLM ${vllmCheck.version} installed`);
  
  // Check vLLM server
  const hasServer = await checkVLLMServer();
  
  if (!hasServer) {
    console.warn(`
⚠️  vLLM server is not running!

Please start the vLLM server:
   python -m vllm.entrypoints.openai.api_server \\
     --model microsoft/DialoGPT-medium \\
     --port 8000

For GPU acceleration:
   python -m vllm.entrypoints.openai.api_server \\
     --model microsoft/DialoGPT-medium \\
     --port 8000 \\
     --tensor-parallel-size 1 \\
     --gpu-memory-utilization 0.8

The server needs to be running for the vLLM provider to work.
`);
  } else {
    console.log('✅ vLLM server is running');
    
    try {
      const response = await fetch('http://localhost:8000/v1/models');
      const models = await response.json();
      console.log(`📋 Server has ${models.data.length} model(s) loaded`);
      
      if (models.data.length > 0) {
        console.log('Available models:');
        models.data.forEach(model => {
          console.log(`   • ${model.id}`);
        });
      }
    } catch (error) {
      console.warn(`⚠️  Could not fetch model list: ${error.message}`);
    }
  }
  
  console.log(`
🚀 vLLM installation check complete!

Next steps:
1. Make sure vLLM server is running: python -m vllm.entrypoints.openai.api_server --model [MODEL_NAME]
2. Install this extension: ouroboros-code extension install @ouroboros/vllm-provider  
3. Start using: ouroboros-code --provider vllm "Hello world"

For model recommendations and configuration: ${VLLM_DOCS_URL}
`);
}

main().catch(error => {
  console.error('Error checking vLLM installation:', error);
  process.exit(1);
});
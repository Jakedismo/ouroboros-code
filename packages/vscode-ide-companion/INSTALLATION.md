# Ouroboros VSCode IDE Companion - Quick Installation Guide

## 🚀 Quick Install

### Prerequisites
- VSCode 1.99.0+ or VSCode Insiders
- Node.js 18+ with npm
- Ouroboros CLI installed separately

### Build & Install
```bash
# 1. Build extension
cd packages/vscode-ide-companion
npm install
npm run package

# 2. Install in VSCode
code --install-extension ouroboros-multi-agent-cli-vscode-ide-companion-1.0.0-alpha.2.vsix

# 3. Install in VSCode Insiders
code-insiders --install-extension ouroboros-multi-agent-cli-vscode-ide-companion-1.0.0-alpha.2.vsix
```

## ⚡ Usage
- **Launch CLI**: `Cmd+Shift+P` → "Ouroboros CLI: Run"
- **Accept Diff**: `Ctrl+S` / `Cmd+S` when diff is open
- **View Logs**: Output → "Ouroboros CLI IDE Companion"

## 📖 Full Documentation
See [VSCode Plugin Guide](../../docs/VSCODE_PLUGIN_GUIDE.md) for comprehensive documentation.

## 🎨 Features
- ✅ **Native Ouroboros Icon** - Beautiful blue ouroboros design
- ✅ **Smart Context Sharing** - Open files, selections, cursor position
- ✅ **Interactive Diffs** - Accept/reject code changes in-editor  
- ✅ **MCP Integration** - Advanced Model Context Protocol support
- ✅ **Multi-Workspace** - Handles complex project structures
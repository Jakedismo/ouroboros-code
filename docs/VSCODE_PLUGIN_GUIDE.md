# Ouroboros VSCode IDE Companion

The **Ouroboros VSCode IDE Companion** is a powerful extension that seamlessly integrates the Ouroboros Code CLI with Visual Studio Code and VSCode Insiders. This companion provides enhanced context awareness, native diff management, and streamlined workflow integration.

## 🎯 Features

### **Editor Integration**
- **📂 Open File Context**: Automatically shares your open files with Ouroboros CLI for better project understanding
- **🎯 Selection Context**: Provides real-time cursor position and selected text to the CLI
- **🔄 Native Diffing**: View, review, and accept code changes directly within VSCode
- **⚡ Quick Launch**: Start Ouroboros CLI sessions instantly from Command Palette

### **Advanced Capabilities** 
- **🔧 MCP Integration**: Model Context Protocol server for advanced tool communication
- **🌐 HTTP Bridge**: IDE server facilitates seamless CLI-editor communication
- **📁 Workspace Awareness**: Automatic workspace path detection and configuration
- **🎨 Diff Visualization**: Rich, interactive diff views with accept/cancel controls

## 🚀 Installation

### **Prerequisites**
- Visual Studio Code 1.99.0+ or VSCode Insiders
- Node.js 18+ and npm installed
- Ouroboros Code CLI (install separately)

### **Step 1: Build the Extension**

Navigate to the plugin directory and build:

```bash
cd packages/vscode-ide-companion

# Install dependencies
npm install

# Generate third-party notices
npm run generate:notices

# Build and package the extension
npm run package
```

This creates: `ouroboros-multi-agent-cli-vscode-ide-companion-1.0.0-alpha.2.vsix`

### **Step 2: Install in VSCode**

#### **Command Line Installation (Recommended)**
```bash
# For VSCode
code --install-extension ouroboros-multi-agent-cli-vscode-ide-companion-1.0.0-alpha.2.vsix

# For VSCode Insiders
code-insiders --install-extension ouroboros-multi-agent-cli-vscode-ide-companion-1.0.0-alpha.2.vsix
```

#### **GUI Installation**
1. Open VSCode/VSCode Insiders
2. Press `Cmd+Shift+P` (macOS) or `Ctrl+Shift+P` (Windows/Linux)
3. Type "Extensions: Install from VSIX..."
4. Navigate to and select the `.vsix` file
5. Click "Install" and restart VSCode when prompted

### **Step 3: Verify Installation**

1. Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
2. Search for "Ouroboros CLI: Run"
3. Check Extensions sidebar - should show "Ouroboros Multi-Agent CLI Companion"
4. Verify "Ouroboros CLI IDE Companion" appears in Output channels

## 💡 Usage

### **Launching Ouroboros CLI**

**Method 1: Command Palette**
1. `Cmd+Shift+P` / `Ctrl+Shift+P`
2. Type "Ouroboros CLI: Run"
3. Select workspace folder (if multiple folders open)
4. Terminal opens with Ouroboros CLI active

**Method 2: Direct Terminal**
```bash
# The extension automatically sets workspace environment variables
ouroboros-code "your prompt here"
```

### **Working with Diffs**

When Ouroboros CLI suggests code changes:

1. **View Diff**: Changes appear in split-view diff editor
2. **Accept Changes**: 
   - Press `Ctrl+S` / `Cmd+S` 
   - Or click Accept button in editor toolbar
   - Or use Command Palette: "Ouroboros CLI: Accept Diff"
3. **Cancel Changes**:
   - Click Cancel button in editor toolbar
   - Or use Command Palette: "Ouroboros CLI: Close Diff Editor"

### **Context Sharing**

The extension automatically provides Ouroboros CLI with:

- **📂 Open Files**: All currently open files and their content
- **🎯 Cursor Position**: Current line and column position
- **✂️ Selected Text**: Any text currently selected in the editor
- **📁 Workspace Path**: Current project root directory

### **Advanced Features**

#### **Multi-Folder Workspaces**
- Automatically detects all workspace folders
- Prompts for folder selection when running CLI
- Sets `GEMINI_CLI_IDE_WORKSPACE_PATH` environment variable

#### **MCP Server Integration**
- Runs local MCP (Model Context Protocol) server
- Enables advanced tool communication between CLI and IDE
- Supports real-time bidirectional data exchange

## ⚙️ Configuration

### **Extension Settings**

The extension uses minimal configuration and works out-of-the-box. Key behaviors:

- **Auto-start**: Activates automatically when VSCode starts
- **Port Management**: Uses dynamic port allocation for IDE server
- **Environment Variables**: Automatically configures workspace paths

### **Workspace Integration**

Add to your project's `.vscode/settings.json` for team consistency:

```json
{
  "ouroboros.autoLaunch": true,
  "ouroboros.diffTimeout": 30000
}
```

## 🔧 Development & Debugging

### **Development Mode**

For extension development:

```bash
# Watch mode with auto-rebuild
npm run watch

# In VSCode, press F5 to launch Extension Development Host
# Or use "Run and Debug" panel → "Run Extension"
```

### **Debugging**

1. **Extension Host Logs**: View → Output → "Ouroboros CLI IDE Companion"
2. **Developer Tools**: Help → Toggle Developer Tools
3. **Extension Logs**: Check extension output channel for detailed logs

### **Testing**

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:ci

# Type checking
npm run check-types
```

## 🚨 Troubleshooting

### **Common Issues**

**Extension Not Loading**
- Restart VSCode after installation
- Check Extensions view for error messages
- Verify VSCode version >= 1.99.0

**CLI Commands Not Working**
- Ensure Ouroboros CLI is installed and in PATH
- Check terminal for error messages
- Verify workspace folder is open

**Diff Not Appearing**
- Check if diff scheme is registered
- Look for errors in Output → "Ouroboros CLI IDE Companion"
- Try closing and reopening the diff editor

**MCP Server Issues**
- Check port availability (extension uses dynamic ports)
- Verify no firewall blocking local connections
- Look for MCP-related errors in extension logs

### **Getting Help**

1. **Check Logs**: Output → "Ouroboros CLI IDE Companion"
2. **Extension Issues**: Check installed extensions for error badges
3. **CLI Issues**: Run `ouroboros-code --debug` for detailed output
4. **File Issues**: Report at project repository

## 📝 License & Attribution

This extension is part of the Ouroboros project and follows the project's licensing terms. See `LICENSE` file for details.

Third-party notices and attributions are available via Command Palette: "Ouroboros CLI: View Third-Party Notices"

---

## 🔗 Related Documentation

- [Ouroboros CLI Documentation](../README.md)
- [MCP Integration Guide](./MCP_INTEGRATION.md)
- [Development Setup](../DEVELOPMENT.md)
- [Troubleshooting Guide](./TROUBLESHOOTING.md)
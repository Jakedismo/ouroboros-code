# Changelog

All notable changes to Ouroboros Code will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0-alpha.6] - 2025-01-24

### Added
- **🔐 Claude OAuth Authentication System**: Complete OAuth 2.0 Authorization Code Flow with PKCE for Claude Max subscribers
  - RFC 7636 compliant PKCE generator with SHA-256 challenges for enhanced security
  - Local callback server (port 54545) with user-friendly HTML success/error pages
  - Multi-format token storage supporting Ouroboros, Python SDK, and legacy Claude CLI formats
  - Enhanced OAuth manager with automatic token refresh and exponential backoff retry logic
  - Browser integration with optional `--no-browser` mode for headless environments

- **🚀 CLI Authentication Commands**: New `ouroboros-code auth claude` command suite
  - `auth claude login` - OAuth authentication flow with port configuration options
  - `auth claude status` - Authentication status with detailed token information (`--verbose`)
  - `auth claude logout` - Token revocation with local/server options (`--local-only`)
  - `auth claude import` - Import tokens from Python SDK and Claude CLI locations (`--list-sources`)

- **🔒 Security & Compatibility Features**:
  - Secure token storage with 0o600 file permissions
  - State validation and CSRF protection against OAuth attacks
  - Cross-platform compatibility with Python SDK (`~/.claude_code/tokens.json`)
  - Legacy Claude CLI support (`~/.claude/.credentials.json`)
  - Automatic port conflict detection and resolution

### Enhanced
- **AnthropicProvider Integration**: Added OAuth methods for seamless Claude Max authentication
- **Backward Compatibility**: Legacy OAuth manager wrapper maintains existing API contracts
- **CLI Help System**: Enhanced help text with OAuth authentication examples and usage patterns

### Changed
- Claude authentication now supports both API keys and OAuth 2.0 for Claude Max subscribers
- Command-line help updated to reflect new authentication options
- Provider selection enhanced with OAuth capability indicators

## [1.0.0-alpha.5] - 2025-01-23

### Added
- **Experimental A2A Mode**: Added `--experimental-a2a-mode` flag to enable Agent-to-Agent communication via webhooks (port 45123) in interactive mode
- **PID-Based Message Filtering**: Implemented client filtering system for targeted agent-to-agent routing
- **Broadcast Message Support**: Messages without target PID are treated as broadcasts and processed by all agents
- **Enhanced Webhook System**: Added target_pid field to webhook payloads for precise message routing

### Enhanced
- **Agent Communication**: A2A handlers now track their process PID for targeted message filtering
- **Webhook Server**: Enhanced logging to distinguish between broadcast and targeted messages
- **Debug Output**: Comprehensive logging for message routing and filtering decisions

### Changed
- A2A communication now available in interactive mode with `--experimental-a2a-mode` flag
- Webhook payload structure extended with optional target_pid field for targeted messaging

## [1.0.0-alpha.2] - 2025-08-22

### Changed
- Updated all package versions to 1.0.0-alpha.2
- Enhanced ASCII art with 3D shading effects for better visual impact
- Fixed Tips component to properly display updated branding

### Fixed
- Resolved issue where old text was showing due to uncompiled TypeScript files
- Ensured all JavaScript files are properly generated from TypeScript sources

## [1.0.0-alpha.1] - 2025-08-22

### 🎉 Major Release: Ouroboros Code Multi-Agent Framework

This release transforms the Gemini CLI into **Ouroboros Code**, a powerful multi-agent AI framework supporting multiple LLM providers while maintaining full backward compatibility with Gemini CLI.

### Added

#### 🐍 Multi-LLM Provider Support
- **OpenAI Integration**: Full support for GPT-5 models with all builtin tools
- **Anthropic Integration**: Complete Claude 4 support with unified tool architecture
- **Provider Flexibility**: Seamlessly switch between Gemini, OpenAI, and Anthropic without code changes
- **Zero Migration Cost**: All 11 builtin tools work identically across every provider

#### 🔧 Unified Builtin-Tools Architecture
- **File Operations**: `read_file`, `write_file`, `edit_file`, `read_many_files` work across all providers
- **Search Tools**: `ls`, `glob`, `grep` with consistent behavior
- **Web Tools**: `web_fetch`, `google_web_search` unified across providers
- **System Tools**: `run_shell_command`, `save_memory` with provider-agnostic execution
- **Performance Optimization**: Intelligent caching and resource pooling
- **Security Validation**: Unified security boundaries across all providers

#### 🎯 Advanced Multi-Provider Commands
- **`/compare`**: Parallel solutions from multiple providers for comprehensive analysis
- **`/converge`**: Synthesize responses from all providers into unified insights
- **`/challenge`**: Create adversarial dialogues between providers for critical analysis
- **`/blindspot`**: Identify what each provider might be missing
- **`/race`**: Performance-optimized provider racing for fastest responses

#### 📝 Smart Instruction File System
- **Multi-File Support**: Support for OUROBOROS.md, CLAUDE.md, GEMINI.md, AGENTS.md, QWEN.md, CRUSH.md
- **Priority Loading**: Automatic selection based on priority (OUROBOROS > CLAUDE > GEMINI > AGENTS > QWEN > CRUSH)
- **Backward Compatibility**: Existing GEMINI.md files continue to work
- **Dynamic `/init` Command**: Creates appropriate instruction file based on context

#### 🔌 Advanced MCP Integration
- **Connection Pooling**: Efficient connection management with automatic reconnection
- **Timeout Management**: Configurable timeouts with automatic cleanup
- **Cross-Provider Sync**: Unified tool discovery and synchronization
- **Webhook Support**: Asynchronous tool execution with callback capabilities

#### 🏗️ Architecture Improvements
- **Provider Factory Pattern**: `LLMProviderFactory` with `ProviderToolAdapter` abstraction
- **Tool Manager**: Centralized `BuiltinToolManager` for consistent tool behavior
- **Performance Optimizer**: Resource management for long-running operations
- **Security Boundaries**: `FilesystemBoundary` for safe file operations

### Changed

#### 🎨 Branding Updates
- **Startup Screen**: Updated to show "OUROBOROS CODE" ASCII art
- **Tips Component**: References to "instruction files" instead of just "GEMINI.md"
- **Command Names**: Primary command is now `ouroboros-code` (with `gemini` alias for compatibility)
- **Documentation**: README emphasizes Ouroboros features while preserving Gemini functionality

#### 🔄 Enhanced Features
- **Memory Tool**: Now supports array of instruction filenames with priority selection
- **File Discovery**: Enhanced to search for all supported instruction file types
- **Init Command**: Creates OUROBOROS.md by default, checks for existing instruction files

### Fixed
- **Tool Consistency**: Resolved discrepancies in tool behavior across providers
- **Provider Migration**: Eliminated functionality loss when switching providers
- **Memory Loading**: Fixed to use only highest priority instruction file

### Security
- **Unified Validation**: All providers now use the same security validation
- **Filesystem Boundaries**: Consistent file access controls across providers
- **Webhook Security**: Secure callback mechanism for asynchronous operations

### Deprecated
- None in this release - full backward compatibility maintained

### Removed
- None in this release - all existing features preserved

## Migration Guide

### From Gemini CLI to Ouroboros Code

1. **No Breaking Changes**: Existing Gemini CLI setups continue to work
2. **Optional Upgrade Path**: 
   - Create OUROBOROS.md for Ouroboros-specific instructions
   - Existing GEMINI.md files are still supported
3. **New Commands Available**: Try `/compare`, `/converge`, `/challenge` for multi-provider features
4. **Provider Selection**: Use `--provider` flag to switch between Gemini, OpenAI, and Anthropic

### For New Users

1. **Installation**: `npm install -g @google/gemini-cli`
2. **First Run**: `ouroboros-code` or `gemini`
3. **Create Instructions**: Run `/init` to create OUROBOROS.md
4. **Set API Keys**: Configure keys for desired providers (GEMINI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY)

## Contributors

This major release was made possible by the collaborative effort of the Ouroboros development team, building upon the excellent foundation of Gemini CLI.

---

For more information, see the [README](./README.md) and [documentation](./docs/).
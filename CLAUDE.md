# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is **Ouroboros** - an open-source multi-agent AI framework that brings the power of **multiple LLM providers** (Gemini, OpenAI, Anthropic) directly into your terminal. It features a **unified builtin-tools architecture** providing identical functionality across all providers, with advanced **MCP (Model Context Protocol) tools integration**, sophisticated connection pooling, webhook callbacks, comprehensive security validation, and innovative **convergence analysis** capabilities.

## 🚨 CRITICAL: Merging Without Breaking Ouroboros Features

### When Merging from Upstream (Google's Gemini CLI)

**IMPORTANT**: This project extends Google's Gemini CLI with significant additional features. When merging upstream changes, you MUST preserve all Ouroboros-specific functionality.

### Pre-Merge Checklist

1. **Identify Current Ouroboros Features**:
   ```bash
   # Check for ouroboros-specific files and features
   grep -r "ouroboros" --include="*.ts" --include="*.tsx" --include="*.json"
   grep -r "multi-llm\|multi-provider" --include="*.ts" 
   find . -name "*agent*" -o -name "*workflow*" -o -name "*provider*"
   ```

2. **Document Current State**:
   ```bash
   # Save current package versions
   cat package.json | grep version > ouroboros-versions.txt
   # List all ouroboros-specific commands
   grep -h "Command:" packages/cli/src/ui/commands/*.ts
   ```

### Merge Strategy

1. **Create Integration Branch**:
   ```bash
   # Never merge directly into main ouroboros branch
   git checkout -b integration/upstream-merge-YYYYMMDD
   ```

2. **Selective Merge Approach**:
   ```bash
   # Don't use git merge --strategy=ours
   # Instead, cherry-pick or manually apply changes
   git fetch upstream main
   git log upstream/main --oneline | head -20  # Review changes
   ```

3. **Preserve These Critical Files**:
   - `package.json` - Keep ouroboros naming and versions
   - `packages/cli/src/config/config.ts` - Preserve CLI flags and help text
   - `packages/cli/src/ui/commands/agentCommand.ts` - Agent system
   - `packages/cli/src/ui/components/Sidebar.tsx` - TUI components
   - `packages/cli/src/ui/components/ContextPanel.tsx` - TUI components
   - `packages/core/src/providers/` - Multi-LLM provider system
   - All files in `ouroboros/` directory

### Post-Merge Verification

1. **Verify Package Names**:
   ```bash
   # Should show @ouroboros/ouroboros-code
   grep '"name":' package.json
   # Binary should be ouroboros-code, not gemini
   grep '"bin":' package.json
   ```

2. **Check Advanced Features**:
   ```bash
   # Test build
   npm run build
   
   # Verify CLI flags exist
   npm start -- --help | grep -E "autonomous|system-prompt|a2a"
   
   # Check providers
   ls packages/core/src/providers/{openai,anthropic,gemini}
   ```

3. **Test Commands**:
   ```bash
   # These should work
   npm start -- --help  # Should show ouroboros-code
   echo "/agent list" | npm start
   echo "/help" | npm start  # Should list /agent command
   ```

### Feature Preservation List

#### Core Ouroboros Features to Preserve:
1. **Multi-LLM Support**: OpenAI, Anthropic providers in `packages/core/src/providers/`
2. **Agent System**: `/agent` command and future agent framework
3. **Workflow System**: WorkflowProgressContext and monitoring
4. **TUI Enhancements**: Sidebar, ContextPanel, keyboard shortcuts
5. **Advanced CLI Flags**:
   - `--autonomous` - Autonomous agent mode
   - `--system-prompt` - Custom system prompts
   - `--experimental-a2a-mode` - Agent-to-agent communication
   - `--max-concurrent-tools` - Tool execution limits
   - `--confirmation-mode` - Safety controls
6. **Package Naming**: All `@ouroboros/ouroboros-code*` names
7. **Binary Name**: `ouroboros-code` not `gemini`
8. **Vision Quest/Saga**: Future `/saga` command system (see `ouroboros/tbd/vision_quest.md`)

### Recovery Instructions

If a merge breaks Ouroboros features:

1. **Check Git History**:
   ```bash
   # Find last good ouroboros commit
   git log --grep="ouroboros" --oneline
   # Cherry-pick lost features
   git cherry-pick <commit-hash>
   ```

2. **Restore from Feature Branches**:
   ```bash
   # Key feature branches to reference
   git checkout feature/ouroboros-enhancements -- packages/cli/src/ui/commands/agentCommand.ts
   git checkout feature/multi-llm -- packages/core/src/providers/
   ```

3. **Manual Recovery Checklist**:
   - [ ] Restore package.json names and versions
   - [ ] Restore CLI help text and flags in config.ts
   - [ ] Restore /agent command
   - [ ] Restore provider implementations
   - [ ] Restore TUI components
   - [ ] Update imports from @google/gemini-cli to @ouroboros/ouroboros-code

### Testing After Merge

Run this test suite after any merge:

```bash
# 1. Build test
npm run build

# 2. Installation test
npm run bundle && npm install -g gemini-code-bundle.tgz
ouroboros-code --version  # Should work

# 3. Feature tests
echo "/agent status" | ouroboros-code
echo "/help" | ouroboros-code | grep agent

# 4. Provider test (if API keys configured)
echo "test" | ouroboros-code --provider openai
echo "test" | ouroboros-code --provider anthropic

# 5. Clean up
npm uninstall -g @ouroboros/ouroboros-code
```

## Architecture

The codebase follows a **monorepo structure** with two main packages:

### Core Components

- **`packages/cli/`**: User-facing terminal interface that handles input processing, history management, display rendering, theme customization, and CLI configuration
- **`packages/core/`**: Backend service that manages multi-provider AI communication, prompt construction, tool registration/execution, and session state management
- **`packages/vscode-ide-companion/`**: VS Code extension companion
- **`packages/test-utils/`**: Shared testing utilities

### Tools System

**Multi-LLM Builtin-Tools with Advanced MCP Integration** (`packages/core/src/providers/tools/`):

**All 11 builtin tools work identically across OpenAI, Anthropic, and Gemini:**

- File system operations (`read_file`, `write_file`, `edit_file`, `ls`, `glob`, `grep`, `read_many_files`)
- Web operations (`web_fetch`, `google_web_search`)
- System operations (`run_shell_command`, `save_memory`)
- **Provider-agnostic execution** with unified security validation
- **Seamless provider migration** with zero functionality loss
- **Performance optimization** with intelligent caching and resource pooling
- **Advanced MCP integration** with connection pooling, timeout management, and cross-provider tool synchronization
- **Webhook callback support** for asynchronous tool execution

## Common Development Commands

### Building

```bash
npm run build                 # Build main project
npm run build:all            # Build main project and sandbox
npm run build:packages       # Build all workspace packages
npm run build:sandbox        # Build sandbox environment
npm run build:vscode         # Build VS Code companion
```

### Testing

```bash
npm test                     # Run all tests
npm run test:ci              # Run tests with CI settings
npm run test:e2e             # Run end-to-end tests
npm run test:integration:all # Run all integration tests
npm run test:scripts         # Run script tests
```

### Code Quality

```bash
npm run lint                 # Lint code
npm run lint:fix             # Auto-fix linting issues
npm run lint:ci              # Lint with CI settings (zero warnings)
npm run format               # Format code with Prettier
npm run typecheck            # TypeScript type checking
```

### Development

```bash
npm run start                # Start Ouroboros Code CLI
npm run debug                # Start in debug mode with inspector
npm run preflight            # Full pre-commit check (clean, install, format, lint, build, typecheck, test)
npm run clean                # Remove generated files
```

### Using Makefile (Alternative)

```bash
make build                   # Build project
make test                    # Run tests
make lint                    # Lint code
make format                  # Format code
make preflight               # Full pre-commit check
make start                   # Start Ouroboros Code CLI
make debug                   # Debug mode
```

## Key Development Areas

### Authentication Systems

- **OAuth2 flow**: `packages/core/src/code_assist/oauth2.ts`
- **Authentication config**: `packages/cli/src/config/auth.ts`
- **Google auth provider**: `packages/core/src/mcp/google-auth-provider.ts`

### Multi-LLM Provider Architecture

- **Provider factory**: `packages/core/src/providers/factory.ts` + `packages/core/src/providers/factory-with-mcp.ts`
- **Provider implementations**: `packages/core/src/providers/{openai,anthropic,gemini}/`
- **Unified tool adapters**: `packages/core/src/providers/{openai,anthropic}/tool-adapter.ts`
- **Complete provider integration**: `packages/core/src/providers/{openai,anthropic}/builtin-tools-integration.ts`

### Builtin-Tools System

- **Unified tool interface**: `packages/core/src/providers/tools/unified-tool-interface.ts`
- **Builtin tool manager**: `packages/core/src/providers/tools/builtin-tool-manager.ts`
- **Security boundaries**: `packages/core/src/providers/tools/filesystem-boundary.ts`
- **Performance optimization**: `packages/core/src/providers/tools/performance-optimizer.ts`

### Advanced MCP Integration

- **MCP tool manager**: `packages/core/src/providers/tools/mcp-tool-manager.ts`
- **Connection pooling**: `packages/core/src/providers/tools/mcp-connection-manager.ts`
- **Tool discovery sync**: `packages/core/src/providers/tools/tool-discovery-sync.ts`
- **Multi-provider MCP config**: `packages/core/src/config/multi-provider-mcp-config.ts`
- **MCP client manager**: `packages/core/src/tools/mcp-client-manager.ts`
- **MCP tools**: `packages/core/src/tools/mcp-tool.ts`
- **MCP commands**: `packages/cli/src/commands/mcp/`

### Webhooks Integration

- **Webhook server**: `packages/core/src/webhooks/webhook-server.ts`
- **Asynchronous callbacks**: Support for real-time tool execution notifications

### Tool Development

- **Tool registry**: `packages/core/src/tools/tool-registry.ts`
- **Individual tools**: `packages/core/src/tools/`
- **Tool execution**: `packages/core/src/core/coreToolScheduler.ts`

### UI Components

- **React components**: `packages/cli/src/ui/components/`
- **Theme system**: `packages/cli/src/ui/themes/`
- **Command handlers**: `packages/cli/src/ui/commands/`

### File Operations

- **File discovery**: `packages/core/src/services/fileDiscoveryService.ts`
- **File system service**: `packages/core/src/services/fileSystemService.ts`
- **File search**: `packages/core/src/utils/filesearch/`

## Testing Strategy

- **Unit tests**: Co-located `.test.ts` files
- **Integration tests**: `/integration-tests/` directory
- **Test utilities**: `packages/test-utils/`
- **Mock configurations**: `packages/core/src/__mocks__/`

## Configuration Files

- **Settings schema**: `packages/cli/src/config/settingsSchema.ts`
- **Environment context**: `packages/core/src/utils/environmentContext.ts`
- **Workspace context**: `packages/core/src/utils/workspaceContext.ts`

## Git Worktree Development Structure

This project uses **git worktree** for parallel feature development. Each worktree is an isolated workspace with its own dependencies and build artifacts.

### Worktree Layout

```plaintext
/Users/jokkeruokolainen/Documents/Solita/GenAI/IDE/
├── ouroboros-coder-agent/     # Main development branch (dev/base)
├── multi-llm/                 # Multi-LLM provider support
├── mcp-webhooks/              # MCP webhook callbacks
├── builtin-tools/             # Built-in tools integration
├── mcp-tools/                 # MCP tools integration
├── integration/               # Complete feature integration
└── experimental/              # Experimental playground
```

### Worktree Purpose & Usage

#### Main Development (`ouroboros-coder-agent/`)

- **Branch**: `dev/base` - Primary development branch
- **Purpose**: Upstream tracking, base for all feature branches
- **Usage**: Sync with upstream, create new worktrees, general maintenance

#### Feature Worktrees

##### Multi-LLM (`multi-llm/`)

- **Branch**: `feature/multi-llm`
- **Purpose**: Multi-LLM provider architecture (OpenAI, Anthropic, etc.)
- **Development**: Provider adapters, unified API interfaces
- **Structure**: Add directories in `packages/core/src/providers/`

##### MCP Webhooks (`mcp-webhooks/`)

- **Branch**: `feature/mcp-webhooks`
- **Purpose**: MCP webhook callback support for server communication
- **Development**: Webhook servers, callback handlers
- **Structure**: Add directories in `packages/core/src/webhooks/`

##### Built-in Tools (`builtin-tools/`)

- **Branch**: `feature/builtin-tools-integration`
- **Purpose**: Built-in tools integration across all providers
- **Development**: Tool managers, provider-agnostic tool interfaces
- **Structure**: Add directories in `packages/core/src/providers/tools/`

##### MCP Tools (`mcp-tools/`)

- **Branch**: `feature/mcp-tools-integration`
- **Purpose**: Advanced MCP tool integrations
- **Development**: Enhanced MCP tool capabilities, advanced integrations

##### Integration (`integration/`)

- **Branch**: `feature/complete-integration`
- **Purpose**: Merge and test all features together
- **Usage**: Feature integration, conflict resolution, comprehensive testing

##### Experimental (`experimental/`)

- **Branch**: `experimental/playground`
- **Purpose**: Safe testing ground for experimental features
- **Usage**: Prototyping, proof-of-concepts, high-risk experiments

### Worktree Development Workflow

#### Starting Work in a Worktree

```bash
# Always check which worktree you're in
git worktree list

# Navigate to appropriate worktree
cd /Users/jokkeruokolainen/Documents/Solita/GenAI/IDE/[worktree-name]

# Verify you're on correct branch
git branch --show-current

# Update with latest changes
git fetch origin
git rebase origin/dev/base  # or git merge origin/dev/base
```

#### Development Cycle

```bash
# Make changes in appropriate worktree
npm test                    # Run tests
npm run lint                # Check code quality
npm run build               # Verify build

# Commit changes
git add .
git commit -m "feat: descriptive commit message"
git push origin [branch-name]
```

#### Sync with Upstream (Daily)

```bash
# In main worktree (ouroboros-coder-agent)
cd /Users/jokkeruokolainen/Documents/Solita/GenAI/IDE/ouroboros-coder-agent
git checkout dev/base
git fetch upstream
git merge upstream/main     # Get latest from upstream
git push origin dev/base    # Update your fork

# Update feature worktrees
cd ../[feature-worktree]
git fetch origin
git rebase origin/dev/base  # Apply upstream changes
```

#### Integration Workflow ✅ IN PROGRESS - COMPLETING MCP TOOLS

```bash
# In integration worktree
cd /Users/jokkeruokolainen/Documents/Solita/GenAI/IDE/integration

# ✅ COMPLETED INTEGRATIONS:
git merge origin/feature/multi-llm           # ✅ Done
git merge origin/feature/mcp-webhooks        # ✅ Done
git merge origin/feature/builtin-tools-integration  # ✅ Done
git merge feature/mcp-tools-integration      # ✅ Done

# ✅ INTEGRATION ACHIEVEMENTS SO FAR:
# - Multi-LLM provider architecture (OpenAI, Anthropic, Gemini)
# - All 11 builtin tools work identically across all providers
# - MCP webhook callback system for asynchronous execution
# - Advanced MCP tools with connection pooling, caching, timeout management
# - Updated model versions (GPT-5, Claude 4, etc.)
# - Unified security validation and performance optimization
# - Zero functionality loss during provider migration
# - Cross-provider tool discovery and synchronization
# - Blindspot detection across provider responses (/blindspot command)
# - Adversarial challenges between providers (/challenge command)

# Test and validate integration
npm test
npm run test:integration
npm run build
git push origin feature/complete-integration
```

### Worktree Management Commands

```bash
# List all worktrees and their status
git worktree list

# Check status across all worktrees
for dir in ouroboros-coder-agent multi-llm mcp-webhooks builtin-tools mcp-tools integration experimental; do
  echo "=== $dir ==="
  (cd /Users/jokkeruokolainen/Documents/Solita/GenAI/IDE/$dir && git status -sb)
done

# Remove a worktree when done
git worktree remove ../[worktree-name]

# Clean up stale references
git worktree prune
```

### Development Guidelines for Coding Agents

1. **Always identify current worktree** before making changes:

   ```bash
   pwd  # Check current directory
   git branch --show-current  # Check current branch
   ```

2. **Use appropriate worktree for feature work**:
   - Multi-LLM providers → `multi-llm/`
   - MCP webhooks → `mcp-webhooks/`
   - Tool integration → `builtin-tools/` or `mcp-tools/`
   - Feature combination → `integration/`
   - Experiments → `experimental/`

3. **Sync before starting work**:

   ```bash
   git fetch origin
   git rebase origin/dev/base
   ```

4. **Test in isolation** within each worktree before integration

5. **Use integration worktree** for testing feature combinations

### Parallel Development Benefits

- **No branch switching**: Work on multiple features simultaneously
- **Isolated builds**: Each worktree has independent node_modules
- **Clean git history**: Features develop independently
- **Easy testing**: Run tests in parallel across worktrees
- **Safe experimentation**: Experimental worktree for risky changes

## Sandboxing

The project includes sophisticated sandboxing capabilities:

- **Sandbox configs**: `packages/cli/src/utils/sandbox-macos-*.sb`
- **Sandbox service**: `packages/cli/src/utils/sandbox.ts`
- **Docker/Podman support**: Integration tests cover multiple sandbox environments

## 🚧 Integration Status: COMPLETING MCP TOOLS INTEGRATION

### **Multi-LLM Builtin-Tools with Advanced MCP Integration** 🔄

The integration worktree has successfully merged and is completing:

- **✅ MCP Webhooks** - Asynchronous tool execution with callback support
- **✅ Multi-LLM Providers** - OpenAI, Anthropic, Gemini with unified interfaces
- **✅ Builtin-Tools System** - All 11 tools work identically across providers
- **✅ Model Updates** - Latest GPT-5, Claude 4, etc. model versions
- **🔄 Advanced MCP Tools** - Connection pooling, timeout management, cross-provider sync
- **✅ Architecture Integration** - `LLMProviderFactory`, `ProviderToolAdapter` pattern
- **✅ Documentation** - `PROVIDER_MIGRATION_GUIDE.md`, updated user guides

### **New MCP Tools Features Being Integrated**

1. **Advanced Connection Management** - Connection pooling with automatic reconnection
2. **Sophisticated Caching** - Result caching with intelligent eviction strategies
3. **Timeout Management** - Configurable timeouts with automatic cleanup
4. **Memory Management** - Efficient resource management for long-running operations
5. **Cross-Provider Tool Discovery** - Unified tool synchronization across all providers
6. **Provider-Specific Optimization** - Tailored configurations for OpenAI, Anthropic, Gemini

### **Usage Examples**

```bash
# Use OpenAI with advanced MCP tools
ouroboros-code "Read package.json and analyze dependencies" --provider openai --enable-mcp

# Use Anthropic with all builtin tools and MCP integration
ouroboros-code "Search for TODO comments in src/" --provider anthropic --enable-mcp

# Use Gemini with advanced MCP features (default)
ouroboros-code "Run tests and show results"
```

See `INTEGRATION_COMPLETE_SUMMARY.md` for comprehensive details.

# important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.
# Git Worktree Development Setup for Multi-LLM Features

## Why Git Worktree is Perfect for This Project

### Key Benefits

1. **Parallel Development**: Work on multiple features simultaneously without switching branches
2. **Clean Upstream Tracking**: Keep main branch pristine for upstream syncs
3. **Isolated Builds**: Each worktree has its own node_modules and build artifacts
4. **Easy Testing**: Run tests in different implementations simultaneously
5. **No Stashing**: Switch between features instantly without stashing changes
6. **Conflict Resolution**: Easier to manage merge conflicts in separate directories

## Initial Repository Setup

### 1. Fork and Clone the Repository

```bash
# Fork on GitHub first, then:
git clone https://github.com/YOUR_USERNAME/gemini-cli.git gemini-cli-main
cd gemini-cli-main

# Add upstream remote
git remote add upstream https://github.com/google-gemini/gemini-cli.git
git fetch upstream
```

### 2. Setup Branch Structure

```bash
# Ensure main tracks upstream
git checkout main
git branch --set-upstream-to=upstream/main

# Create development base branch
git checkout -b dev/base
git push -u origin dev/base
```

## Worktree Structure

### Recommended Directory Layout

```plaintext
ouroboros-coder-agent/           # Parent directory
├── main/                         # Main worktree (tracks upstream)
├── multi-llm/                    # Multi-LLM provider feature
├── mcp-webhooks/                 # MCP webhook callbacks feature
├── builtin-tools/                # Built-in tools integration
├── integration/                  # Integration of all features
└── experimental/                 # Experimental features
```

## Setting Up Worktrees

### 1. Create Base Worktree Structure

```bash
# From the parent directory
mkdir gemini-cli
cd gemini-cli

# Clone as the main worktree
git clone https://github.com/YOUR_USERNAME/gemini-cli.git main
cd main
git remote add upstream https://github.com/google-gemini/gemini-cli.git
```

### 2. Create Feature Worktrees

```bash
# Multi-LLM Provider Support
git worktree add -b feature/multi-llm ../multi-llm dev/base
cd ../multi-llm
npm install
npm run build

# MCP Webhook Callbacks
cd ../ouroboros-coder-agent
git worktree add -b feature/mcp-webhooks ../mcp-webhooks dev/base
cd ../mcp-webhooks
npm install
npm run build

# Built-in Tools Integration
cd ../ouroboros-coder-agent
git worktree add -b feature/builtin-tools-integration ../builtin-tools dev/base
cd ../builtin-tools
npm install
npm run build

# MCP Tools Integration
cd ../ouroboros-coder-agent
git worktree add -b feature/mcp-tools-integration ../mcp-tools dev/base
cd ../mcp-tools
npm install
npm run build

# Integration Branch (combines all features)
cd ../ouroboros-coder-agent
git worktree add -b feature/complete-integration ../integration dev/base
cd ../integration
npm install
```

### 3. Create Experimental Worktree

```bash
cd ../ouroboros-coder-agent
git worktree add -b experimental/playground ../experimental dev/base
```

## Development Workflow

### Daily Workflow

#### 1. Start Your Day - Sync with Upstream

```bash
# Update main worktree
cd ~/ouroboros-coder-agent/main
git checkout main
git fetch upstream
git merge upstream/main
git push origin main

# Update base branch
git checkout dev/base
git merge main
git push origin dev/base
```

#### 2. Update Feature Worktrees

```bash
# For each feature worktree
cd ~/ouroboros-coder-agent/multi-llm
git fetch origin
git rebase origin/dev/base

# Alternatively, merge if you prefer
# git merge origin/dev/base
```

#### 3. Develop in Isolated Worktrees

```bash
# Work on multi-LLM feature
cd ~/ouroboros-coder-agent/multi-llm
# Make changes
npm test
git add .
git commit -m "feat: add OpenAI provider adapter"
git push origin feature/multi-llm
```

### Feature Development Workflow

#### Phase 1: Multi-LLM Providers

```bash
cd ~/ouroboros-coder-agent/multi-llm

# Create provider structure
mkdir -p packages/core/src/providers/{openai,anthropic,gemini}
# Implement providers as per plan
npm test
git add .
git commit -m "feat: implement multi-LLM provider architecture"
```

#### Phase 2: MCP Webhooks

```bash
cd ~/ouroboros-coder-agent/mcp-webhooks

# Create webhook structure
mkdir -p packages/core/src/webhooks
# Implement webhook server
npm test
git add .
git commit -m "feat: add MCP webhook callback support"
```

#### Phase 3: Built-in Tools

```bash
cd ~/ouroboros-coder-agent/builtin-tools

# Create tools integration
mkdir -p packages/core/src/providers/tools
# Implement tool managers
npm test
git add .
git commit -m "feat: enable built-in tools for all providers"
```

#### Phase 4: Integration

```bash
cd ~/ouroboros-coder-agent/integration

# Merge all features
git merge origin/feature/multi-llm
git merge origin/feature/mcp-webhooks
git merge origin/feature/builtin-tools-integration

# Resolve conflicts, test integration
npm test
npm run test:integration
git push origin feature/complete-integration
```

## Managing Worktrees

### List All Worktrees

```bash
cd ~/ouroboros-coder-agent/main
git worktree list
```

Output:

```
$(pwd)/ouroboros-coder-agent/main          abc1234 [main]
$(pwd)/ouroboros-coder-agent/multi-llm     def5678 [feature/multi-llm]
$(pwd)/ouroboros-coder-agent/mcp-webhooks  ghi9012 [feature/mcp-webhooks]
$(pwd)/ouroboros-coder-agent/builtin-tools jkl3456 [feature/builtin-tools-integration]
$(pwd)/ouroboros-coder-agent/integration   mno7890 [feature/complete-integration]
```

### Remove a Worktree

```bash
# When done with a feature
cd ~/ouroboros-coder-agent/main
git worktree remove ../experimental
```

### Clean Up Stale Worktrees

```bash
git worktree prune
```

## Handling Upstream Changes

### Weekly Upstream Sync Process

```bash
#!/bin/bash
# save as ~/ouroboros-coder-agent/sync-upstream.sh

cd ~/ouroboros-coder-agent/main

# Update main
git checkout main
git fetch upstream
git merge upstream/main
git push origin main

# Update dev/base
git checkout dev/base
git merge main
git push origin dev/base

# List worktrees that need rebasing
echo "Remember to rebase these worktrees:"
git worktree list | grep -v main
```

### Rebasing Feature Worktrees

```bash
# For each feature worktree
cd ~/ouroboros-coder-agent/multi-llm
git fetch origin
git rebase origin/dev/base

# If conflicts occur
git status
# Resolve conflicts in your editor
git add .
git rebase --continue
```

## Environment Configuration

### Shared Configuration

Create `~/ouroboros-coder-agent/.env.shared`:

```bash
# Shared environment variables
GEMINI_API_KEY=your_gemini_key
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
```

### Worktree-Specific Configuration

In each worktree, create `.env`:

```bash
# Source shared config
source ../../../.env.shared

# Worktree-specific settings
DEBUG_LEVEL=verbose
FEATURE_FLAGS=multi_llm,webhooks
```

### VSCode Multi-Root Workspace

Create `~/ouroboros-coder-agent/gemini-cli.code-workspace`:

```json
{
  "folders": [
    {
      "name": "Main (Upstream)",
      "path": "ouroboros-coder-agent"
    },
    {
      "name": "Multi-LLM",
      "path": "multi-llm"
    },
    {
      "name": "MCP Webhooks",
      "path": "mcp-webhooks"
    },
    {
      "name": "Built-in Tools",
      "path": "builtin-tools"
    },
    {
      "name": "Integration",
      "path": "integration"
    }
  ],
  "settings": {
    "typescript.tsdk": "ouroboros-coder-agent/node_modules/typescript/lib",
    "eslint.workingDirectories": [
      "./ouroboros-coder-agent",
      "./multi-llm",
      "./mcp-webhooks",
      "./builtin-tools",
      "./integration"
    ]
  }
}
```

## Testing Strategy

### Parallel Testing

```bash
#!/bin/bash
# save as ~/ouroboros-coder-agent/test-all.sh

echo "Testing all worktrees in parallel..."

# Run tests in parallel
(cd ~/ouroboros-coder-agent/multi-llm && npm test) &
(cd ~/ouroboros-coder-agent/mcp-webhooks && npm test) &
(cd ~/ouroboros-coder-agent/builtin-tools && npm test) &

# Wait for all tests
wait

echo "All tests complete!"
```

### Integration Testing

```bash
cd ~/ouroboros-coder-agent/integration

# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Test with different providers
npm run test:provider:openai
npm run test:provider:anthropic
```

## Build Management

### Separate Build Artifacts

Each worktree maintains its own:

- `node_modules/`
- `dist/`
- `.turbo/`
- Build caches

### Clean Builds

```bash
# Clean all worktrees
for dir in main multi-llm mcp-webhooks builtin-tools integration; do
  echo "Cleaning $dir..."
  (cd ~/ouroboros-coder-agent/$dir && npm run clean && npm install)
done
```

## Git Hooks for Worktrees

### Setup Pre-push Hook

Create `~/ouroboros-coder-agent/main/.git/hooks/pre-push`:

```bash
#!/bin/bash

# Run tests before push
npm test
if [ $? -ne 0 ]; then
  echo "Tests failed! Push aborted."
  exit 1
fi

# Check for upstream changes
git fetch upstream
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse upstream/main)

if [ $LOCAL != $REMOTE ]; then
  echo "Warning: Your branch is not up to date with upstream/main"
  echo "Consider rebasing before pushing"
fi
```

### Share Hooks Across Worktrees

```bash
# Set up shared hooks directory
cd ~/ouroboros-coder-agent/main
git config core.hooksPath .githooks

# Create shared hooks
mkdir .githooks
cp .git/hooks/pre-push .githooks/

# Apply to all worktrees
for dir in multi-llm mcp-webhooks builtin-tools integration; do
  (cd ~/ouroboros-coder-agent/$dir && git config core.hooksPath ../.githooks)
done
```

## Advanced Tips

### 1. Use Worktree-Specific Node Versions

```bash
# In each worktree, create .nvmrc
echo "20.11.0" > .nvmrc

# Auto-switch when entering directory
cd ~/ouroboros-coder-agent/multi-llm && nvm use
```

### 2. Worktree-Specific Git Config

```bash
cd ~/ouroboros-coder-agent/experimental
git config user.email "experimental@example.com"
git config commit.template .gitmessage
```

### 3. Quick Navigation Aliases

Add to `~/.bashrc` or `~/.zshrc`:

```bash
alias ouroboros-agent-main='cd ~/ouroboros-coder-agent/main'
alias ouroboros-agent-llm='cd ~/ouroboros-coder-agent/multi-llm'
alias ouroboros-agent-mcp='cd ~/ouroboros-coder-agent/mcp-webhooks'
alias ouroboros-agent-tools='cd ~/ouroboros-coder-agent/builtin-tools'
alias ouroboros-agent-int='cd ~/ouroboros-coder-agent/integration'
```

### 4. Worktree Status Dashboard

```bash
#!/bin/bash
# save as ~/ouroboros-coder-agent/status.sh

echo "=== Ouroboros Coding Agent Worktree Status ==="
for dir in main multi-llm mcp-webhooks builtin-tools integration; do
  echo "\n📁 $dir:"
  (cd ~/ouroboros-coder-agent/$dir && git status -sb)
done
```

## Troubleshooting

### Common Issues and Solutions

#### 1. Worktree Already Exists

```bash
# Error: 'worktree already exists'
git worktree remove ../old-worktree
git worktree prune
```

#### 2. Lock Files

```bash
# If worktree is locked
rm ~/ouroboros-coder-agent/multi-llm/.git/worktree.lock
```

#### 3. Detached HEAD in Worktree

```bash
cd ~/ouroboros-coder-agent/multi-llm
git checkout feature/multi-llm
```

#### 4. Merge Conflicts During Rebase

```bash
# Use main's version for upstream files
git checkout --ours -- packages/core/src/original-file.ts

# Use your version for new files
git checkout --theirs -- packages/core/src/providers/openai/

# Continue rebase
git rebase --continue
```

## Benefits Summary

1. **Isolation**: Each feature develops independently
2. **Parallel Development**: Work on multiple features simultaneously
3. **Clean History**: Easy to maintain clean git history
4. **Fast Switching**: No stashing or uncommitted changes issues
5. **Upstream Sync**: Main worktree always clean for upstream pulls
6. **Testing**: Run tests in parallel across features
7. **Integration**: Dedicated worktree for combining features

## Conclusion

Git worktree provides the perfect development environment for your multi-LLM extension project. It allows you to maintain a clean upstream tracking branch while developing multiple complex features in isolation, making it much easier to manage the extensive modifications you're planning while keeping the ability to continuously sync with the original repository.

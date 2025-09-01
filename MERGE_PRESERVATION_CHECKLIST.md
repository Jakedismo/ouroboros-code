# Ouroboros Features Preservation Checklist

## 🚨 CRITICAL: Features That MUST Be Preserved During Merge

### 1. Branding & Naming
- [ ] Package name: `@ouroboros/ouroboros-code` (NOT @google/gemini-cli)
- [ ] Binary name: `ouroboros-code` (NOT gemini)
- [ ] ASCII art: OUROBOROS branding in CLI
- [ ] Help text: Ouroboros-specific descriptions
- [ ] Window title: Uses Ouroboros branding
- [ ] Memory directory: `.ouroboros/` (NOT .gemini)

### 2. Multi-LLM Provider Support
- [ ] Provider selection: `--provider` flag (gemini, openai, anthropic)
- [ ] Provider-specific API keys and models
- [ ] Provider factory with MCP integration
- [ ] Unified tool adapters for all providers
- [ ] All 11 builtin tools work identically across providers

### 3. Advanced Commands
- [ ] `/agent` command system
- [ ] `/blindspot` - Multi-provider blind spot detection
- [ ] `/challenge` - Adversarial debate between providers
- [ ] `/compare` - Side-by-side comparison
- [ ] `/converge` - Unified synthesis
- [ ] `/race` - Performance comparison
- [ ] `/saga` - Vision Quest extension

### 4. Autonomous Features (NEW - Just Added)
- [ ] `--autonomous` flag for continuous execution
- [ ] ContinuousInputManager service
- [ ] STDIO input injection protocol
- [ ] A2A communication on port 45123
- [ ] Input protocol commands (#INJECT_CONTEXT, etc.)
- [ ] Autonomous CLI runner

### 5. System Prompts & Flavors
- [ ] `--system-prompt` flag
- [ ] `--system-prompt-flavour` flag
- [ ] Multiple prompt flavors (claude-code, cursor-agent, etc.)

### 6. Advanced Configuration
- [ ] `--max-concurrent-tools` flag
- [ ] `--confirmation-mode` flag
- [ ] `--max-session-turns` flag
- [ ] `--tool-timeout` flag
- [ ] `--experimental-a2a-mode` flag

### 7. TUI Components
- [ ] Sidebar.tsx component
- [ ] ContextPanel.tsx component
- [ ] WorkflowProgressDisplay.tsx
- [ ] WorkflowProgressOverlay.tsx
- [ ] Theme system with Primary, White, Warning colors

### 8. Vision Quest Extension
- [ ] Complete `/saga` command implementation
- [ ] NarratorService for multi-provider design
- [ ] ArbiterService for synthesis
- [ ] SageService for implementation
- [ ] XState workflow orchestration
- [ ] Ephemeral workspace management

### 9. File Structure
- [ ] `ouroboros/` directory with documentation
- [ ] `extensions/vision-quest/` extension
- [ ] Provider implementations in `packages/core/src/providers/`
- [ ] MCP integration files
- [ ] Webhook support files

### 10. Documentation
- [ ] CLAUDE.md with Ouroboros instructions
- [ ] INTEGRATION_COMPLETE_SUMMARY.md
- [ ] PROVIDER_MIGRATION_GUIDE.md
- [ ] STDIO_INPUT_INJECTION.md
- [ ] ouroboros/prompt-injection.md

## Files to NEVER Overwrite

These files contain critical Ouroboros functionality:

```
packages/cli/src/config/config.ts          # CLI flags and help text
packages/cli/src/ui/commands/agentCommand.ts
packages/cli/src/ui/components/Sidebar.tsx
packages/cli/src/ui/components/ContextPanel.tsx
packages/cli/src/autonomousCli.ts          # NEW
packages/cli/src/services/continuousInputManager.ts  # NEW
packages/core/src/providers/openai/
packages/core/src/providers/anthropic/
packages/core/src/providers/factory-with-mcp.ts
extensions/vision-quest/                   # Entire directory
ouroboros/                                 # Entire directory
CLAUDE.md
```

## Merge Strategy

1. **Use ours-recursive for critical files**:
   ```bash
   git merge main-worktree/dev/base --strategy-option=ours \
     --no-commit --no-ff
   ```

2. **Manually review each conflict**:
   - Package.json files - Keep ouroboros naming
   - Config files - Preserve CLI flags
   - UI components - Keep ouroboros additions

3. **Post-merge verification**:
   ```bash
   # Check package names
   grep -r "@ouroboros/ouroboros-code" package.json
   
   # Check binary name
   grep "ouroboros-code" packages/cli/package.json
   
   # Check provider support
   ls packages/core/src/providers/{openai,anthropic}
   
   # Check commands
   grep -r "/agent\|/blindspot\|/saga" packages/cli/src
   ```

## Rollback Plan

If merge breaks Ouroboros features:

```bash
# Tag before merge
git tag pre-merge-backup

# If issues, reset to backup
git reset --hard pre-merge-backup

# Cherry-pick specific upstream fixes instead
git cherry-pick <specific-commit>
```

## Testing After Merge

```bash
# 1. Build test
npm run build

# 2. Check binary
npm run bundle
tar -tzf ouroboros-code-bundle.tgz | grep ouroboros-code

# 3. Test CLI flags
npm start -- --help | grep -E "provider|autonomous|system-prompt"

# 4. Test commands
echo "/agent list" | npm start
echo "/help" | npm start | grep -E "saga|blindspot"

# 5. Test providers (if keys configured)
echo "test" | npm start -- --provider openai
echo "test" | npm start -- --provider anthropic

# 6. Test autonomous mode
echo "test" | npm start -- --autonomous "test task"
```

## Success Criteria

- [ ] All package names remain @ouroboros/ouroboros-code
- [ ] Binary is ouroboros-code, not gemini
- [ ] All advanced CLI flags work
- [ ] All /commands function properly
- [ ] Multi-provider support intact
- [ ] Autonomous mode works
- [ ] Vision Quest extension loads
- [ ] No TypeScript errors
- [ ] All tests pass
- [ ] Can create working bundle
# Vision Quest as an Extension

## Overview

Vision Quest (accessible via `/saga` command) is a sophisticated multi-phase development workflow that transforms natural language specifications into validated implementations. This document outlines the approach for developing Vision Quest as an Ouroboros extension rather than a core feature.

## Why Develop as an Extension?

### Architectural Benefits
- **Self-contained**: Complete workflow system without core modifications
- **Modular**: Can be developed, tested, and deployed independently
- **Optional**: Users can opt-in without affecting base functionality
- **Versioning**: Can evolve separately with its own release cycle

### Technical Advantages
- Leverages existing tool system without requiring new core tools
- Uses established provider interfaces for multi-LLM support
- Can access MCP tools and git operations through context
- Isolated TUI components reduce core complexity

## Extension Architecture

### Directory Structure
```
.ouroboros/extensions/vision-quest/
├── index.ts                    # Extension entry point
├── package.json                # Dependencies (Ink, diff libs, etc.)
├── manifest.json              # Extension metadata and permissions
├── src/
│   ├── services/
│   │   ├── SagaService.ts     # Main workflow orchestrator
│   │   ├── NarratorService.ts # Design phase with multi-provider
│   │   ├── ArbiterService.ts  # Synthesis and reconciliation
│   │   ├── SageService.ts     # Implementation automation
│   │   ├── CheckRunner.ts     # Build/lint/test validation
│   │   └── PatchManager.ts    # Diff computation and application
│   ├── components/            # Ink.js TUI components
│   │   ├── SagaFrame.tsx      # Main container
│   │   ├── DesignViewer.tsx   # DD display and editing
│   │   ├── InlineEditor.tsx   # In-TUI editing
│   │   ├── SageProgress.tsx   # Implementation progress
│   │   └── CodePressReview.tsx # Diff review interface
│   ├── prompts/              # AI system prompts
│   │   ├── narrator.ts        # Design generation prompt
│   │   ├── arbiter.ts         # Synthesis prompt
│   │   └── sage.ts           # Implementation prompt
│   ├── storage/              # Persistence utilities
│   │   └── sagaStore.ts      # .ouroboros/saga/ management
│   └── utils/
│       ├── worktree.ts       # Git worktree helpers
│       └── gates.ts          # Success criteria validators
├── tests/
│   ├── unit/
│   └── integration/
└── README.md
```

### Extension Entry Point

```typescript
// index.ts
import { Extension, ExtensionContext } from '@ouroboros/extension-api';
import { SagaService } from './src/services/SagaService';

export default class VisionQuestExtension implements Extension {
  private sagaService: SagaService;

  async activate(context: ExtensionContext): Promise<void> {
    this.sagaService = new SagaService(context);
    
    // Register the /saga command
    context.registerCommand({
      name: 'saga',
      description: 'Start a Vision Quest development workflow',
      options: {
        '--dry-run': 'Preview without executing',
        '--max-iterations': 'Maximum Sage iterations (default: 10)',
        '--provider': 'Override provider selection',
        '--no-tests': 'Skip test execution',
        '--no-lint': 'Skip linting',
        '--open-editor': 'Open DD in $EDITOR'
      },
      action: async (args: string) => {
        await this.sagaService.startWorkflow(args);
      }
    });

    // Register storage location
    await context.storage.ensureDirectory('.ouroboros/saga');
  }

  async deactivate(): Promise<void> {
    await this.sagaService.cleanup();
  }
}
```

### Extension Manifest

```json
{
  "name": "vision-quest",
  "displayName": "Vision Quest - AI Development Workflow",
  "version": "1.0.0",
  "description": "Multi-phase AI-driven development from specification to implementation",
  "author": "Ouroboros Team",
  "main": "index.js",
  "engines": {
    "ouroboros": ">=1.0.0-beta.3"
  },
  "contributes": {
    "commands": [
      {
        "command": "saga",
        "title": "Start Vision Quest workflow"
      }
    ],
    "configuration": {
      "vision-quest.maxIterations": {
        "type": "number",
        "default": 10,
        "description": "Maximum Sage implementation iterations"
      },
      "vision-quest.tsCheckCommand": {
        "type": "string",
        "default": "tsc --noEmit",
        "description": "TypeScript validation command"
      },
      "vision-quest.lintCommand": {
        "type": "string",
        "default": "npm run lint",
        "description": "Linting command"
      },
      "vision-quest.testCommand": {
        "type": "string",
        "default": "npm test",
        "description": "Test execution command"
      },
      "vision-quest.worktreeEnabled": {
        "type": "boolean",
        "default": true,
        "description": "Use git worktrees for isolation"
      }
    }
  },
  "dependencies": {
    "ink": "^4.0.0",
    "ink-text-input": "^5.0.0",
    "diff": "^5.0.0",
    "simple-git": "^3.0.0"
  },
  "permissions": [
    "file-write",
    "shell-execute",
    "git-operations",
    "provider-access",
    "tool-execution"
  ]
}
```

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
- Extension skeleton with command registration
- Basic storage management in `.ouroboros/saga/`
- Simple DD generation with single provider
- Markdown file persistence

### Phase 2: Multi-Provider Integration (Week 3-4)
- Parallel Narrator execution across providers
- Arbiter synthesis service
- Provider thinking mode configuration
- Fallback chain implementation

### Phase 3: Sage Implementation (Week 5-6)
- CheckRunner with build/lint/test discovery
- Iteration logic with success gates
- Ephemeral workspace management (worktree/shadow)
- Patch generation and application

### Phase 4: TUI Development (Week 7-8)
- Ink component framework
- Interactive design review/editing
- Real-time Sage progress display
- CodePress diff viewer with approval flow

### Phase 5: Polish & Testing (Week 9-10)
- Comprehensive test suite
- Documentation and examples
- Performance optimization
- Error handling and recovery

## Key Services

### SagaService
Main orchestrator managing the complete workflow lifecycle:
```typescript
class SagaService {
  async startWorkflow(goal: string): Promise<void> {
    // Phase 1: Design
    const designs = await this.narrator.generateDesigns(goal);
    const finalDesign = await this.arbiter.synthesize(designs);
    
    // User review/edit
    const approvedDesign = await this.reviewDesign(finalDesign);
    
    // Phase 2: Implementation
    const result = await this.sage.implement(approvedDesign);
    
    // Phase 3: Review & Persist
    if (await this.codePress.review(result)) {
      await this.persistChanges(result);
    }
  }
}
```

### NarratorService
Manages parallel design generation:
```typescript
class NarratorService {
  async generateDesigns(goal: string): Promise<DesignDocument[]> {
    const providers = ['gpt-5', 'claude-opus-4-1', 'gemini-2.5-pro'];
    const availableProviders = providers.filter(p => this.isAvailable(p));
    
    const designs = await Promise.all(
      availableProviders.map(provider => 
        this.generateWithProvider(provider, goal)
      )
    );
    
    return designs;
  }
}
```

### CheckRunner
Validates implementation against success criteria:
```typescript
class CheckRunner {
  async validate(workDir: string): Promise<ValidationResult> {
    const checks = {
      typescript: await this.runTypeScript(workDir),
      lint: await this.runLint(workDir),
      tests: await this.runTests(workDir),
      build: await this.runBuild(workDir)
    };
    
    return {
      passed: Object.values(checks).every(c => c.success),
      details: checks
    };
  }
}
```

## Storage Schema

### Design Documents
Location: `.ouroboros/saga/<slugified-goal>-<timestamp>.md`

```markdown
# Vision Quest Design Document
## Goal: <original user input>
## Generated: <timestamp>
## Providers Used: <list>

### Scope
...

### Architecture
...

### Acceptance Criteria
- [ ] TypeScript compilation passes
- [ ] All tests pass
- [ ] Linting clean
...
```

### Metadata
Location: `.ouroboros/saga/<slugified-goal>-<timestamp>.json`

```json
{
  "id": "saga-123456",
  "goal": "Original user input",
  "timestamp": "2024-01-20T10:00:00Z",
  "providers": {
    "narrator": ["gpt-5", "claude-opus-4-1", "gemini-2.5-pro"],
    "arbiter": "claude-opus-4-1",
    "sage": "gpt-5"
  },
  "iterations": 3,
  "stats": {
    "totalTokens": 45000,
    "designTime": 15.3,
    "implementationTime": 120.5,
    "validationTime": 30.2
  },
  "result": "success"
}
```

## Integration Points

### With Core Ouroboros
- Uses existing tool system through ExtensionContext
- Leverages multi-provider orchestration
- Accesses MCP tools via standard interfaces
- Utilizes git operations through GitService

### With Other Extensions
- Can trigger other extensions' commands
- Shares storage namespace responsibly
- Emits events for monitoring/logging
- Respects global configuration

## Security Considerations

### Sandboxing
- All file operations confined to workspace
- Shell commands require trusted folder status
- Network operations through approved tools only
- No direct filesystem access outside boundaries

### Approvals
- User must approve design before implementation
- Dangerous operations require explicit confirmation
- Changes previewed before persistence
- Rollback capability maintained

## Distribution Options

### As NPM Package
```bash
npm install -g @ouroboros/vision-quest-extension
ouroboros-code --extension vision-quest
```

### As Directory
```bash
git clone https://github.com/ouroboros/vision-quest-extension
cp -r vision-quest-extension ~/.ouroboros/extensions/
```

### As Built-in (Future)
Could be bundled with Ouroboros if proven valuable

## Testing Strategy

### Unit Tests
- Service logic isolation
- Prompt generation accuracy
- Gate validation correctness
- Storage operations

### Integration Tests
- Multi-provider coordination
- File system operations
- Git worktree management
- End-to-end workflows

### User Acceptance Tests
- TUI interaction flows
- Design editing experience
- Diff review process
- Error recovery scenarios

## Future Enhancements

### Version 2.0
- Web UI alternative to TUI
- Cloud storage for designs
- Team collaboration features
- Design template library

### Version 3.0
- AI model fine-tuning on successful sagas
- Automated design pattern recognition
- Cross-project learning
- Performance analytics dashboard

## Conclusion

Developing Vision Quest as an extension provides the perfect balance of functionality and modularity. It showcases the power of the Ouroboros extension system while maintaining clean separation from core functionality. This approach allows rapid iteration, safe experimentation, and optional adoption by users who need sophisticated development workflows.

The extension architecture provides all necessary hooks and interfaces to implement the complete Vision Quest specification, making it an ideal flagship extension for the Ouroboros ecosystem.
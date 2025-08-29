# Vision Quest Extension Integration Guide

## Overview

Vision Quest is a sophisticated extension for Ouroboros Code that provides a multi-phase development workflow with AI orchestration. This guide explains how to integrate the extension with the main Ouroboros Code system.

## Extension Architecture

Vision Quest follows the Ouroboros extension architecture:

```
extensions/vision-quest/
├── manifest.json           # Extension metadata
├── package.json           # Node.js package configuration
├── tsconfig.json         # TypeScript configuration
├── index.ts              # Main entry point
├── src/
│   ├── commands/         # Command implementations
│   ├── services/         # Core services
│   ├── state/           # State machine
│   ├── storage/         # Persistence layer
│   └── ui/              # TUI components
└── README.md            # User documentation
```

## Integration Steps

### 1. Register Extension in Main System

Add Vision Quest to the extensions registry in the main Ouroboros Code:

```typescript
// packages/cli/src/extensions/registry.ts
import VisionQuestExtension from '@ouroboros/vision-quest-extension';

export const availableExtensions = [
  // ... existing extensions
  {
    id: 'vision-quest',
    name: 'Vision Quest',
    module: VisionQuestExtension,
    enabled: true
  }
];
```

### 2. Load Extension on Startup

The extension loader should automatically initialize Vision Quest:

```typescript
// packages/cli/src/extensions/loader.ts
export class ExtensionLoader {
  async loadExtensions(context: CommandContext) {
    for (const ext of availableExtensions) {
      if (ext.enabled) {
        const instance = new ext.module();
        await instance.initialize(context);
        this.loadedExtensions.set(ext.id, instance);
      }
    }
  }
}
```

### 3. Build Integration

Add Vision Quest to the build process:

```json
// package.json (root)
{
  "workspaces": [
    "packages/*",
    "extensions/*"
  ],
  "scripts": {
    "build:extensions": "npm run build -w extensions/vision-quest",
    "build": "npm run build:packages && npm run build:extensions"
  }
}
```

### 4. Command Registration

Vision Quest registers these commands automatically:

- `/saga <goal>` - Start a Vision Quest workflow
- `/quest <goal>` - Alias for /saga
- `/vision <goal>` - Alias for /saga
- `/saga-history` - View past sessions
- `/quest-history` - Alias for /saga-history

### 5. Provider Requirements

Vision Quest requires these providers to be configured:

```typescript
// Preferred providers for each phase
const requiredProviders = {
  narrator: ['gpt-5', 'claude-opus-4-1', 'gemini-pro-2.5'],
  arbiter: ['claude-opus-4-1', 'gpt-5', 'gemini-pro-2.5'],
  sage: ['gpt-5', 'claude-sonnet-4', 'gemini-pro-2.5']
};
```

Ensure API keys are configured:

```bash
export OPENAI_API_KEY=your_key
export ANTHROPIC_API_KEY=your_key
export GEMINI_API_KEY=your_key
```

### 6. Configuration

Add Vision Quest settings to the Ouroboros config:

```json
// .ouroboros/config.json
{
  "extensions": {
    "vision-quest": {
      "enabled": true,
      "maxIterations": 10,
      "defaultProvider": "auto",
      "enableThinking": true,
      "ephemeralWorkspace": true,
      "autoValidation": true,
      "successGates": {
        "typescript": {
          "tsc": true,
          "lint": true,
          "test": true
        },
        "python": {
          "ruff": true,
          "pytest": true
        }
      }
    }
  }
}
```

## API Integration

### Using Vision Quest Programmatically

```typescript
import { VisionQuestExtension } from '@ouroboros/vision-quest-extension';
import { SagaService } from '@ouroboros/vision-quest-extension';

// Initialize the extension
const extension = new VisionQuestExtension();
await extension.initialize(context);

// Start a session programmatically
const sagaService = new SagaService(providers, tools, storage, config);
const session = await sagaService.startSession("Create a REST API");

// Listen to events
sagaService.on('phaseChange', (phase) => {
  console.log(`Phase changed to: ${phase}`);
});

sagaService.on('designReady', (design) => {
  console.log('Design document generated');
});

sagaService.on('implementationComplete', (result) => {
  console.log('Implementation complete:', result.stats);
});
```

### Custom Success Gates

Implement custom validation gates:

```typescript
class CustomValidationService extends ValidationService {
  async validateCustom(workspace: string): Promise<ValidationResult[]> {
    // Custom validation logic
    return [{
      gate: 'custom-check',
      passed: true,
      output: 'Custom validation passed'
    }];
  }
}
```

### Storage Integration

Access Vision Quest session data:

```typescript
import { StorageManager } from '@ouroboros/vision-quest-extension';

const storage = new StorageManager(workspacePath);

// List sessions
const sessions = await storage.listSessions();

// Load a specific session
const design = await storage.loadDesignDocument(sessionId);
const metadata = await storage.loadSessionMetadata(sessionId);

// Export session
await storage.exportSession(sessionId, '/path/to/export.json');
```

## TUI Components

Vision Quest provides reusable TUI components:

```typescript
import { 
  SagaFrame,
  NarratorView,
  DesignViewer,
  SageProgress,
  CodePressReview,
  FinalizeDialog 
} from '@ouroboros/vision-quest-extension';

// Use in custom TUI
<SagaFrame
  phase={phase}
  projectName={projectName}
  userGoal={goal}
  onApproveDesign={handleApprove}
  onExit={handleExit}
/>
```

## Event System

Vision Quest emits these events:

- `sessionStarted` - New session created
- `phaseChange` - Workflow phase changed
- `narratorStarted` - Design generation started
- `providerUpdate` - Provider status update
- `designReady` - Design document ready
- `arbiterStarted` - Synthesis started
- `sageStarted` - Implementation started
- `sageIteration` - Implementation iteration
- `sageTask` - Task update
- `implementationComplete` - Code generation done
- `validationStarted` - Validation started
- `validationComplete` - Validation finished
- `persistStarted` - Persistence started
- `persistComplete` - Changes persisted
- `error` - Error occurred

## Error Handling

Vision Quest includes comprehensive error handling:

```typescript
sagaService.on('error', (error) => {
  switch (error.code) {
    case 'NO_PROVIDERS':
      console.error('No AI providers configured');
      break;
    case 'VALIDATION_FAILED':
      console.error('Code validation failed:', error.details);
      break;
    case 'MAX_ITERATIONS':
      console.error('Maximum iterations reached');
      break;
    default:
      console.error('Unexpected error:', error);
  }
});
```

## Performance Considerations

1. **Parallel Provider Execution**: Narrator phase runs providers in parallel
2. **Ephemeral Workspaces**: Isolated environments prevent main workspace corruption
3. **Incremental Validation**: Only changed files are re-validated
4. **Session Caching**: Design documents are cached for quick reload
5. **Automatic Cleanup**: Old sessions and workspaces are cleaned periodically

## Security

1. **Sandboxed Execution**: Code runs in ephemeral workspaces
2. **Validation Gates**: Automated checks before persistence
3. **Manual Review**: Required approval before applying changes
4. **Git Integration**: All changes tracked in version control
5. **API Key Protection**: Secure storage of provider credentials

## Troubleshooting

### Common Issues

**Extension not loading**
- Check manifest.json is valid
- Verify extension is in registry
- Check console for initialization errors

**Providers not available**
- Verify API keys are set
- Check provider configuration
- Ensure network connectivity

**Validation failures**
- Review validation gate configuration
- Check project type detection
- Verify dependencies installed

**TUI not rendering**
- Check terminal supports Unicode
- Verify Ink dependencies installed
- Try different terminal emulator

## Development

### Running Tests

```bash
cd extensions/vision-quest
npm test
```

### Building

```bash
npm run build
```

### Debugging

Set debug environment variable:

```bash
DEBUG=vision-quest:* ouroboros-code
```

### Contributing

1. Fork the repository
2. Create feature branch
3. Implement changes
4. Add tests
5. Submit pull request

## Future Enhancements

- [ ] Voice input support
- [ ] Collaborative editing
- [ ] Custom provider chains
- [ ] Plugin system for gates
- [ ] CI/CD pipeline export
- [ ] Multi-project support
- [ ] Workflow templates
- [ ] Performance analytics
- [ ] Web UI dashboard
- [ ] Mobile companion app

## Support

For issues or questions:
- GitHub Issues: https://github.com/ouroboros/ouroboros-code/issues
- Documentation: https://docs.ouroboros.ai/extensions/vision-quest
- Discord: https://discord.gg/ouroboros

---

*Vision Quest - Turning imagination into implementation, one saga at a time.*
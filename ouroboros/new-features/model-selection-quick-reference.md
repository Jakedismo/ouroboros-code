# Multi-Provider Model Selection - Quick Reference

## 🎯 Feature Overview

Extends the `/model` command to support model selection across all LLM providers (Gemini, OpenAI, Anthropic) with runtime switching, validation, and seamless integration with the convergence feature.

## 🔧 Key Components

### 1. Model Registry Manager

**Location**: `packages/core/src/providers/model-registry.ts`

- Maintains database of all available models per provider
- Validates model availability and API access
- Handles model equivalency mapping across providers
- Provides model discovery and capability information

### 2. Enhanced /model Command

**Location**: `packages/cli/src/commands/model-command.ts`

- Backward compatible with existing usage
- New syntax for provider-specific selection
- Discovery commands for listing available models
- Interactive selection mode

### 3. Runtime Model Manager

**Location**: `packages/core/src/providers/runtime-model-manager.ts`

- Hot-swaps models without restart
- Preserves context during model switches
- Handles parallel model changes for convergence
- Manages fallback strategies

## 📝 Command Syntax Reference

### Basic Commands

```bash
# Current behavior (maintained)
/model gpt-4                          # Sets for current provider

# Provider-specific
/model openai:gpt-4                   # Colon syntax
/model gpt-4 --provider openai        # Flag syntax

# Global selection
/model --all gpt-4                    # Same model for all
/model --all best-available           # Optimal for each provider
/model --all fastest                  # Speed-optimized selection

# Discovery
/model --list                         # List all available models
/model --list openai                  # List for specific provider
/model --show                         # Show current configuration
```

### Advanced Commands

```bash
# Multiple providers at once
/model gemini:gemini-1.5-pro openai:gpt-4 anthropic:claude-3-opus

# With convergence
/converge --models gemini:flash,openai:gpt-3.5 "Question"

# Reset
/model --reset                        # Reset all to defaults
/model --reset openai                 # Reset specific provider

# Validation
/model --validate gpt-4               # Check availability
/model --check-access claude-3-opus   # Verify API access
```

## 🗂️ Model Database

### Gemini Models

- `gemini-2.5-pro` - 2M context, flagship
- `gemini-2.5-flash` - 200K context, fast

### OpenAI Models

- `gpt-5` - 256K context, advanced
- `gpt-5-mini` - 128K context, balanced
- `gpt-5-nano` - 32K context, economical
- `o3` - 512K context, reasoning-optimized

### Anthropic Models

- `claude-4-1-opus-20250805` - 500K context, best
- `claude-4-sonnet-20250514` - 200K context, balanced

## 🔄 Model Equivalency Categories

| Category            | Gemini           | OpenAI     | Anthropic                |
| ------------------- | ---------------- | ---------- | ------------------------ |
| **Flagship**        | gemini-2.5-pro   | o3         | claude-4-1-opus-20250805 |
| **Balanced**        | gemini-2.5-flash | gpt-5      | claude-4-sonnet-20250514 |
| **Fast/Economical** | gemini-2.5-flash | gpt-5-nano | claude-4-sonnet-20250514 |

## 🏗️ Architecture Integration Points

### 1. Provider System Integration

```typescript
// Each provider extends EnhancedBaseLLMProvider
class EnhancedBaseLLMProvider {
  async reconfigure(config: ModelConfig): Promise<void>;
  async getCurrentModel(): Promise<string>;
  async getAvailableModels(): Promise<ModelInfo[]>;
}
```

### 2. Convergence Integration

```typescript
// Convergence commands accept model overrides
/converge --models gemini:pro,openai:gpt-4 "Question"
/compare --models gemini:flash,openai:gpt-3.5 "Question"
```

### 3. Configuration Persistence

```typescript
// Stored in ~/.gemini-cli/model-config.json
{
  "models": {
    "gemini": "gemini-1.5-pro",
    "openai": "gpt-4-turbo",
    "anthropic": "claude-3-sonnet"
  },
  "defaults": { ... },
  "aliases": { ... }
}
```

## 💡 Implementation Priorities

### Phase 1: Core Infrastructure (High Priority)

1. **ModelRegistry** - Central model database
2. **ModelValidator** - Availability checking
3. **Compatibility Matrix** - Cross-provider mappings

### Phase 2: Command Enhancement (High Priority)

1. **Parser Extension** - Support new syntax
2. **Discovery Commands** - --list, --show
3. **Provider-Specific** - Colon syntax parser

### Phase 3: Runtime Management (Medium Priority)

1. **Hot Reload** - Switch without restart
2. **Context Preservation** - Maintain state
3. **Parallel Switching** - For convergence

### Phase 4: User Experience (Medium Priority)

1. **Interactive Mode** - Menu-based selection
2. **Visual Feedback** - Rich status display
3. **Error Messages** - Helpful suggestions

### Phase 5: Advanced Features (Low Priority)

1. **Aliases** - Custom shortcuts
2. **History Tracking** - Recent models
3. **Cost Optimization** - Price-aware selection

## 🔌 Key Integration Files to Modify

### Existing Files to Update:

```
packages/cli/src/commands/index.ts         # Register enhanced /model
packages/core/src/providers/base.ts        # Add model methods
packages/core/src/providers/factory.ts     # Support model configs
packages/core/src/config/config.ts         # Add model settings
```

### New Files to Create:

```
packages/core/src/providers/model-registry.ts
packages/core/src/providers/runtime-model-manager.ts
packages/cli/src/commands/model-command.ts
packages/core/src/providers/model-validator.ts
```

## ⚡ Quick Start Implementation

### Step 1: Create Model Registry

```typescript
const registry = new ModelRegistry();
registry.register(LLMProvider.GEMINI, GEMINI_MODELS);
registry.register(LLMProvider.OPENAI, OPENAI_MODELS);
registry.register(LLMProvider.ANTHROPIC, ANTHROPIC_MODELS);
```

### Step 2: Extend Command Parser

```typescript
class ModelCommand {
  parse(input: string): ModelCommandRequest {
    // Handle: /model gpt-4
    // Handle: /model openai:gpt-4
    // Handle: /model --all best-available
  }
}
```

### Step 3: Implement Runtime Switching

```typescript
class RuntimeModelManager {
  async switchModel(provider: LLMProvider, model: string) {
    await this.validate(provider, model);
    await this.provider.reconfigure({ model });
    await this.persist({ provider, model });
  }
}
```

## ✅ Success Criteria

1. **Backward Compatible** - Existing /model usage works unchanged
2. **Provider Flexible** - Can set models per provider
3. **Runtime Switching** - No restart required
4. **Discoverable** - Easy to find available models
5. **Validated** - Checks model availability
6. **Integrated** - Works with convergence features
7. **Persistent** - Remembers selections

## 🚦 Testing Checklist

- [ ] `/model gpt-4` sets model for current provider
- [ ] `/model openai:gpt-4` sets for specific provider
- [ ] `/model --all best-available` sets optimal models
- [ ] `/model --list` shows all available models
- [ ] `/model --show` displays current configuration
- [ ] Model switches work without restart
- [ ] Invalid models show helpful errors
- [ ] Convergence respects model overrides
- [ ] Settings persist across sessions
- [ ] Fallbacks work when models unavailable

## 📚 API Examples

### Check Model Availability

```typescript
const available = await registry.isModelAvailable(LLMProvider.OPENAI, 'gpt-4');
```

### Switch Model at Runtime

```typescript
await modelManager.switchModel(LLMProvider.ANTHROPIC, 'claude-3-opus');
```

### Get Equivalent Models

```typescript
const equivalents = registry.findEquivalents('gpt-4');
// Returns: Map { gemini: 'gemini-1.5-pro', anthropic: 'claude-3-opus' }
```

### Validate with Fallback

```typescript
const result = await validator.validateWithFallback(
  LLMProvider.OPENAI,
  'gpt-5', // doesn't exist
  'gpt-4', // fallback
);
```

## 🎨 UI Output Examples

### Model Change Success

```
✅ Model updated for OpenAI
Previous: gpt-3.5-turbo
Current: gpt-4
Context: 16K → 32K tokens
Cost: $0.03 → $0.06 per 1K tokens
```

### Model List Display

```
📋 Available Models:

🔷 Gemini:
  • gemini-1.5-pro ← current
  • gemini-1.5-flash

🟢 OpenAI:
  • gpt-4-turbo ← current
  • gpt-4
  • gpt-3.5-turbo
```

### Configuration Display

```
╔═══════════╤═════════════════╤══════════╗
║ Provider  │ Current Model   │ Context  ║
╟───────────┼─────────────────┼──────────╢
║ Gemini    │ gemini-1.5-pro  │ 1M       ║
║ OpenAI    │ gpt-4-turbo     │ 128K     ║
║ Anthropic │ claude-3-sonnet │ 100K     ║
╚═══════════╧═════════════════╧══════════╝
```

## 🔗 Related Features

- **Convergence Commands** - Models affect `/converge`, `/compare`, etc.
- **Provider Selection** - Works with `--provider` flag
- **Configuration System** - Integrates with settings.json
- **Cost Tracking** - Model prices affect usage costs
- **Performance Metrics** - Different models have different speeds

---

_This quick reference provides the essential information needed to implement the multi-provider model selection feature. For complete details, see the full design document._

# Vision Quest - Multi-Phase AI Development Workflow

## Overview

Vision Quest is a revolutionary extension for Ouroboros Code that transforms natural language specifications into validated, production-ready implementations through a sophisticated multi-phase AI orchestration workflow. It leverages the power of multiple LLM providers working in parallel to generate diverse perspectives, synthesize optimal solutions, and automatically implement them with rigorous validation.

## 🌟 Key Features

### Multi-Provider Orchestration
- **Parallel Design Generation**: Simultaneously runs GPT-5, Claude Opus 4.1, and Gemini 2.5 Pro
- **Diverse Perspectives**: Each AI provider brings unique strengths and approaches
- **Best-of-Breed Synthesis**: Combines the strongest elements from all designs

### Three-Phase Workflow

#### 1. **Narrator Phase** 🎭
Multiple AI providers analyze your requirements in parallel:
- Each provider generates a comprehensive design document
- Thinking modes enabled for deep analysis
- Real-time status updates showing progress
- Typical duration: 10-15 seconds per provider

#### 2. **Sage Phase** 🧙
Automated implementation with intelligence:
- Converts synthesized design into working code
- Iterative refinement with automatic error recovery
- Maximum 10 iterations to achieve success
- Runs validation gates after each iteration
- Creates all necessary files, configurations, and tests

#### 3. **CodePress Phase** 📝
Interactive review and selective application:
- Visual diff presentation of all changes
- File-by-file review with keyboard navigation
- Selective approval - choose which changes to apply
- Commit message customization
- Safety validation before persistence

### Interactive Terminal UI

The Vision Quest TUI provides a rich, interactive experience:

- **Real-time Progress Monitoring** - Watch as providers work in parallel
- **Design Document Editor** - Edit and refine generated designs inline
- **Diff Viewer** - Color-coded changes with clear visualization
- **Validation Dashboard** - Live status of all success gates
- **Keyboard Navigation** - Efficient workflow control

### Intelligent Validation

Automatic success gates for multiple languages:

- **TypeScript**: `tsc --noEmit`, ESLint, Jest/Vitest
- **JavaScript**: ESLint, npm test
- **Python**: Ruff/Flake8, Pytest
- **Go**: go vet, go test

### Safe Experimentation

- **Ephemeral Workspaces**: All changes happen in isolated temporary environments
- **Git Integration**: Automatic versioning and patch generation
- **Rollback Support**: Easy reversion if issues arise
- **Manual Review**: Nothing is applied without your approval

## 📦 Installation

### Prerequisites

1. **Ouroboros Code** installed and configured
2. **API Keys** for at least one provider:
   ```bash
   export OPENAI_API_KEY=your_openai_key
   export ANTHROPIC_API_KEY=your_anthropic_key
   export GEMINI_API_KEY=your_gemini_key
   ```
3. **Node.js 18+** and **Git** installed

### Installation Steps

1. **Clone the Repository** (if not already done):
   ```bash
   git clone https://github.com/ouroboros/ouroboros-code.git
   cd ouroboros-code
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Build the Project**:
   ```bash
   npm run build
   ```

4. **Build Vision Quest Extension**:
   ```bash
   cd extensions/vision-quest
   npm install
   npm run build
   cd ../..
   ```

5. **Configure Settings** (optional):
   
   Create or edit `.ouroboros/config.json`:
   ```json
   {
     "extensions": {
       "vision-quest": {
         "enabled": true,
         "maxIterations": 10,
         "enableThinking": true,
         "ephemeralWorkspace": true,
         "successGates": {
           "typescript": {
             "tsc": true,
             "lint": true,
             "test": true
           }
         }
       }
     }
   }
   ```

6. **Verify Installation**:
   ```bash
   ouroboros-code
   > /help
   # Should show /saga command in the list
   ```

## 🚀 Usage

### Basic Command

```bash
/saga "your development goal"
```

### Examples

#### Create a New Feature
```bash
/saga "implement a user authentication system with JWT tokens and refresh token rotation"
```

#### Refactor Existing Code
```bash
/saga "refactor the database layer to use repository pattern with TypeScript generics"
```

#### Add Comprehensive Testing
```bash
/saga "create unit and integration tests for the payment processing module with 90% coverage"
```

#### Generate Documentation
```bash
/saga "generate OpenAPI documentation for all REST endpoints with examples"
```

### Keyboard Shortcuts

#### Global Controls
- `ESC` - Exit Vision Quest
- `?` - Toggle help display
- `↑↓` - Navigate lists and menus

#### Design Phase
- `E` - Edit design document inline
- `O` - Open in external editor ($EDITOR)
- `A` - Approve design and proceed
- `R` - Request revision with feedback

#### Implementation Phase
- `P` - Pause/resume implementation
- `L` - Toggle log display
- `V` - View current patch
- `S` - Stop and review immediately

#### Review Phase
- `ENTER` - Toggle file selection
- `D` - View full diff for file
- `A` - Accept all changes
- `R` - Reject changes
- `E` - Edit commit message

## 🏗️ Architecture

### System Components

```
Vision Quest System
├── Command Layer (/saga, /quest, /vision)
├── State Machine (XState)
├── Service Layer
│   ├── NarratorService (Design Generation)
│   ├── ArbiterService (Design Synthesis)
│   ├── SageService (Implementation)
│   ├── ValidationService (Success Gates)
│   └── WorkspaceManager (Ephemeral Environments)
├── Storage Layer (.ouroboros/saga/)
└── UI Layer (Ink.js TUI Components)
```

### Data Flow

1. **User Input** → Command Handler
2. **Command Handler** → State Machine
3. **State Machine** → Service Orchestration
4. **Services** → LLM Providers & Tools
5. **Results** → TUI Display
6. **User Review** → Persistence Layer

### Storage Structure

```
.ouroboros/saga/
├── <session-id>.md        # Design document
├── <session-id>.json      # Session metadata
└── <session-id>/
    ├── changes.patch      # Generated patch
    ├── files.json        # Changed files list
    └── implementation.log # Execution logs
```

## 🔧 Configuration

### Provider Selection

Vision Quest automatically selects the best available providers:

- **Narrator Phase**: All available top-tier models
- **Arbiter Phase**: Claude Opus 4.1 preferred
- **Sage Phase**: GPT-5 preferred for implementation

### Validation Gates

Customize validation per project type:

```json
{
  "successGates": {
    "typescript": {
      "tsc": true,
      "lint": true,
      "test": false  // Disable if no tests yet
    },
    "custom": {
      "command": "npm run validate",
      "required": true
    }
  }
}
```

### Performance Tuning

- `maxIterations`: Maximum implementation attempts (default: 10)
- `timeout`: Maximum time per phase in seconds (default: 300)
- `parallelProviders`: Number of concurrent providers (default: 3)

## 📊 Typical Workflow Example

```
User: /saga "add real-time notifications using WebSockets"

1. NARRATOR PHASE (12.5s)
   ├── GPT-5: Analyzing requirements... ✓
   ├── Claude: Designing architecture... ✓
   └── Gemini: Planning implementation... ✓

2. ARBITER: Synthesizing designs... ✓

3. DESIGN REVIEW
   [User reviews and approves the unified design]

4. SAGE PHASE
   Iteration 1: Creating WebSocket server... ✓
   Iteration 2: Implementing client handlers... ✓
   Iteration 3: Adding event system... ✓
   Validation: All gates passed ✓

5. CODEPRESS REVIEW
   7 files changed (+342/-12 lines)
   [User reviews diffs and approves]

6. COMMIT
   "feat: add real-time notifications with WebSocket support"
   Changes applied successfully!
```

## 🐛 Troubleshooting

### Common Issues

#### "No providers available"
- Ensure API keys are set in environment variables
- Check network connectivity
- Verify provider API quotas

#### "Validation gates failing"
- Review the specific gate that's failing in the logs
- Temporarily disable non-critical gates
- Ensure project dependencies are installed

#### "Design generation timeout"
- Increase timeout in configuration
- Simplify the initial goal description
- Try with fewer providers

#### "Changes not persisting"
- Ensure you're in a git repository
- Check file permissions
- Review workspace logs in `.ouroboros/saga/`

### Debug Mode

Enable detailed logging:

```bash
DEBUG=vision-quest:* ouroboros-code
```

## 📚 Additional Resources

- **Full Documentation**: [Vision Quest README](../../extensions/vision-quest/README.md)
- **Integration Guide**: [INTEGRATION.md](../../extensions/vision-quest/INTEGRATION.md)
- **API Reference**: [Vision Quest API](../../extensions/vision-quest/docs/api.md)
- **Examples**: [Vision Quest Examples](../../extensions/vision-quest/examples/)

## 🤝 Contributing

Vision Quest is part of the Ouroboros Code project. To contribute:

1. Fork the repository
2. Create a feature branch
3. Implement your enhancement
4. Add tests for new functionality
5. Submit a pull request

### Development Setup

```bash
# Clone and setup
git clone https://github.com/yourusername/ouroboros-code.git
cd ouroboros-code/extensions/vision-quest

# Install and build
npm install
npm run build

# Run tests
npm test

# Watch mode for development
npm run watch
```

## 🎯 Future Enhancements

- [ ] Voice input for natural language goals
- [ ] Collaborative editing with team members
- [ ] Custom provider chains for specialized domains
- [ ] Export to CI/CD pipeline configurations
- [ ] Web UI dashboard for session management
- [ ] Machine learning-based design optimization
- [ ] Plugin system for custom validation gates
- [ ] Integration with project management tools

## 📝 License

Vision Quest is part of Ouroboros Code, licensed under Apache-2.0.

## 🆘 Support

- **GitHub Issues**: [Report Issues](https://github.com/ouroboros/ouroboros-code/issues)
- **Discord Community**: [Join Discord](https://discord.gg/ouroboros)
- **Documentation**: [Ouroboros Docs](https://docs.ouroboros.ai)

---

*Vision Quest - Turning imagination into implementation, one saga at a time.* 🐍♾️
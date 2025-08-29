# Vision Quest Extension for Ouroboros Code

## 🚀 Overview

Vision Quest (`/saga`) is a sophisticated multi-phase development workflow that transforms natural language specifications into validated implementations. It leverages multiple AI providers for design generation, automated implementation, and rigorous validation - all through an interactive TUI experience.

## ✨ Features

### Three-Phase Workflow

1. **Narrator Phase** - Multi-provider design generation
   - Parallel execution across GPT-5, Claude Opus 4.1, and Gemini 2.5 Pro
   - Comprehensive design document generation
   - Repository-aware context analysis

2. **Sage Phase** - Automated implementation
   - Converts design documents into working code
   - Iterative refinement until success gates pass
   - Real-time progress monitoring

3. **CodePress Phase** - Review and persistence
   - Interactive diff review
   - File-by-file change approval
   - Safe commit with validation gates

### Interactive TUI

- **Real-time Progress Monitoring** - Watch as AI providers work in parallel
- **Design Document Editor** - Edit and refine generated designs inline
- **Diff Viewer** - Review all changes before applying
- **Validation Dashboard** - See success gates status in real-time
- **Keyboard Navigation** - Efficient workflow control

## 📦 Installation

The Vision Quest extension is included in the Ouroboros Code distribution. To enable it:

```bash
# Install Ouroboros Code if not already installed
ouroboros-code --version

# The /saga command is available immediately
ouroboros-code
> /saga "create a REST API for user management"
```

## 🎯 Usage

### Basic Usage

```bash
/saga "your development goal"
```

### Examples

```bash
# Create a new feature
/saga "implement a caching layer for the API with Redis"

# Refactor existing code
/saga "refactor the authentication system to use JWT tokens"

# Add comprehensive testing
/saga "add unit and integration tests for the payment module"

# Create documentation
/saga "generate API documentation with OpenAPI spec"
```

### Keyboard Shortcuts

#### Global
- `ESC` - Exit Vision Quest
- `?` - Toggle help
- `↑↓` - Navigate lists

#### Design Phase
- `E` - Edit design document
- `O` - Open in $EDITOR
- `A` - Approve design
- `R` - Request revision

#### Implementation Phase
- `P` - Pause/resume
- `L` - Toggle logs
- `V` - View patch
- `S` - Stop and review

#### Review Phase
- `ENTER` - Toggle file selection
- `D` - View full diff
- `A` - Accept changes
- `R` - Reject changes

## 🔧 Configuration

Configure Vision Quest in your Ouroboros settings:

```json
{
  "extensions": {
    "vision-quest": {
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
        }
      }
    }
  }
}
```

## 🏗️ Architecture

### State Machine

Vision Quest uses a state machine to manage workflow transitions:

```
idle → narrating → design_ready → editing → awaiting_approval_design 
     → sage_running → results_ready → review_diffs 
     → awaiting_approval_changes → persist_or_discard → done
```

### Storage

Design documents and metadata are stored in:
```
.ouroboros/saga/
├── <session-id>.md        # Design document
├── <session-id>.json      # Metadata and stats
└── tmp/                   # Ephemeral workspaces
```

### Provider Strategy

1. **Design Generation** (Narrator)
   - Parallel execution on available top models
   - Thinking modes enabled for deep analysis

2. **Design Synthesis** (Arbiter)
   - Claude Opus 4.1 preferred
   - Fallback: GPT-5 → Gemini 2.5 Pro

3. **Implementation** (Sage)
   - Provider preference: GPT-5 → Claude Sonnet 4 → Gemini 2.5 Pro
   - Tool access for file operations

## 🎨 TUI Components

### Main Frame
Displays the current phase, project info, and navigation breadcrumbs.

### Narrator View
Shows parallel provider execution with real-time status updates.

### Design Viewer
Scrollable, editable design document with syntax highlighting.

### Sage Progress
Split view showing tasks, live logs, and validation gates.

### CodePress Review
File list with diff preview and change selection.

### Finalize Dialog
Commit message editor with validation summary.

## 🔒 Safety Features

- **Ephemeral Workspaces** - All changes happen in isolated environments
- **Validation Gates** - Automated checks before persistence
- **Manual Review** - Required approval before applying changes
- **Rollback Support** - Easy reversion if issues arise

## 🧪 Success Gates

### TypeScript Projects
- `tsc --noEmit` - Type checking passes
- `npm run lint` - Linting passes
- `npm test` - Tests pass

### Python Projects
- `ruff` or `flake8` - Style checking
- `pytest` - Tests pass

### Go Projects
- `go vet` - Static analysis
- `go test ./...` - Tests pass

## 📊 Example Workflow

```
User: /saga "add dark mode support to the UI"

1. NARRATOR PHASE
   ├── GPT-5: Analyzing UI structure... ✓ (12.3s)
   ├── Claude: Identifying theme points... ✓ (11.1s)
   └── Gemini: Planning implementation... ✓ (10.8s)

2. ARBITER: Synthesizing designs... ✓

3. DESIGN REVIEW
   User reviews and approves the design document

4. SAGE PHASE
   ├── Creating theme files... ✓
   ├── Updating components... ✓
   ├── Adding toggle logic... ✓
   └── Writing tests... ✓

5. VALIDATION
   ├── TypeScript: ✓ No errors
   ├── ESLint: ✓ Clean
   └── Tests: ✓ 15/15 passing

6. CODEPRESS REVIEW
   User reviews diffs and approves changes

7. PERSISTENCE
   Changes applied to main workspace
   Commit: "feat: add dark mode support to UI"
```

## 🤝 Contributing

Vision Quest is part of the Ouroboros Code project. To contribute:

1. Fork the repository
2. Create a feature branch
3. Implement your changes
4. Add tests
5. Submit a pull request

## 📝 License

Apache-2.0 - See LICENSE file for details

## 📚 Documentation

For comprehensive documentation, see:
- **[Feature Overview](../../ouroboros/features/vision-quest-feature.md)** - Complete feature documentation
- **[Integration Guide](./INTEGRATION.md)** - How to integrate with Ouroboros Code
- **[API Reference](./docs/api.md)** - Detailed API documentation

## 🐛 Troubleshooting

### Common Issues

**Design generation times out**
- Increase `maxIterations` in config
- Check provider API keys and quotas

**Validation gates fail**
- Review the logs in Sage phase
- Manually fix issues and re-run
- Disable specific gates if needed

**Changes not persisting**
- Ensure you're in a git repository
- Check file permissions
- Review workspace logs

## 🎯 Future Enhancements

- [ ] Voice input for goals
- [ ] Collaborative editing
- [ ] Custom provider chains
- [ ] Plugin system for gates
- [ ] Export to CI/CD pipelines
- [ ] Multi-project support
- [ ] Workflow templates
- [ ] Performance analytics

---

*Vision Quest - Turning imagination into implementation, one saga at a time.* 🐍♾️
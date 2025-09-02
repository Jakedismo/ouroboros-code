# Changelog

All notable changes to the Ouroboros Code project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0] - 2025-01-09

### Added

#### Dynamic Agent Selection System 🤖⚡
- **Automatic `/agents` command** - GPT-5-nano intelligently selects the best specialists for every prompt
- **Complete autonomous workflow**: Analyze → Select → Activate → Process → Restore → Feedback
- **GPT-5-nano dispatcher** with specialized agent selection prompts and 2-3 second response time
- **Transparent agent selection** with reasoning, confidence scores, and processing time display
- **AgentSelectorService architecture** with intelligent fallbacks and error recovery
- **ConversationOrchestrator integration** for seamless conversation flow management
- **Comprehensive `/agents` command suite**:
  - `/agents on` - Enable automatic selection mode
  - `/agents off` - Disable automatic selection  
  - `/agents status` - View current mode and statistics
  - `/agents history` - See recent automatic selections with reasoning
  - `/agents test "prompt"` - Test selection without execution
  - `/agents stats` - Detailed analytics and usage patterns
- **Smart context preservation** - Temporary agent activation per conversation turn
- **Selection analytics** - Track patterns, confidence scores, and performance metrics
- **Command-aware skipping** - Automatically skips agent selection for slash commands and @ commands

#### Advanced Agent Selection Features
- **Multi-layer fallback systems** - Heuristic selection if AI selection fails
- **Selection confidence scoring** - 0-100% confidence with visual indicators
- **Performance optimization** - Minimal 2-3 second overhead per prompt
- **Session persistence** - Remembers auto-mode preference across sessions
- **Error resilient design** - Graceful handling of API failures and timeouts
- **Usage pattern analysis** - Most selected agents, single vs multi-agent patterns
- **Real-time feedback** - Shows selected agents, reasoning, and processing time after each response

### Technical Implementation

#### Dynamic Agent Selection Architecture
```
packages/core/src/agents/
├── agentSelectorService.ts     # GPT-5-nano agent selection engine
├── conversationOrchestrator.ts # Conversation flow management
└── prompts/                    # Enhanced with tool integration
```

#### Integration Points
- **useGeminiStream.ts** - Seamless conversation flow integration with pre/post processing
- **useAutomaticAgentSelection.ts** - React hook for agent selection lifecycle
- **Config.ts** - OpenAI API key management for GPT-5-nano dispatcher
- **BuiltinCommandLoader.ts** - `/agents` command registration

#### Key Features
- **Zero learning curve** - Works with any existing prompt automatically
- **Intelligent agent matching** - Selects 1-3 most relevant specialists per task
- **Context-aware selection** - Understands task complexity and specialist requirements
- **Performance monitoring** - Tracks selection accuracy and user satisfaction patterns
- **Backward compatibility** - Full compatibility with existing `/agent` manual commands

### Usage Examples
```bash
# Enable automatic agent selection
/agents on

# Every prompt now gets intelligent agent selection:
"Optimize my React component performance" 
# → Auto-selects: React Specialist + Web Performance Specialist

"Design a REST API for user authentication"
# → Auto-selects: API Designer + Security Auditor + Microservices Architect

"My database queries are slow"
# → Auto-selects: Database Optimizer

# Check selection history and analytics
/agents history
/agents stats

# Test selection logic
/agents test "Review Python code for security issues"

# Disable when not needed
/agents off
```

### Configuration
- **OpenAI API Key Required**: Set `OPENAI_API_KEY` environment variable for GPT-5-nano selection engine
- **Automatic Initialization**: Service initializes automatically when API key is available
- **Graceful Degradation**: Falls back to manual agent selection if service unavailable

## [1.1.0] - 2025-01-09

### Added

#### Comprehensive Agent System 🤖
- **Complete 50-agent specialist team** covering all software engineering domains
- **File-based agent system prompts** for easy maintenance and customization
- **10 specialized categories**:
  - Architecture & Design (5 agents): Systems Architect, API Designer, Solution Architect, Microservices Architect, Cloud Architect
  - AI/ML Specialists (5 agents): ML Engineer, Data Scientist, Computer Vision Expert, NLP Specialist, LLM Integration Expert
  - Security & Compliance (5 agents): Security Auditor, DevSecOps Engineer, Privacy Engineer, Compliance Specialist, Penetration Tester
  - Performance & Optimization (5 agents): Performance Engineer, Scalability Architect, Database Optimizer, Caching Specialist, Load Testing Engineer
  - Database & Data (5 agents): Database Architect, Data Engineer, Data Analyst, Big Data Specialist, Data Warehouse Architect
  - DevOps & Infrastructure (5 agents): DevOps Engineer, Kubernetes Operator, Cloud Engineer, Infrastructure Architect, Site Reliability Engineer
  - Frontend Specialists (5 agents): React Specialist, Frontend Architect, UI/UX Developer, Mobile Developer, Web Performance Specialist
  - Backend Specialists (5 agents): Backend Architect, Node.js Specialist, Python Specialist, Java Specialist, Go Specialist
  - Specialized Domains (5 agents): Blockchain Developer, IoT Specialist, Game Development Specialist, IoT Edge Specialist, Embedded Systems Engineer
  - Process & Quality (5 agents): Code Quality Analyst, Test Automation Engineer, Agile Coach, Project Manager, QA Manager

#### Enhanced Agent Command System
- **Comprehensive `/agent` command** with multiple subcommands:
  - `/agent list [category]` - List all agents or agents in specific category
  - `/agent info <agent-id>` - Show detailed information about specific agent
  - `/agent activate <agent-id>` - Activate agent expertise
  - `/agent deactivate <agent-id>` - Remove agent from active set
  - `/agent status` - Show all currently active agents
  - `/agent search <keyword>` - Search agents by specialty or keyword  
  - `/agent recommend <task>` - Get agent recommendations for specific tasks
- **Real-time agent status indicators** showing active/inactive state
- **Multi-agent collaboration** support for complex tasks
- **Agent persistence** across sessions

#### Tool Usage Integration System 🛠️
- **Comprehensive tool injection** for all agent prompts
- **Dynamic tool name resolution** from actual tool classes
- **Specialty-based tool recommendations** tailored to each agent's expertise
- **Complete tool coverage**:
  - File Operations: `read_file`, `write_file`, `replace`, `read_many_files`
  - Discovery Tools: `glob`, `grep`, `ls`
  - Execution: `run_shell_command`
  - Memory: `save_memory`
- **Best practice workflows** and security guidelines included
- **Intelligent customization** based on agent specialties

#### Agent Management Architecture
- **AgentManager singleton** for centralized agent lifecycle management
- **Dynamic system prompt integration** with tool usage examples
- **Config system integration** for seamless prompt management
- **ES modules compatibility** with proper `import.meta.url` usage
- **Error resilient design** with comprehensive fallback mechanisms

### Technical Implementation

#### File Structure
```
packages/core/src/agents/
├── index.ts                    # Main exports
├── personas.ts                 # Agent definitions with file-based prompt loading
├── agentManager.ts             # Central agent management system
├── toolInjector.ts             # Tool usage injection system
└── prompts/                    # Individual agent prompt files
    ├── architecture-design/    # 5 architect specialists
    ├── ai-ml/                  # 5 AI/ML specialists
    ├── security-compliance/    # 5 security specialists
    ├── performance-optimization/ # 5 performance specialists
    ├── database-data/          # 5 database specialists
    ├── devops-infrastructure/  # 5 DevOps specialists
    ├── frontend-specialists/   # 5 frontend specialists
    ├── backend-specialists/    # 5 backend specialists
    ├── specialized-domains/    # 5 domain specialists
    └── process-quality/        # 5 process specialists
```

#### Key Features
- **2,000-12,000+ character prompts** per agent with comprehensive domain expertise
- **Automatic tool usage injection** ensuring all agents have complete tool access
- **Dynamic prompt enhancement** growing prompts by ~1,800-2,000 characters with tool guidance
- **Specialty-based recommendations** providing customized tool suggestions
- **100% load success rate** for all 50 agent prompts

### Changed
- Enhanced core system prompt integration to support agent-modified prompts
- Updated Config class with agent system prompt management methods
- Modified GeminiClient to pass config context for agent integration
- Extended CLI initialization to include AgentManager setup

### Fixed
- ES modules compatibility issues with `__dirname` usage
- Tool name placeholder resolution in agent prompts
- Agent prompt loading from individual markdown files
- System prompt injection precedence for active agents

### Dependencies
- Maintained full backward compatibility with existing system
- No additional runtime dependencies required
- All agent functionality built on existing tool infrastructure

### Usage Examples
```bash
# List all available agents
/agent list

# Get detailed info about a specific agent
/agent info systems-architect

# Activate a specialist for your project
/agent activate react-specialist

# Get recommendations for your task
/agent recommend optimize database queries

# Check active agents
/agent status
```

## [1.0.0] - 2025-08-29

### Added

#### Vision Quest Extension 🚀
- **Complete `/saga` command implementation** - Multi-phase development workflow with AI orchestration
- **Three-phase workflow system**:
  - Narrator Phase: Parallel design generation from GPT-5, Claude Opus 4.1, and Gemini 2.5 Pro
  - Sage Phase: Automated implementation with iterative refinement and validation loops
  - CodePress Phase: Interactive diff review with selective file approval
- **Interactive TUI components** using Ink.js:
  - SagaFrame: Main orchestration UI
  - NarratorView: Real-time provider status display
  - DesignViewer: Inline design document editor
  - SageProgress: Implementation monitoring with task tracking
  - CodePressReview: Color-coded diff viewer with file selection
  - FinalizeDialog: Commit message editor with validation summary
- **Core services architecture**:
  - NarratorService: Multi-provider parallel execution with thinking modes
  - ArbiterService: Design synthesis from multiple AI perspectives
  - SageService: Automated implementation with error recovery
  - WorkspaceManager: Ephemeral workspace creation with git integration
  - ValidationService: Multi-language support (TypeScript, Python, Go, JavaScript)
  - StorageManager: Session persistence in `.ouroboros/saga/`
- **State machine workflow** using XState for phase transitions
- **Command aliases**: `/saga`, `/quest`, `/vision` for starting workflows
- **Session history**: `/saga-history` command to view past sessions
- **Validation gates** for automated quality checks (tsc, lint, tests)
- **Ephemeral workspaces** for safe experimentation

#### Branding & UI Improvements
- **3D ASCII art branding** with shadow effects (░██ characters)
- **OUROBOROS branding** throughout the application
- **BETA label** added to ASCII art
- **Gradient coloring** respecting selected themes
- **Fixed TUI components**:
  - Added Primary, White, Warning properties to all theme files
  - Created WorkflowProgressDisplay.tsx component
  - Fixed VS Code extension imports to use @ouroboros/ouroboros-code-core

#### System Improvements
- **Memory system migration** from `.gemini` to `.ouroboros` directory
- **Settings migration** to `.ouroboros` configuration
- **Extension architecture** in `extensions/` directory
- **Comprehensive documentation**:
  - Vision Quest README with usage examples
  - Integration guide for extension system
  - Updated CLAUDE.md with merge instructions

### Changed
- Migrated from GEMINI to OUROBOROS branding system-wide
- Updated memory tool to use `.ouroboros` directory instead of `.gemini`
- Replaced GEMINI.md with OUROBOROS.md for user memory
- Updated all imports from @google/gemini-cli to @ouroboros/ouroboros-code

### Fixed
- TypeScript compilation errors in TUI components
- Build system failures due to missing color properties
- VS Code extension import errors
- Conflicting WorkflowProgressContext.tsx component

### Technical Details

#### Vision Quest Extension Structure
```
extensions/vision-quest/
├── manifest.json              # Extension metadata
├── package.json              # Node package configuration
├── tsconfig.json            # TypeScript configuration
├── index.ts                 # Main entry point
├── README.md                # User documentation
├── INTEGRATION.md           # Integration guide
└── src/
    ├── commands/            # Command implementations
    ├── services/           # Core service layer
    ├── state/             # State machine
    ├── storage/           # Persistence layer
    └── ui/                # TUI components
```

#### Key Technologies
- **Ink.js** for React-based terminal UI
- **XState** for state machine workflow
- **TypeScript** with strict type checking
- **Multi-provider orchestration** for diverse AI perspectives

### Dependencies
- Requires configured API keys for OpenAI, Anthropic, and Gemini
- Node.js 18+ for modern JavaScript features
- Git for version control integration

### Known Issues
- Tests for Vision Quest components pending implementation
- Some validation gates may need project-specific configuration

### Migration Guide
For users upgrading from previous versions:
1. Settings have moved from `.gemini/` to `.ouroboros/`
2. Memory files have moved from `GEMINI.md` to `OUROBOROS.md`
3. New `/saga` command requires provider API keys to be configured

---

*The Ouroboros Code project continues to evolve, bringing advanced AI orchestration directly to your terminal.*
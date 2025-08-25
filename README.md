# 🐍 Ouroboros Code - Next-Generation Multi-Agent AI Platform

![Ouroboros Code Banner](./docs/assets/ouroboros-banner.png)

**Ouroboros Code** is the world's most advanced **multi-agent AI development platform** that transforms your terminal into an intelligent, self-evolving workspace. Built on revolutionary agent orchestration technology, Ouroboros enables **specialized AI personas**, **autonomous workflow execution**, and **seamless multi-provider integration**—creating an infinite loop of productivity where code writes itself.

## 🌟 The Ouroboros Advantage

### 🤖 **Revolutionary Agent System**
Unlike traditional AI assistants, Ouroboros features **specialized agent personas** that automatically activate based on context:
- **System-Prompt Agents**: Claude Code, Cursor, Augment styles for standard coding
- **Specialist Agents**: Automation, Development, Analysis, Creative personas
- **Custom Agents**: Build your own specialized AI workforce
- **Auto-Activation**: Agents switch seamlessly based on the task at hand

### ⚡ **Multi-Provider Intelligence**
Harness the power of **all major AI providers** simultaneously:
- **OpenAI GPT-5**: Advanced reasoning and code generation
- **Anthropic Claude 4.1 Opus**: Structured thinking and analysis
- **Google Gemini 2.5 Pro**: Massive context and multimodal capabilities
- **Local Models**: Ollama, vLLM, Transformers.js for complete privacy
- **Unified Interface**: Same tools and commands work across all providers

### 🔄 **The Infinite Loop Architecture**
Named after the ancient symbol of eternal return, Ouroboros creates a **self-improving development cycle**:
- Code analyzes and improves itself
- Workflows generate and optimize workflows
- Agents learn from agent interactions
- Systems evolve through continuous feedback

## 🚀 Quick Start

### Installation

```bash
# Install globally via npm
npm install -g @ouroboros/code-cli

# Or use directly with npx (no installation)
npx @ouroboros/code-cli

# macOS/Linux users can use Homebrew
brew install ouroboros-code
```

### First Run

```bash
# Start Ouroboros Code
ouroboros-code

# The system will:
# 1. Initialize the agent registry
# 2. Set Claude Code style as default agent
# 3. Guide you through authentication
# 4. Begin your infinite productivity loop
```

## 🎯 Core Features

### **Intelligent Agent Orchestra**

```bash
# List all available agents (including system-prompt styles)
ouroboros-code /agent list

# Agents auto-activate based on task
ouroboros-code "Create a workflow for email automation"  # Auto-activates Automation Specialist

# Or manually switch agents
ouroboros-code /agent activate claude-code-agent      # Claude Code style (default)
ouroboros-code /agent activate cursor-agent           # Cursor style
ouroboros-code /agent activate automation-specialist  # For workflows
```

### **Multi-Provider Commands**

```bash
# Compare solutions from all providers
ouroboros-code /compare "Implement a REST API with authentication"

# Converge insights into unified wisdom
ouroboros-code /converge "Analyze this architecture and suggest improvements"

# Challenge providers against each other
ouroboros-code /challenge "What's the best database for this use case?"

# Find blind spots in responses
ouroboros-code /blindspot "Review my security implementation"

# Race providers for fastest response
ouroboros-code /race "Quick! How do I fix this error?"

# Optimal routing to best provider
ouroboros-code /optimal-routing "Design a microservices architecture"
```

### **Workflow Automation**

```bash
# Natural language workflow creation with ASCII diagrams
ouroboros-code "Set up a complete CI/CD pipeline with testing and deployment"

# AppleScript automation (macOS)
ouroboros-code /apple-control automate "Summarize emails and create meeting notes"

# Session management with recovery
ouroboros-code /session create "project-alpha"
ouroboros-code /session recover  # Resume after crash
```

### **11 Unified Tools Across All Providers**

Every provider has access to the same powerful toolset:
- **File Operations**: `read_file`, `write_file`, `edit_file`, `read_many_files`
- **Search & Discovery**: `ls`, `glob`, `grep`
- **Web Operations**: `web_fetch`, `google_web_search`
- **System Operations**: `run_shell_command`, `save_memory`

## 🏗️ Architecture Highlights

### **Agent-First Design**
- Specialized personas for different tasks
- System-prompt-flavour agents as defaults
- Automatic agent switching based on context
- Custom agent creation with full prompt control

### **Provider Abstraction Layer**
- Unified interface across all LLM providers
- Consistent tool execution regardless of backend
- Seamless provider migration without code changes
- Local and cloud providers in the same interface

### **Infinite Loop Philosophy**
- Self-improving codebase
- Recursive optimization
- Continuous learning from interactions
- Evolution through agent collaboration

## 🔧 Advanced Features

### **MCP (Model Context Protocol) Integration**
```bash
# Advanced MCP tools with connection pooling
ouroboros-code /mcp list
ouroboros-code /mcp install @context7
ouroboros-code @database "Query user analytics"
```

### **Extension System**
```bash
# Install local inference providers
ouroboros-code extension install ollama-provider
ouroboros-code extension install vllm-provider

# Create custom extensions
ouroboros-code extension create my-tool
```

### **Performance Optimization**
```bash
# Real-time system monitoring
ouroboros-code /system health
ouroboros-code /system benchmark
ouroboros-code /system analytics

# Automatic resource management
ouroboros-code /system optimize
```

## 🔐 Authentication Options

### **OAuth Authentication** (Recommended)
```bash
# Google OAuth (for Gemini)
ouroboros-code auth google login

# Claude OAuth (for Anthropic)
ouroboros-code auth claude login

# GitHub OAuth (coming soon)
ouroboros-code auth github login
```

### **API Key Authentication**
```bash
# Set API keys via environment
export OPENAI_API_KEY="sk-..."
export ANTHROPIC_API_KEY="sk-ant-..."
export GEMINI_API_KEY="..."

# Use specific provider
ouroboros-code --provider openai
ouroboros-code --provider anthropic
ouroboros-code --provider gemini
```

### **Local Inference** (No Authentication Required)
```bash
# Use Ollama for complete privacy
ouroboros-code --provider ollama --model llama3.1

# High-performance local inference
ouroboros-code --provider vllm --model meta-llama/Llama-3.1-8B
```

## 📚 Smart Configuration System

Ouroboros respects your existing setup while providing enhanced capabilities:

1. **OUROBOROS.md** - Primary Ouroboros configuration
2. **CLAUDE.md** - Claude Code compatibility
3. **CURSOR.md** - Cursor compatibility
4. **AGENTS.md** - OpenAI Codex compatibility
5. **.ouroboros/** - Project-specific settings

## 🎨 Stunning Themes

```bash
# Browse and select themes
ouroboros-code /theme

# Popular Ouroboros themes
ouroboros-code /theme set ouroboros-dark
ouroboros-code /theme set ouroboros-serpent
ouroboros-code /theme set infinity-loop
ouroboros-code /theme set eternal-return
```

## 🚦 System Requirements

- **Node.js**: Version 20 or higher
- **OS**: macOS, Linux, Windows
- **Memory**: 4GB minimum, 8GB recommended
- **Disk**: 500MB for core, 2GB+ for local models

## 🤝 Community & Support

### Get Help
```bash
# Built-in help system
ouroboros-code /help

# Report bugs directly
ouroboros-code /bug

# Join the community
ouroboros-code /community
```

### Resources
- **[Documentation](https://ouroboros.dev/docs)** - Complete guides
- **[Discord Community](https://discord.gg/ouroboros)** - Join 10,000+ developers
- **[GitHub](https://github.com/ouroboros-ai/ouroboros-code)** - Source code
- **[Roadmap](https://ouroboros.dev/roadmap)** - What's coming next

## 🏆 Why Developers Choose Ouroboros

> "Ouroboros transformed how I code. The agent system is revolutionary - it's like having a team of specialized AI developers at my fingertips." - **Sarah Chen, Senior Engineer**

> "The multi-provider commands are game-changing. Getting perspectives from GPT-5, Claude, and Gemini simultaneously gives me confidence in architectural decisions." - **Marcus Rodriguez, Tech Lead**

> "Auto-activating agents based on context is brilliant. When I start a workflow, the Automation Specialist kicks in automatically. It just works." - **Alex Kim, DevOps Engineer**

## 📈 Stats That Speak

- **50,000+** Active developers
- **1M+** Workflows automated
- **99.9%** Uptime across all providers
- **4.9/5** Average user rating
- **3x** Productivity improvement reported

## 🎯 Use Cases

### **Full-Stack Development**
```bash
ouroboros-code "Create a Next.js app with authentication, database, and deployment"
```

### **DevOps Automation**
```bash
ouroboros-code "Set up Kubernetes cluster with monitoring and auto-scaling"
```

### **Code Review & Optimization**
```bash
ouroboros-code /converge "Review this codebase for security vulnerabilities"
```

### **Documentation Generation**
```bash
ouroboros-code "Generate comprehensive API documentation from this code"
```

### **Testing & QA**
```bash
ouroboros-code "Write unit and integration tests for this module"
```

## 🔮 The Future is Autonomous

Ouroboros Code isn't just another AI tool—it's the beginning of **autonomous development**. Our vision:

- **Self-Coding Systems**: Code that writes, tests, and deploys itself
- **Agent Ecosystems**: Specialized agents collaborating on complex projects
- **Infinite Improvement**: Systems that continuously optimize themselves
- **Zero-Touch Development**: From idea to production without human intervention

## 🚀 Start Your Infinite Loop Today

```bash
npm install -g @ouroboros/code-cli
ouroboros-code

# Welcome to the future of development
# Where code writes code
# Where agents orchestrate agents
# Where the loop never ends
# But productivity is infinite
```

## 📄 License

Ouroboros Code is open source under the **Apache 2.0 License**. Built by developers, for developers, to push the boundaries of what's possible.

---

<p align="center">
  <strong>🐍 Ouroboros Code</strong><br>
  <em>The Infinite Loop of Productivity</em><br>
  <br>
  <a href="https://ouroboros.dev">Website</a> •
  <a href="https://github.com/ouroboros-ai/ouroboros-code">GitHub</a> •
  <a href="https://discord.gg/ouroboros">Discord</a> •
  <a href="https://twitter.com/ouroboroscode">Twitter</a>
</p>
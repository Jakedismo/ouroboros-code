# Welcome to Ouroboros Code Documentation

This documentation collects everything you need to install, configure, and extend the Ouroboros Code toolchain. Ouroboros Code ships a CLI, IDE companion, and automation hooks that all share the unified runtime powered by the OpenAI Agents SDK plus the Vercel AI provider extension.

## Overview

Ouroboros Code brings multi-provider agent capabilities to your terminal in an interactive Read-Eval-Print Loop (REPL) environment. The CLI (`packages/cli`) talks to the shared core runtime (`packages/core`), which manages tool execution, telemetry, and all model traffic through the unified Agents SDK stack. Optional provider connectors let you reach Anthropic Claude 4.1/Opus 4.1 and Google Gemini 2.5 models without custom clients.

## Navigating the Documentation

- **[Execution and Deployment](./deployment.md):** Run the CLI via npm, Docker, or source builds.
- **[Unified Agents Architecture](./unified-agents-architecture.md):** Deep dive into the runtime composition and provider connectors.
- **CLI Usage:**
  - **[CLI Introduction](./cli/index.md):** Overview of the command-line interface.
  - **[Commands](./cli/commands.md):** Synopsis of available CLI commands.
  - **[Configuration](./cli/configuration.md):** Environment variables, settings files, and optional provider SDK installation.
  - **[Checkpointing](./checkpointing.md):** Persisting and restoring agent state.
  - **[Extensions](./extension.md):** Build and register custom tools.
  - **[IDE Integration](./ide-integration.md):** Connect Ouroboros Code to your editor.
  - **[Telemetry](./telemetry.md):** Metrics, logging, and opt-in analytics.
- **Core Details:**
  - **[Core Introduction](./core/index.md):** Orientation to the runtime services.
  - **[Tools API](./core/tools-api.md):** How the core exposes tools to the agent loop.
- **Tools:**
  - **[Tools Overview](./tools/index.md):** Catalogue of built-in tools.
  - **[File System Tools](./tools/file-system.md):** `read_file`, `write_file`, and friends.
  - **[Multi-File Read Tool](./tools/multi-file.md):** `read_many_files` usage and limits.
  - **[Shell Tool](./tools/shell.md):** `run_shell_command` reference.
  - **[Web Fetch Tool](./tools/web-fetch.md):** `web_fetch` configuration.
  - **[Web Search Tool](./tools/web-search.md):** Google programmable search details.
  - **[Memory Tool](./tools/memory.md):** Persisting conversation memories.
- **[Contributing & Development Guide](../CONTRIBUTING.md):** Workspace setup and coding conventions.
- **[NPM](./npm.md):** Published packages and versioning.
- **[Troubleshooting Guide](./troubleshooting.md):** Common issues and fixes.
- **[Terms of Service and Privacy Notice](./tos-privacy.md):** Legal guidance for using Ouroboros Code.
- **[Releases](./releases.md):** Release cadence and changelog pointers.

We hope this documentation helps you make the most of Ouroboros Code!

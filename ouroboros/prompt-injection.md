# Ouroboros Prompt Injection Mechanism

## Overview

The Ouroboros prompt injection mechanism enables real-time interaction with running AI agents through multiple input channels. This powerful feature allows you to inject new prompts, context, files, and commands into active sessions without restarting the process.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Input Sources                           │
├──────────────┬──────────────┬──────────────┬──────────────┤
│    stdin     │  Named Pipe  │     A2A      │   Process    │
│   (Direct)   │   (FIFO)     │  (Port 45123)│     FD       │
└──────┬───────┴──────┬───────┴──────┬───────┴──────┬───────┘
       │              │              │              │
       └──────────────┴──────────────┴──────────────┘
                           │
                           ▼
              ┌────────────────────────────┐
              │  ContinuousInputManager    │
              │  - Event-driven processing │
              │  - Command queue           │
              │  - Protocol parsing        │
              └────────────┬───────────────┘
                           │
                           ▼
              ┌────────────────────────────┐
              │    Command Processor       │
              │  - Context injection       │
              │  - File loading            │
              │  - Execution control       │
              └────────────┬───────────────┘
                           │
                           ▼
              ┌────────────────────────────┐
              │     AI Agent Loop          │
              │  - Processes inputs        │
              │  - Executes tasks          │
              │  - Maintains conversation  │
              └────────────────────────────┘
```

## Input Methods

### 1. Direct stdin Input

When running in a terminal (including tmux), you can type directly:

```bash
# Start autonomous mode
$ ouroboros-code --autonomous "Development assistant"

# Type directly (appears inline with output)
> Fix the authentication bug in login.js
[AI processes and responds]

> Add comprehensive error handling
[AI continues the conversation]
```

**Pros:**
- Immediate and intuitive
- No setup required
- Works in any terminal

**Cons:**
- Mixed with AI output
- Hard to script
- Limited to current terminal

### 2. Named Pipe (FIFO)

Best for controlled input from different terminals or scripts:

```bash
# Terminal 1: Create pipe and start agent
$ mkfifo /tmp/ouroboros_pipe
$ ouroboros-code --autonomous "Code reviewer" < /tmp/ouroboros_pipe

# Terminal 2: Send commands
$ echo "Review the latest PR" > /tmp/ouroboros_pipe
$ echo "#INJECT_FILE src/new-feature.js" > /tmp/ouroboros_pipe
```

**Pros:**
- Clean separation of input/output
- Scriptable
- Multiple writers possible

**Cons:**
- Requires pipe setup
- Pipe must exist before starting

### 3. Process File Descriptors

Direct writing to process stdin (Linux/Unix):

```bash
# Find process PID
$ ps aux | grep ouroboros-code
user 12345 ... ouroboros-code --autonomous

# Write to stdin
$ echo "New instruction" > /proc/12345/fd/0
```

**Pros:**
- Works with already-running processes
- No prior setup needed

**Cons:**
- Platform-specific (/proc on Linux)
- Requires process PID
- Permission restrictions

### 4. A2A (Agent-to-Agent) Communication

Network-based communication on port 45123:

```javascript
// Node.js example
const net = require('net');

function sendToAgent(message) {
  const client = net.connect(45123, 'localhost', () => {
    client.write(JSON.stringify({
      type: 'task',
      data: message,
      timestamp: Date.now(),
      sender: 'orchestrator'
    }));
  });
  
  client.on('data', (data) => {
    console.log('Response:', JSON.parse(data.toString()));
    client.end();
  });
}

sendToAgent('Analyze the performance metrics');
```

**Pros:**
- Language agnostic
- Remote capable
- Structured messages
- Response handling

**Cons:**
- Requires network setup
- More complex protocol
- Port must be available

## Protocol Commands

### Basic Commands

| Command | Description | Example |
|---------|-------------|---------|
| `#INJECT_CONTEXT` | Start multi-line context injection | See below |
| `#END_CONTEXT` | End context injection | See below |
| `#INJECT_FILE <path>` | Inject file contents | `#INJECT_FILE src/app.js` |
| `#INJECT_COMMAND <cmd>` | Request command execution | `#INJECT_COMMAND npm test` |
| `#PAUSE_EXECUTION` | Pause agent processing | `#PAUSE_EXECUTION` |
| `#RESUME_EXECUTION` | Resume agent processing | `#RESUME_EXECUTION` |
| `#EXIT_AUTONOMOUS` | Gracefully exit autonomous mode | `#EXIT_AUTONOMOUS` |

### Context Injection Example

```bash
#INJECT_CONTEXT
This is a multi-line context injection.
It can contain:
- Requirements
- Code samples
- Documentation
- Any relevant information

The agent will process this as additional context
for the current conversation.
#END_CONTEXT
```

## tmux Workflows

### Basic Setup

```bash
# Create new tmux session
tmux new-session -d -s ai-dev

# Split window horizontally
tmux split-window -h -t ai-dev

# Start agent in left pane
tmux send-keys -t ai-dev:0.0 \
  "ouroboros-code --autonomous 'Development assistant'" C-m

# Right pane for monitoring
tmux send-keys -t ai-dev:0.1 "htop" C-m

# Attach to session
tmux attach -t ai-dev
```

### Advanced Setup with Named Pipe

```bash
#!/bin/bash
# setup-ai-session.sh

SESSION="ai-workspace"
PIPE="/tmp/ouroboros_pipe"

# Create session
tmux new-session -d -s $SESSION

# Create three panes
tmux split-window -h -t $SESSION
tmux split-window -v -t $SESSION:0.1

# Pane 0: AI Agent
tmux send-keys -t $SESSION:0.0 "mkfifo $PIPE" C-m
tmux send-keys -t $SESSION:0.0 \
  "ouroboros-code --autonomous 'Full-stack developer' < $PIPE" C-m

# Pane 1: Control Panel
tmux send-keys -t $SESSION:0.1 \
  "echo '# Control Panel - Send commands to: $PIPE'" C-m
tmux send-keys -t $SESSION:0.1 \
  "echo 'Example: echo \"Review code\" > $PIPE'" C-m

# Pane 2: File Watcher
tmux send-keys -t $SESSION:0.2 \
  "watch -n 2 'git status -s'" C-m

# Set pane titles
tmux select-pane -t $SESSION:0.0 -T "AI Agent"
tmux select-pane -t $SESSION:0.1 -T "Control"
tmux select-pane -t $SESSION:0.2 -T "Monitor"

# Attach
tmux attach -t $SESSION
```

### Helper Functions

Add to your `.bashrc` or `.zshrc`:

```bash
# Ouroboros AI helper functions

# Send message to AI agent
ai-send() {
  echo "$*" > /tmp/ouroboros_pipe
}

# Inject file to AI agent
ai-file() {
  echo "#INJECT_FILE $1" > /tmp/ouroboros_pipe
}

# Inject context to AI agent
ai-context() {
  {
    echo "#INJECT_CONTEXT"
    cat
    echo "#END_CONTEXT"
  } > /tmp/ouroboros_pipe
}

# Send command for AI to execute
ai-cmd() {
  echo "#INJECT_COMMAND $*" > /tmp/ouroboros_pipe
}

# Control AI execution
ai-pause() {
  echo "#PAUSE_EXECUTION" > /tmp/ouroboros_pipe
}

ai-resume() {
  echo "#RESUME_EXECUTION" > /tmp/ouroboros_pipe
}

ai-exit() {
  echo "#EXIT_AUTONOMOUS" > /tmp/ouroboros_pipe
}

# Start AI session with tmux
ai-start() {
  local task="${1:-Development assistant}"
  tmux new-session -d -s ouroboros-ai \
    "mkfifo /tmp/ouroboros_pipe; ouroboros-code --autonomous '$task' < /tmp/ouroboros_pipe"
  tmux attach -t ouroboros-ai
}
```

Usage:
```bash
# Start AI session
$ ai-start "Help with React development"

# From another terminal
$ ai-send "Create a new component for user profiles"
$ ai-file src/components/UserCard.jsx
$ echo "Use Material-UI for styling" | ai-context
$ ai-cmd "npm test UserCard"
```

## Practical Examples

### 1. Continuous Development Assistant

```bash
# Terminal 1: Start assistant
$ mkfifo /tmp/ai_pipe
$ ouroboros-code --autonomous \
    "Monitor codebase and suggest improvements" < /tmp/ai_pipe

# Terminal 2: Development workflow
$ git commit -m "Add new feature"
$ echo "#INJECT_COMMAND git diff HEAD~1" > /tmp/ai_pipe
$ echo "Review my latest commit for issues" > /tmp/ai_pipe
```

### 2. Test-Driven Development

```bash
# Start TDD assistant
$ ouroboros-code --autonomous "TDD assistant for Python project" &
$ PID=$!

# Write test first
$ echo "Create a test for a fibonacci function" > /proc/$PID/fd/0

# After test is created
$ echo "#INJECT_FILE test_fibonacci.py" > /proc/$PID/fd/0
$ echo "Now implement the fibonacci function" > /proc/$PID/fd/0
```

### 3. Multi-Agent Orchestration

```python
#!/usr/bin/env python3
# orchestrator.py

import socket
import json
import time

class AgentOrchestrator:
    def __init__(self, agents):
        self.agents = agents  # [(host, port), ...]
    
    def send_task(self, agent_idx, task):
        host, port = self.agents[agent_idx]
        
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.connect((host, port))
            
            message = json.dumps({
                'type': 'task',
                'data': task,
                'timestamp': int(time.time() * 1000),
                'sender': 'orchestrator'
            })
            
            s.send(message.encode())
            response = s.recv(1024)
            return json.loads(response.decode())
    
    def distribute_work(self, tasks):
        results = []
        for i, task in enumerate(tasks):
            agent_idx = i % len(self.agents)
            result = self.send_task(agent_idx, task)
            results.append(result)
            print(f"Task '{task}' sent to agent {agent_idx}: {result}")
        return results

# Usage
orchestrator = AgentOrchestrator([
    ('localhost', 45123),  # Agent 1
    ('localhost', 45124),  # Agent 2
])

tasks = [
    "Review authentication module",
    "Optimize database queries",
    "Write API documentation",
    "Create unit tests for user service"
]

orchestrator.distribute_work(tasks)
```

### 4. Automated Code Review Pipeline

```bash
#!/bin/bash
# auto-review.sh

PIPE="/tmp/reviewer_pipe"
BRANCH="$1"

# Start reviewer if not running
if ! pgrep -f "ouroboros-code.*reviewer" > /dev/null; then
  mkfifo $PIPE 2>/dev/null
  ouroboros-code --autonomous "Code reviewer" < $PIPE &
  sleep 2
fi

# Get changed files
CHANGED_FILES=$(git diff --name-only main...$BRANCH)

# Send review request
{
  echo "#INJECT_CONTEXT"
  echo "Review branch: $BRANCH"
  echo "Changed files:"
  echo "$CHANGED_FILES"
  echo "#END_CONTEXT"
  
  # Inject each changed file
  for file in $CHANGED_FILES; do
    if [ -f "$file" ]; then
      echo "#INJECT_FILE $file"
    fi
  done
  
  echo "Perform a comprehensive code review focusing on:"
  echo "1. Security vulnerabilities"
  echo "2. Performance issues"
  echo "3. Code style and best practices"
  echo "4. Test coverage"
} > $PIPE
```

## Best Practices

### 1. Session Management

```bash
# Always use named pipes for production
PIPE="/tmp/ouroboros_$(date +%s)"
mkfifo $PIPE
trap "rm -f $PIPE" EXIT

ouroboros-code --autonomous "Task" < $PIPE &
PID=$!
```

### 2. Error Handling

```bash
# Check if agent is responsive
check_agent() {
  echo "ping" > /tmp/ouroboros_pipe
  timeout 5 grep -q "response" <(tail -f /var/log/ouroboros.log)
  return $?
}

if ! check_agent; then
  echo "Agent not responding, restarting..."
  ai-exit
  ai-start "Development assistant"
fi
```

### 3. Logging and Monitoring

```bash
# Log all interactions
{
  ouroboros-code --autonomous "Assistant" < /tmp/ai_pipe 2>&1
} | tee -a /var/log/ouroboros_session.log
```

### 4. Resource Management

```bash
# Limit resources
systemd-run --uid=$(id -u) \
  --property=MemoryMax=2G \
  --property=CPUQuota=50% \
  ouroboros-code --autonomous "Resource-limited agent"
```

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Commands not processed | Wrong input method | Verify pipe exists or stdin is open |
| Agent not responding | Paused or blocked | Send `#RESUME_EXECUTION` |
| Port 45123 in use | Another agent running | Use different port or kill process |
| Mixed output in terminal | Direct stdin with output | Use named pipe instead |
| Permission denied on /proc | Insufficient privileges | Use named pipe or A2A |

### Debug Mode

Enable debug output to troubleshoot:

```bash
ouroboros-code --autonomous "Task" --debug

# Shows:
# - Input processing
# - Command parsing
# - Queue status
# - A2A connections
```

### Health Check Script

```bash
#!/bin/bash
# health-check.sh

check_port() {
  nc -z localhost 45123
  echo "A2A Port: $([ $? -eq 0 ] && echo 'OK' || echo 'FAIL')"
}

check_pipe() {
  [ -p /tmp/ouroboros_pipe ]
  echo "Named Pipe: $([ $? -eq 0 ] && echo 'OK' || echo 'FAIL')"
}

check_process() {
  pgrep -f "ouroboros-code.*autonomous" > /dev/null
  echo "Process: $([ $? -eq 0 ] && echo 'OK' || echo 'FAIL')"
}

echo "=== Ouroboros Health Check ==="
check_process
check_pipe
check_port
```

## Security Considerations

### Input Validation

- Protocol commands are validated before execution
- File paths are checked for traversal attacks
- Commands are not executed directly (sent to AI for interpretation)

### Isolation

```bash
# Run in container for isolation
docker run -it --rm \
  -v $(pwd):/workspace \
  -p 45123:45123 \
  ouroboros-image \
  ouroboros-code --autonomous "Isolated agent"
```

### Access Control

```bash
# Restrict pipe access
mkfifo -m 600 /tmp/ouroboros_pipe

# Restrict A2A to localhost only
# (Default behavior, external connections blocked)
```

## Performance Tips

1. **Use named pipes** for high-volume input
2. **Batch context injections** instead of many small ones
3. **Monitor memory usage** with long-running sessions
4. **Implement command throttling** for automation scripts
5. **Use A2A for programmatic control** instead of text parsing

## Integration Examples

### GitHub Actions

```yaml
name: AI Code Review
on: [pull_request]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Start AI Reviewer
        run: |
          mkfifo /tmp/ai_pipe
          ouroboros-code --autonomous "PR reviewer" < /tmp/ai_pipe &
          echo $! > /tmp/ai.pid
          
      - name: Send PR for Review
        run: |
          echo "#INJECT_CONTEXT" > /tmp/ai_pipe
          echo "PR #${{ github.event.pull_request.number }}" > /tmp/ai_pipe
          echo "Title: ${{ github.event.pull_request.title }}" > /tmp/ai_pipe
          git diff origin/main...HEAD >> /tmp/ai_pipe
          echo "#END_CONTEXT" > /tmp/ai_pipe
          echo "Review this PR for issues" > /tmp/ai_pipe
          
      - name: Wait and Collect Results
        run: |
          sleep 30
          kill $(cat /tmp/ai.pid)
```

### VS Code Task

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "AI Assistant",
      "type": "shell",
      "command": "mkfifo /tmp/vscode_ai; ouroboros-code --autonomous 'VS Code assistant' < /tmp/vscode_ai",
      "isBackground": true,
      "problemMatcher": []
    },
    {
      "label": "Send to AI",
      "type": "shell",
      "command": "echo '${input:aiCommand}' > /tmp/vscode_ai",
      "problemMatcher": []
    }
  ],
  "inputs": [
    {
      "id": "aiCommand",
      "type": "promptString",
      "description": "Command for AI assistant"
    }
  ]
}
```

## Summary

The Ouroboros prompt injection mechanism provides flexible, powerful ways to interact with running AI agents. Whether you're using simple stdin input, sophisticated named pipes, or network-based A2A communication, the system adapts to your workflow needs. The combination of continuous monitoring, protocol commands, and multiple input channels makes it ideal for both interactive development and automated pipelines.
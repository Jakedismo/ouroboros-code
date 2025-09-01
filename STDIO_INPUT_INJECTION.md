# STDIO Input Injection for Headless Sessions

## Overview

This implementation enables runtime context injection for both `--prompt` and `--autonomous` modes while they're running in headless sessions. External systems can now provide input and control commands during execution without restarting the process.

## Features Implemented

### 1. **ContinuousInputManager Service**
- Monitors stdin continuously during headless sessions
- Queues incoming commands and context injections
- Supports special control protocol commands
- Non-blocking async input handling

### 2. **Enhanced Non-Interactive Mode**
- `--prompt` mode now supports continuous input when enabled
- Processes queued inputs between tool executions
- Supports context injection mid-conversation
- Handles special control sequences

### 3. **Full Autonomous Mode**
- `--autonomous` flag enables continuous execution without exit
- Maintains conversation loop indefinitely
- A2A (Agent-to-Agent) communication on port 45123
- Session management with configurable turn limits

### 4. **Input Protocol Commands**

The following commands can be injected via stdin during execution:

```bash
# Inject multi-line context
#INJECT_CONTEXT
Your context data here
Can be multiple lines
#END_CONTEXT

# Inject file content
#INJECT_FILE /path/to/file.txt

# Execute a command
#INJECT_COMMAND run tests

# Control execution
#PAUSE_EXECUTION
#RESUME_EXECUTION
#EXIT_AUTONOMOUS
```

## Usage Examples

### Basic Prompt Mode with Continuous Input

```bash
# Start with prompt mode and continuous input
echo "Analyze this code" | ouroboros-code --prompt "Start analysis"

# Then inject additional context while running:
echo "#INJECT_CONTEXT
Additional code to analyze
#END_CONTEXT" >> /proc/[PID]/fd/0
```

### Autonomous Mode

```bash
# Start autonomous mode
ouroboros-code --autonomous "Continue working on the project autonomously"

# The process will:
# 1. Execute the initial prompt
# 2. Continue running, waiting for new inputs
# 3. Accept control commands via stdin
# 4. Enable A2A communication on port 45123
```

### Programmatic Input Injection

```bash
#!/bin/bash
# Start ouroboros in autonomous mode
mkfifo /tmp/ouroboros_input
ouroboros-code --autonomous "Monitor and fix issues" < /tmp/ouroboros_input &
PID=$!

# Inject context programmatically
echo "#INJECT_CONTEXT" > /tmp/ouroboros_input
cat new_requirements.txt > /tmp/ouroboros_input
echo "#END_CONTEXT" > /tmp/ouroboros_input

# Inject file
echo "#INJECT_FILE /path/to/updated/code.js" > /tmp/ouroboros_input

# When done
echo "#EXIT_AUTONOMOUS" > /tmp/ouroboros_input
wait $PID
```

### Python Example

```python
import subprocess
import time

# Start ouroboros with stdin pipe
process = subprocess.Popen(
    ['ouroboros-code', '--autonomous', 'Help with development'],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True
)

# Inject context
process.stdin.write("#INJECT_CONTEXT\n")
process.stdin.write("New feature requirements:\n")
process.stdin.write("- Add user authentication\n")
process.stdin.write("- Implement data validation\n")
process.stdin.write("#END_CONTEXT\n")
process.stdin.flush()

time.sleep(10)  # Let it process

# Inject file
process.stdin.write("#INJECT_FILE requirements.txt\n")
process.stdin.flush()

# Exit when done
process.stdin.write("#EXIT_AUTONOMOUS\n")
process.stdin.flush()

process.wait()
```

### A2A Communication

When running in autonomous mode with experimental A2A enabled:

```javascript
// Connect to another agent
const net = require('net');

const client = new net.Socket();
client.connect(45123, '127.0.0.1', () => {
    // Send task to agent
    client.write(JSON.stringify({
        type: 'task',
        data: 'Review and optimize the authentication module',
        timestamp: Date.now(),
        sender: 'orchestrator'
    }));
});

client.on('data', (data) => {
    const response = JSON.parse(data.toString());
    console.log('Agent response:', response);
});
```

## Configuration

### Enable Continuous Input

Continuous input is automatically enabled when using:
- `--prompt` flag - Enables continuous input for single session
- `--autonomous` flag - Enables continuous input with autonomous execution

### Debug Mode

Enable debug mode to see input processing details:

```bash
ouroboros-code --autonomous "Task" --debug
```

### Session Limits

Control autonomous session duration:

```bash
# Limit to 50 turns
ouroboros-code --autonomous "Task" --max-session-turns 50
```

## Implementation Details

### Architecture Components

1. **ContinuousInputManager** (`packages/cli/src/services/continuousInputManager.ts`)
   - Event-driven input processing
   - Command queue management
   - Protocol parsing

2. **Enhanced Config** (`packages/core/src/config/config.ts`)
   - `autonomousMode` flag
   - `enableContinuousInput` flag
   - Getter methods for mode detection

3. **Modified NonInteractive Runner** (`packages/cli/src/nonInteractiveCli.ts`)
   - Input manager integration
   - Command processing between turns
   - Autonomous mode loop support

4. **Autonomous CLI** (`packages/cli/src/autonomousCli.ts`)
   - Full autonomous execution
   - A2A server implementation
   - Session management

### Key Benefits

- **Runtime Flexibility**: Inject context without restarting
- **Long-Running Agents**: Support for autonomous agents
- **External Integration**: Other systems can provide input
- **Backward Compatible**: Existing behavior preserved
- **Sophisticated Workflows**: Enable complex automation

## Testing

### Test Continuous Input with --prompt

```bash
# Terminal 1: Start with prompt
mkfifo /tmp/test_input
ouroboros-code --prompt "Describe the project structure" < /tmp/test_input

# Terminal 2: Inject additional context
echo "Focus on the src directory" > /tmp/test_input
echo "#INJECT_FILE package.json" > /tmp/test_input
```

### Test Autonomous Mode

```bash
# Start autonomous mode
ouroboros-code --autonomous "Monitor the codebase for issues"

# Process continues running
# Type commands directly or pipe them in
# Use #EXIT_AUTONOMOUS to stop
```

## Troubleshooting

### Process Doesn't Accept Input
- Ensure stdin is not already closed
- Check if continuous input is enabled (--prompt or --autonomous)
- Verify debug mode for diagnostic output

### A2A Connection Refused
- Check if port 45123 is available
- Ensure experimental A2A mode is enabled
- Verify firewall settings

### Commands Not Processing
- Commands must start with # character
- Ensure proper command syntax
- Check debug logs for parsing errors

## Future Enhancements

1. **WebSocket Support**: Alternative to stdin for web-based input
2. **Multi-Agent Orchestration**: Enhanced A2A protocol
3. **Input History**: Persistent command history
4. **GUI Control Panel**: Visual interface for command injection
5. **Input Validation**: Schema-based command validation
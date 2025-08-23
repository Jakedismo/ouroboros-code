# Agent-to-Agent PID Filtering Usage Guide

This document explains how to use the new PID-based filtering system for targeted agent-to-agent communication.

## Overview

The webhook notification system now supports both **targeted messages** and **broadcast messages** through PID-based filtering:

- **Targeted Messages**: Include a `target_pid` field to send messages only to a specific agent process
- **Broadcast Messages**: Omit the `target_pid` field to send messages to all listening agents

## Webhook Payload Structure

```typescript
interface WebhookPayload {
  tool_id: string;
  server_name: string;
  status: 'completed' | 'failed' | 'progress';
  result?: {
    output: unknown;
    error?: string;
  };
  started_at: string;
  completed_at?: string;
  metadata?: Record<string, unknown>;
  target_pid?: number; // Optional PID for targeted messages
}
```

## Usage Examples

### 1. Broadcast Message (All Agents)

```json
{
  "tool_id": "global-update-001",
  "server_name": "coordinator",
  "status": "completed",
  "started_at": "2025-01-23T10:30:00Z",
  "metadata": {
    "message": "System maintenance scheduled at 2PM"
  }
}
```

This message will be processed by **all** active A2A handlers.

### 2. Targeted Message (Specific Agent)

```json
{
  "tool_id": "task-assignment-001",
  "server_name": "task-manager",
  "status": "completed",
  "target_pid": 12345,
  "started_at": "2025-01-23T10:30:00Z",
  "metadata": {
    "task": "Process customer order #5678",
    "priority": "high"
  }
}
```

This message will **only** be processed by the agent with PID 12345.

## Implementation Details

### Agent Process Tracking

Each `AutonomousA2AHandler` instance automatically tracks its process PID:

```typescript
// Get the current process PID for an agent
const agentPid = a2aHandler.getProcessPid();
console.log(`Agent PID: ${agentPid}`);
```

### Filtering Logic

1. **Broadcast Processing**: Messages without `target_pid` are processed by all agents
2. **Targeted Processing**: Messages with `target_pid` are only processed if the PID matches
3. **Debug Logging**: When debug mode is enabled, filtering decisions are logged

### Debug Output Examples

```
[A2A Handler] Processing broadcast message { tool_id: "global-update-001" }
[A2A Handler] Processing targeted message { tool_id: "task-001", target_pid: 12345, current_pid: 12345 }
[A2A Handler] Skipping message not targeted for this PID { target_pid: 67890, current_pid: 12345, tool_id: "other-task" }
[Webhook Server] Received broadcast webhook for tool global-update-001
[Webhook Server] Received targeted (PID: 12345) webhook for tool task-001
```

## Use Cases

### 1. System-Wide Announcements
Use broadcast messages for:
- System maintenance notifications
- Configuration updates
- Global state changes

### 2. Task Assignment
Use targeted messages for:
- Specific work assignments
- Direct agent-to-agent communication
- Process-specific notifications

### 3. Load Balancing
Combine both approaches:
- Broadcast work availability
- Target specific agents for load distribution

## Testing Your Implementation

To verify PID filtering is working:

1. Start multiple agent instances with `--experimental-a2a-mode --debug`
2. Send both broadcast and targeted webhook messages
3. Verify that targeted messages only appear in the intended agent's logs
4. Confirm broadcast messages appear in all agents' logs

## Error Handling

- Invalid PID values are treated as broadcast messages
- Network errors are logged but don't affect other message processing
- Authentication failures are handled at the webhook server level
# A2A Webhook Notification Specifications

## Overview

This document provides complete specifications for sending webhook notifications to autonomous ouroboros-code instances for Agent-to-Agent (A2A) communication. The webhook system enables real-time delivery of A2A messages to agents operating in autonomous mode.

## Webhook Endpoint Configuration

### Base Endpoint
- **URL**: `http://localhost:45123/mcp-webhook`
- **Method**: `POST`
- **Port**: `45123` (fixed, not configurable)
- **Content-Type**: `application/json`

### Security Requirements

#### 1. Authentication Header (Required)
```http
Authorization: Bearer <auth_token>
```

The `auth_token` is automatically generated when the webhook server starts. You can:
- **Extract from logs**: Check debug output when autonomous mode starts
- **Use environment variable**: Set `WEBHOOK_AUTH_TOKEN` in environment
- **Configure in settings**: Add to ouroboros-code configuration

#### 2. HMAC Signature (Recommended)
```http
X-MCP-Signature: sha256=<hmac_signature>
```

HMAC signature calculation:
```javascript
const crypto = require('crypto');
const hmac = crypto.createHmac('sha256', hmac_secret);
hmac.update(JSON.stringify(payload));
const signature = `sha256=${hmac.digest('hex')}`;
```

## A2A Webhook Payload Format

### Core A2A Payload Structure
```json
{
  "notification_type": "a2a_message",
  "agent_data": {
    "sender_agent_id": "agent-alpha", 
    "receiver_agent_id": "agent-beta",
    "message_count": 3,
    "priority": "urgent",
    "auto_execute": true
  },
  "mcp_tool_config": {
    "tool_name": "a2a_coordinate",
    "auto_params": {
      "action": "inbox",
      "sessionId": "agent-beta-session",
      "unreadOnly": true,
      "limit": 50
    }
  }
}
```

### Field Specifications

#### `notification_type` (Required)
- **Type**: `string`
- **Values**: `"a2a_message"` | `"tool_completion"` | `"agent_request"`
- **Description**: Type of A2A notification being sent

#### `agent_data` (Optional)
- **Type**: `object`
- **Description**: Metadata about the A2A communication

**Fields:**
- `sender_agent_id` (string): ID of the sending agent
- `receiver_agent_id` (string): ID of the receiving agent  
- `message_count` (number): Number of messages available
- `priority` (string): `"low"` | `"normal"` | `"high"` | `"urgent"` | `"critical"`
- `auto_execute` (boolean): Whether to automatically execute the MCP tool

#### `mcp_tool_config` (Optional)
- **Type**: `object`
- **Description**: Configuration for automatic MCP tool execution

**Fields:**
- `tool_name` (string): `"a2a_coordinate"` | `"mao_inbox_poll"`
- `auto_params` (object): Tool-specific parameters (see tool sections below)

## Tool-Specific Configurations

### 1. a2a_coordinate Tool Configuration

#### Basic Configuration
```json
{
  "tool_name": "a2a_coordinate",
  "auto_params": {
    "action": "inbox",
    "sessionId": "agent-session-id",
    "unreadOnly": true,
    "limit": 50,
    "sortBy": "receivedAt",
    "sortOrder": "desc"
  }
}
```

#### Advanced Configuration
```json
{
  "tool_name": "a2a_coordinate", 
  "auto_params": {
    "action": "inbox",
    "sessionId": "agent-session-id",
    "unreadOnly": true,
    "limit": 25,
    "since": "2024-01-20T10:00:00Z",
    "topic": "coordination.urgent",
    "from": "agent-alpha",
    "sortBy": "priority",
    "sortOrder": "desc"
  }
}
```

**Parameters:**
- `action`: Always `"inbox"` for A2A message retrieval
- `sessionId`: Target agent's session identifier
- `unreadOnly`: Filter to unread messages only (default: `true`)
- `limit`: Maximum messages to retrieve (1-100, default: 50)
- `since`: ISO timestamp for message filtering (optional)
- `topic`: Specific topic filter (optional)
- `from`: Sender agent filter (optional) 
- `sortBy`: Sort field - `"receivedAt"` | `"priority"` | `"status"` | `"from"`
- `sortOrder`: Sort direction - `"asc"` | `"desc"`

### 2. mao_inbox_poll Tool Configuration

#### Basic Configuration
```json
{
  "tool_name": "mao_inbox_poll",
  "auto_params": {
    "agentId": "agent-beta",
    "unreadOnly": true,
    "limit": 50,
    "includeExpired": false
  }
}
```

#### Advanced Configuration
```json
{
  "tool_name": "mao_inbox_poll",
  "auto_params": {
    "agentId": "agent-beta",
    "unreadOnly": true,
    "type": "leadership",
    "priority": "critical", 
    "from": "agent-alpha",
    "since": "2024-01-20T10:00:00Z",
    "limit": 20,
    "includeExpired": false
  }
}
```

**Parameters:**
- `agentId`: Target agent identifier (required)
- `unreadOnly`: Filter to unread messages (default: `true`)
- `type`: Message type filter - `"leadership"` | `"coordinator"` | `"fitness"` | `"consensus"` | `"stigmergic"` | `"phase"` | `"general"`
- `priority`: Priority filter - `"critical"` | `"high"` | `"normal"` | `"low"`
- `from`: Sender agent filter (optional)
- `since`: ISO timestamp for message filtering (optional)
- `limit`: Maximum messages to retrieve (1-100, default: 50)
- `includeExpired`: Include expired messages (default: `false`)

## Example Webhook Requests

### 1. Basic A2A Message Notification

```bash
curl -X POST http://localhost:45123/mcp-webhook \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-auth-token-here" \
  -d '{
    "notification_type": "a2a_message",
    "agent_data": {
      "sender_agent_id": "agent-alpha",
      "receiver_agent_id": "agent-beta",
      "message_count": 1,
      "priority": "urgent", 
      "auto_execute": true
    }
  }'
```

### 2. A2A Message with a2a_coordinate Tool

```bash
curl -X POST http://localhost:45123/mcp-webhook \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-auth-token-here" \
  -H "X-MCP-Signature: sha256=calculated-hmac-signature" \
  -d '{
    "notification_type": "a2a_message",
    "agent_data": {
      "sender_agent_id": "coordination-hub",
      "receiver_agent_id": "worker-agent-001", 
      "message_count": 3,
      "priority": "high",
      "auto_execute": true
    },
    "mcp_tool_config": {
      "tool_name": "a2a_coordinate",
      "auto_params": {
        "action": "inbox",
        "sessionId": "worker-agent-001-session",
        "unreadOnly": true,
        "limit": 10,
        "topic": "task.assignment"
      }
    }
  }'
```

### 3. A2A Message with mao_inbox_poll Tool

```bash
curl -X POST http://localhost:45123/mcp-webhook \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-auth-token-here" \
  -d '{
    "notification_type": "a2a_message",
    "agent_data": {
      "sender_agent_id": "leadership-agent",
      "receiver_agent_id": "coordinator-agent",
      "message_count": 2,
      "priority": "critical",
      "auto_execute": true
    },
    "mcp_tool_config": {
      "tool_name": "mao_inbox_poll", 
      "auto_params": {
        "agentId": "coordinator-agent",
        "unreadOnly": true,
        "type": "leadership",
        "priority": "critical",
        "limit": 5
      }
    }
  }'
```

### 4. Agent Request Notification

```bash
curl -X POST http://localhost:45123/mcp-webhook \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-auth-token-here" \
  -d '{
    "notification_type": "agent_request",
    "agent_data": {
      "sender_agent_id": "requester-agent",
      "receiver_agent_id": "target-agent",
      "priority": "normal",
      "auto_execute": false
    }
  }'
```

## Programming Language Examples

### JavaScript/Node.js

```javascript
const crypto = require('crypto');

async function sendA2ANotification(payload, authToken, hmacSecret) {
  const body = JSON.stringify(payload);
  
  // Calculate HMAC signature
  const hmac = crypto.createHmac('sha256', hmacSecret);
  hmac.update(body);
  const signature = `sha256=${hmac.digest('hex')}`;
  
  const response = await fetch('http://localhost:45123/mcp-webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
      'X-MCP-Signature': signature
    },
    body: body
  });
  
  return response.ok;
}

// Usage
const payload = {
  notification_type: 'a2a_message',
  agent_data: {
    sender_agent_id: 'sender-001',
    receiver_agent_id: 'receiver-001',
    message_count: 1,
    priority: 'urgent',
    auto_execute: true
  },
  mcp_tool_config: {
    tool_name: 'a2a_coordinate',
    auto_params: {
      action: 'inbox',
      sessionId: 'receiver-001-session',
      unreadOnly: true,
      limit: 50
    }
  }
};

sendA2ANotification(payload, 'your-auth-token', 'your-hmac-secret');
```

### Python

```python
import json
import hmac
import hashlib
import requests

def send_a2a_notification(payload, auth_token, hmac_secret):
    body = json.dumps(payload)
    
    # Calculate HMAC signature
    signature = hmac.new(
        hmac_secret.encode('utf-8'),
        body.encode('utf-8'), 
        hashlib.sha256
    ).hexdigest()
    
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {auth_token}',
        'X-MCP-Signature': f'sha256={signature}'
    }
    
    response = requests.post(
        'http://localhost:45123/mcp-webhook',
        headers=headers,
        data=body
    )
    
    return response.status_code == 200

# Usage
payload = {
    'notification_type': 'a2a_message',
    'agent_data': {
        'sender_agent_id': 'python-sender',
        'receiver_agent_id': 'target-agent',
        'message_count': 2,
        'priority': 'high',
        'auto_execute': True
    },
    'mcp_tool_config': {
        'tool_name': 'mao_inbox_poll',
        'auto_params': {
            'agentId': 'target-agent',
            'unreadOnly': True,
            'type': 'coordinator',
            'limit': 10
        }
    }
}

send_a2a_notification(payload, 'your-auth-token', 'your-hmac-secret')
```

### Go

```go
package main

import (
    "bytes"
    "crypto/hmac"
    "crypto/sha256"
    "encoding/hex"
    "encoding/json"
    "fmt"
    "net/http"
)

type A2APayload struct {
    NotificationType string     `json:"notification_type"`
    AgentData        AgentData  `json:"agent_data"`
    MCPToolConfig    *ToolConfig `json:"mcp_tool_config,omitempty"`
}

type AgentData struct {
    SenderAgentID   string `json:"sender_agent_id"`
    ReceiverAgentID string `json:"receiver_agent_id"`
    MessageCount    int    `json:"message_count"`
    Priority        string `json:"priority"`
    AutoExecute     bool   `json:"auto_execute"`
}

type ToolConfig struct {
    ToolName   string                 `json:"tool_name"`
    AutoParams map[string]interface{} `json:"auto_params"`
}

func sendA2ANotification(payload A2APayload, authToken, hmacSecret string) error {
    body, err := json.Marshal(payload)
    if err != nil {
        return err
    }
    
    // Calculate HMAC signature
    mac := hmac.New(sha256.New, []byte(hmacSecret))
    mac.Write(body)
    signature := "sha256=" + hex.EncodeToString(mac.Sum(nil))
    
    req, err := http.NewRequest("POST", "http://localhost:45123/mcp-webhook", bytes.NewBuffer(body))
    if err != nil {
        return err
    }
    
    req.Header.Set("Content-Type", "application/json")
    req.Header.Set("Authorization", "Bearer "+authToken)
    req.Header.Set("X-MCP-Signature", signature)
    
    client := &http.Client{}
    resp, err := client.Do(req)
    if err != nil {
        return err
    }
    defer resp.Body.Close()
    
    if resp.StatusCode != 200 {
        return fmt.Errorf("webhook returned status: %d", resp.StatusCode)
    }
    
    return nil
}

// Usage
func main() {
    payload := A2APayload{
        NotificationType: "a2a_message",
        AgentData: AgentData{
            SenderAgentID:   "go-sender",
            ReceiverAgentID: "target-agent",
            MessageCount:    1,
            Priority:        "urgent",
            AutoExecute:     true,
        },
        MCPToolConfig: &ToolConfig{
            ToolName: "a2a_coordinate",
            AutoParams: map[string]interface{}{
                "action":      "inbox",
                "sessionId":   "target-agent-session", 
                "unreadOnly":  true,
                "limit":       50,
            },
        },
    }
    
    err := sendA2ANotification(payload, "your-auth-token", "your-hmac-secret")
    if err != nil {
        fmt.Printf("Error: %v\n", err)
    }
}
```

## Response Codes

### Success Responses
- **200 OK**: Webhook processed successfully
- **202 Accepted**: Webhook queued for processing (async mode)

### Error Responses
- **400 Bad Request**: Malformed JSON payload or invalid parameters
- **401 Unauthorized**: Missing or invalid Authorization header
- **403 Forbidden**: Invalid HMAC signature
- **404 Not Found**: Incorrect webhook path (must be `/mcp-webhook`)
- **405 Method Not Allowed**: HTTP method other than POST
- **500 Internal Server Error**: Server processing error

## Configuration and Security

### Environment Variables
```bash
# Optional: Set fixed auth token
export WEBHOOK_AUTH_TOKEN="your-secure-token-here"

# Optional: Set HMAC secret
export WEBHOOK_HMAC_SECRET="your-hmac-secret-here"

# Optional: Disable HMAC validation (not recommended)
export WEBHOOK_DISABLE_HMAC="false"
```

### Authentication Token Discovery
When an autonomous agent starts, the auth token is logged:
```
[A2A] Autonomous agent mode initialized with A2A support
[Webhook Server] Server started on http://localhost:45123/mcp-webhook
[Webhook Server] Auth token: abc123def456...
```

### Security Best Practices
1. **Use HTTPS**: In production, use reverse proxy with TLS termination
2. **Validate Signatures**: Always verify HMAC signatures
3. **Rotate Tokens**: Periodically rotate auth tokens and HMAC secrets
4. **Network Security**: Restrict webhook endpoint access via firewall
5. **Rate Limiting**: Implement rate limiting to prevent abuse
6. **Log Monitoring**: Monitor webhook access logs for anomalies

## Troubleshooting

### Common Issues

1. **401 Unauthorized**
   - Check Authorization header format: `Bearer <token>`
   - Verify auth token matches the one generated by webhook server
   - Check debug logs for the correct token value

2. **403 Forbidden** 
   - Verify HMAC signature calculation
   - Ensure HMAC secret matches server configuration
   - Check signature format: `sha256=<hex_digest>`

3. **Connection Refused**
   - Verify ouroboros-code is running in autonomous mode
   - Check that webhook server is listening on port 45123
   - Ensure no firewall blocking port 45123

4. **No A2A Processing**
   - Verify `notification_type` is set to `"a2a_message"`
   - Check that MCP tools (a2a_coordinate or mao_inbox_poll) are available
   - Review debug logs for tool detection and execution

### Debug Commands
```bash
# Test webhook endpoint availability
curl -X GET http://localhost:45123/mcp-webhook
# Should return 405 Method Not Allowed

# Test with minimal payload
curl -X POST http://localhost:45123/mcp-webhook \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-token" \
  -d '{"notification_type":"a2a_message"}'

# Monitor logs with debug enabled
ouroboros-code --debug --prompt "autonomous task"
```

This webhook notification system provides robust, secure A2A communication for distributed autonomous agent networks.
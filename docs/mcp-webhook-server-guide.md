# MCP Server Webhook Implementation Guide

## Overview
MCP servers can notify Gemini CLI when long-running tools complete by sending webhook callbacks.

## Webhook Configuration Reception

MCP servers should accept webhook configuration via:
1. Custom notification method `webhook/configure`
2. Tool parameters with `__mcp_webhook_metadata` field

## Webhook Payload Format

```json
{
  "tool_id": "unique-invocation-id",
  "server_name": "your-mcp-server",
  "status": "completed|failed|progress",
  "result": {
    "output": "Tool execution result",
    "error": "Error message if failed"
  },
  "started_at": "2025-01-20T10:00:00Z",
  "completed_at": "2025-01-20T10:05:00Z",
  "metadata": {
    "custom": "fields"
  }
}
```

## Security

1. **Token Authentication**: Include `Authorization: Bearer <token>` header
2. **HMAC Signature**: Include `X-MCP-Signature: sha256=<signature>` header
3. **HTTPS**: Use HTTPS in production environments

## Example Implementation

```python
import requests
import hmac
import hashlib
import json

def send_webhook(webhook_url, auth_token, hmac_secret, payload):
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {auth_token}'
    }
    
    body = json.dumps(payload)
    
    if hmac_secret:
        signature = hmac.new(
            hmac_secret.encode(),
            body.encode(),
            hashlib.sha256
        ).hexdigest()
        headers['X-MCP-Signature'] = f'sha256={signature}'
    
    response = requests.post(webhook_url, json=payload, headers=headers)
    return response.status_code == 200
```
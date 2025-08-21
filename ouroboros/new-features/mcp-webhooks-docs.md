# MCP Webhook Notifications - Implementation Guide for MCP Servers

## Overview

The Gemini CLI now supports webhook notifications for long-running MCP tools. This allows MCP servers to execute tools asynchronously and notify the CLI when operations complete, enabling better user experience for time-intensive operations.

## How It Works

1. **Gemini CLI** starts a local webhook server when webhook-enabled tools are registered
2. **MCP Tool Execution** includes webhook metadata in tool parameters
3. **MCP Server** processes the tool and sends notifications via HTTP webhooks
4. **Gemini CLI** receives notifications and updates the user interface

## Webhook Metadata Reception

Your MCP server will receive webhook configuration through tool parameters when a webhook-enabled tool is invoked:

```json
{
  "your_tool_param": "normal_value",
  "__mcp_webhook_metadata": {
    "webhook_url": "http://localhost:45123/mcp-webhook",
    "webhook_auth_token": "abc123...",
    "webhook_hmac_secret": "def456...",
    "tool_invocation_id": "unique-uuid-for-this-invocation"
  }
}
```

## Required Server Modifications

### 1. Detect Webhook Configuration

Check if the `__mcp_webhook_metadata` field is present in tool parameters:

```python
def execute_tool(params):
    webhook_meta = params.get('__mcp_webhook_metadata')
    
    if webhook_meta:
        # This tool should use webhook notifications
        return execute_tool_async(params, webhook_meta)
    else:
        # Execute synchronously as normal
        return execute_tool_sync(params)
```

### 2. Asynchronous Execution Pattern

For webhook-enabled tools, return immediately and process asynchronously:

```python
def execute_tool_async(params, webhook_meta):
    # Start background task
    asyncio.create_task(
        long_running_operation(params, webhook_meta)
    )
    
    # Return immediately with acknowledgment
    return {
        "type": "text",
        "text": "Task started. You will be notified when it completes."
    }

async def long_running_operation(params, webhook_meta):
    try:
        # Send progress updates (optional)
        await send_webhook_notification(webhook_meta, {
            "tool_id": webhook_meta["tool_invocation_id"],
            "server_name": "your-server-name",
            "status": "progress",
            "result": {"output": "50% complete"},
            "started_at": start_time.isoformat()
        })
        
        # Perform the actual work
        result = await perform_actual_work(params)
        
        # Send completion notification
        await send_webhook_notification(webhook_meta, {
            "tool_id": webhook_meta["tool_invocation_id"],
            "server_name": "your-server-name", 
            "status": "completed",
            "result": {"output": result},
            "started_at": start_time.isoformat(),
            "completed_at": datetime.now().isoformat()
        })
        
    except Exception as e:
        # Send failure notification
        await send_webhook_notification(webhook_meta, {
            "tool_id": webhook_meta["tool_invocation_id"],
            "server_name": "your-server-name",
            "status": "failed", 
            "result": {"error": str(e)},
            "started_at": start_time.isoformat(),
            "completed_at": datetime.now().isoformat()
        })
```

### 3. Webhook Notification Implementation

```python
import requests
import hmac
import hashlib
import json
from datetime import datetime

async def send_webhook_notification(webhook_meta, payload):
    """Send webhook notification to Gemini CLI"""
    
    url = webhook_meta["webhook_url"]
    auth_token = webhook_meta["webhook_auth_token"]
    hmac_secret = webhook_meta.get("webhook_hmac_secret")
    
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {auth_token}'
    }
    
    # Serialize payload
    body = json.dumps(payload, separators=(',', ':'))
    
    # Add HMAC signature for security
    if hmac_secret:
        signature = hmac.new(
            hmac_secret.encode(),
            body.encode(), 
            hashlib.sha256
        ).hexdigest()
        headers['X-MCP-Signature'] = f'sha256={signature}'
    
    try:
        response = requests.post(url, data=body, headers=headers, timeout=10)
        return response.status_code == 200
    except Exception as e:
        print(f"Webhook notification failed: {e}")
        return False
```

## Webhook Payload Specification

### Required Fields

```typescript
interface WebhookPayload {
  tool_id: string;           // From webhook metadata
  server_name: string;       // Your MCP server name
  status: 'completed' | 'failed' | 'progress';
  started_at: string;        // ISO 8601 timestamp
}
```

### Optional Fields

```typescript
interface WebhookPayload {
  result?: {
    output?: any;            // Tool result data
    error?: string;          // Error message if failed
  };
  completed_at?: string;     // ISO 8601 timestamp for completion
  metadata?: Record<string, any>; // Custom fields
}
```

### Status Types

- **`progress`**: Intermediate updates during execution (optional)
- **`completed`**: Tool finished successfully 
- **`failed`**: Tool execution failed

## Security Implementation

### Authentication Headers

Always include the authentication token:

```python
headers = {
    'Authorization': f'Bearer {webhook_meta["webhook_auth_token"]}'
}
```

### HMAC Signature (Recommended)

Include HMAC signature for request integrity:

```python
def generate_hmac_signature(body: str, secret: str) -> str:
    signature = hmac.new(
        secret.encode(),
        body.encode(),
        hashlib.sha256
    ).hexdigest()
    return f'sha256={signature}'

headers['X-MCP-Signature'] = generate_hmac_signature(body, hmac_secret)
```

## Example: File Processing Tool

```python
class FileProcessorTool:
    def execute(self, params):
        file_path = params.get('file_path')
        webhook_meta = params.get('__mcp_webhook_metadata')
        
        if webhook_meta:
            # Async execution with webhook notifications
            asyncio.create_task(
                self.process_file_async(file_path, webhook_meta)
            )
            return {
                "type": "text", 
                "text": f"Started processing {file_path}. You'll be notified when complete."
            }
        else:
            # Synchronous execution
            result = self.process_file_sync(file_path)
            return {"type": "text", "text": result}
    
    async def process_file_async(self, file_path, webhook_meta):
        start_time = datetime.now()
        
        try:
            # Send progress updates
            await self.send_webhook(webhook_meta, {
                "tool_id": webhook_meta["tool_invocation_id"],
                "server_name": "file-processor",
                "status": "progress",
                "result": {"output": "Reading file..."},
                "started_at": start_time.isoformat()
            })
            
            # Simulate file processing
            await asyncio.sleep(2)
            
            await self.send_webhook(webhook_meta, {
                "tool_id": webhook_meta["tool_invocation_id"], 
                "server_name": "file-processor",
                "status": "progress",
                "result": {"output": "Processing data..."},
                "started_at": start_time.isoformat()
            })
            
            # More processing
            await asyncio.sleep(3)
            result = f"Successfully processed {file_path}"
            
            # Send completion
            await self.send_webhook(webhook_meta, {
                "tool_id": webhook_meta["tool_invocation_id"],
                "server_name": "file-processor", 
                "status": "completed",
                "result": {"output": result},
                "started_at": start_time.isoformat(),
                "completed_at": datetime.now().isoformat()
            })
            
        except Exception as e:
            await self.send_webhook(webhook_meta, {
                "tool_id": webhook_meta["tool_invocation_id"],
                "server_name": "file-processor",
                "status": "failed",
                "result": {"error": str(e)},
                "started_at": start_time.isoformat(),
                "completed_at": datetime.now().isoformat()
            })
```

## Configuration in Gemini CLI

Users can enable webhook support with:

```bash
# Enable webhooks globally
gemini --enable-webhooks

# Configure webhook server
export GEMINI_WEBHOOK_PORT=45123
export GEMINI_WEBHOOK_HOST=localhost
```

## Best Practices

### 1. Timeout Handling
- Implement reasonable timeouts for long operations
- Send progress updates at least every 30 seconds for long-running tasks

### 2. Error Handling  
- Always send failure notifications on errors
- Include descriptive error messages in the `result.error` field

### 3. Progress Updates
- Send progress notifications for operations taking >5 seconds
- Include meaningful progress information in `result.output`

### 4. Resource Management
- Clean up resources after webhook notifications
- Implement proper background task management

### 5. Security
- Validate webhook URLs before making requests
- Use HTTPS in production environments
- Implement request timeouts and retry logic

## Testing Your Implementation

### 1. Enable Webhook Logging

```python
import logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

async def send_webhook_notification(webhook_meta, payload):
    logger.debug(f"Sending webhook: {payload}")
    # ... implementation
    logger.debug(f"Webhook response: {response.status_code}")
```

### 2. Test Tool Invocation

```bash
# Start Gemini CLI with webhooks enabled
gemini --enable-webhooks --debug

# Execute your webhook-enabled tool
> Use the file_processor tool to process "large_file.csv"
```

### 3. Verify Notifications

Check that your server sends notifications in the correct format and the CLI receives them properly.

## Migration Strategy

1. **Phase 1**: Add webhook detection to existing tools
2. **Phase 2**: Implement async execution for appropriate tools  
3. **Phase 3**: Add progress notifications for long-running operations
4. **Phase 4**: Optimize based on user feedback

This webhook system enables much better user experience for long-running MCP tools while maintaining backward compatibility with existing implementations.
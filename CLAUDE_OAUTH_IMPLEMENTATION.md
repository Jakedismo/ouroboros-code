# Claude OAuth Implementation for Ouroboros Code

## Overview

This document describes the OAuth authentication implementation for Anthropic's Claude models in Ouroboros Code, allowing Claude Max subscribers to use their existing subscriptions instead of API keys.

## Architecture

### Core Components

1. **AnthropicOAuthManager** (`packages/core/src/providers/anthropic/oauth-manager.ts`)
   - Manages OAuth tokens and credentials
   - Handles token refresh automatically
   - Supports multiple credential sources
   - Implements secure token storage

2. **Extended AnthropicProvider** (`packages/core/src/providers/anthropic/provider.ts`)
   - Integrates OAuth authentication
   - Automatic token refresh on 401 errors
   - Fallback to API key authentication
   - Seamless provider switching

3. **CLI Configuration** (`packages/cli/src/config/config.ts`)
   - New OAuth-specific flags
   - Environment variable support
   - Credential path configuration

4. **Storage Integration** (`packages/core/src/config/storage.ts`)
   - Secure credential storage
   - Centralized configuration directory
   - Permission-restricted file access (600)

## Usage

### Command Line Options

```bash
# Basic OAuth usage
ouroboros-code --provider anthropic --claude-use-oauth

# With explicit credentials path
ouroboros-code --provider anthropic --claude-use-oauth --claude-credentials-path ~/.claude/.credentials.json

# With environment variables
export CLAUDE_ACCESS_TOKEN="your_access_token"
export CLAUDE_REFRESH_TOKEN="your_refresh_token"
ouroboros-code --provider anthropic --claude-use-oauth

# Interactive mode with OAuth
ouroboros-code --provider anthropic --claude-use-oauth -i "Help me refactor this code"
```

### Configuration Options

| Flag | Environment Variable | Description |
|------|---------------------|-------------|
| `--claude-use-oauth` | - | Enable OAuth authentication |
| `--claude-access-token` | `CLAUDE_ACCESS_TOKEN` | OAuth access token |
| `--claude-refresh-token` | `CLAUDE_REFRESH_TOKEN` | OAuth refresh token |
| `--claude-credentials-path` | - | Path to credentials file |

### Credential Sources (Priority Order)

1. **Command-line flags** (highest priority)
   - `--claude-access-token`
   - `--claude-refresh-token`

2. **Environment variables**
   - `CLAUDE_ACCESS_TOKEN`
   - `CLAUDE_REFRESH_TOKEN`

3. **Credentials file**
   - Default: `~/.claude/.credentials.json`
   - Custom: via `--claude-credentials-path`

4. **Cached credentials**
   - Stored at: `~/.ouroboros-code/anthropic-oauth.json`

## Credentials File Format

### Claude Web Format (`~/.claude/.credentials.json`)
```json
{
  "accessToken": "claude_access_token",
  "refreshToken": "claude_refresh_token",
  "expiresAt": 1234567890000,
  "email": "user@example.com",
  "subscription": "Claude Max"
}
```

### Ouroboros Cache Format (`~/.ouroboros-code/anthropic-oauth.json`)
```json
{
  "accessToken": "claude_access_token",
  "refreshToken": "claude_refresh_token",
  "expiresAt": 1234567890000
}
```

## Implementation Details

### Token Refresh Flow

1. **Automatic Refresh**: Tokens are refreshed automatically when:
   - Token expires (checked before each API call)
   - API returns 401 Unauthorized
   - Within 5 minutes of expiration

2. **Refresh Process**:
   ```typescript
   // Simplified refresh flow
   if (tokenNeedsRefresh()) {
     const newTokens = await refreshAccessToken();
     updateStoredTokens(newTokens);
     updateApiClient(newTokens.access_token);
   }
   ```

3. **Error Handling**:
   - Retry once on 401 errors after refresh
   - Fall back to API key if OAuth fails
   - Clear error messages for debugging

### Security Considerations

1. **Token Storage**:
   - Files stored with 600 permissions (owner read/write only)
   - Tokens never logged in debug output
   - Secure credential paths validation

2. **Token Transmission**:
   - Access tokens used as Bearer tokens
   - HTTPS-only communication
   - No token exposure in error messages

3. **Refresh Token Security**:
   - Refresh tokens stored separately
   - Automatic rotation on refresh
   - Expiry validation before use

## Migration Guide

### For Claude Max Subscribers

1. **Export credentials from Claude Web**:
   - Sign in to claude.ai
   - Export credentials (if available)
   - Or manually create credentials file

2. **Configure Ouroboros**:
   ```bash
   # Import credentials
   ouroboros-code --provider anthropic \
     --claude-use-oauth \
     --claude-credentials-path ~/Downloads/claude-credentials.json \
     -p "Import my credentials"
   ```

3. **Verify authentication**:
   ```bash
   ouroboros-code --provider anthropic --claude-use-oauth -p "Hello Claude"
   ```

### For API Key Users

No changes required! Continue using:
```bash
export ANTHROPIC_API_KEY="your_api_key"
ouroboros-code --provider anthropic
```

## Advanced Features

### Programmatic Usage

```typescript
import { AnthropicProvider } from '@ouroboros/code-cli-core';

const provider = new AnthropicProvider({
  provider: 'anthropic',
  model: 'claude-opus-4-1-20250805',
  useOAuth: true,
  oauthAccessToken: 'your_token',
  oauthRefreshToken: 'refresh_token',
  oauthAutoRefresh: true
});

await provider.initialize();
```

### Token Management API

```typescript
// Import credentials from file
await provider.importClaudeCredentials('/path/to/credentials.json');

// Check OAuth status
const status = provider.getOAuthStatus();
console.log('OAuth configured:', status.isConfigured);
console.log('Token expires:', status.expiresAt);
```

## Troubleshooting

### Common Issues

1. **"No OAuth access token available"**
   - Ensure credentials file exists
   - Check file permissions (should be readable)
   - Verify token hasn't expired

2. **"OAuth token refresh failed"**
   - Check refresh token validity
   - Ensure network connectivity
   - Verify Claude service status

3. **"401 Unauthorized" errors**
   - Token may be revoked
   - Re-authenticate via Claude web
   - Check subscription status

### Debug Mode

Enable debug output for OAuth troubleshooting:
```bash
ouroboros-code --provider anthropic --claude-use-oauth --debug
```

Debug output includes:
- Token loading source
- Refresh attempts
- Authentication flow
- Error details

## Benefits

1. **For Claude Max Subscribers**:
   - Use existing subscription
   - No additional API costs
   - Higher rate limits
   - Access to latest models

2. **For Organizations**:
   - Centralized billing
   - User management
   - Audit trails
   - Compliance features

3. **For Developers**:
   - Seamless authentication
   - Automatic token refresh
   - Multiple credential sources
   - Backward compatibility

## Future Enhancements

- [ ] Browser-based OAuth flow
- [ ] Token encryption at rest
- [ ] Multi-account support
- [ ] OAuth scope management
- [ ] Token revocation API
- [ ] Session management
- [ ] SSO integration

## Conclusion

The OAuth implementation provides a robust, secure, and user-friendly authentication method for Claude models in Ouroboros Code. It maintains backward compatibility while offering enhanced features for Claude Max subscribers, making it easier to leverage the full power of Claude's capabilities without managing API keys.
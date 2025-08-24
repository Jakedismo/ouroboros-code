/**
 * @license
 * Copyright 2025 Ouroboros
 * SPDX-License-Identifier: Apache-2.0
 */

import * as http from 'http';
import { URL } from 'url';
import * as net from 'net';
import { PKCEGenerator, OAuthStateGenerator, PKCEPair } from './pkce.js';
import { getErrorMessage } from '../../utils/errors.js';

/**
 * OAuth configuration for Claude authentication
 */
export interface ClaudeOAuthConfig {
  clientId: string;
  clientSecret?: string;
  authorizeUrl: string;
  tokenUrl: string;
  revokeUrl?: string;
  scopes: string[];
  callbackPort: number;
  timeout: number;
  redirectUri?: string;
}

/**
 * OAuth token response structure
 */
export interface OAuthTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

/**
 * OAuth error response structure
 */
export interface OAuthErrorResponse {
  error: string;
  error_description?: string;
  error_uri?: string;
}

/**
 * Result of the OAuth authorization flow
 */
export interface OAuthFlowResult {
  tokens: OAuthTokenResponse;
  state: string;
}

/**
 * Handles the complete OAuth 2.0 authorization code flow with PKCE
 * for Claude authentication
 */
export class ClaudeOAuthFlow {
  private server?: http.Server;
  private pkce?: PKCEPair;
  private state?: string;
  private config: ClaudeOAuthConfig;
  private authPromise?: Promise<OAuthFlowResult>;
  private authResolve?: (result: OAuthFlowResult) => void;
  private authReject?: (error: Error) => void;

  // Default configuration values
  private static readonly DEFAULT_CONFIG: Partial<ClaudeOAuthConfig> = {
    clientId: 'ouroboros-code-cli',
    authorizeUrl: 'https://console.anthropic.com/oauth/authorize',
    tokenUrl: 'https://api.anthropic.com/oauth/token',
    revokeUrl: 'https://api.anthropic.com/oauth/revoke',
    callbackPort: 54545,
    timeout: 300000, // 5 minutes
    scopes: [
      'profile',
      'email',
      'claude_code:read',
      'claude_code:write',
      'claude_code:execute',
      'tools:read',
      'tools:write',
      'workspace:read'
    ]
  };

  constructor(config: Partial<ClaudeOAuthConfig> = {}) {
    // Merge with defaults
    this.config = {
      ...ClaudeOAuthFlow.DEFAULT_CONFIG,
      ...config
    } as ClaudeOAuthConfig;

    // Set redirect URI if not provided
    if (!this.config.redirectUri) {
      this.config.redirectUri = `http://localhost:${this.config.callbackPort}/callback`;
    }
  }

  /**
   * Start the OAuth authorization flow
   * 
   * @returns Promise that resolves with authorization URL and flow completion
   */
  async startAuthFlow(): Promise<{ authUrl: string; flowPromise: Promise<OAuthFlowResult> }> {
    // Generate PKCE parameters and state
    this.pkce = PKCEGenerator.generate();
    this.state = OAuthStateGenerator.generate();

    // Start callback server
    await this.startCallbackServer();

    // Build authorization URL
    const authUrl = this.buildAuthUrl();

    // Create promise for flow completion
    this.authPromise = new Promise<OAuthFlowResult>((resolve, reject) => {
      this.authResolve = resolve;
      this.authReject = reject;

      // Set timeout
      const timeoutId = setTimeout(() => {
        this.cleanup();
        reject(new Error(`OAuth authentication timed out after ${this.config.timeout / 1000} seconds`));
      }, this.config.timeout);

      // Clear timeout when resolved
      const originalResolve = resolve;
      const originalReject = reject;
      
      this.authResolve = (result: OAuthFlowResult) => {
        clearTimeout(timeoutId);
        originalResolve(result);
      };
      
      this.authReject = (error: Error) => {
        clearTimeout(timeoutId);
        originalReject(error);
      };
    });

    return {
      authUrl,
      flowPromise: this.authPromise
    };
  }

  /**
   * Exchange authorization code for tokens
   * 
   * @param code - Authorization code from callback
   * @returns OAuth tokens
   */
  async exchangeCodeForTokens(code: string): Promise<OAuthTokenResponse> {
    if (!this.pkce) {
      throw new Error('PKCE parameters not initialized');
    }

    const tokenRequest = {
      grant_type: 'authorization_code',
      client_id: this.config.clientId,
      code,
      redirect_uri: this.config.redirectUri!,
      code_verifier: this.pkce.verifier,
    };

    // Add client secret if provided
    if (this.config.clientSecret) {
      (tokenRequest as any).client_secret = this.config.clientSecret;
    }

    try {
      const response = await fetch(this.config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: new URLSearchParams(tokenRequest).toString(),
      });

      const responseText = await response.text();

      if (!response.ok) {
        let errorInfo: OAuthErrorResponse;
        try {
          errorInfo = JSON.parse(responseText);
        } catch {
          errorInfo = {
            error: 'invalid_response',
            error_description: `HTTP ${response.status}: ${responseText}`
          };
        }
        
        throw new Error(`Token exchange failed: ${errorInfo.error} - ${errorInfo.error_description || 'Unknown error'}`);
      }

      const tokens: OAuthTokenResponse = JSON.parse(responseText);

      if (!tokens.access_token) {
        throw new Error('Invalid token response: missing access_token');
      }

      return tokens;
    } catch (error) {
      throw new Error(`Failed to exchange authorization code: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Revoke OAuth tokens
   * 
   * @param token - Token to revoke (access or refresh)
   * @param tokenTypeHint - Hint about token type
   */
  async revokeToken(token: string, tokenTypeHint: 'access_token' | 'refresh_token' = 'access_token'): Promise<void> {
    if (!this.config.revokeUrl) {
      throw new Error('Token revocation not supported: no revoke URL configured');
    }

    const revokeRequest = {
      token,
      token_type_hint: tokenTypeHint,
      client_id: this.config.clientId,
    };

    if (this.config.clientSecret) {
      (revokeRequest as any).client_secret = this.config.clientSecret;
    }

    try {
      const response = await fetch(this.config.revokeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(revokeRequest).toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
    } catch (error) {
      throw new Error(`Failed to revoke token: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    if (this.server) {
      this.server.close();
      this.server = undefined;
    }
    this.pkce = undefined;
    this.state = undefined;
    this.authPromise = undefined;
    this.authResolve = undefined;
    this.authReject = undefined;
  }

  /**
   * Build the authorization URL
   */
  private buildAuthUrl(): string {
    if (!this.pkce || !this.state) {
      throw new Error('PKCE parameters and state not initialized');
    }

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri!,
      scope: this.config.scopes.join(' '),
      state: this.state,
      code_challenge: this.pkce.challenge,
      code_challenge_method: this.pkce.method
    });

    return `${this.config.authorizeUrl}?${params.toString()}`;
  }

  /**
   * Start the local callback server
   */
  private async startCallbackServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        try {
          const url = new URL(req.url!, `http://localhost:${this.config.callbackPort}`);
          
          if (url.pathname === '/callback') {
            await this.handleCallback(url, res);
          } else if (url.pathname === '/health') {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('OK');
          } else {
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end(this.renderNotFoundPage());
          }
        } catch (error) {
          console.error('Callback server error:', error);
          res.writeHead(500, { 'Content-Type': 'text/html' });
          res.end(this.renderErrorPage('Internal server error'));
        }
      });

      this.server.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          reject(new Error(`Port ${this.config.callbackPort} is already in use. Please close any applications using this port or set a different callback port.`));
        } else {
          reject(new Error(`Failed to start callback server: ${getErrorMessage(error)}`));
        }
      });

      this.server.listen(this.config.callbackPort, 'localhost', () => {
        resolve();
      });
    });
  }

  /**
   * Handle the OAuth callback
   */
  private async handleCallback(url: URL, res: http.ServerResponse): Promise<void> {
    try {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');
      const errorDescription = url.searchParams.get('error_description');

      // Validate state parameter
      if (state !== this.state) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(this.renderErrorPage('Invalid state parameter - possible CSRF attack'));
        this.authReject?.(new Error('OAuth state mismatch - possible CSRF attack'));
        return;
      }

      // Handle OAuth errors
      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(this.renderErrorPage(`Authentication failed: ${error}${errorDescription ? ` - ${errorDescription}` : ''}`));
        this.authReject?.(new Error(`OAuth error: ${error} - ${errorDescription || 'Unknown error'}`));
        return;
      }

      // Handle successful authorization
      if (code) {
        try {
          const tokens = await this.exchangeCodeForTokens(code);
          
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(this.renderSuccessPage());
          
          this.authResolve?.({ tokens, state: this.state! });
        } catch (tokenError) {
          res.writeHead(500, { 'Content-Type': 'text/html' });
          res.end(this.renderErrorPage(`Token exchange failed: ${getErrorMessage(tokenError)}`));
          this.authReject?.(tokenError as Error);
        }
      } else {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(this.renderErrorPage('No authorization code received'));
        this.authReject?.(new Error('No authorization code in callback'));
      }
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end(this.renderErrorPage('Internal server error'));
      this.authReject?.(error as Error);
    } finally {
      // Close server after handling callback
      this.cleanup();
    }
  }

  /**
   * Render success page HTML
   */
  private renderSuccessPage(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Authentication Successful - Ouroboros</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            padding: 60px 40px;
            text-align: center;
            max-width: 500px;
            width: 100%;
        }
        .success-icon {
            color: #10b981;
            font-size: 72px;
            margin-bottom: 20px;
            display: block;
        }
        h1 {
            color: #1f2937;
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 16px;
        }
        p {
            color: #6b7280;
            font-size: 16px;
            line-height: 1.5;
            margin-bottom: 32px;
        }
        .brand {
            color: #667eea;
            font-weight: 600;
        }
        .auto-close {
            color: #9ca3af;
            font-size: 14px;
            font-style: italic;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="success-icon">✓</div>
        <h1>Authentication Successful!</h1>
        <p>You have successfully authenticated with Claude. You can now close this window and return to <span class="brand">Ouroboros</span>.</p>
        <p class="auto-close">This window will close automatically in 5 seconds.</p>
    </div>
    <script>
        setTimeout(() => {
            try {
                window.close();
            } catch(e) {
                console.log('Could not auto-close window');
            }
        }, 5000);
    </script>
</body>
</html>`;
  }

  /**
   * Render error page HTML
   */
  private renderErrorPage(errorMessage: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Authentication Failed - Ouroboros</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            padding: 60px 40px;
            text-align: center;
            max-width: 500px;
            width: 100%;
        }
        .error-icon {
            color: #ef4444;
            font-size: 72px;
            margin-bottom: 20px;
            display: block;
        }
        h1 {
            color: #1f2937;
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 16px;
        }
        p {
            color: #6b7280;
            font-size: 16px;
            line-height: 1.5;
            margin-bottom: 20px;
        }
        .error-message {
            background: #fef2f2;
            border: 1px solid #fecaca;
            color: #991b1b;
            padding: 16px;
            border-radius: 8px;
            font-family: monospace;
            font-size: 14px;
            margin-bottom: 32px;
            word-break: break-word;
        }
        .brand {
            color: #667eea;
            font-weight: 600;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="error-icon">✗</div>
        <h1>Authentication Failed</h1>
        <p>There was an error during the authentication process:</p>
        <div class="error-message">${this.escapeHtml(errorMessage)}</div>
        <p>Please close this window and try again in <span class="brand">Ouroboros</span>.</p>
    </div>
</body>
</html>`;
  }

  /**
   * Render 404 page HTML
   */
  private renderNotFoundPage(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Page Not Found - Ouroboros OAuth</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            background: #f3f4f6;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 16px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.05);
            padding: 60px 40px;
            text-align: center;
            max-width: 500px;
            width: 100%;
        }
        h1 {
            color: #1f2937;
            font-size: 24px;
            margin-bottom: 16px;
        }
        p {
            color: #6b7280;
            font-size: 16px;
            line-height: 1.5;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>404 - Page Not Found</h1>
        <p>This is the OAuth callback server for Ouroboros authentication.</p>
    </div>
</body>
</html>`;
  }

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }
}

/**
 * Utility function to find an available port
 */
export async function findAvailablePort(startPort: number = 54545): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    
    server.listen(startPort, 'localhost', () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => resolve(port));
    });
    
    server.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        // Try next port
        findAvailablePort(startPort + 1).then(resolve).catch(reject);
      } else {
        reject(error);
      }
    });
  });
}
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { MCPServerConfig } from '../config/config.js';
import { WorkspaceContext } from '../utils/workspaceContext.js';
/**
 * Enhanced MCP connection that includes webhook configuration
 */
export declare function connectToMcpServerWithWebhook(mcpServerName: string, mcpServerConfig: MCPServerConfig, debugMode: boolean, workspaceContext: WorkspaceContext, enableWebhooks?: boolean): Promise<Client>;

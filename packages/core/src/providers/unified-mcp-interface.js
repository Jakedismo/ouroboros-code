/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { LLMProvider, } from './types.js';
import { DiscoveredMCPTool } from '../tools/mcp-tool.js';
import { McpClientManager } from '../tools/mcp-client-manager.js';
import { ToolConfirmationOutcome } from '../tools/tools.js';
/**
 * Security levels specific to MCP tools
 */
export var MCPToolSecurityLevel;
(function (MCPToolSecurityLevel) {
    MCPToolSecurityLevel["SAFE"] = "safe";
    MCPToolSecurityLevel["MODERATE"] = "moderate";
    MCPToolSecurityLevel["DANGEROUS"] = "dangerous";
})(MCPToolSecurityLevel || (MCPToolSecurityLevel = {}));
/**
 * Unified MCP Tool Interface for cross-provider compatibility
 * This ensures MCP tools work consistently across all LLM providers
 */
export class UnifiedMCPInterface {
    mcpClientManager;
    toolRegistry;
    config;
    // Cache for tool metadata to avoid repeated lookups
    toolMetadataCache = new Map();
    // Provider-specific MCP tool adapters
    providerAdapters = new Map();
    constructor(config, toolRegistry) {
        this.config = config;
        this.toolRegistry = toolRegistry;
        this.mcpClientManager = new McpClientManager(config.getMcpServers() ?? {}, config.getMcpServerCommand(), toolRegistry, config.getPromptRegistry(), config.getDebugMode(), config.getWorkspaceContext());
        // Initialize provider adapters
        this.initializeProviderAdapters();
    }
    /**
     * Initialize provider-specific MCP adapters
     */
    initializeProviderAdapters() {
        this.providerAdapters.set(LLMProvider.GEMINI, new GeminiMCPAdapter());
        this.providerAdapters.set(LLMProvider.OPENAI, new OpenAIMCPAdapter());
        this.providerAdapters.set(LLMProvider.ANTHROPIC, new AnthropicMCPAdapter());
    }
    /**
     * Get all available MCP tools in unified format
     */
    getUnifiedMCPTools() {
        const mcpTools = this.toolRegistry
            .getAllTools()
            .filter((tool) => tool instanceof DiscoveredMCPTool)
            .map((tool) => tool);
        return mcpTools.map((tool) => this.convertMCPToolToUnified(tool));
    }
    /**
     * Get MCP tools formatted for a specific provider
     */
    getToolsForProvider(provider) {
        const unifiedTools = this.getUnifiedMCPTools();
        const adapter = this.providerAdapters.get(provider);
        if (!adapter) {
            throw new Error(`No MCP adapter found for provider: ${provider}`);
        }
        return adapter.formatToolsForRequest(unifiedTools);
    }
    /**
     * Execute MCP tool calls across providers
     */
    async executeMCPToolCall(context) {
        const startTime = Date.now();
        const toolKey = `${context.serverName}.${context.toolName}`;
        // Get the MCP tool from registry
        const mcpTool = this.toolRegistry
            .getAllTools()
            .find((tool) => tool instanceof DiscoveredMCPTool &&
            tool.serverName === context.serverName &&
            tool.serverToolName === context.toolName);
        if (!mcpTool) {
            throw new Error(`MCP tool not found: ${toolKey}`);
        }
        // Process confirmation if required
        await this.processMCPToolConfirmation(context, mcpTool);
        // Execute the tool
        const invocation = mcpTool.createInvocation(context.parameters);
        const result = await invocation.execute(context.abortSignal || new AbortController().signal);
        // Convert to unified MCP result
        const unifiedResult = {
            toolCallId: `mcp_${context.serverName}_${context.toolName}_${Date.now()}`,
            content: result.llmContent || '',
            serverName: context.serverName,
            toolName: context.toolName,
            executionTime: Date.now() - startTime,
            isError: !!result.error,
            error: result.error?.message,
            display: result.returnDisplay,
        };
        return unifiedResult;
    }
    /**
     * Process MCP tool confirmation using unified confirmation system
     */
    async processMCPToolConfirmation(context, mcpTool) {
        // Create unified tool call for confirmation
        const unifiedToolCall = {
            id: `mcp_${context.serverName}_${context.toolName}_${Date.now()}`,
            name: `${context.serverName}.${context.toolName}`,
            arguments: context.parameters,
        };
        // Check if confirmation is required using the tool's own logic
        const invocation = mcpTool.createInvocation(context.parameters);
        const confirmationDetails = await invocation.shouldConfirmExecute(context.abortSignal || new AbortController().signal);
        if (confirmationDetails && confirmationDetails.type === 'mcp') {
            // Use the existing MCP confirmation system
            const outcome = await new Promise((resolve) => {
                // This would typically be handled by the UI layer
                // For now, we default to proceed for trusted tools
                if (mcpTool.trust) {
                    resolve(ToolConfirmationOutcome.ProceedOnce);
                }
                else {
                    resolve(ToolConfirmationOutcome.Cancel);
                }
            });
            if (confirmationDetails.onConfirm) {
                await confirmationDetails.onConfirm(outcome);
            }
            if (outcome === ToolConfirmationOutcome.Cancel) {
                throw new Error('MCP tool execution was cancelled by user');
            }
        }
    }
    /**
     * Convert DiscoveredMCPTool to UnifiedTool format
     */
    convertMCPToolToUnified(mcpTool) {
        return {
            name: mcpTool.name,
            description: mcpTool.description,
            parameters: {
                type: 'object',
                properties: this.convertParameterSchema(mcpTool.parameterSchema),
                required: this.extractRequiredParameters(mcpTool.parameterSchema),
            },
        };
    }
    /**
     * Convert MCP parameter schema to unified format
     */
    convertParameterSchema(schema) {
        if (!schema || typeof schema !== 'object') {
            return {};
        }
        if (schema.properties) {
            return schema.properties;
        }
        return schema;
    }
    /**
     * Extract required parameters from MCP schema
     */
    extractRequiredParameters(schema) {
        if (!schema || typeof schema !== 'object') {
            return [];
        }
        return schema.required || [];
    }
    /**
     * Get MCP tool metadata with caching
     */
    getMCPToolMetadata(serverName, toolName) {
        const key = `${serverName}.${toolName}`;
        if (this.toolMetadataCache.has(key)) {
            return this.toolMetadataCache.get(key);
        }
        const mcpTool = this.toolRegistry
            .getAllTools()
            .find((tool) => tool instanceof DiscoveredMCPTool &&
            tool.serverName === serverName &&
            tool.serverToolName === toolName);
        if (!mcpTool) {
            throw new Error(`MCP tool not found: ${key}`);
        }
        const metadata = {
            serverName,
            toolName,
            displayName: mcpTool.displayName,
            description: mcpTool.description,
            securityLevel: this.assessMCPToolSecurityLevel(mcpTool),
            requiresConfirmation: !mcpTool.trust,
            trusted: mcpTool.trust || false,
            timeout: mcpTool.timeout,
            supportedProviders: [
                LLMProvider.GEMINI,
                LLMProvider.OPENAI,
                LLMProvider.ANTHROPIC,
            ],
            capabilities: this.analyzeMCPToolCapabilities(mcpTool),
        };
        this.toolMetadataCache.set(key, metadata);
        return metadata;
    }
    /**
     * Assess security level of MCP tool based on its characteristics
     */
    assessMCPToolSecurityLevel(mcpTool) {
        const toolName = mcpTool.serverToolName.toLowerCase();
        const description = mcpTool.description.toLowerCase();
        // Dangerous patterns
        const dangerousPatterns = [
            'execute',
            'run',
            'shell',
            'command',
            'system',
            'kill',
            'delete',
            'remove',
            'write',
            'create',
            'modify',
            'update',
            'install',
            'uninstall',
        ];
        // Safe patterns
        const safePatterns = [
            'read',
            'get',
            'fetch',
            'list',
            'search',
            'find',
            'query',
            'show',
            'display',
        ];
        if (dangerousPatterns.some((pattern) => toolName.includes(pattern) || description.includes(pattern))) {
            return MCPToolSecurityLevel.DANGEROUS;
        }
        if (safePatterns.some((pattern) => toolName.includes(pattern) || description.includes(pattern))) {
            return MCPToolSecurityLevel.SAFE;
        }
        return MCPToolSecurityLevel.MODERATE;
    }
    /**
     * Analyze MCP tool capabilities
     */
    analyzeMCPToolCapabilities(mcpTool) {
        const capabilities = [];
        const toolName = mcpTool.serverToolName.toLowerCase();
        const description = mcpTool.description.toLowerCase();
        // Analyze based on tool name and description
        if (toolName.includes('read') || description.includes('read')) {
            capabilities.push({
                name: 'data_reading',
                description: 'Can read data from external sources',
                riskLevel: 'low',
            });
        }
        if (toolName.includes('write') ||
            description.includes('write') ||
            toolName.includes('create') ||
            description.includes('create')) {
            capabilities.push({
                name: 'data_modification',
                description: 'Can modify or create data',
                riskLevel: 'medium',
            });
        }
        if (toolName.includes('execute') ||
            toolName.includes('run') ||
            toolName.includes('shell') ||
            toolName.includes('command')) {
            capabilities.push({
                name: 'command_execution',
                description: 'Can execute system commands',
                riskLevel: 'high',
            });
        }
        if (toolName.includes('network') ||
            toolName.includes('http') ||
            toolName.includes('api') ||
            description.includes('network')) {
            capabilities.push({
                name: 'network_access',
                description: 'Can make network requests',
                riskLevel: 'medium',
            });
        }
        return capabilities;
    }
    /**
     * Get tool statistics for MCP tools
     */
    getMCPToolStatistics() {
        const mcpTools = this.toolRegistry
            .getAllTools()
            .filter((tool) => tool instanceof DiscoveredMCPTool)
            .map((tool) => tool);
        const byServer = {};
        const bySecurityLevel = {
            [MCPToolSecurityLevel.SAFE]: 0,
            [MCPToolSecurityLevel.MODERATE]: 0,
            [MCPToolSecurityLevel.DANGEROUS]: 0,
        };
        let trusted = 0;
        let requiresConfirmation = 0;
        mcpTools.forEach((tool) => {
            // Count by server
            byServer[tool.serverName] = (byServer[tool.serverName] || 0) + 1;
            // Count by security level
            const securityLevel = this.assessMCPToolSecurityLevel(tool);
            bySecurityLevel[securityLevel]++;
            // Count trust and confirmation requirements
            if (tool.trust)
                trusted++;
            if (!tool.trust)
                requiresConfirmation++;
        });
        return {
            totalMCPTools: mcpTools.length,
            byServer,
            bySecurityLevel,
            trusted,
            requiresConfirmation,
        };
    }
    /**
     * Restart MCP servers
     */
    async restartMCPServers() {
        await this.toolRegistry.restartMcpServers();
        this.toolMetadataCache.clear(); // Clear cache after restart
    }
    /**
     * Discover MCP tools
     */
    async discoverMCPTools() {
        await this.toolRegistry.discoverMcpTools();
        this.toolMetadataCache.clear(); // Clear cache after discovery
    }
    /**
     * Get the MCP client manager
     */
    getMCPClientManager() {
        return this.mcpClientManager;
    }
}
/**
 * Abstract base class for provider-specific MCP adapters
 */
export class MCPProviderAdapter {
}
/**
 * Gemini MCP Adapter - handles Gemini-specific MCP tool formatting
 */
export class GeminiMCPAdapter extends MCPProviderAdapter {
    formatToolsForRequest(tools) {
        // Gemini uses FunctionDeclaration format
        return tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            parametersJsonSchema: tool.parameters,
        }));
    }
    convertToolCallFromProvider(toolCall) {
        return {
            id: `gemini_mcp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: toolCall.name,
            arguments: toolCall.args || {},
        };
    }
    convertToolResultToProvider(result) {
        return {
            functionResponse: {
                name: `${result.serverName}.${result.toolName}`,
                response: {
                    content: result.content,
                    executionTime: result.executionTime,
                },
            },
        };
    }
}
/**
 * OpenAI MCP Adapter - handles OpenAI-specific MCP tool formatting
 */
export class OpenAIMCPAdapter extends MCPProviderAdapter {
    formatToolsForRequest(tools) {
        return tools.map((tool) => ({
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
            },
        }));
    }
    convertToolCallFromProvider(toolCall) {
        return {
            id: toolCall.id,
            name: toolCall.function.name,
            arguments: JSON.parse(toolCall.function.arguments || '{}'),
        };
    }
    convertToolResultToProvider(result) {
        return {
            tool_call_id: result.toolCallId,
            role: 'tool',
            content: typeof result.content === 'string'
                ? result.content
                : JSON.stringify(result.content),
        };
    }
}
/**
 * Anthropic MCP Adapter - handles Anthropic-specific MCP tool formatting
 */
export class AnthropicMCPAdapter extends MCPProviderAdapter {
    formatToolsForRequest(tools) {
        return tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.parameters,
        }));
    }
    convertToolCallFromProvider(toolCall) {
        return {
            id: toolCall.id,
            name: toolCall.name,
            arguments: toolCall.input || {},
        };
    }
    convertToolResultToProvider(result) {
        return {
            type: 'tool_result',
            tool_use_id: result.toolCallId,
            content: typeof result.content === 'string'
                ? result.content
                : JSON.stringify(result.content),
            is_error: result.isError || false,
        };
    }
}
//# sourceMappingURL=unified-mcp-interface.js.map
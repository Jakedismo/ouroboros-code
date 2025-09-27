/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  AgentContent,
  AgentContentFragment,
  AgentMessage,
  AgentToolInvocation,
  AgentToolResult,
  AgentStreamEvent,
  AgentFunctionCall,
  AgentStreamUsage,
  JsonSchema,
  SchemaUnion,
  SchemaType,
  FunctionCall,
  Part,
  PartUnion,
  PartListUnion,
  Content,
  ContentListUnion,
  ContentUnion,
  Tool,
  ToolFunctionDeclaration,
  ToolToolFunctionDeclaration,
  ToolListUnion,
  ToolConfig,
  GenerateContentConfig,
  GenerateContentParameters,
  SendMessageParameters,
  GenerateContentResponse,
  GenerateContentResponseCandidate,
  GenerateContentResponseUsageMetadata,
  GenerateContentResponsePromptFeedback,
  FinishReason,
  BlockedReason,
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentParameters,
  EmbedContentResponse,
  GroundingMetadata,
  GenerationConfigRoutingConfig,
  ModelSelectionConfig,
  MediaResolution,
  SpeechConfigUnion,
  ThinkingConfig,
  SafetySetting,
  Candidate,
} from './agentsTypes.js';

/**
 * Minimal surface required from an MCP client for tool discovery and
 * invocation. The Model Context Protocol SDK satisfies this interface.
 */
type McpClientLike = {
  listTools?: (...args: any[]) => Promise<Record<string, unknown>>;
  callTool: (...args: any[]) => Promise<Record<string, unknown> | void>;
};

export interface CallableTool {
  tool(): Promise<{ functionDeclarations?: ToolFunctionDeclaration[] }>;
  callTool(functionCalls: FunctionCall[]): Promise<Part[]>;
}

const ensureArray = <T>(value: T | T[]): T[] =>
  Array.isArray(value) ? value : [value];

export function createUserContent(message: PartListUnion): Content {
  const parts = ensureArray(message).map((item) =>
    typeof item === 'string' ? ({ text: item } as Part) : (item as Part),
  );
  return { role: 'user', parts };
}

/**
 * Adapts an MCP client to the callable tool shape historically provided by the
 * Google GenAI SDK. Only the subset required by the Ouroboros runtime is
 * implemented here.
 */
export function mcpToTool(client: McpClientLike): CallableTool {
  return {
    async tool() {
      if (typeof client.listTools !== 'function') {
        return { functionDeclarations: [] };
      }

      try {
        const response = await client.listTools({}, {});
        const tools = Array.isArray(response?.['tools'])
          ? (response['tools'] as Array<Record<string, unknown>>)
          : [];

        const functionDeclarations: ToolFunctionDeclaration[] = tools.map(
          (tool) => {
            const inputSchema = (tool['inputSchema'] ??
              tool['parameters'] ??
              tool['schema']) as JsonSchema | undefined;
            return {
              name: typeof tool['name'] === 'string' ? (tool['name'] as string) : undefined,
              description:
                typeof tool['description'] === 'string'
                  ? (tool['description'] as string)
                  : undefined,
              parametersJsonSchema:
                inputSchema && typeof inputSchema === 'object'
                  ? (inputSchema as JsonSchema)
                  : undefined,
            } satisfies ToolFunctionDeclaration;
          },
        );

        return { functionDeclarations };
      } catch (error) {
        console.warn('Failed to list MCP tools:', error);
        return { functionDeclarations: [] };
      }
    },

    async callTool(functionCalls: FunctionCall[]): Promise<Part[]> {
      const results: Part[] = [];

      for (const call of functionCalls) {
        const name = call.name ?? '';
        const args = call.args ?? {};

        try {
          const response = await client.callTool({ name, arguments: args });
          const content = Array.isArray(response?.['content'])
            ? (response?.['content'] as unknown[])
            : response?.['content']
            ? [response['content']]
            : [];

          results.push({
            functionResponse: {
              name,
              response: {
                content,
                raw: response,
              },
            },
          });
        } catch (error) {
          results.push({
            functionResponse: {
              name,
              response: {
                error,
              },
            },
          });
        }
      }

      return results;
    },
  };
}

export type {
  AgentContent,
  AgentContentFragment,
  AgentMessage,
  AgentToolInvocation,
  AgentToolResult,
  AgentStreamEvent,
  AgentFunctionCall,
  AgentStreamUsage,
  JsonSchema,
  SchemaUnion,
  SchemaType,
  Part,
  PartUnion,
  PartListUnion,
  Content,
  ContentListUnion,
  ContentUnion,
  Tool,
  ToolFunctionDeclaration,
  ToolListUnion,
  ToolConfig,
  GenerateContentConfig,
  GenerateContentParameters,
  SendMessageParameters,
  GenerateContentResponse,
  GenerateContentResponseCandidate,
  GenerateContentResponseUsageMetadata,
  GenerateContentResponsePromptFeedback,
  FinishReason,
  BlockedReason,
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentParameters,
  EmbedContentResponse,
  GroundingMetadata,
  GenerationConfigRoutingConfig,
  ModelSelectionConfig,
  MediaResolution,
  SpeechConfigUnion,
  ThinkingConfig,
  SafetySetting,
  Candidate,
  ToolToolFunctionDeclaration,
  FunctionCall,
};


export { Type } from './agentsTypes.js';

// Legacy placeholders retained for compatibility with existing tests that mock
// the Google GenAI SDK classes. They intentionally provide minimal behaviour
// because the real implementation now lives in the unified Agents runtime.
export class GoogleGenAI {
  constructor(..._args: unknown[]) {}

  getGenerativeModel(): unknown {
    throw new Error('GoogleGenAI stub does not provide generative models.');
  }
}

export class Models {
  async generateContent(
    _request: GenerateContentParameters,
    _userPromptId: string,
  ): Promise<GenerateContentResponse> {
    throw new Error('Models stub generateContent called unexpectedly.');
  }

  async generateContentStream(
    _request: GenerateContentParameters,
    _userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    async function* empty(): AsyncGenerator<GenerateContentResponse> {}
    return empty();
  }

  async countTokens(
    _request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    throw new Error('Models stub countTokens called unexpectedly.');
  }

  async embedContent(
    _request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    throw new Error('Models stub embedContent called unexpectedly.');
  }
}

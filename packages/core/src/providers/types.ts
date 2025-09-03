export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ProviderOptions {
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  response_format?: { type: 'json_object' | 'text' | 'json_schema', json_schema?: any };
  tool_choice?: 'none' | 'auto' | 'required' | { type: 'function', function: { name: string } };
  parallel_tool_calls?: boolean;
  reasoning_effort?: string;
}

export interface StreamingResponse {
  content?: string;
  toolCalls?: ToolCall[];
  done?: boolean;
}

export interface Provider {
  name: string;
  generateResponse(
    messages: Message[],
    options?: ProviderOptions,
    tools?: any[]
  ): AsyncIterable<StreamingResponse>;
  
  generateCompletion(
    messages: Message[],
    options?: ProviderOptions,
    tools?: any[]
  ): Promise<string>;
}

export interface ProviderFactory {
  createProvider(type: 'openai' | 'anthropic' | 'gemini', options?: ProviderOptions): Provider;
}
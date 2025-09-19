import type { PartListUnion } from '@google/genai';
import { tool as createAgentsTool, type Tool as AgentsTool } from '@openai/agents';
import { z, type ZodTypeAny } from 'zod';
import type { Config, ToolCallRequestInfo } from '../index.js';
import { executeToolCall } from '../core/nonInteractiveToolExecutor.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import type { AnyDeclarativeTool, ToolResultDisplay } from '../tools/tools.js';

export interface ToolAdapterContext {
  registry: ToolRegistry;
  config: Config;
  getPromptId(): string;
}

export function adaptToolsToAgents(context: ToolAdapterContext): AgentsTool[] {
  const tools = context.registry.getAllTools();
  return tools.map(tool => createAdaptedTool(tool, context));
}

function createAdaptedTool(tool: AnyDeclarativeTool, context: ToolAdapterContext): AgentsTool {
  const schema = extractSchema(tool);
  const parametersSchema = schema
    ? convertJsonSchemaToZod(schema)
    : z.object({}).passthrough();

  return createAgentsTool({
    name: tool.name,
    description: tool.description,
    parameters: parametersSchema as any,
    async execute(_, input) {
      const normalizedArgs = normalizeArguments(input);
      const callRequest: ToolCallRequestInfo = {
        callId: `agents-sdk-${tool.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: tool.name,
        args: normalizedArgs,
        isClientInitiated: false,
        prompt_id: context.getPromptId(),
      };

      const abortController = new AbortController();

      try {
        const response = await executeToolCall(
          context.config,
          callRequest,
          abortController.signal,
        );

        const responseText = partListToString(response.responseParts as unknown as PartListUnion);
        if (responseText) {
          return responseText;
        }
        const displayText = response.resultDisplay
          ? toolResultDisplayToString(response.resultDisplay)
          : '';
        return displayText || `${tool.displayName} executed successfully.`;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : `Tool ${tool.displayName} failed`;
        return `An error occurred while running the tool. Please try again. Error: ${message}`;
      }
    },
  });
}

function extractSchema(tool: AnyDeclarativeTool): Record<string, unknown> | undefined {
  const schema = tool.schema as Record<string, unknown>;
  const jsonSchema = (schema['parametersJsonSchema'] ?? schema['parameters']) as Record<string, unknown> | undefined;
  if (!jsonSchema) {
    return undefined;
  }
  return jsonSchema;
}

type JsonSchema = Record<string, unknown>;

function convertJsonSchemaToZod(schema: JsonSchema): ZodTypeAny {
  try {
    return internalConvertJsonSchemaToZod(schema);
  } catch (error) {
    console.warn('Failed to convert tool schema to Zod. Falling back to permissive object schema.', error);
    return z.object({}).passthrough();
  }
}

function internalConvertJsonSchemaToZod(schema: JsonSchema): ZodTypeAny {
  if (!schema || typeof schema !== 'object') {
    return z.any();
  }

  if (Array.isArray(schema['enum'])) {
    const enumValues = schema['enum'] as unknown[];
    const allStrings = enumValues.every((value) => typeof value === 'string');
    if (allStrings && enumValues.length > 0) {
      return z.enum(enumValues as [string, ...string[]]);
    }
    if (enumValues.length > 0) {
      const literals = enumValues.map((value) => z.literal(value as never)) as ZodTypeAny[];
      return buildUnionSchema(literals);
    }
  }

  if (schema['const'] !== undefined) {
    return z.literal(schema['const'] as never);
  }

  const type = schema['type'] ?? (schema['properties'] ? 'object' : undefined);

  if (Array.isArray(type)) {
    const variants = type
      .map((variant) => {
        if (variant === 'null') {
          return z.null();
        }
        return internalConvertJsonSchemaToZod({ ...schema, type: variant });
      })
      .filter(Boolean) as ZodTypeAny[];
    return buildUnionSchema(variants);
  }

  switch (type) {
    case 'string':
      return buildStringSchema(schema);
    case 'number':
      return buildNumberSchema(schema, false);
    case 'integer':
      return buildNumberSchema(schema, true);
    case 'boolean':
      return z.boolean();
    case 'array':
      return buildArraySchema(schema);
    case 'object':
      return buildObjectSchema(schema);
    case 'null':
      return z.null();
    default:
      if (schema['oneOf']) {
        const variants = (schema['oneOf'] as JsonSchema[]).map((variant) => internalConvertJsonSchemaToZod(variant));
        return buildUnionSchema(variants);
      }
      if (schema['anyOf']) {
        const variants = (schema['anyOf'] as JsonSchema[]).map((variant) => internalConvertJsonSchemaToZod(variant));
        return buildUnionSchema(variants);
      }
      if (schema['allOf']) {
        const variants = (schema['allOf'] as JsonSchema[]).map((variant) => internalConvertJsonSchemaToZod(variant));
        if (variants.length === 0) {
          return z.any();
        }
        return variants.slice(1).reduce((acc, current) => z.intersection(acc, current), variants[0]);
      }
      return z.any();
  }
}

function buildUnionSchema(variants: ZodTypeAny[]): ZodTypeAny {
  if (variants.length === 0) {
    return z.any();
  }
  if (variants.length === 1) {
    return variants[0];
  }
  return variants.slice(1).reduce(
    (acc, current) => z.union([acc, current] as [ZodTypeAny, ZodTypeAny]),
    variants[0],
  );
}

function buildStringSchema(schema: JsonSchema): ZodTypeAny {
  let base = z.string();

  if (typeof schema['minLength'] === 'number') {
    base = base.min(schema['minLength'] as number);
  }
  if (typeof schema['maxLength'] === 'number') {
    base = base.max(schema['maxLength'] as number);
  }
  if (schema['pattern'] && typeof schema['pattern'] === 'string') {
    try {
      const regex = new RegExp(schema['pattern'] as string);
      base = base.regex(regex);
    } catch (_error) {
      // Ignore invalid regex patterns
    }
  }
  if (schema['format'] === 'uri') {
    base = base.url();
  }
  if (schema['format'] === 'email') {
    base = base.email();
  }
  if (schema['description'] && typeof schema['description'] === 'string') {
    base = base.describe(schema['description'] as string);
  }
  const finalSchema =
    schema['default'] !== undefined
      ? base.default(schema['default'] as string)
      : base;
  return finalSchema as ZodTypeAny;
}

function buildNumberSchema(schema: JsonSchema, isInteger: boolean): ZodTypeAny {
  let numeric = z.number();
  if (isInteger) {
    numeric = numeric.int();
  }
  if (typeof schema['minimum'] === 'number') {
    numeric = numeric.min(schema['minimum'] as number);
  }
  if (typeof schema['maximum'] === 'number') {
    numeric = numeric.max(schema['maximum'] as number);
  }
  if (typeof schema['exclusiveMinimum'] === 'number') {
    numeric = numeric.gt(schema['exclusiveMinimum'] as number);
  }
  if (typeof schema['exclusiveMaximum'] === 'number') {
    numeric = numeric.lt(schema['exclusiveMaximum'] as number);
  }

  let configured: ZodTypeAny = numeric;

  if (schema['description'] && typeof schema['description'] === 'string') {
    configured = configured.describe(schema['description'] as string);
  }

  if (schema['multipleOf'] && typeof schema['multipleOf'] === 'number' && schema['multipleOf'] !== 0) {
    const divisor = schema['multipleOf'] as number;
    configured = configured.refine(
      (value) =>
        typeof value === 'number' &&
        Number.isFinite(value / divisor) &&
        Math.abs((value / divisor) - Math.round(value / divisor)) < Number.EPSILON,
      { message: `Value must be a multiple of ${divisor}` },
    );
  }

  if (schema['default'] !== undefined) {
    configured = configured.default(schema['default'] as number);
  }

  return configured as ZodTypeAny;
}

function buildArraySchema(schema: JsonSchema): ZodTypeAny {
  const itemsSchema = schema['items'];
  const itemZod = itemsSchema
    ? internalConvertJsonSchemaToZod(itemsSchema as JsonSchema)
    : z.any();
  let arrayBase = z.array(itemZod);

  if (typeof schema['minItems'] === 'number') {
    arrayBase = arrayBase.min(schema['minItems'] as number);
  }
  if (typeof schema['maxItems'] === 'number') {
    arrayBase = arrayBase.max(schema['maxItems'] as number);
  }

  let configured: ZodTypeAny = arrayBase;

  if (schema['uniqueItems'] === true) {
    configured = configured.refine((arr) => Array.isArray(arr) && new Set(arr as unknown[]).size === (arr as unknown[]).length, {
      message: 'Array items must be unique',
    });
  }
  if (schema['description'] && typeof schema['description'] === 'string') {
    configured = configured.describe(schema['description'] as string);
  }
  const defaultValue = schema['default'];
  if (Array.isArray(defaultValue)) {
    configured = configured.default(defaultValue);
  }

  return configured as ZodTypeAny;
}

function buildObjectSchema(schema: JsonSchema): ZodTypeAny {
  const properties = (schema['properties'] ?? {}) as Record<string, JsonSchema>;
  const requiredKeys = new Set(
    Array.isArray(schema['required'])
      ? (schema['required'] as string[])
      : [],
  );

  const shape: Record<string, ZodTypeAny> = {};
  for (const [key, value] of Object.entries(properties)) {
    let propertySchema = internalConvertJsonSchemaToZod(value);
    if (value['default'] !== undefined) {
      propertySchema = propertySchema.default(value['default']);
    }
    if (!requiredKeys.has(key)) {
      propertySchema = propertySchema.nullable().optional();
    }
    if (value['description'] && typeof value['description'] === 'string') {
      propertySchema = propertySchema.describe(value['description'] as string);
    }
    shape[key] = propertySchema;
  }

  const baseObject = z.object(shape);
  const configuredObject =
    schema['additionalProperties'] === true
      ? baseObject.passthrough()
      : schema['additionalProperties'] === false
        ? baseObject.strict()
        : baseObject;

  let objectSchema: ZodTypeAny = configuredObject;

  if (schema['description'] && typeof schema['description'] === 'string') {
    objectSchema = objectSchema.describe(schema['description'] as string);
  }

  if (schema['default'] && typeof schema['default'] === 'object') {
    objectSchema = objectSchema.default(schema['default']);
  }

  return objectSchema as ZodTypeAny;
}

function normalizeArguments(args: unknown): Record<string, unknown> {
  if (args === null || args === undefined) {
    return {};
  }

  if (typeof args === 'string') {
    try {
      const parsed = JSON.parse(args);
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return { value: args };
    }
    return { value: args };
  }

  if (typeof args === 'object') {
    if ('arguments' in (args as Record<string, unknown>)) {
      const raw = (args as Record<string, unknown>)['arguments'];
      if (typeof raw === 'string') {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            return parsed as Record<string, unknown>;
          }
        } catch {
          return { value: raw } as Record<string, unknown>;
        }
      }
    }
    return args as Record<string, unknown>;
  }

  return { value: args };
}

function partListToString(content: PartListUnion): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === 'string') {
          return part;
        }
        if (part && typeof part === 'object') {
          const text = (part as Record<string, unknown>)['text'];
          if (typeof text === 'string') {
            return text;
          }
          const functionResponse = (part as Record<string, unknown>)['functionResponse'];
          if (functionResponse) {
            try {
              return JSON.stringify(functionResponse);
            } catch {
              return '[functionResponse]';
            }
          }
          try {
            return JSON.stringify(part);
          } catch {
            return '';
          }
        }
        return '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  if (content && typeof content === 'object') {
    const text = (content as Record<string, unknown>)['text'];
    if (typeof text === 'string') {
      return text;
    }
    try {
      return JSON.stringify(content);
    } catch {
      return '';
    }
  }

  return String(content ?? '');
}

function toolResultDisplayToString(display: ToolResultDisplay): string {
  if (typeof display === 'string') {
    return display;
  }

  try {
    return JSON.stringify(display);
  } catch {
    return '[tool-result]';
  }
}

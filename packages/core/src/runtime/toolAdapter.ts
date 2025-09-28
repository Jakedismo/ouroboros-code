import path from 'node:path';
import {
  tool as createAgentsTool,
  type Tool as AgentsTool,
} from '@openai/agents';
import { z, type ZodTypeAny } from 'zod';
import type {
  Config,
  ToolCallRequestInfo,
  ToolCallResponseInfo,
} from '../index.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import type { AnyDeclarativeTool, ToolResultDisplay } from '../tools/tools.js';
import { toolResponsePartsToString } from '../utils/toolResponseStringifier.js';

export interface ToolAdapterContext {
  registry: ToolRegistry;
  config: Config;
  getPromptId(): string;
  agentId?: string;
  agentName?: string;
  agentEmoji?: string;
  onToolExecuted?: (payload: {
    request: ToolCallRequestInfo;
    response: ToolCallResponseInfo;
  }) => void;
}

interface ArgumentNormalizationContext {
  workspaceRoots: readonly string[];
  targetDir: string;
}

export function adaptToolsToAgents(context: ToolAdapterContext): AgentsTool[] {
  const tools = context.registry.getAllTools();
  const normalizationContext = buildNormalizationContext(context);
  return tools.map((tool) =>
    createAdaptedTool(tool, context, normalizationContext),
  );
}

function buildNormalizationContext(
  context: ToolAdapterContext,
): ArgumentNormalizationContext {
  try {
    const workspace = context.config.getWorkspaceContext();
    return {
      workspaceRoots: workspace.getDirectories(),
      targetDir: context.config.getTargetDir(),
    };
  } catch (_error) {
    return {
      workspaceRoots: [],
      targetDir: context.config.getTargetDir(),
    };
  }
}

function createAdaptedTool(
  tool: AnyDeclarativeTool,
  context: ToolAdapterContext,
  normalizationContext: ArgumentNormalizationContext,
): AgentsTool {
  const schema = extractSchema(tool);
  const strict = tool.options?.strictParameters !== false;
  const parametersSchema = schema
    ? strict
      ? convertJsonSchemaToZod(schema)
      : schema
    : strict
      ? z.object({}).passthrough()
      : { type: 'object', properties: {} };

  const needsApproval = tool.options?.needsApproval;

  return createAgentsTool({
    name: tool.name,
    description: tool.description,
    parameters: parametersSchema as any,
    strict,
    needsApproval,
    async execute(
      input: unknown,
      _runContext: unknown,
    ) {
      const normalizedArgs = normalizeArguments(
        tool,
        (typeof input === 'object' && input !== null
          ? (input as Record<string, unknown>)
          : ({} as Record<string, unknown>)),
        normalizationContext,
      );
      const callRequest: ToolCallRequestInfo = {
        callId: `agents-sdk-${tool.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: tool.name,
        args: normalizedArgs,
        isClientInitiated: false,
        prompt_id: context.getPromptId(),
        agentId: context.agentId,
        agentName: context.agentName,
        agentEmoji: context.agentEmoji,
      };

      const abortController = new AbortController();

      try {
        if (context.config.getDebugMode?.() || process.env['OUROBOROS_DEBUG_TOOL_CALLS']) {
          console.debug('[ToolAdapter][request]', callRequest.name, callRequest.args);
        }
        const response = await context.config.executeToolCall(
          callRequest,
          abortController.signal,
          {
            agentId: context.agentId,
            agentName: context.agentName,
            agentEmoji: context.agentEmoji,
          },
        );

        if (context.config.getDebugMode?.() || process.env['OUROBOROS_DEBUG_TOOL_CALLS']) {
          console.debug('[ToolAdapter][response]', callRequest.name, {
            error: response.error?.message,
            resultDisplay: response.resultDisplay,
          });
        }

        context.onToolExecuted?.({ request: callRequest, response });

        const responseText = toolResponsePartsToString(response.responseParts);
        if (responseText) {
          return responseText;
        }
        const displayText = response.resultDisplay
          ? toolResultDisplayToString(response.resultDisplay)
          : '';
        return displayText || `${tool.displayName} executed successfully.`;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : `Tool ${tool.displayName} failed`;
        return `An error occurred while running the tool. Please try again. Error: ${message}`;
      }
    },
  });
}

function extractSchema(
  tool: AnyDeclarativeTool,
): Record<string, unknown> | undefined {
  const jsonSchema = tool.schema.parametersJsonSchema ?? tool.schema.parameters;
  if (!jsonSchema || typeof jsonSchema !== 'object') {
    return undefined;
  }
  return jsonSchema as Record<string, unknown>;
}

type JsonSchema = Record<string, unknown>;

function convertJsonSchemaToZod(schema: JsonSchema): ZodTypeAny {
  try {
    return internalConvertJsonSchemaToZod(schema);
  } catch (error) {
    console.warn(
      'Failed to convert tool schema to Zod. Falling back to permissive object schema.',
      error,
    );
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
      const literals = enumValues.map((value) =>
        z.literal(value as never),
      ) as ZodTypeAny[];
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
        const variants = (schema['oneOf'] as JsonSchema[]).map((variant) =>
          internalConvertJsonSchemaToZod(variant),
        );
        return buildUnionSchema(variants);
      }
      if (schema['anyOf']) {
        const variants = (schema['anyOf'] as JsonSchema[]).map((variant) =>
          internalConvertJsonSchemaToZod(variant),
        );
        return buildUnionSchema(variants);
      }
      if (schema['allOf']) {
        const variants = (schema['allOf'] as JsonSchema[]).map((variant) =>
          internalConvertJsonSchemaToZod(variant),
        );
        if (variants.length === 0) {
          return z.any();
        }
        return variants
          .slice(1)
          .reduce((acc, current) => z.intersection(acc, current), variants[0]);
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
  return variants
    .slice(1)
    .reduce(
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

  if (
    schema['multipleOf'] &&
    typeof schema['multipleOf'] === 'number' &&
    schema['multipleOf'] !== 0
  ) {
    const divisor = schema['multipleOf'] as number;
    configured = configured.refine(
      (value) =>
        typeof value === 'number' &&
        Number.isFinite(value / divisor) &&
        Math.abs(value / divisor - Math.round(value / divisor)) <
          Number.EPSILON,
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
    configured = configured.refine(
      (arr) =>
        Array.isArray(arr) &&
        new Set(arr as unknown[]).size === (arr as unknown[]).length,
      {
        message: 'Array items must be unique',
      },
    );
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
    Array.isArray(schema['required']) ? (schema['required'] as string[]) : [],
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

function normalizeArguments(
  tool: AnyDeclarativeTool,
  args: unknown,
  normalizationContext: ArgumentNormalizationContext,
): Record<string, unknown> {
  const base = coerceToRecord(args);
  return postProcessArguments(tool, base, normalizationContext);
}

function coerceToRecord(args: unknown): Record<string, unknown> {
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
    const record = args as Record<string, unknown>;
    if ('arguments' in record) {
      const raw = record['arguments'];
      if (typeof raw === 'string') {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            return parsed as Record<string, unknown>;
          }
        } catch {
          return { value: raw };
        }
      }
    }
    return record;
  }

  return { value: args };
}

function postProcessArguments(
  tool: AnyDeclarativeTool,
  args: Record<string, unknown>,
  normalizationContext: ArgumentNormalizationContext,
): Record<string, unknown> {
  const result = { ...args };

  switch (tool.name) {
    case 'search_file_content':
      normalizeSearchTextArgs(result);
      break;
    case 'glob':
      normalizeGlobArgs(result);
      break;
    case 'read_file':
      normalizeFilePathArgs(
        result,
        'absolute_path',
        ['path', 'file_path', 'filepath', 'filePath'],
        normalizationContext,
      );
      break;
    case 'write_file':
      normalizeFilePathArgs(
        result,
        'file_path',
        ['path', 'absolute_path', 'filepath', 'filePath'],
        normalizationContext,
      );
      break;
    case 'replace':
      normalizeFilePathArgs(
        result,
        'file_path',
        ['path', 'absolute_path', 'filepath', 'filePath'],
        normalizationContext,
      );
      break;
    default:
      break;
  }

  return result;
}

function normalizeFilePathArgs(
  target: Record<string, unknown>,
  canonicalKey: string,
  aliases: string[],
  normalizationContext: ArgumentNormalizationContext,
): void {
  const candidateKeys = [canonicalKey, ...aliases];

  for (const key of candidateKeys) {
    if (!(key in target)) {
      continue;
    }

    const value = target[key];

    if (value === undefined || value === null) {
      deleteAliasIfNeeded(target, key, canonicalKey);
      continue;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        deleteAliasIfNeeded(target, key, canonicalKey);
        continue;
      }
      const absolute = resolveToWorkspaceAbsolute(
        trimmed,
        normalizationContext,
      );
      target[canonicalKey] = absolute ?? trimmed;
    } else {
      target[canonicalKey] = value;
    }

    deleteAliasIfNeeded(target, key, canonicalKey);
  }
}

function deleteAliasIfNeeded(
  target: Record<string, unknown>,
  key: string,
  canonicalKey: string,
): void {
  if (key !== canonicalKey) {
    delete target[key];
  }
}

function resolveToWorkspaceAbsolute(
  value: string,
  context: ArgumentNormalizationContext,
): string | undefined {
  if (path.isAbsolute(value)) {
    return value;
  }

  const candidates: string[] = [];

  for (const root of context.workspaceRoots) {
    candidates.push(path.resolve(root, value));
  }

  candidates.push(path.resolve(context.targetDir, value));

  for (const candidate of candidates) {
    if (isPathWithinRoots(candidate, context.workspaceRoots)) {
      return candidate;
    }
  }

  return candidates.length > 0 ? candidates[candidates.length - 1] : undefined;
}

function isPathWithinRoots(
  candidate: string,
  roots: readonly string[],
): boolean {
  if (roots.length === 0) {
    return true;
  }
  return roots.some((root) => {
    const relative = path.relative(root, candidate);
    return (
      !relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative)
    );
  });
}

// Exposed for testing argument normalization logic without needing the Agents runtime
export function normalizeToolArgumentsForTest(
  toolName: string,
  args: Record<string, unknown>,
  options: { workspaceRoots?: readonly string[]; targetDir?: string } = {},
): Record<string, unknown> {
  const normalizationContext: ArgumentNormalizationContext = {
    workspaceRoots: options.workspaceRoots ?? ['/workspace'],
    targetDir: options.targetDir ?? '/workspace',
  };
  return postProcessArguments(
    { name: toolName } as AnyDeclarativeTool,
    { ...args },
    normalizationContext,
  );
}

function normalizeSearchTextArgs(args: Record<string, unknown>): void {
  const pattern = extractStringValue(args['pattern']);
  if (pattern) {
    args['pattern'] = pattern;
  }

  if (!args['pattern']) {
    const fallbackKeys = ['query', 'regex', 'term', 'text', 'search', 'value'];
    for (const key of fallbackKeys) {
      const candidate = extractStringValue(args[key]);
      const trimmed =
        candidate && typeof candidate === 'string'
          ? candidate.trim()
          : candidate;
      if (typeof trimmed === 'string' && trimmed.length > 0) {
        args['pattern'] = trimmed;
        break;
      }
    }
  }

  // Clean up common alias properties to avoid confusing schema validation
  if (args['pattern']) {
    for (const key of ['query', 'regex', 'term', 'text', 'search', 'value']) {
      if (key in args) {
        delete args[key];
      }
    }
  }

  const path = extractStringValue(args['path']);
  if (typeof path === 'string' && path.trim().length > 0) {
    args['path'] = path.trim();
  }

  const include = extractStringValue(args['include']);
  if (typeof include === 'string' && include.trim().length > 0) {
    args['include'] = include.trim();
  }
}

function normalizeGlobArgs(args: Record<string, unknown>): void {
  const pattern = extractStringValue(args['pattern']);
  if (pattern) {
    args['pattern'] = pattern;
  }

  if (!args['pattern']) {
    const fallbackKeys = ['glob', 'query', 'patternText', 'value'];
    for (const key of fallbackKeys) {
      const candidate = extractStringValue(args[key]);
      const trimmed =
        candidate && typeof candidate === 'string'
          ? candidate.trim()
          : candidate;
      if (typeof trimmed === 'string' && trimmed.length > 0) {
        args['pattern'] = trimmed;
        break;
      }
    }
  }

  if (!args['pattern'] && Array.isArray(args['patterns'])) {
    const first = (args['patterns'] as unknown[]).find(
      (item) => typeof item === 'string',
    );
    if (typeof first === 'string' && first.trim().length > 0) {
      args['pattern'] = first.trim();
    }
  }

  if (args['pattern']) {
    for (const key of ['glob', 'query', 'patternText', 'value', 'patterns']) {
      if (key in args) {
        delete args[key];
      }
    }
  }

  const path = extractStringValue(args['path']);
  if (typeof path === 'string' && path.trim().length > 0) {
    args['path'] = path.trim();
  }

  if ('case_sensitive' in args) {
    const coerced = coerceBoolean(args['case_sensitive']);
    if (coerced !== undefined) {
      args['case_sensitive'] = coerced;
    }
  }

  if ('respect_git_ignore' in args) {
    const coerced = coerceBoolean(args['respect_git_ignore']);
    if (coerced !== undefined) {
      args['respect_git_ignore'] = coerced;
    }
  }
}

function extractStringValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (value && typeof value === 'object') {
    if (Array.isArray(value)) {
      const joined = value
        .map((item) => (typeof item === 'string' ? item : undefined))
        .filter((item): item is string => typeof item === 'string')
        .join(' ')
        .trim();
      return joined || undefined;
    }

    const record = value as Record<string, unknown>;
    const textLikeKeys = ['text', 'value', 'pattern', 'query'];
    for (const key of textLikeKeys) {
      const nested = record[key];
      if (typeof nested === 'string') {
        return nested;
      }
    }
  }

  return undefined;
}

function coerceBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'yes', '1'].includes(normalized)) {
      return true;
    }
    if (['false', 'no', '0'].includes(normalized)) {
      return false;
    }
  }
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  return undefined;
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

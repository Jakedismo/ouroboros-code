// @ts-nocheck
import { z, type ZodTypeAny } from 'zod';

export type JsonSchema = Record<string, unknown>;

export function convertJsonSchemaToZod(schema: JsonSchema): ZodTypeAny {
  try {
    return internalConvertJsonSchemaToZod(schema);
  } catch (error) {
    console.warn(
      'Failed to convert JSON schema to Zod. Falling back to permissive object schema.',
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

  if (schema['uniqueItems']) {
    arrayBase = arrayBase.refine((arr) => Array.isArray(arr) && new Set(arr).size === arr.length, {
      message: 'Array items must be unique',
    });
  }

  if (schema['description'] && typeof schema['description'] === 'string') {
    arrayBase = arrayBase.describe(schema['description'] as string);
  }

  if (schema['default'] !== undefined) {
    arrayBase = arrayBase.default(schema['default'] as unknown[]);
  }

  return arrayBase as ZodTypeAny;
}

function buildObjectSchema(schema: JsonSchema): ZodTypeAny {
  const properties = schema['properties'] as Record<string, JsonSchema> | undefined;
  const required = Array.isArray(schema['required']) ? new Set(schema['required'] as string[]) : new Set<string>();
  const shape: Record<string, ZodTypeAny> = {};

  if (properties) {
    for (const [key, value] of Object.entries(properties)) {
      const propertySchema = internalConvertJsonSchemaToZod(value ?? {});
      shape[key] = required.has(key) ? propertySchema : makeOptional(propertySchema);
    }
  }

  let objectSchema = z.object(shape);

  if (schema['additionalProperties'] === true || schema['additionalProperties'] === undefined) {
    objectSchema = objectSchema.catchall(z.any());
  } else if (schema['additionalProperties'] && typeof schema['additionalProperties'] === 'object') {
    objectSchema = objectSchema.catchall(
      internalConvertJsonSchemaToZod(schema['additionalProperties'] as JsonSchema),
    );
  }

  if (schema['minProperties'] && typeof schema['minProperties'] === 'number') {
    objectSchema = objectSchema.refine(
      (value) => typeof value === 'object' && value !== null && Object.keys(value).length >= (schema['minProperties'] as number),
      { message: `Object must have at least ${schema['minProperties']} properties` },
    );
  }

  if (schema['maxProperties'] && typeof schema['maxProperties'] === 'number') {
    objectSchema = objectSchema.refine(
      (value) => typeof value === 'object' && value !== null && Object.keys(value).length <= (schema['maxProperties'] as number),
      { message: `Object must have at most ${schema['maxProperties']} properties` },
    );
  }

  if (schema['description'] && typeof schema['description'] === 'string') {
    objectSchema = objectSchema.describe(schema['description'] as string);
  }

  if (schema['default'] !== undefined) {
    objectSchema = objectSchema.default(schema['default'] as Record<string, unknown>);
  }

  return objectSchema;
}

function makeOptional(schema: ZodTypeAny): ZodTypeAny {
  if (schema.isOptional()) {
    return schema;
  }
  if (schema.isNullable()) {
    return schema;
  }
  return schema.nullable();
}

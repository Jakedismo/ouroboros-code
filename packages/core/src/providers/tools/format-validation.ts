/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  UnifiedTool,
  UnifiedToolCall,
  UnifiedToolResult,
} from './unified-tool-interface.js';
import { ToolConversionError } from './error-handling.js';

// Type aliases for missing types
type UnifiedParameterSchema = any;
type ToolFormatConverter = any;

/**
 * Validation result for tool format conversions.
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Context for validation operations.
 */
export interface ValidationContext {
  providerId: string;
  toolName?: string;
  operationType: 'tool_schema' | 'tool_call' | 'tool_result';
  strict?: boolean; // Whether to apply strict validation
}

/**
 * Comprehensive validator for tool format conversions.
 * Ensures data integrity when converting between provider formats.
 */
export class ToolFormatValidator {
  /**
   * Validate a unified tool schema.
   * @param tool Unified tool to validate.
   * @param context Validation context.
   * @returns Validation result.
   */
  static validateUnifiedTool(
    tool: UnifiedTool,
    context: ValidationContext,
  ): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    // Validate required fields
    if (
      !tool.name ||
      typeof tool.name !== 'string' ||
      tool.name.trim() === ''
    ) {
      result.errors.push(
        'Tool name is required and must be a non-empty string',
      );
      result.isValid = false;
    }

    if (!tool.description || typeof tool.description !== 'string') {
      result.errors.push('Tool description is required and must be a string');
      result.isValid = false;
    }

    if (!tool.parameters || typeof tool.parameters !== 'object') {
      result.errors.push('Tool parameters are required and must be an object');
      result.isValid = false;
    } else {
      // Validate parameter schema
      const paramValidation = this.validateParameterSchema(
        tool.parameters,
        context,
        'parameters',
      );
      result.errors.push(...paramValidation.errors);
      result.warnings.push(...paramValidation.warnings);
      if (!paramValidation.isValid) {
        result.isValid = false;
      }
    }

    // Provider-specific validation
    if (context.strict) {
      const providerValidation = this.validateForProvider(tool, context);
      result.errors.push(...providerValidation.errors);
      result.warnings.push(...providerValidation.warnings);
      if (!providerValidation.isValid) {
        result.isValid = false;
      }
    }

    return result;
  }

  /**
   * Validate parameter schema recursively.
   * @param schema Parameter schema to validate.
   * @param context Validation context.
   * @param path Current path for error reporting.
   * @returns Validation result.
   */
  private static validateParameterSchema(
    schema: any,
    context: ValidationContext,
    path: string,
  ): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    if (!schema || typeof schema !== 'object') {
      result.errors.push(`${path}: Schema must be an object`);
      result.isValid = false;
      return result;
    }

    // Validate type
    if (schema.type !== 'object') {
      result.errors.push(`${path}: Root schema type must be 'object'`);
      result.isValid = false;
    }

    // Validate properties
    if (!schema.properties || typeof schema.properties !== 'object') {
      result.warnings.push(`${path}: No properties defined`);
    } else {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        const propValidation = this.validatePropertySchema(
          propSchema as UnifiedParameterSchema,
          context,
          `${path}.${propName}`,
        );
        result.errors.push(...propValidation.errors);
        result.warnings.push(...propValidation.warnings);
        if (!propValidation.isValid) {
          result.isValid = false;
        }
      }
    }

    // Validate required array
    if (schema.required && !Array.isArray(schema.required)) {
      result.errors.push(`${path}: Required field must be an array`);
      result.isValid = false;
    } else if (schema.required) {
      for (const requiredProp of schema.required) {
        if (typeof requiredProp !== 'string') {
          result.errors.push(`${path}: Required properties must be strings`);
          result.isValid = false;
        } else if (!schema.properties || !schema.properties[requiredProp]) {
          result.errors.push(
            `${path}: Required property '${requiredProp}' not found in properties`,
          );
          result.isValid = false;
        }
      }
    }

    return result;
  }

  /**
   * Validate individual property schema.
   * @param schema Property schema to validate.
   * @param context Validation context.
   * @param path Current path for error reporting.
   * @returns Validation result.
   */
  private static validatePropertySchema(
    schema: UnifiedParameterSchema,
    context: ValidationContext,
    path: string,
  ): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    // Validate required type
    const validTypes = ['string', 'number', 'boolean', 'array', 'object'];
    if (!schema.type || !validTypes.includes(schema.type)) {
      result.errors.push(
        `${path}: Invalid or missing type. Must be one of: ${validTypes.join(', ')}`,
      );
      result.isValid = false;
    }

    // Type-specific validation
    switch (schema.type) {
      case 'array':
        if (!schema.items) {
          result.warnings.push(
            `${path}: Array type should have items definition`,
          );
        } else {
          const itemValidation = this.validatePropertySchema(
            schema.items,
            context,
            `${path}[items]`,
          );
          result.errors.push(...itemValidation.errors);
          result.warnings.push(...itemValidation.warnings);
          if (!itemValidation.isValid) {
            result.isValid = false;
          }
        }
        break;

      case 'object':
        if (!schema.properties) {
          result.warnings.push(
            `${path}: Object type should have properties definition`,
          );
        } else {
          for (const [propName, propSchema] of Object.entries(
            schema.properties,
          )) {
            const propValidation = this.validatePropertySchema(
              propSchema,
              context,
              `${path}.${propName}`,
            );
            result.errors.push(...propValidation.errors);
            result.warnings.push(...propValidation.warnings);
            if (!propValidation.isValid) {
              result.isValid = false;
            }
          }
        }
        break;

      case 'number':
        if (schema.minimum !== undefined && schema.maximum !== undefined) {
          if (schema.minimum > schema.maximum) {
            result.errors.push(
              `${path}: Minimum cannot be greater than maximum`,
            );
            result.isValid = false;
          }
        }
        break;

      case 'string':
        if (schema.minLength !== undefined && schema.maxLength !== undefined) {
          if (schema.minLength > schema.maxLength) {
            result.errors.push(
              `${path}: minLength cannot be greater than maxLength`,
            );
            result.isValid = false;
          }
        }
        if (schema.pattern) {
          try {
            new RegExp(schema.pattern);
          } catch {
            result.errors.push(`${path}: Invalid regex pattern`);
            result.isValid = false;
          }
        }
        break;
    }

    // Validate enum values
    if (schema.enum && !Array.isArray(schema.enum)) {
      result.errors.push(`${path}: Enum must be an array`);
      result.isValid = false;
    }

    return result;
  }

  /**
   * Validate provider-specific constraints.
   * @param tool Unified tool.
   * @param context Validation context.
   * @returns Validation result.
   */
  private static validateForProvider(
    tool: UnifiedTool,
    context: ValidationContext,
  ): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    switch (context.providerId) {
      case 'openai':
        return this.validateForOpenAI(tool, context);
      case 'anthropic':
        return this.validateForAnthropic(tool, context);
      case 'gemini':
        return this.validateForGemini(tool, context);
      default:
        result.warnings.push(
          `Unknown provider ${context.providerId}, skipping provider-specific validation`,
        );
    }

    return result;
  }

  /**
   * Validate for OpenAI-specific constraints.
   */
  private static validateForOpenAI(
    tool: UnifiedTool,
    context: ValidationContext,
  ): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    // OpenAI function name constraints
    if (tool.name.length > 64) {
      result.errors.push('OpenAI function names must be 64 characters or less');
      result.isValid = false;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(tool.name)) {
      result.errors.push(
        'OpenAI function names must contain only letters, numbers, underscores, and hyphens',
      );
      result.isValid = false;
    }

    // Description length check
    if (tool.description.length > 1024) {
      result.warnings.push(
        'OpenAI function descriptions over 1024 characters may be truncated',
      );
    }

    return result;
  }

  /**
   * Validate for Anthropic-specific constraints.
   */
  private static validateForAnthropic(
    tool: UnifiedTool,
    context: ValidationContext,
  ): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    // Anthropic tool name constraints
    if (tool.name.length > 64) {
      result.errors.push('Anthropic tool names must be 64 characters or less');
      result.isValid = false;
    }

    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(tool.name)) {
      result.errors.push(
        'Anthropic tool names must start with a letter and contain only letters, numbers, and underscores',
      );
      result.isValid = false;
    }

    return result;
  }

  /**
   * Validate for Gemini-specific constraints.
   */
  private static validateForGemini(
    tool: UnifiedTool,
    context: ValidationContext,
  ): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    // Gemini function name constraints (similar to OpenAI but with different rules)
    if (tool.name.length > 63) {
      result.errors.push('Gemini function names must be 63 characters or less');
      result.isValid = false;
    }

    if (!/^[a-zA-Z0-9_.-]+$/.test(tool.name)) {
      result.errors.push(
        'Gemini function names must contain only letters, numbers, underscores, dots, and hyphens',
      );
      result.isValid = false;
    }

    return result;
  }

  /**
   * Validate a tool call format.
   * @param toolCall Tool call to validate.
   * @param context Validation context.
   * @returns Validation result.
   */
  static validateToolCall(
    toolCall: UnifiedToolCall,
    context: ValidationContext,
  ): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    // Validate required fields
    if (!toolCall.id || typeof toolCall.id !== 'string') {
      result.errors.push('Tool call ID is required and must be a string');
      result.isValid = false;
    }

    if (!toolCall.name || typeof toolCall.name !== 'string') {
      result.errors.push('Tool call name is required and must be a string');
      result.isValid = false;
    }

    if (!toolCall.arguments || typeof toolCall.arguments !== 'object') {
      result.errors.push(
        'Tool call arguments are required and must be an object',
      );
      result.isValid = false;
    }

    // Validate arguments are serializable
    try {
      JSON.stringify(toolCall.arguments);
    } catch {
      result.errors.push('Tool call arguments must be JSON serializable');
      result.isValid = false;
    }

    return result;
  }

  /**
   * Validate a tool result format.
   * @param toolResult Tool result to validate.
   * @param context Validation context.
   * @returns Validation result.
   */
  static validateToolResult(
    toolResult: UnifiedToolResult,
    context: ValidationContext,
  ): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    // Validate required fields
    if (!toolResult.toolCallId || typeof toolResult.toolCallId !== 'string') {
      result.errors.push(
        'Tool result toolCallId is required and must be a string',
      );
      result.isValid = false;
    }

    if (toolResult.content === undefined || toolResult.content === null) {
      result.errors.push('Tool result content is required');
      result.isValid = false;
    }

    // Validate content is serializable
    try {
      JSON.stringify(toolResult.content);
    } catch {
      result.errors.push('Tool result content must be JSON serializable');
      result.isValid = false;
    }

    // Validate error consistency
    if (toolResult.isError && !toolResult.error) {
      result.warnings.push(
        'Tool result marked as error but no error message provided',
      );
    }

    if (toolResult.error && !toolResult.isError) {
      result.warnings.push(
        'Tool result has error message but isError is false',
      );
    }

    return result;
  }

  /**
   * Validate conversion between formats.
   * @param originalTool Original tool in unified format.
   * @param converter Tool format converter.
   * @param context Validation context.
   * @returns Validation result with conversion test.
   */
  static validateConversion(
    originalTool: UnifiedTool,
    converter: ToolFormatConverter,
    context: ValidationContext,
  ): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    try {
      // Test conversion to provider format and back
      const providerFormat = converter.toProviderFormat(originalTool);

      if (!providerFormat) {
        result.errors.push(
          'Conversion to provider format returned null/undefined',
        );
        result.isValid = false;
        return result;
      }

      // Validate provider format is serializable
      try {
        JSON.stringify(providerFormat);
      } catch {
        result.errors.push('Provider format result is not JSON serializable');
        result.isValid = false;
      }

      // Test round-trip conversion if possible
      if (converter.fromFunctionDeclaration) {
        try {
          const functionDeclaration =
            converter.toFunctionDeclaration(originalTool);
          const roundTripTool =
            converter.fromFunctionDeclaration(functionDeclaration);

          // Check if essential fields are preserved
          if (roundTripTool.name !== originalTool.name) {
            result.warnings.push(
              'Tool name changed during round-trip conversion',
            );
          }

          if (roundTripTool.description !== originalTool.description) {
            result.warnings.push(
              'Tool description changed during round-trip conversion',
            );
          }
        } catch (conversionError: any) {
          result.warnings.push(
            `Round-trip conversion failed: ${conversionError.message}`,
          );
        }
      }
    } catch (error: any) {
      result.errors.push(`Conversion failed: ${error.message}`);
      result.isValid = false;
    }

    return result;
  }

  /**
   * Validate all aspects of a tool format conversion pipeline.
   * @param tool Unified tool to validate.
   * @param converter Tool format converter.
   * @param context Validation context.
   * @returns Comprehensive validation result.
   */
  static validateComplete(
    tool: UnifiedTool,
    converter: ToolFormatConverter,
    context: ValidationContext,
  ): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    // Validate unified tool
    const toolValidation = this.validateUnifiedTool(tool, context);
    result.errors.push(...toolValidation.errors);
    result.warnings.push(...toolValidation.warnings);
    if (!toolValidation.isValid) {
      result.isValid = false;
    }

    // Validate conversion if tool is valid
    if (toolValidation.isValid) {
      const conversionValidation = this.validateConversion(
        tool,
        converter,
        context,
      );
      result.errors.push(...conversionValidation.errors);
      result.warnings.push(...conversionValidation.warnings);
      if (!conversionValidation.isValid) {
        result.isValid = false;
      }
    }

    return result;
  }

  /**
   * Create a validation context.
   * @param providerId Provider identifier.
   * @param options Additional context options.
   * @returns Validation context.
   */
  static createContext(
    providerId: string,
    options: {
      toolName?: string;
      operationType?: ValidationContext['operationType'];
      strict?: boolean;
    } = {},
  ): ValidationContext {
    return {
      providerId,
      toolName: options.toolName,
      operationType: options.operationType || 'tool_schema',
      strict: options.strict ?? true,
    };
  }

  /**
   * Convert validation result to error if invalid.
   * @param validation Validation result.
   * @param context Validation context.
   * @returns ToolConversionError if invalid, null if valid.
   */
  static toErrorIfInvalid(
    validation: ValidationResult,
    context: ValidationContext,
  ): ToolConversionError | null {
    if (validation.isValid) {
      return null;
    }

    const errorMessage = validation.errors.join('; ');
    return ToolConversionError.schemaConversion(
      'unified',
      context.providerId,
      errorMessage,
    );
  }
}

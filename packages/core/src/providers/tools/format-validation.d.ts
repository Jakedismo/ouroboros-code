/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { UnifiedTool, UnifiedToolCall, UnifiedToolResult, ToolFormatConverter } from './unified-tool-interface.js';
import { ToolConversionError } from './error-handling.js';
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
    strict?: boolean;
}
/**
 * Comprehensive validator for tool format conversions.
 * Ensures data integrity when converting between provider formats.
 */
export declare class ToolFormatValidator {
    /**
     * Validate a unified tool schema.
     * @param tool Unified tool to validate.
     * @param context Validation context.
     * @returns Validation result.
     */
    static validateUnifiedTool(tool: UnifiedTool, context: ValidationContext): ValidationResult;
    /**
     * Validate parameter schema recursively.
     * @param schema Parameter schema to validate.
     * @param context Validation context.
     * @param path Current path for error reporting.
     * @returns Validation result.
     */
    private static validateParameterSchema;
    /**
     * Validate individual property schema.
     * @param schema Property schema to validate.
     * @param context Validation context.
     * @param path Current path for error reporting.
     * @returns Validation result.
     */
    private static validatePropertySchema;
    /**
     * Validate provider-specific constraints.
     * @param tool Unified tool.
     * @param context Validation context.
     * @returns Validation result.
     */
    private static validateForProvider;
    /**
     * Validate for OpenAI-specific constraints.
     */
    private static validateForOpenAI;
    /**
     * Validate for Anthropic-specific constraints.
     */
    private static validateForAnthropic;
    /**
     * Validate for Gemini-specific constraints.
     */
    private static validateForGemini;
    /**
     * Validate a tool call format.
     * @param toolCall Tool call to validate.
     * @param context Validation context.
     * @returns Validation result.
     */
    static validateToolCall(toolCall: UnifiedToolCall, context: ValidationContext): ValidationResult;
    /**
     * Validate a tool result format.
     * @param toolResult Tool result to validate.
     * @param context Validation context.
     * @returns Validation result.
     */
    static validateToolResult(toolResult: UnifiedToolResult, context: ValidationContext): ValidationResult;
    /**
     * Validate conversion between formats.
     * @param originalTool Original tool in unified format.
     * @param converter Tool format converter.
     * @param context Validation context.
     * @returns Validation result with conversion test.
     */
    static validateConversion(originalTool: UnifiedTool, converter: ToolFormatConverter, context: ValidationContext): ValidationResult;
    /**
     * Validate all aspects of a tool format conversion pipeline.
     * @param tool Unified tool to validate.
     * @param converter Tool format converter.
     * @param context Validation context.
     * @returns Comprehensive validation result.
     */
    static validateComplete(tool: UnifiedTool, converter: ToolFormatConverter, context: ValidationContext): ValidationResult;
    /**
     * Create a validation context.
     * @param providerId Provider identifier.
     * @param options Additional context options.
     * @returns Validation context.
     */
    static createContext(providerId: string, options?: {
        toolName?: string;
        operationType?: ValidationContext['operationType'];
        strict?: boolean;
    }): ValidationContext;
    /**
     * Convert validation result to error if invalid.
     * @param validation Validation result.
     * @param context Validation context.
     * @returns ToolConversionError if invalid, null if valid.
     */
    static toErrorIfInvalid(validation: ValidationResult, context: ValidationContext): ToolConversionError | null;
}

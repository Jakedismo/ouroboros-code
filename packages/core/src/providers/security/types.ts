/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Security types and interfaces for Multi-LLM Provider system
 */

import { LLMProvider } from '../types.js';

// Type alias for backward compatibility
type ProviderType = LLMProvider;

export enum SecurityLevel {
  SAFE = 'safe',
  MODERATE = 'moderate',
  DANGEROUS = 'dangerous',
  CRITICAL = 'critical',
}

export interface SecurityViolation {
  type: SecurityViolationType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  path?: string;
  command?: string;
  provider: ProviderType | null;
  timestamp?: Date;
  evidence?: any;
}

export type SecurityViolationType =
  | 'path_traversal'
  | 'dangerous_characters'
  | 'absolute_path_restriction'
  | 'blocked_directory'
  | 'directory_not_allowed'
  | 'blocked_file_type'
  | 'file_type_not_allowed'
  | 'executable_file_creation'
  | 'file_size_exceeded'
  | 'dangerous_command'
  | 'command_injection'
  | 'privilege_escalation'
  | 'network_access_violation'
  | 'environment_manipulation'
  | 'system_file_access';

export interface SecurityContext {
  userId?: string;
  sessionId: string;
  permissions: Permission[];
  riskLevel: SecurityLevel;
  ipAddress?: string;
  userAgent?: string;
  environment?: EnvironmentContext;
}

export interface Permission {
  resource: string;
  action: string;
  conditions?: PermissionCondition[];
}

export interface PermissionCondition {
  type: 'time' | 'location' | 'resource_limit' | 'approval_required';
  value: any;
}

export interface EnvironmentContext {
  workingDirectory: string;
  environment: 'development' | 'staging' | 'production';
  containerized: boolean;
  sandboxed: boolean;
  networkAccess: boolean;
}

export interface SecurityAssessment {
  riskLevel: SecurityLevel;
  riskFactors: RiskFactor[];
  securityChecks: SecurityCheck[];
  recommendations: SecurityRecommendation[];
  allowExecution: boolean;
  requiresConfirmation: boolean;
  mitigationActions?: SecurityMitigation[];
}

export interface RiskFactor {
  type: RiskType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  evidence?: any;
  mitigation?: string;
  weight: number; // 0-1 scale for risk calculation
}

export enum RiskType {
  FILE_SYSTEM_ACCESS = 'file_system_access',
  COMMAND_EXECUTION = 'command_execution',
  NETWORK_ACCESS = 'network_access',
  DATA_EXPOSURE = 'data_exposure',
  PRIVILEGE_ESCALATION = 'privilege_escalation',
  ENVIRONMENT_MANIPULATION = 'environment_manipulation',
  SYSTEM_MODIFICATION = 'system_modification',
  CREDENTIAL_ACCESS = 'credential_access',
  INFORMATION_GATHERING = 'information_gathering',
}

export interface SecurityCheck {
  name: string;
  category: SecurityCheckCategory;
  passed: boolean;
  details: string;
  evidence?: any;
  recommendation?: string;
}

export enum SecurityCheckCategory {
  INPUT_VALIDATION = 'input_validation',
  ACCESS_CONTROL = 'access_control',
  DATA_PROTECTION = 'data_protection',
  COMMAND_SAFETY = 'command_safety',
  NETWORK_SECURITY = 'network_security',
  FILE_SYSTEM_SECURITY = 'file_system_security',
  PRIVILEGE_MANAGEMENT = 'privilege_management',
}

export interface SecurityRecommendation {
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: SecurityCheckCategory;
  description: string;
  action: string;
  impact: string;
  implementation?: SecurityMitigation;
}

export interface SecurityMitigation {
  type: MitigationType;
  description: string;
  implementation: string;
  effectiveness: number; // 0-1 scale
  cost: 'low' | 'medium' | 'high';
}

export enum MitigationType {
  DENY_ACCESS = 'deny_access',
  REQUIRE_CONFIRMATION = 'require_confirmation',
  RESTRICT_PARAMETERS = 'restrict_parameters',
  SANDBOX_EXECUTION = 'sandbox_execution',
  AUDIT_LOG = 'audit_log',
  RATE_LIMIT = 'rate_limit',
  ENCRYPT_DATA = 'encrypt_data',
  VALIDATE_INPUT = 'validate_input',
}

export interface SecurityEvent {
  id: string;
  timestamp: Date;
  type: SecurityEventType;
  severity: SecurityLevel;
  provider: ProviderType;
  description: string;
  context: SecurityContext;
  violations: SecurityViolation[];
  resolution?: SecurityEventResolution;
}

export enum SecurityEventType {
  BOUNDARY_VIOLATION = 'boundary_violation',
  COMMAND_BLOCKED = 'command_blocked',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  PRIVILEGE_ESCALATION_ATTEMPT = 'privilege_escalation_attempt',
  DATA_ACCESS_VIOLATION = 'data_access_violation',
  NETWORK_VIOLATION = 'network_violation',
  AUTHENTICATION_FAILURE = 'authentication_failure',
  CONFIGURATION_TAMPERING = 'configuration_tampering',
}

export interface SecurityEventResolution {
  action: SecurityAction;
  reason: string;
  automaticResolution: boolean;
  timestamp: Date;
}

export enum SecurityAction {
  ALLOW = 'allow',
  DENY = 'deny',
  REQUIRE_CONFIRMATION = 'require_confirmation',
  SANDBOX = 'sandbox',
  AUDIT_ONLY = 'audit_only',
  RATE_LIMIT = 'rate_limit',
  ESCALATE = 'escalate',
}

export interface SecurityPolicy {
  name: string;
  version: string;
  provider?: ProviderType;
  rules: SecurityRule[];
  defaultAction: SecurityAction;
  enforcementLevel: 'strict' | 'moderate' | 'permissive';
}

export interface SecurityRule {
  id: string;
  name: string;
  description: string;
  condition: SecurityCondition;
  action: SecurityAction;
  priority: number;
  enabled: boolean;
}

export interface SecurityCondition {
  type:
    | 'tool_name'
    | 'parameter_pattern'
    | 'file_path'
    | 'command_pattern'
    | 'provider'
    | 'risk_level';
  operator:
    | 'equals'
    | 'contains'
    | 'matches'
    | 'greater_than'
    | 'less_than'
    | 'in_list';
  value: any;
  negated?: boolean;
}

export interface SecurityConfiguration {
  policies: SecurityPolicy[];
  globalSettings: GlobalSecuritySettings;
  providerSettings: {
    [K in ProviderType]?: ProviderSecuritySettings;
  };
  auditSettings: AuditSettings;
}

export interface GlobalSecuritySettings {
  strictMode: boolean;
  defaultRiskLevel: SecurityLevel;
  requireConfirmationThreshold: SecurityLevel;
  blockThreshold: SecurityLevel;
  enableAuditLogging: boolean;
  enableRealTimeMonitoring: boolean;
  maxConcurrentOperations: number;
  sessionTimeout: number;
}

export interface ProviderSecuritySettings {
  enabled: boolean;
  riskMultiplier: number; // Multiplier for risk calculations
  allowedTools: string[];
  blockedTools: string[];
  requiresApproval: boolean;
  sandboxMode: boolean;
  customRules: SecurityRule[];
}

export interface AuditSettings {
  enabled: boolean;
  level: 'minimal' | 'standard' | 'comprehensive';
  retention: number; // days
  realTime: boolean;
  destinations: AuditDestination[];
  filters: AuditFilter[];
}

export interface AuditDestination {
  type: 'file' | 'database' | 'webhook' | 'syslog';
  configuration: any;
  enabled: boolean;
}

export interface AuditFilter {
  type: 'severity' | 'provider' | 'tool' | 'user';
  value: any;
  action: 'include' | 'exclude';
}

export interface SecurityMetrics {
  totalEvents: number;
  eventsByType: { [key in SecurityEventType]: number };
  eventsBySeverity: { [key in SecurityLevel]: number };
  eventsByProvider: { [key in ProviderType]: number };
  blockedOperations: number;
  confirmedOperations: number;
  falsePositives: number;
  responseTime: {
    average: number;
    p95: number;
    p99: number;
  };
  timeRange: {
    start: Date;
    end: Date;
  };
}

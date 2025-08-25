/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

// Core registry exports
export { AgentRegistry, type AgentInfo } from './agent-registry.js';
export { AgentStorage, type AgentConfig, type AgentRegistryMetadata } from './agent-storage.js';
export { 
  BUILT_IN_AGENTS, 
  getBuiltInAgent, 
  getBuiltInAgentIds, 
  initializeBuiltInAgents 
} from './built-in-agents.js';
export { 
  RegistryInitializer, 
  type HealthCheckResult, 
  getRegistryInitializer, 
  initializeGlobalRegistry 
} from './registry-initializer.js';

// Convenience exports for common use cases
export type { AgentConfig as Agent } from './agent-storage.js';
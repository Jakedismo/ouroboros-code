/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

// Provider integration exports
export {
  type ProviderIntegration,
  AgentActivationService,
  OuroborosProviderIntegration,
  type AgentActivationEvent,
  type AgentActivationListener,
  AgentActivationError,
  getAgentActivationService,
  initializeAgentActivationService,
} from './provider-integration.js';

// Agent manager exports
export {
  AgentManager,
  type AgentSystemStatus,
  getAgentManager,
  initializeGlobalAgentManager,
} from './agent-manager.js';
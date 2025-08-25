/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import { Config } from '../../../core/src/config/config.js';
import { ToolRegistry } from '../../../core/src/tools/tool-registry.js';
import { AgentManager } from '../core/agent-manager.js';
import { WorkflowManager } from '../workflow/workflow-manager.js';
import { SessionManager } from '../session/session-manager.js';
import { Logger } from '../../../core/src/utils/logger.js';

/**
 * Resource allocation strategy
 */
export type ResourceAllocationStrategy = 
  | 'balanced'       // Equal resource allocation
  | 'priority-based' // Allocate based on agent/workflow priority
  | 'performance'    // Allocate based on historical performance
  | 'adaptive';      // Dynamic allocation based on current load

/**
 * Resource constraints configuration
 */
export interface ResourceConstraints {
  memory: {
    maxUsageMB: number;
    reservedMB: number;
    bufferMB: number;
  };
  cpu: {
    maxUsagePercent: number;
    reservedPercent: number;
    maxConcurrentOperations: number;
  };
  network: {
    maxConcurrentConnections: number;
    bandwidthLimitMBps?: number;
    timeoutMs: number;
  };
  storage: {
    maxCacheSizeMB: number;
    maxTemporaryFilesMB: number;
    cleanupIntervalMs: number;
  };
}

/**
 * Resource allocation result
 */
export interface ResourceAllocation {
  allocationId: string;
  resourceType: string;
  requestedAmount: number;
  allocatedAmount: number;
  priority: number;
  expiresAt: number;
  metadata: Record<string, any>;
}

/**
 * Resource usage tracking
 */
export interface ResourceUsage {
  resourceType: string;
  used: number;
  available: number;
  percentage: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  allocations: ResourceAllocation[];
}

/**
 * Resource management statistics
 */
export interface ResourceStatistics {
  timestamp: number;
  totalAllocations: number;
  activeAllocations: number;
  resourceUtilization: {
    memory: ResourceUsage;
    cpu: ResourceUsage;
    network: ResourceUsage;
    storage: ResourceUsage;
  };
  allocationEfficiency: number;
  fragmentationRatio: number;
  contentionCount: number;
}

/**
 * Resource allocation request
 */
export interface ResourceRequest {
  requestId: string;
  resourceType: 'memory' | 'cpu' | 'network' | 'storage' | 'agent-slot' | 'workflow-slot';
  amount: number;
  priority: number;
  durationMs: number;
  requesterInfo: {
    type: 'agent' | 'workflow' | 'tool' | 'session';
    id: string;
    name: string;
  };
  constraints?: {
    maxWaitTimeMs?: number;
    canShare?: boolean;
    preemptible?: boolean;
  };
  metadata: Record<string, any>;
}

/**
 * Resource manager for coordinating system resources across agents and workflows
 */
export class ResourceManager extends EventEmitter {
  private logger: Logger;
  private constraints: ResourceConstraints;
  private allocationStrategy: ResourceAllocationStrategy;
  private allocations: Map<string, ResourceAllocation> = new Map();
  private resourceUsageHistory: ResourceStatistics[] = [];
  private requestQueue: ResourceRequest[] = [];
  private allocationCounter = 0;
  private monitoringTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;

  // Resource pools for different types
  private memoryPool: { used: number; available: number } = { used: 0, available: 0 };
  private cpuPool: { used: number; available: number; operations: number } = { used: 0, available: 100, operations: 0 };
  private networkPool: { connections: number; maxConnections: number } = { connections: 0, maxConnections: 0 };
  private storagePool: { used: number; available: number } = { used: 0, available: 0 };
  private agentSlots: { used: number; available: number } = { used: 0, available: 0 };
  private workflowSlots: { used: number; available: number } = { used: 0, available: 0 };

  constructor(
    private config: Config,
    private toolRegistry: ToolRegistry,
    private agentManager: AgentManager,
    private workflowManager: WorkflowManager,
    private sessionManager: SessionManager,
    constraints?: Partial<ResourceConstraints>,
    strategy: ResourceAllocationStrategy = 'adaptive'
  ) {
    super();
    this.logger = new Logger('ResourceManager');
    this.allocationStrategy = strategy;

    // Default resource constraints
    this.constraints = {
      memory: {
        maxUsageMB: 2048, // 2GB
        reservedMB: 256,  // 256MB
        bufferMB: 128,    // 128MB
      },
      cpu: {
        maxUsagePercent: 80,
        reservedPercent: 20,
        maxConcurrentOperations: 50,
      },
      network: {
        maxConcurrentConnections: 100,
        timeoutMs: 30000,
      },
      storage: {
        maxCacheSizeMB: 512,
        maxTemporaryFilesMB: 256,
        cleanupIntervalMs: 300000, // 5 minutes
      },
      ...constraints,
    };

    this.initializeResourcePools();
  }

  /**
   * Initialize resource manager
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing resource manager...');

    // Initialize resource pools based on system resources
    await this.initializeResourcePools();

    // Start resource monitoring
    this.startResourceMonitoring();

    // Start cleanup scheduler
    this.startCleanupScheduler();

    // Set up event listeners
    this.setupEventListeners();

    this.emit('resource-manager-initialized', {
      strategy: this.allocationStrategy,
      constraints: this.constraints,
      pools: this.getResourcePoolStatus(),
    });

    this.logger.info('Resource manager initialized successfully');
  }

  /**
   * Request resource allocation
   */
  async requestResource(request: ResourceRequest): Promise<ResourceAllocation | null> {
    this.logger.debug('Resource allocation requested', { request });

    // Validate request
    if (!this.validateResourceRequest(request)) {
      throw new Error(`Invalid resource request: ${request.requestId}`);
    }

    // Check if resource can be allocated immediately
    const immediateAllocation = await this.tryImmediateAllocation(request);
    if (immediateAllocation) {
      this.emit('resource-allocated', immediateAllocation);
      return immediateAllocation;
    }

    // Add to queue if cannot allocate immediately
    if (request.constraints?.maxWaitTimeMs) {
      this.requestQueue.push(request);
      this.requestQueue.sort((a, b) => b.priority - a.priority); // Sort by priority

      // Try to allocate from queue
      await this.processRequestQueue();

      // Check if request was fulfilled
      const allocation = Array.from(this.allocations.values())
        .find(alloc => alloc.metadata.requestId === request.requestId);
      
      return allocation || null;
    }

    return null;
  }

  /**
   * Release resource allocation
   */
  async releaseResource(allocationId: string): Promise<boolean> {
    const allocation = this.allocations.get(allocationId);
    if (!allocation) {
      this.logger.warn('Attempted to release unknown allocation', { allocationId });
      return false;
    }

    // Return resource to pool
    await this.returnResourceToPool(allocation);

    // Remove allocation
    this.allocations.delete(allocationId);

    this.emit('resource-released', allocation);
    this.logger.debug('Resource released', { allocation });

    // Process any queued requests
    await this.processRequestQueue();

    return true;
  }

  /**
   * Get current resource statistics
   */
  getResourceStatistics(): ResourceStatistics {
    const timestamp = Date.now();
    const totalAllocations = this.allocations.size;
    const activeAllocations = Array.from(this.allocations.values())
      .filter(alloc => alloc.expiresAt > timestamp).length;

    const resourceUtilization = {
      memory: this.getResourceUsage('memory'),
      cpu: this.getResourceUsage('cpu'),
      network: this.getResourceUsage('network'),
      storage: this.getResourceUsage('storage'),
    };

    const allocationEfficiency = this.calculateAllocationEfficiency();
    const fragmentationRatio = this.calculateFragmentationRatio();
    const contentionCount = this.requestQueue.length;

    const statistics: ResourceStatistics = {
      timestamp,
      totalAllocations,
      activeAllocations,
      resourceUtilization,
      allocationEfficiency,
      fragmentationRatio,
      contentionCount,
    };

    // Store statistics for historical analysis
    this.resourceUsageHistory.push(statistics);
    if (this.resourceUsageHistory.length > 1000) {
      this.resourceUsageHistory.shift();
    }

    return statistics;
  }

  /**
   * Update allocation strategy
   */
  setAllocationStrategy(strategy: ResourceAllocationStrategy): void {
    const oldStrategy = this.allocationStrategy;
    this.allocationStrategy = strategy;

    this.logger.info('Resource allocation strategy changed', {
      oldStrategy,
      newStrategy: strategy,
    });

    this.emit('strategy-changed', { oldStrategy, newStrategy: strategy });
  }

  /**
   * Get resource allocation recommendations
   */
  getOptimizationRecommendations(): string[] {
    const recommendations: string[] = [];
    const stats = this.getResourceStatistics();

    // Memory recommendations
    if (stats.resourceUtilization.memory.percentage > 85) {
      recommendations.push('Memory usage is high; consider releasing unused allocations or increasing memory limits');
    }

    // CPU recommendations
    if (stats.resourceUtilization.cpu.percentage > 90) {
      recommendations.push('CPU usage is very high; consider reducing concurrent operations');
    }

    // Fragmentation recommendations
    if (stats.fragmentationRatio > 0.3) {
      recommendations.push('High resource fragmentation detected; consider resource compaction');
    }

    // Queue recommendations
    if (stats.contentionCount > 10) {
      recommendations.push('High resource contention; consider increasing resource limits or optimizing allocation strategy');
    }

    // Efficiency recommendations
    if (stats.allocationEfficiency < 0.7) {
      recommendations.push('Low allocation efficiency; consider reviewing allocation patterns and durations');
    }

    return recommendations;
  }

  /**
   * Initialize resource pools based on system capabilities
   */
  private async initializeResourcePools(): Promise<void> {
    // Memory pool initialization
    const memoryUsage = process.memoryUsage();
    this.memoryPool = {
      used: memoryUsage.heapUsed / 1024 / 1024, // MB
      available: this.constraints.memory.maxUsageMB - this.constraints.memory.reservedMB,
    };

    // CPU pool initialization
    this.cpuPool = {
      used: 0,
      available: this.constraints.cpu.maxUsagePercent - this.constraints.cpu.reservedPercent,
      operations: 0,
    };

    // Network pool initialization
    this.networkPool = {
      connections: 0,
      maxConnections: this.constraints.network.maxConcurrentConnections,
    };

    // Storage pool initialization
    this.storagePool = {
      used: 0,
      available: this.constraints.storage.maxCacheSizeMB,
    };

    // Agent slots (based on system configuration)
    this.agentSlots = {
      used: 0,
      available: 20, // Default max concurrent agents
    };

    // Workflow slots (based on system configuration)
    this.workflowSlots = {
      used: 0,
      available: 50, // Default max concurrent workflows
    };

    this.logger.info('Resource pools initialized', {
      memory: this.memoryPool,
      cpu: this.cpuPool,
      network: this.networkPool,
      storage: this.storagePool,
      agentSlots: this.agentSlots,
      workflowSlots: this.workflowSlots,
    });
  }

  /**
   * Validate resource request
   */
  private validateResourceRequest(request: ResourceRequest): boolean {
    if (!request.requestId || !request.resourceType || request.amount <= 0) {
      return false;
    }

    if (request.priority < 0 || request.priority > 10) {
      return false;
    }

    if (request.durationMs <= 0) {
      return false;
    }

    return true;
  }

  /**
   * Try to allocate resource immediately
   */
  private async tryImmediateAllocation(request: ResourceRequest): Promise<ResourceAllocation | null> {
    const available = this.getAvailableResource(request.resourceType);
    
    if (available < request.amount) {
      return null; // Not enough resources available
    }

    // Create allocation
    const allocationId = `alloc_${++this.allocationCounter}`;
    const allocation: ResourceAllocation = {
      allocationId,
      resourceType: request.resourceType,
      requestedAmount: request.amount,
      allocatedAmount: request.amount,
      priority: request.priority,
      expiresAt: Date.now() + request.durationMs,
      metadata: {
        requestId: request.requestId,
        requesterInfo: request.requesterInfo,
        constraints: request.constraints,
        ...request.metadata,
      },
    };

    // Reserve resource from pool
    await this.reserveResourceFromPool(allocation);

    // Store allocation
    this.allocations.set(allocationId, allocation);

    return allocation;
  }

  /**
   * Process resource request queue
   */
  private async processRequestQueue(): Promise<void> {
    if (this.requestQueue.length === 0) {
      return;
    }

    const processedRequests: string[] = [];

    for (let i = 0; i < this.requestQueue.length; i++) {
      const request = this.requestQueue[i];
      
      // Check if request has expired
      if (request.constraints?.maxWaitTimeMs &&
          Date.now() - parseInt(request.requestId.split('_')[1] || '0') > request.constraints.maxWaitTimeMs) {
        processedRequests.push(request.requestId);
        this.emit('resource-request-expired', request);
        continue;
      }

      // Try to allocate
      const allocation = await this.tryImmediateAllocation(request);
      if (allocation) {
        processedRequests.push(request.requestId);
        this.emit('resource-allocated', allocation);
      }
    }

    // Remove processed requests from queue
    this.requestQueue = this.requestQueue.filter(
      req => !processedRequests.includes(req.requestId)
    );
  }

  /**
   * Get available resource amount
   */
  private getAvailableResource(resourceType: string): number {
    switch (resourceType) {
      case 'memory':
        return Math.max(0, this.memoryPool.available - this.memoryPool.used);
      case 'cpu':
        return Math.max(0, this.cpuPool.available - this.cpuPool.used);
      case 'network':
        return Math.max(0, this.networkPool.maxConnections - this.networkPool.connections);
      case 'storage':
        return Math.max(0, this.storagePool.available - this.storagePool.used);
      case 'agent-slot':
        return Math.max(0, this.agentSlots.available - this.agentSlots.used);
      case 'workflow-slot':
        return Math.max(0, this.workflowSlots.available - this.workflowSlots.used);
      default:
        return 0;
    }
  }

  /**
   * Reserve resource from pool
   */
  private async reserveResourceFromPool(allocation: ResourceAllocation): Promise<void> {
    switch (allocation.resourceType) {
      case 'memory':
        this.memoryPool.used += allocation.allocatedAmount;
        break;
      case 'cpu':
        this.cpuPool.used += allocation.allocatedAmount;
        this.cpuPool.operations++;
        break;
      case 'network':
        this.networkPool.connections++;
        break;
      case 'storage':
        this.storagePool.used += allocation.allocatedAmount;
        break;
      case 'agent-slot':
        this.agentSlots.used++;
        break;
      case 'workflow-slot':
        this.workflowSlots.used++;
        break;
    }
  }

  /**
   * Return resource to pool
   */
  private async returnResourceToPool(allocation: ResourceAllocation): Promise<void> {
    switch (allocation.resourceType) {
      case 'memory':
        this.memoryPool.used = Math.max(0, this.memoryPool.used - allocation.allocatedAmount);
        break;
      case 'cpu':
        this.cpuPool.used = Math.max(0, this.cpuPool.used - allocation.allocatedAmount);
        this.cpuPool.operations = Math.max(0, this.cpuPool.operations - 1);
        break;
      case 'network':
        this.networkPool.connections = Math.max(0, this.networkPool.connections - 1);
        break;
      case 'storage':
        this.storagePool.used = Math.max(0, this.storagePool.used - allocation.allocatedAmount);
        break;
      case 'agent-slot':
        this.agentSlots.used = Math.max(0, this.agentSlots.used - 1);
        break;
      case 'workflow-slot':
        this.workflowSlots.used = Math.max(0, this.workflowSlots.used - 1);
        break;
    }
  }

  /**
   * Get resource usage for a specific type
   */
  private getResourceUsage(resourceType: string): ResourceUsage {
    const allocationsForType = Array.from(this.allocations.values())
      .filter(alloc => alloc.resourceType === resourceType);

    let used: number, available: number;

    switch (resourceType) {
      case 'memory':
        used = this.memoryPool.used;
        available = this.memoryPool.available;
        break;
      case 'cpu':
        used = this.cpuPool.used;
        available = this.cpuPool.available;
        break;
      case 'network':
        used = this.networkPool.connections;
        available = this.networkPool.maxConnections;
        break;
      case 'storage':
        used = this.storagePool.used;
        available = this.storagePool.available;
        break;
      default:
        used = 0;
        available = 100;
    }

    const percentage = available > 0 ? (used / available) * 100 : 0;
    const trend = this.calculateResourceTrend(resourceType);

    return {
      resourceType,
      used,
      available,
      percentage,
      trend,
      allocations: allocationsForType,
    };
  }

  /**
   * Calculate resource usage trend
   */
  private calculateResourceTrend(resourceType: string): 'increasing' | 'decreasing' | 'stable' {
    const recentStats = this.resourceUsageHistory.slice(-5);
    if (recentStats.length < 3) {
      return 'stable';
    }

    const usageValues = recentStats.map(stat => 
      stat.resourceUtilization[resourceType as keyof typeof stat.resourceUtilization]?.used || 0
    );

    const trend = usageValues[usageValues.length - 1] - usageValues[0];
    const threshold = usageValues[0] * 0.1; // 10% threshold

    if (Math.abs(trend) <= threshold) {
      return 'stable';
    }

    return trend > 0 ? 'increasing' : 'decreasing';
  }

  /**
   * Calculate allocation efficiency
   */
  private calculateAllocationEfficiency(): number {
    if (this.allocations.size === 0) {
      return 1.0;
    }

    const now = Date.now();
    let totalRequestedDuration = 0;
    let totalActualDuration = 0;

    for (const allocation of this.allocations.values()) {
      const requestedDuration = allocation.expiresAt - (allocation.metadata.createdAt || now);
      const actualDuration = Math.min(now - (allocation.metadata.createdAt || now), requestedDuration);
      
      totalRequestedDuration += requestedDuration;
      totalActualDuration += actualDuration;
    }

    return totalRequestedDuration > 0 ? totalActualDuration / totalRequestedDuration : 1.0;
  }

  /**
   * Calculate resource fragmentation ratio
   */
  private calculateFragmentationRatio(): number {
    // Simple fragmentation calculation based on allocation sizes
    const allocations = Array.from(this.allocations.values());
    if (allocations.length === 0) {
      return 0;
    }

    const allocationSizes = allocations.map(alloc => alloc.allocatedAmount);
    const totalAllocated = allocationSizes.reduce((sum, size) => sum + size, 0);
    const averageSize = totalAllocated / allocationSizes.length;
    
    const variance = allocationSizes.reduce((sum, size) => 
      sum + Math.pow(size - averageSize, 2), 0) / allocationSizes.length;
    
    const standardDeviation = Math.sqrt(variance);
    
    return averageSize > 0 ? standardDeviation / averageSize : 0;
  }

  /**
   * Start resource monitoring
   */
  private startResourceMonitoring(): void {
    this.monitoringTimer = setInterval(() => {
      this.getResourceStatistics();
      this.cleanupExpiredAllocations();
    }, 30000); // Monitor every 30 seconds
  }

  /**
   * Start cleanup scheduler
   */
  private startCleanupScheduler(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredAllocations();
      this.cleanupRequestQueue();
    }, this.constraints.storage.cleanupIntervalMs);
  }

  /**
   * Cleanup expired allocations
   */
  private cleanupExpiredAllocations(): void {
    const now = Date.now();
    const expiredAllocations: string[] = [];

    for (const [id, allocation] of this.allocations) {
      if (allocation.expiresAt <= now) {
        expiredAllocations.push(id);
      }
    }

    for (const id of expiredAllocations) {
      this.releaseResource(id);
    }

    if (expiredAllocations.length > 0) {
      this.logger.debug('Cleaned up expired allocations', { count: expiredAllocations.length });
    }
  }

  /**
   * Cleanup request queue
   */
  private cleanupRequestQueue(): void {
    const initialLength = this.requestQueue.length;
    this.requestQueue = this.requestQueue.filter(request => {
      const maxWaitTime = request.constraints?.maxWaitTimeMs || 300000; // 5 minutes default
      const requestAge = Date.now() - parseInt(request.requestId.split('_')[1] || '0');
      return requestAge < maxWaitTime;
    });

    const cleaned = initialLength - this.requestQueue.length;
    if (cleaned > 0) {
      this.logger.debug('Cleaned up expired requests', { count: cleaned });
    }
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    // Listen to agent events
    this.agentManager.on('agent-activated', () => {
      // Agent slot allocation handled automatically
    });

    this.agentManager.on('agent-deactivated', () => {
      // Agent slot release handled automatically
    });

    // Listen to workflow events
    this.workflowManager.on('workflow-started', () => {
      // Workflow slot allocation handled automatically
    });

    this.workflowManager.on('workflow-completed', () => {
      // Workflow slot release handled automatically
    });
  }

  /**
   * Get resource pool status
   */
  getResourcePoolStatus() {
    return {
      memory: this.memoryPool,
      cpu: this.cpuPool,
      network: this.networkPool,
      storage: this.storagePool,
      agentSlots: this.agentSlots,
      workflowSlots: this.workflowSlots,
    };
  }

  /**
   * Cleanup and shutdown
   */
  async cleanup(): Promise<void> {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = undefined;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    // Release all allocations
    for (const allocationId of this.allocations.keys()) {
      await this.releaseResource(allocationId);
    }

    this.requestQueue.length = 0;
    this.resourceUsageHistory.length = 0;
    this.removeAllListeners();

    this.logger.info('Resource manager cleaned up');
  }
}

export default ResourceManager;
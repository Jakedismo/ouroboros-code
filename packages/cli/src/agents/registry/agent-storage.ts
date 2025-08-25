/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/**
 * Core agent configuration interface
 */
export interface AgentConfig {
  id: string;
  name: string;
  version: string;
  category: 'built-in' | 'custom';
  description: string;
  author: string;
  created: string;
  modified: string;
  systemPrompt: string;
  capabilities: {
    tools: {
      fileOperations: boolean;
      shellCommands: boolean;
      webResearch: boolean;
      appleControl: boolean;
      emailCalendar: boolean;
      dockerManagement: boolean;
    };
    specialBehaviors: string[];
  };
  toolConfiguration: {
    enabledTools: string[];
    customToolOptions: Record<string, any>;
  };
  metadata: {
    usageCount: number;
    lastUsed: string | null;
    effectiveness: number;
    userRating: number;
  };
}

/**
 * Registry metadata for tracking agents
 */
export interface AgentRegistryMetadata {
  version: string;
  lastUpdated: string;
  activeAgent: string | null;
  agentCount: {
    builtIn: number;
    custom: number;
  };
}

/**
 * Agent storage and file system operations
 */
export class AgentStorage {
  private readonly agentsPath: string;
  private readonly builtInPath: string;
  private readonly customPath: string;
  private readonly registryMetadataFile: string;
  private readonly activeAgentFile: string;

  constructor() {
    this.agentsPath = join(homedir(), '.ouroboros-code', 'agents');
    this.builtInPath = join(this.agentsPath, 'built-in');
    this.customPath = join(this.agentsPath, 'custom');
    this.registryMetadataFile = join(this.agentsPath, 'registry.json');
    this.activeAgentFile = join(this.agentsPath, 'active-agent.json');
  }

  /**
   * Initialize agent storage directories
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.agentsPath, { recursive: true });
      await fs.mkdir(this.builtInPath, { recursive: true });
      await fs.mkdir(this.customPath, { recursive: true });

      // Create default registry metadata if it doesn't exist
      if (!await this.fileExists(this.registryMetadataFile)) {
        const defaultMetadata: AgentRegistryMetadata = {
          version: '1.0.0',
          lastUpdated: new Date().toISOString(),
          activeAgent: null,
          agentCount: {
            builtIn: 0,
            custom: 0,
          },
        };
        await this.writeRegistryMetadata(defaultMetadata);
      }
    } catch (error) {
      throw new Error(`Failed to initialize agent storage: ${error}`);
    }
  }

  /**
   * Save agent configuration to file
   */
  async saveAgent(agent: AgentConfig): Promise<void> {
    const filePath = this.getAgentFilePath(agent.id, agent.category);
    
    try {
      await fs.writeFile(
        filePath, 
        JSON.stringify(agent, null, 2), 
        'utf-8'
      );

      // Update registry metadata
      await this.updateAgentCount();
    } catch (error) {
      throw new Error(`Failed to save agent ${agent.id}: ${error}`);
    }
  }

  /**
   * Load agent configuration from file
   */
  async loadAgent(agentId: string, category: 'built-in' | 'custom'): Promise<AgentConfig | null> {
    const filePath = this.getAgentFilePath(agentId, category);
    
    try {
      if (!await this.fileExists(filePath)) {
        return null;
      }

      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as AgentConfig;
    } catch (error) {
      console.warn(`Failed to load agent ${agentId}: ${error}`);
      return null;
    }
  }

  /**
   * Load all agents from both built-in and custom directories
   */
  async loadAllAgents(): Promise<AgentConfig[]> {
    const agents: AgentConfig[] = [];

    try {
      // Load built-in agents
      const builtInFiles = await this.listAgentFiles(this.builtInPath);
      for (const file of builtInFiles) {
        const agentId = this.extractAgentIdFromFilename(file);
        const agent = await this.loadAgent(agentId, 'built-in');
        if (agent) {
          agents.push(agent);
        }
      }

      // Load custom agents
      const customFiles = await this.listAgentFiles(this.customPath);
      for (const file of customFiles) {
        const agentId = this.extractAgentIdFromFilename(file);
        const agent = await this.loadAgent(agentId, 'custom');
        if (agent) {
          agents.push(agent);
        }
      }
    } catch (error) {
      throw new Error(`Failed to load agents: ${error}`);
    }

    return agents;
  }

  /**
   * Delete agent configuration
   */
  async deleteAgent(agentId: string, category: 'built-in' | 'custom'): Promise<void> {
    if (category === 'built-in') {
      throw new Error('Cannot delete built-in agents');
    }

    const filePath = this.getAgentFilePath(agentId, category);
    
    try {
      if (await this.fileExists(filePath)) {
        await fs.unlink(filePath);
        await this.updateAgentCount();
      }
    } catch (error) {
      throw new Error(`Failed to delete agent ${agentId}: ${error}`);
    }
  }

  /**
   * Set the currently active agent
   */
  async setActiveAgent(agentId: string): Promise<void> {
    try {
      const activeAgentData = {
        agentId,
        activatedAt: new Date().toISOString(),
      };

      await fs.writeFile(
        this.activeAgentFile,
        JSON.stringify(activeAgentData, null, 2),
        'utf-8'
      );

      // Update registry metadata
      const metadata = await this.readRegistryMetadata();
      metadata.activeAgent = agentId;
      metadata.lastUpdated = new Date().toISOString();
      await this.writeRegistryMetadata(metadata);
    } catch (error) {
      throw new Error(`Failed to set active agent: ${error}`);
    }
  }

  /**
   * Get the currently active agent
   */
  async getActiveAgent(): Promise<string | null> {
    try {
      if (!await this.fileExists(this.activeAgentFile)) {
        return null;
      }

      const content = await fs.readFile(this.activeAgentFile, 'utf-8');
      const data = JSON.parse(content);
      return data.agentId || null;
    } catch (error) {
      console.warn(`Failed to get active agent: ${error}`);
      return null;
    }
  }

  /**
   * Read registry metadata
   */
  async readRegistryMetadata(): Promise<AgentRegistryMetadata> {
    try {
      const content = await fs.readFile(this.registryMetadataFile, 'utf-8');
      return JSON.parse(content) as AgentRegistryMetadata;
    } catch (error) {
      // Return default metadata if file doesn't exist or is corrupted
      return {
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        activeAgent: null,
        agentCount: {
          builtIn: 0,
          custom: 0,
        },
      };
    }
  }

  /**
   * Write registry metadata
   */
  private async writeRegistryMetadata(metadata: AgentRegistryMetadata): Promise<void> {
    await fs.writeFile(
      this.registryMetadataFile,
      JSON.stringify(metadata, null, 2),
      'utf-8'
    );
  }

  /**
   * Update agent count in metadata
   */
  private async updateAgentCount(): Promise<void> {
    try {
      const builtInFiles = await this.listAgentFiles(this.builtInPath);
      const customFiles = await this.listAgentFiles(this.customPath);
      
      const metadata = await this.readRegistryMetadata();
      metadata.agentCount.builtIn = builtInFiles.length;
      metadata.agentCount.custom = customFiles.length;
      metadata.lastUpdated = new Date().toISOString();
      
      await this.writeRegistryMetadata(metadata);
    } catch (error) {
      console.warn(`Failed to update agent count: ${error}`);
    }
  }

  /**
   * Get file path for agent
   */
  private getAgentFilePath(agentId: string, category: 'built-in' | 'custom'): string {
    const basePath = category === 'built-in' ? this.builtInPath : this.customPath;
    return join(basePath, `${agentId}.json`);
  }

  /**
   * List agent files in directory
   */
  private async listAgentFiles(directory: string): Promise<string[]> {
    try {
      const files = await fs.readdir(directory);
      return files.filter(file => file.endsWith('.json'));
    } catch (error) {
      return [];
    }
  }

  /**
   * Extract agent ID from filename
   */
  private extractAgentIdFromFilename(filename: string): string {
    return filename.replace('.json', '');
  }

  /**
   * Check if file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
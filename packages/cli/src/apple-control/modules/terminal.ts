/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { ActionDefinition, ActionContext, ActionCategory } from '../core/action-registry.js';
import { AppleScriptEngine, PermissionLevel, AppleScriptResult } from '../core/applescript-engine.js';

/**
 * Terminal Manager - Handles Terminal app control and Docker operations
 */
export class TerminalManager {
  /**
   * Open a new terminal tab
   */
  static async newTab(command?: string): Promise<AppleScriptResult> {
    const commandToRun = command ? `do script "${command.replace(/"/g, '\\"')}"` : 'do script ""';
    
    const script = `
      tell application "Terminal"
        activate
        ${commandToRun} in (make new tab at end of tabs of window 1)
      end tell
    `;

    return await AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.SAFE_WRITE,
      timeout: 5000
    });
  }

  /**
   * Open a new terminal window
   */
  static async newWindow(command?: string): Promise<AppleScriptResult> {
    const commandToRun = command ? `do script "${command.replace(/"/g, '\\"')}"` : 'do script ""';
    
    const script = `
      tell application "Terminal"
        activate
        ${commandToRun}
      end tell
    `;

    return await AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.SAFE_WRITE,
      timeout: 5000
    });
  }

  /**
   * Run a command in the front terminal
   */
  static async runCommand(command: string): Promise<AppleScriptResult> {
    const script = `
      tell application "Terminal"
        activate
        do script "${command.replace(/"/g, '\\"')}" in front window
      end tell
    `;

    return await AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.SAFE_WRITE,
      timeout: 10000
    });
  }

  /**
   * Get list of terminal tabs and their processes
   */
  static async listTabs(): Promise<AppleScriptResult> {
    const script = `
      tell application "Terminal"
        set tabInfo to {}
        set windowCount to count of windows
        
        repeat with i from 1 to windowCount
          set currentWindow to window i
          set tabCount to count of tabs of currentWindow
          
          repeat with j from 1 to tabCount
            set currentTab to tab j of currentWindow
            set tabName to name of currentTab
            set tabBusy to busy of currentTab
            set tabProcess to processes of currentTab as string
            
            set end of tabInfo to ("Window " & i & " Tab " & j & ": " & tabName & " | Busy: " & tabBusy & " | Processes: " & tabProcess)
          end repeat
        end repeat
        
        set AppleScript's text item delimiters to "\\n"
        set tabList to tabInfo as string
        set AppleScript's text item delimiters to ""
        
        return "Terminal Tabs Overview:\\n" & tabList
      end tell
    `;

    return await AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.READ_ONLY,
      timeout: 8000
    });
  }

  /**
   * Close a terminal tab or window
   */
  static async closeTab(windowIndex: number = 1, tabIndex?: number): Promise<AppleScriptResult> {
    let script: string;
    
    if (tabIndex) {
      script = `
        tell application "Terminal"
          close tab ${tabIndex} of window ${windowIndex}
        end tell
      `;
    } else {
      script = `
        tell application "Terminal"
          close window ${windowIndex}
        end tell
      `;
    }

    return await AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.SAFE_WRITE,
      timeout: 3000
    });
  }
}

/**
 * Docker Manager - Handles Docker operations via Terminal commands
 */
export class DockerManager {
  /**
   * List Docker containers
   */
  static async listContainers(all: boolean = false): Promise<AppleScriptResult> {
    const allFlag = all ? '-a' : '';
    const command = `docker ps ${allFlag} --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}\\t{{.Image}}"`;
    
    const script = `
      tell application "Terminal"
        activate
        set dockerOutput to do shell script "${command}"
        return "Docker Containers:\\n" & dockerOutput
      end tell
    `;

    return await AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.READ_ONLY,
      timeout: 10000
    });
  }

  /**
   * Create and run a Docker container
   */
  static async createContainer(
    image: string, 
    name?: string, 
    ports?: string, 
    env?: Record<string, string>,
    volumes?: string[],
    detached: boolean = true
  ): Promise<AppleScriptResult> {
    let dockerCommand = 'docker run';
    
    if (detached) dockerCommand += ' -d';
    if (name) dockerCommand += ` --name ${name}`;
    if (ports) dockerCommand += ` -p ${ports}`;
    
    // Add environment variables
    if (env) {
      Object.entries(env).forEach(([key, value]) => {
        dockerCommand += ` -e ${key}="${value}"`;
      });
    }
    
    // Add volume mounts
    if (volumes && volumes.length > 0) {
      volumes.forEach(volume => {
        dockerCommand += ` -v ${volume}`;
      });
    }
    
    dockerCommand += ` ${image}`;
    
    const script = `
      tell application "Terminal"
        activate
        set dockerResult to do shell script "${dockerCommand}"
        return "Docker Container Created:\\n" & dockerResult
      end tell
    `;

    return await AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.FULL_ACCESS,
      timeout: 30000
    });
  }

  /**
   * Start a Docker container
   */
  static async startContainer(containerName: string): Promise<AppleScriptResult> {
    const command = `docker start ${containerName}`;
    
    const script = `
      tell application "Terminal"
        activate
        set dockerOutput to do shell script "${command}"
        return "Docker Container Started:\\n" & dockerOutput
      end tell
    `;

    return await AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.SAFE_WRITE,
      timeout: 15000
    });
  }

  /**
   * Stop a Docker container
   */
  static async stopContainer(containerName: string): Promise<AppleScriptResult> {
    const command = `docker stop ${containerName}`;
    
    const script = `
      tell application "Terminal"
        activate
        set dockerOutput to do shell script "${command}"
        return "Docker Container Stopped:\\n" & dockerOutput
      end tell
    `;

    return await AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.SAFE_WRITE,
      timeout: 15000
    });
  }

  /**
   * Remove a Docker container
   */
  static async removeContainer(containerName: string, force: boolean = false): Promise<AppleScriptResult> {
    const forceFlag = force ? ' -f' : '';
    const command = `docker rm${forceFlag} ${containerName}`;
    
    const script = `
      tell application "Terminal"
        activate
        set dockerOutput to do shell script "${command}"
        return "Docker Container Removed:\\n" & dockerOutput
      end tell
    `;

    return await AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.FULL_ACCESS,
      timeout: 10000
    });
  }

  /**
   * List Docker images
   */
  static async listImages(): Promise<AppleScriptResult> {
    const command = 'docker images --format "table {{.Repository}}\\t{{.Tag}}\\t{{.Size}}\\t{{.CreatedSince}}"';
    
    const script = `
      tell application "Terminal"
        activate
        set dockerOutput to do shell script "${command}"
        return "Docker Images:\\n" & dockerOutput
      end tell
    `;

    return await AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.READ_ONLY,
      timeout: 10000
    });
  }

  /**
   * Build a Docker image
   */
  static async buildImage(dockerfilePath: string, tag: string, buildArgs?: Record<string, string>): Promise<AppleScriptResult> {
    let dockerCommand = `docker build -t ${tag}`;
    
    // Add build arguments
    if (buildArgs) {
      Object.entries(buildArgs).forEach(([key, value]) => {
        dockerCommand += ` --build-arg ${key}="${value}"`;
      });
    }
    
    dockerCommand += ` ${dockerfilePath}`;
    
    const script = `
      tell application "Terminal"
        activate
        set dockerOutput to do shell script "${dockerCommand}"
        return "Docker Image Built:\\n" & dockerOutput
      end tell
    `;

    return await AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.FULL_ACCESS,
      timeout: 300000 // 5 minutes for build operations
    });
  }

  /**
   * Get Docker system information
   */
  static async getDockerInfo(): Promise<AppleScriptResult> {
    const command = 'docker system df && echo "\\n--- Docker Version ---" && docker version --format "{{.Server.Version}}"';
    
    const script = `
      tell application "Terminal"
        activate
        set dockerOutput to do shell script "${command}"
        return "Docker System Information:\\n" & dockerOutput
      end tell
    `;

    return await AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.READ_ONLY,
      timeout: 8000
    });
  }
}

/**
 * Register Terminal and Docker actions
 */
export function registerTerminalActions(): ActionDefinition[] {
  return [
    // === TERMINAL ACTIONS ===
    {
      id: 'terminal:new-tab',
      name: 'New Terminal Tab',
      description: 'Open a new terminal tab, optionally with a command to execute',
      category: ActionCategory.TERMINAL,
      permissionLevel: PermissionLevel.SAFE_WRITE,
      parameters: [
        {
          name: 'command',
          type: 'string',
          required: false,
          description: 'Optional command to run in the new tab'
        }
      ],
      examples: [
        {
          description: 'Open new terminal tab',
          input: 'terminal:new-tab',
          expectedBehavior: 'Opens a new terminal tab'
        },
        {
          description: 'Open tab with command',
          input: 'terminal:new-tab command="npm start"',
          expectedBehavior: 'Opens new tab and runs npm start'
        }
      ],
      execute: async (context: ActionContext) => {
        const { command } = context.parameters;
        return await TerminalManager.newTab(command);
      }
    },

    {
      id: 'terminal:new-window',
      name: 'New Terminal Window',
      description: 'Open a new terminal window, optionally with a command to execute',
      category: ActionCategory.TERMINAL,
      permissionLevel: PermissionLevel.SAFE_WRITE,
      parameters: [
        {
          name: 'command',
          type: 'string',
          required: false,
          description: 'Optional command to run in the new window'
        }
      ],
      examples: [
        {
          description: 'Open new terminal window',
          input: 'terminal:new-window',
          expectedBehavior: 'Opens a new terminal window'
        },
        {
          description: 'Open window with development server',
          input: 'terminal:new-window command="cd ~/project && npm run dev"',
          expectedBehavior: 'Opens new window and starts development server'
        }
      ],
      execute: async (context: ActionContext) => {
        const { command } = context.parameters;
        return await TerminalManager.newWindow(command);
      }
    },

    {
      id: 'terminal:run-command',
      name: 'Run Terminal Command',
      description: 'Execute a command in the front terminal window',
      category: ActionCategory.TERMINAL,
      permissionLevel: PermissionLevel.SAFE_WRITE,
      parameters: [
        {
          name: 'command',
          type: 'string',
          required: true,
          description: 'Command to execute in the terminal'
        }
      ],
      examples: [
        {
          description: 'List files',
          input: 'terminal:run-command command="ls -la"',
          expectedBehavior: 'Runs ls -la in the front terminal'
        },
        {
          description: 'Git status',
          input: 'terminal:run-command command="git status"',
          expectedBehavior: 'Shows git repository status'
        }
      ],
      execute: async (context: ActionContext) => {
        const { command } = context.parameters;
        
        if (!command) {
          return {
            success: false,
            output: '',
            error: 'Missing required parameter: command is required',
            executionTime: 0
          };
        }
        
        return await TerminalManager.runCommand(command);
      }
    },

    {
      id: 'terminal:list-tabs',
      name: 'List Terminal Tabs',
      description: 'Show all terminal windows and tabs with their current status',
      category: ActionCategory.TERMINAL,
      permissionLevel: PermissionLevel.READ_ONLY,
      parameters: [],
      examples: [
        {
          description: 'List all terminal tabs',
          input: 'terminal:list-tabs',
          expectedBehavior: 'Shows all terminal windows and tabs with processes'
        }
      ],
      execute: async (context: ActionContext) => {
        return await TerminalManager.listTabs();
      }
    },

    {
      id: 'terminal:close-tab',
      name: 'Close Terminal Tab',
      description: 'Close a specific terminal tab or window',
      category: ActionCategory.TERMINAL,
      permissionLevel: PermissionLevel.SAFE_WRITE,
      parameters: [
        {
          name: 'windowIndex',
          type: 'number',
          required: false,
          description: 'Window number (default: 1)',
          defaultValue: 1
        },
        {
          name: 'tabIndex',
          type: 'number',
          required: false,
          description: 'Tab number within window (if not specified, closes whole window)'
        }
      ],
      examples: [
        {
          description: 'Close specific tab',
          input: 'terminal:close-tab windowIndex=1 tabIndex=2',
          expectedBehavior: 'Closes tab 2 in window 1'
        },
        {
          description: 'Close entire window',
          input: 'terminal:close-tab windowIndex=1',
          expectedBehavior: 'Closes window 1 entirely'
        }
      ],
      execute: async (context: ActionContext) => {
        const { windowIndex = 1, tabIndex } = context.parameters;
        return await TerminalManager.closeTab(windowIndex, tabIndex);
      }
    },

    // === DOCKER ACTIONS ===
    {
      id: 'docker:list-containers',
      name: 'List Docker Containers',
      description: 'List all Docker containers (running or all containers)',
      category: ActionCategory.DOCKER,
      permissionLevel: PermissionLevel.READ_ONLY,
      parameters: [
        {
          name: 'all',
          type: 'boolean',
          required: false,
          description: 'Show all containers (including stopped ones)',
          defaultValue: false
        }
      ],
      examples: [
        {
          description: 'List running containers',
          input: 'docker:list-containers',
          expectedBehavior: 'Shows all currently running Docker containers'
        },
        {
          description: 'List all containers',
          input: 'docker:list-containers all=true',
          expectedBehavior: 'Shows all Docker containers including stopped ones'
        }
      ],
      execute: async (context: ActionContext) => {
        const { all = false } = context.parameters;
        return await DockerManager.listContainers(all);
      }
    },

    {
      id: 'docker:create-container',
      name: 'Create Docker Container',
      description: 'Create and run a new Docker container with specified configuration',
      category: ActionCategory.DOCKER,
      permissionLevel: PermissionLevel.FULL_ACCESS,
      parameters: [
        {
          name: 'image',
          type: 'string',
          required: true,
          description: 'Docker image name (e.g., "nginx:latest")'
        },
        {
          name: 'name',
          type: 'string',
          required: false,
          description: 'Container name'
        },
        {
          name: 'ports',
          type: 'string',
          required: false,
          description: 'Port mapping (e.g., "8080:80")'
        },
        {
          name: 'detached',
          type: 'boolean',
          required: false,
          description: 'Run in detached mode',
          defaultValue: true
        }
      ],
      examples: [
        {
          description: 'Create Nginx container',
          input: 'docker:create-container image="nginx:latest" name="web-server" ports="8080:80"',
          expectedBehavior: 'Creates and starts an Nginx container accessible on port 8080'
        },
        {
          description: 'Create Redis container',
          input: 'docker:create-container image="redis:alpine" name="cache-server"',
          expectedBehavior: 'Creates and starts a Redis container'
        }
      ],
      execute: async (context: ActionContext) => {
        const { image, name, ports, detached = true } = context.parameters;
        
        if (!image) {
          return {
            success: false,
            output: '',
            error: 'Missing required parameter: image is required',
            executionTime: 0
          };
        }
        
        return await DockerManager.createContainer(image, name, ports, undefined, undefined, detached);
      }
    },

    {
      id: 'docker:start-container',
      name: 'Start Docker Container',
      description: 'Start a stopped Docker container',
      category: ActionCategory.DOCKER,
      permissionLevel: PermissionLevel.SAFE_WRITE,
      parameters: [
        {
          name: 'containerName',
          type: 'string',
          required: true,
          description: 'Name or ID of the container to start'
        }
      ],
      examples: [
        {
          description: 'Start container by name',
          input: 'docker:start-container containerName="web-server"',
          expectedBehavior: 'Starts the container named web-server'
        }
      ],
      execute: async (context: ActionContext) => {
        const { containerName } = context.parameters;
        
        if (!containerName) {
          return {
            success: false,
            output: '',
            error: 'Missing required parameter: containerName is required',
            executionTime: 0
          };
        }
        
        return await DockerManager.startContainer(containerName);
      }
    },

    {
      id: 'docker:stop-container',
      name: 'Stop Docker Container',
      description: 'Stop a running Docker container',
      category: ActionCategory.DOCKER,
      permissionLevel: PermissionLevel.SAFE_WRITE,
      parameters: [
        {
          name: 'containerName',
          type: 'string',
          required: true,
          description: 'Name or ID of the container to stop'
        }
      ],
      examples: [
        {
          description: 'Stop container by name',
          input: 'docker:stop-container containerName="web-server"',
          expectedBehavior: 'Stops the container named web-server'
        }
      ],
      execute: async (context: ActionContext) => {
        const { containerName } = context.parameters;
        
        if (!containerName) {
          return {
            success: false,
            output: '',
            error: 'Missing required parameter: containerName is required',
            executionTime: 0
          };
        }
        
        return await DockerManager.stopContainer(containerName);
      }
    },

    {
      id: 'docker:remove-container',
      name: 'Remove Docker Container',
      description: 'Remove a Docker container (container must be stopped first unless forced)',
      category: ActionCategory.DOCKER,
      permissionLevel: PermissionLevel.FULL_ACCESS,
      parameters: [
        {
          name: 'containerName',
          type: 'string',
          required: true,
          description: 'Name or ID of the container to remove'
        },
        {
          name: 'force',
          type: 'boolean',
          required: false,
          description: 'Force removal (stops and removes running containers)',
          defaultValue: false
        }
      ],
      examples: [
        {
          description: 'Remove stopped container',
          input: 'docker:remove-container containerName="old-container"',
          expectedBehavior: 'Removes the stopped container'
        },
        {
          description: 'Force remove running container',
          input: 'docker:remove-container containerName="running-container" force=true',
          expectedBehavior: 'Stops and removes the running container'
        }
      ],
      execute: async (context: ActionContext) => {
        const { containerName, force = false } = context.parameters;
        
        if (!containerName) {
          return {
            success: false,
            output: '',
            error: 'Missing required parameter: containerName is required',
            executionTime: 0
          };
        }
        
        return await DockerManager.removeContainer(containerName, force);
      }
    },

    {
      id: 'docker:list-images',
      name: 'List Docker Images',
      description: 'List all Docker images on the system',
      category: ActionCategory.DOCKER,
      permissionLevel: PermissionLevel.READ_ONLY,
      parameters: [],
      examples: [
        {
          description: 'List all Docker images',
          input: 'docker:list-images',
          expectedBehavior: 'Shows all Docker images with repository, tag, and size'
        }
      ],
      execute: async (context: ActionContext) => {
        return await DockerManager.listImages();
      }
    },

    {
      id: 'docker:system-info',
      name: 'Docker System Info',
      description: 'Get Docker system information and disk usage',
      category: ActionCategory.DOCKER,
      permissionLevel: PermissionLevel.READ_ONLY,
      parameters: [],
      examples: [
        {
          description: 'Get Docker system information',
          input: 'docker:system-info',
          expectedBehavior: 'Shows Docker disk usage and version information'
        }
      ],
      execute: async (context: ActionContext) => {
        return await DockerManager.getDockerInfo();
      }
    }
  ];
}
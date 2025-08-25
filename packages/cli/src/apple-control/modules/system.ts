/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { ActionDefinition, ActionContext, ActionCategory } from '../core/action-registry.js';
import { AppleScriptEngine, PermissionLevel, AppleScriptResult } from '../core/applescript-engine.js';

/**
 * Application Manager - Handles app control operations
 */
export class ApplicationManager {
  /**
   * Open an application
   */
  static async openApp(appName: string): Promise<AppleScriptResult> {
    const script = `
      tell application "${appName}"
        activate
      end tell
      return "Application '${appName}' opened successfully"
    `;

    return await AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.SAFE_WRITE,
      timeout: 10000
    });
  }

  /**
   * Quit an application
   */
  static async quitApp(appName: string, force: boolean = false): Promise<AppleScriptResult> {
    const quitCommand = force ? 'quit without saving' : 'quit';
    
    const script = `
      tell application "${appName}"
        ${quitCommand}
      end tell
      return "Application '${appName}' quit successfully"
    `;

    return await AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.SAFE_WRITE,
      timeout: 8000
    });
  }

  /**
   * List running applications
   */
  static async listApps(): Promise<AppleScriptResult> {
    const script = `
      tell application "System Events"
        set runningApps to {}
        repeat with proc in application processes
          if background only of proc is false then
            set processName to name of proc as string
            set processVisible to visible of proc as string
            set end of runningApps to (processName & " | Visible: " & processVisible)
          end if
        end repeat
        
        set AppleScript's text item delimiters to "\\n"
        set appList to runningApps as string
        set AppleScript's text item delimiters to ""
        
        return "Running Applications:\\n" & appList
      end tell
    `;

    return await AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.READ_ONLY,
      timeout: 8000
    });
  }

  /**
   * Get application status
   */
  static async getAppStatus(appName: string): Promise<AppleScriptResult> {
    const script = `
      tell application "System Events"
        if exists application process "${appName}" then
          set appProcess to application process "${appName}"
          set isVisible to visible of appProcess
          set isFrontmost to frontmost of appProcess
          set windowCount to count of windows of appProcess
          
          return "Application '${appName}' Status:\\nRunning: Yes\\nVisible: " & isVisible & "\\nFrontmost: " & isFrontmost & "\\nWindows: " & windowCount
        else
          return "Application '${appName}' is not currently running"
        end if
      end tell
    `;

    return await AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.READ_ONLY,
      timeout: 5000
    });
  }

  /**
   * Switch to/focus an application
   */
  static async switchToApp(appName: string): Promise<AppleScriptResult> {
    const script = `
      tell application "System Events"
        if exists application process "${appName}" then
          tell application process "${appName}"
            set frontmost to true
          end tell
          return "Switched to application '${appName}'"
        else
          return "Application '${appName}' is not running"
        end if
      end tell
    `;

    return await AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.SAFE_WRITE,
      timeout: 5000
    });
  }
}

/**
 * Volume Manager - Handles system volume control
 */
export class VolumeManager {
  /**
   * Set system volume level
   */
  static async setVolume(level: number): Promise<AppleScriptResult> {
    // Ensure volume is between 0 and 100
    const volumeLevel = Math.max(0, Math.min(100, level));
    
    const script = `
      set volume output volume ${volumeLevel}
      return "System volume set to ${volumeLevel}%"
    `;

    return await AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.SAFE_WRITE,
      timeout: 3000
    });
  }

  /**
   * Get current volume level
   */
  static async getVolume(): Promise<AppleScriptResult> {
    const script = `
      set currentVolume to output volume of (get volume settings)
      return "Current system volume: " & currentVolume & "%"
    `;

    return await AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.READ_ONLY,
      timeout: 3000
    });
  }

  /**
   * Mute system volume
   */
  static async mute(): Promise<AppleScriptResult> {
    const script = `
      set volume output muted true
      return "System volume muted"
    `;

    return await AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.SAFE_WRITE,
      timeout: 3000
    });
  }

  /**
   * Unmute system volume
   */
  static async unmute(): Promise<AppleScriptResult> {
    const script = `
      set volume output muted false
      return "System volume unmuted"
    `;

    return await AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.SAFE_WRITE,
      timeout: 3000
    });
  }

  /**
   * Toggle mute status
   */
  static async toggleMute(): Promise<AppleScriptResult> {
    const script = `
      set currentSettings to get volume settings
      set currentMuted to output muted of currentSettings
      
      if currentMuted then
        set volume output muted false
        return "System volume unmuted"
      else
        set volume output muted true  
        return "System volume muted"
      end if
    `;

    return await AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.SAFE_WRITE,
      timeout: 3000
    });
  }
}

/**
 * Finder Manager - Handles Finder operations
 */
export class FinderManager {
  /**
   * Open a folder in Finder
   */
  static async openFolder(folderPath: string): Promise<AppleScriptResult> {
    const script = `
      tell application "Finder"
        activate
        open folder POSIX file "${folderPath}"
      end tell
      return "Opened folder: ${folderPath}"
    `;

    return await AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.SAFE_WRITE,
      timeout: 5000
    });
  }

  /**
   * Create a new folder
   */
  static async createFolder(parentPath: string, folderName: string): Promise<AppleScriptResult> {
    const script = `
      tell application "Finder"
        activate
        set parentFolder to folder POSIX file "${parentPath}"
        make new folder at parentFolder with properties {name:"${folderName}"}
      end tell
      return "Created folder '${folderName}' in ${parentPath}"
    `;

    return await AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.SAFE_WRITE,
      timeout: 5000
    });
  }

  /**
   * Move items to trash
   */
  static async moveToTrash(itemPath: string): Promise<AppleScriptResult> {
    const script = `
      tell application "Finder"
        set itemToTrash to POSIX file "${itemPath}"
        move itemToTrash to trash
      end tell
      return "Moved item to trash: ${itemPath}"
    `;

    return await AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.FULL_ACCESS,
      timeout: 8000
    });
  }

  /**
   * Get desktop items
   */
  static async getDesktopItems(): Promise<AppleScriptResult> {
    const script = `
      tell application "Finder"
        set desktopItems to {}
        set desktopFolder to desktop
        
        repeat with item in every item of desktopFolder
          set itemName to name of item as string
          set itemKind to kind of item as string
          set end of desktopItems to (itemName & " (" & itemKind & ")")
        end repeat
        
        set AppleScript's text item delimiters to "\\n"
        set itemList to desktopItems as string
        set AppleScript's text item delimiters to ""
        
        return "Desktop Items:\\n" & itemList
      end tell
    `;

    return await AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.READ_ONLY,
      timeout: 8000
    });
  }

  /**
   * Get current Finder selection
   */
  static async getSelection(): Promise<AppleScriptResult> {
    const script = `
      tell application "Finder"
        set selectedItems to selection
        if selectedItems is {} then
          return "No items selected in Finder"
        else
          set itemNames to {}
          repeat with item in selectedItems
            set itemName to name of item as string
            set itemPath to POSIX path of (item as alias)
            set end of itemNames to (itemName & " | " & itemPath)
          end repeat
          
          set AppleScript's text item delimiters to "\\n"
          set selectionList to itemNames as string
          set AppleScript's text item delimiters to ""
          
          return "Finder Selection:\\n" & selectionList
        end if
      end tell
    `;

    return await AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.READ_ONLY,
      timeout: 5000
    });
  }
}

/**
 * Messages Manager - Handles Messages app integration
 */
export class MessagesManager {
  /**
   * Send a message (requires Messages app setup)
   */
  static async sendMessage(recipient: string, messageText: string): Promise<AppleScriptResult> {
    const script = `
      tell application "Messages"
        set targetService to 1st account whose account type = iMessage
        set targetBuddy to participant "${recipient}" of targetService
        send "${messageText}" to targetBuddy
      end tell
      return "Message sent to ${recipient}: ${messageText}"
    `;

    return await AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.FULL_ACCESS,
      timeout: 10000
    });
  }

  /**
   * Get recent messages
   */
  static async getRecentMessages(count: number = 5): Promise<AppleScriptResult> {
    const script = `
      tell application "Messages"
        set recentChats to {}
        set chatCount to count of chats
        
        repeat with i from 1 to (chatCount)
          if i > ${count} then exit repeat
          
          set currentChat to chat i
          set chatName to name of currentChat
          set lastMessage to text of last text of currentChat
          set messageDate to time sent of last text of currentChat
          
          set end of recentChats to ("Chat: " & chatName & "\\nLast Message: " & lastMessage & "\\nDate: " & messageDate & "\\n---")
        end repeat
        
        set AppleScript's text item delimiters to "\\n"
        set chatList to recentChats as string
        set AppleScript's text item delimiters to ""
        
        return "Recent Messages:\\n" & chatList
      end tell
    `;

    return await AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.READ_ONLY,
      timeout: 10000
    });
  }
}

/**
 * System Control Manager - Handles general system operations
 */
export class SystemControlManager {
  /**
   * Get system information
   */
  static async getSystemInfo(): Promise<AppleScriptResult> {
    const script = `
      set systemInfo to system info
      set computerName to computer name of systemInfo
      set userName to short user name of systemInfo
      set osVersion to system version of systemInfo
      set cpuType to CPU type of systemInfo
      set physicalMemory to physical memory of systemInfo
      
      set memoryGB to round (physicalMemory / 1073741824)
      
      return "System Information:\\n" & ¬
             "Computer Name: " & computerName & "\\n" & ¬
             "User: " & userName & "\\n" & ¬
             "macOS Version: " & osVersion & "\\n" & ¬
             "CPU Type: " & cpuType & "\\n" & ¬
             "Physical Memory: " & memoryGB & " GB"
    `;

    return await AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.READ_ONLY,
      timeout: 5000
    });
  }

  /**
   * Lock the screen
   */
  static async lockScreen(): Promise<AppleScriptResult> {
    const script = `
      tell application "System Events"
        keystroke "q" using {control down, command down}
      end tell
      return "Screen locked"
    `;

    return await AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.FULL_ACCESS,
      timeout: 3000
    });
  }

  /**
   * Show notification
   */
  static async showNotification(title: string, subtitle?: string, sound?: string): Promise<AppleScriptResult> {
    let notificationScript = `display notification "${title}"`;
    
    if (subtitle) {
      notificationScript += ` with title "${subtitle}"`;
    }
    
    if (sound) {
      notificationScript += ` sound name "${sound}"`;
    }
    
    const script = `
      ${notificationScript}
      return "Notification displayed: ${title}"
    `;

    return await AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.SAFE_WRITE,
      timeout: 5000
    });
  }
}

/**
 * Register System Control actions
 */
export function registerSystemActions(): ActionDefinition[] {
  return [
    // === APPLICATION CONTROL ACTIONS ===
    {
      id: 'system:open-app',
      name: 'Open Application',
      description: 'Open and activate a Mac application',
      category: ActionCategory.SYSTEM,
      permissionLevel: PermissionLevel.SAFE_WRITE,
      parameters: [
        {
          name: 'appName',
          type: 'string',
          required: true,
          description: 'Name of the application to open (e.g., "Safari", "Xcode")'
        }
      ],
      examples: [
        {
          description: 'Open Safari browser',
          input: 'system:open-app appName="Safari"',
          expectedBehavior: 'Opens and activates Safari browser'
        },
        {
          description: 'Open VS Code',
          input: 'system:open-app appName="Visual Studio Code"',
          expectedBehavior: 'Opens and activates Visual Studio Code'
        }
      ],
      execute: async (context: ActionContext) => {
        const { appName } = context.parameters;
        
        if (!appName) {
          return {
            success: false,
            output: '',
            error: 'Missing required parameter: appName is required',
            executionTime: 0
          };
        }
        
        return await ApplicationManager.openApp(appName);
      }
    },

    {
      id: 'system:quit-app',
      name: 'Quit Application',
      description: 'Quit a running Mac application',
      category: ActionCategory.SYSTEM,
      permissionLevel: PermissionLevel.SAFE_WRITE,
      parameters: [
        {
          name: 'appName',
          type: 'string',
          required: true,
          description: 'Name of the application to quit'
        },
        {
          name: 'force',
          type: 'boolean',
          required: false,
          description: 'Force quit without saving',
          defaultValue: false
        }
      ],
      examples: [
        {
          description: 'Quit Safari normally',
          input: 'system:quit-app appName="Safari"',
          expectedBehavior: 'Safely quits Safari with save prompts'
        },
        {
          description: 'Force quit unresponsive app',
          input: 'system:quit-app appName="TextEdit" force=true',
          expectedBehavior: 'Force quits TextEdit without saving'
        }
      ],
      execute: async (context: ActionContext) => {
        const { appName, force = false } = context.parameters;
        
        if (!appName) {
          return {
            success: false,
            output: '',
            error: 'Missing required parameter: appName is required',
            executionTime: 0
          };
        }
        
        return await ApplicationManager.quitApp(appName, force);
      }
    },

    {
      id: 'system:list-apps',
      name: 'List Running Applications',
      description: 'Show all currently running applications with their visibility status',
      category: ActionCategory.SYSTEM,
      permissionLevel: PermissionLevel.READ_ONLY,
      parameters: [],
      examples: [
        {
          description: 'List all running apps',
          input: 'system:list-apps',
          expectedBehavior: 'Shows all running applications with visibility status'
        }
      ],
      execute: async (context: ActionContext) => {
        return await ApplicationManager.listApps();
      }
    },

    {
      id: 'system:app-status',
      name: 'Get Application Status',
      description: 'Get detailed status information for a specific application',
      category: ActionCategory.SYSTEM,
      permissionLevel: PermissionLevel.READ_ONLY,
      parameters: [
        {
          name: 'appName',
          type: 'string',
          required: true,
          description: 'Name of the application to check'
        }
      ],
      examples: [
        {
          description: 'Check Safari status',
          input: 'system:app-status appName="Safari"',
          expectedBehavior: 'Shows Safari running status, visibility, and window count'
        }
      ],
      execute: async (context: ActionContext) => {
        const { appName } = context.parameters;
        
        if (!appName) {
          return {
            success: false,
            output: '',
            error: 'Missing required parameter: appName is required',
            executionTime: 0
          };
        }
        
        return await ApplicationManager.getAppStatus(appName);
      }
    },

    {
      id: 'system:switch-to-app',
      name: 'Switch to Application',
      description: 'Bring an application to the foreground (focus/activate it)',
      category: ActionCategory.SYSTEM,
      permissionLevel: PermissionLevel.SAFE_WRITE,
      parameters: [
        {
          name: 'appName',
          type: 'string',
          required: true,
          description: 'Name of the application to switch to'
        }
      ],
      examples: [
        {
          description: 'Switch to Terminal',
          input: 'system:switch-to-app appName="Terminal"',
          expectedBehavior: 'Brings Terminal to foreground if running'
        }
      ],
      execute: async (context: ActionContext) => {
        const { appName } = context.parameters;
        
        if (!appName) {
          return {
            success: false,
            output: '',
            error: 'Missing required parameter: appName is required',
            executionTime: 0
          };
        }
        
        return await ApplicationManager.switchToApp(appName);
      }
    },

    // === VOLUME CONTROL ACTIONS ===
    {
      id: 'system:set-volume',
      name: 'Set System Volume',
      description: 'Set the system volume to a specific level (0-100)',
      category: ActionCategory.SYSTEM,
      permissionLevel: PermissionLevel.SAFE_WRITE,
      parameters: [
        {
          name: 'level',
          type: 'number',
          required: true,
          description: 'Volume level from 0 to 100'
        }
      ],
      examples: [
        {
          description: 'Set volume to 50%',
          input: 'system:set-volume level=50',
          expectedBehavior: 'Sets system volume to 50%'
        },
        {
          description: 'Set volume to maximum',
          input: 'system:set-volume level=100',
          expectedBehavior: 'Sets system volume to 100%'
        }
      ],
      execute: async (context: ActionContext) => {
        const { level } = context.parameters;
        
        if (level === undefined || level === null) {
          return {
            success: false,
            output: '',
            error: 'Missing required parameter: level is required',
            executionTime: 0
          };
        }
        
        return await VolumeManager.setVolume(level);
      }
    },

    {
      id: 'system:get-volume',
      name: 'Get System Volume',
      description: 'Get the current system volume level',
      category: ActionCategory.SYSTEM,
      permissionLevel: PermissionLevel.READ_ONLY,
      parameters: [],
      examples: [
        {
          description: 'Check current volume',
          input: 'system:get-volume',
          expectedBehavior: 'Shows current system volume percentage'
        }
      ],
      execute: async (context: ActionContext) => {
        return await VolumeManager.getVolume();
      }
    },

    {
      id: 'system:toggle-mute',
      name: 'Toggle System Mute',
      description: 'Toggle the system mute status (mute if unmuted, unmute if muted)',
      category: ActionCategory.SYSTEM,
      permissionLevel: PermissionLevel.SAFE_WRITE,
      parameters: [],
      examples: [
        {
          description: 'Toggle mute status',
          input: 'system:toggle-mute',
          expectedBehavior: 'Mutes system if unmuted, unmutes if muted'
        }
      ],
      execute: async (context: ActionContext) => {
        return await VolumeManager.toggleMute();
      }
    },

    // === FINDER OPERATIONS ===
    {
      id: 'system:open-folder',
      name: 'Open Folder in Finder',
      description: 'Open a specific folder in Finder',
      category: ActionCategory.SYSTEM,
      permissionLevel: PermissionLevel.SAFE_WRITE,
      parameters: [
        {
          name: 'folderPath',
          type: 'string',
          required: true,
          description: 'Full path to the folder to open'
        }
      ],
      examples: [
        {
          description: 'Open Documents folder',
          input: 'system:open-folder folderPath="/Users/username/Documents"',
          expectedBehavior: 'Opens Documents folder in Finder'
        },
        {
          description: 'Open project folder',
          input: 'system:open-folder folderPath="/Users/username/Projects/myapp"',
          expectedBehavior: 'Opens project folder in Finder'
        }
      ],
      execute: async (context: ActionContext) => {
        const { folderPath } = context.parameters;
        
        if (!folderPath) {
          return {
            success: false,
            output: '',
            error: 'Missing required parameter: folderPath is required',
            executionTime: 0
          };
        }
        
        return await FinderManager.openFolder(folderPath);
      }
    },

    {
      id: 'system:create-folder',
      name: 'Create New Folder',
      description: 'Create a new folder in the specified location',
      category: ActionCategory.SYSTEM,
      permissionLevel: PermissionLevel.SAFE_WRITE,
      parameters: [
        {
          name: 'parentPath',
          type: 'string',
          required: true,
          description: 'Parent directory path where to create the folder'
        },
        {
          name: 'folderName',
          type: 'string',
          required: true,
          description: 'Name of the new folder to create'
        }
      ],
      examples: [
        {
          description: 'Create project folder',
          input: 'system:create-folder parentPath="/Users/username/Documents" folderName="New Project"',
          expectedBehavior: 'Creates "New Project" folder in Documents'
        }
      ],
      execute: async (context: ActionContext) => {
        const { parentPath, folderName } = context.parameters;
        
        if (!parentPath || !folderName) {
          return {
            success: false,
            output: '',
            error: 'Missing required parameters: parentPath and folderName are required',
            executionTime: 0
          };
        }
        
        return await FinderManager.createFolder(parentPath, folderName);
      }
    },

    {
      id: 'system:get-desktop-items',
      name: 'Get Desktop Items',
      description: 'List all items currently on the desktop',
      category: ActionCategory.SYSTEM,
      permissionLevel: PermissionLevel.READ_ONLY,
      parameters: [],
      examples: [
        {
          description: 'List desktop items',
          input: 'system:get-desktop-items',
          expectedBehavior: 'Shows all files and folders on the desktop'
        }
      ],
      execute: async (context: ActionContext) => {
        return await FinderManager.getDesktopItems();
      }
    },

    {
      id: 'system:get-finder-selection',
      name: 'Get Finder Selection',
      description: 'Get currently selected items in Finder',
      category: ActionCategory.SYSTEM,
      permissionLevel: PermissionLevel.READ_ONLY,
      parameters: [],
      examples: [
        {
          description: 'Get selected files',
          input: 'system:get-finder-selection',
          expectedBehavior: 'Shows currently selected items in Finder'
        }
      ],
      execute: async (context: ActionContext) => {
        return await FinderManager.getSelection();
      }
    },

    // === SYSTEM INFO AND CONTROL ===
    {
      id: 'system:get-system-info',
      name: 'Get System Information',
      description: 'Get comprehensive system information (computer name, user, OS version, memory)',
      category: ActionCategory.SYSTEM,
      permissionLevel: PermissionLevel.READ_ONLY,
      parameters: [],
      examples: [
        {
          description: 'Get system info',
          input: 'system:get-system-info',
          expectedBehavior: 'Shows computer name, user, macOS version, CPU, and memory'
        }
      ],
      execute: async (context: ActionContext) => {
        return await SystemControlManager.getSystemInfo();
      }
    },

    {
      id: 'system:show-notification',
      name: 'Show Notification',
      description: 'Display a system notification with custom title and optional subtitle',
      category: ActionCategory.SYSTEM,
      permissionLevel: PermissionLevel.SAFE_WRITE,
      parameters: [
        {
          name: 'title',
          type: 'string',
          required: true,
          description: 'Notification message text'
        },
        {
          name: 'subtitle',
          type: 'string',
          required: false,
          description: 'Optional notification title/subtitle'
        },
        {
          name: 'sound',
          type: 'string',
          required: false,
          description: 'Optional notification sound name'
        }
      ],
      examples: [
        {
          description: 'Simple notification',
          input: 'system:show-notification title="Task completed!"',
          expectedBehavior: 'Shows notification with message'
        },
        {
          description: 'Notification with subtitle and sound',
          input: 'system:show-notification title="Build finished" subtitle="Automation Complete" sound="Glass"',
          expectedBehavior: 'Shows detailed notification with sound'
        }
      ],
      execute: async (context: ActionContext) => {
        const { title, subtitle, sound } = context.parameters;
        
        if (!title) {
          return {
            success: false,
            output: '',
            error: 'Missing required parameter: title is required',
            executionTime: 0
          };
        }
        
        return await SystemControlManager.showNotification(title, subtitle, sound);
      }
    }
  ];
}
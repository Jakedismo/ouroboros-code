/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { SlashCommandProcessorResult } from '../types.js';
import { ProgressFormat } from '../../workflow/monitoring/progress-tracker.js';

/**
 * Process workflow progress related slash commands
 */
export function processWorkflowProgressCommand(
  command: string,
  args: string[]
): SlashCommandProcessorResult | null {

  switch (command) {
    case 'workflow':
    case 'wf': {
      const subCommand = args[0];
      
      switch (subCommand) {
        case 'progress':
        case 'p':
          return processProgressCommand(args.slice(1));
        
        case 'list':
        case 'ls':
          return {
            type: 'schedule_tool',
            toolName: 'workflow_list_active',
            toolArgs: {}
          };
        
        case 'stats':
        case 's':
          return {
            type: 'schedule_tool',
            toolName: 'workflow_show_stats',
            toolArgs: {}
          };
        
        case 'dashboard':
        case 'd':
          return {
            type: 'schedule_tool',
            toolName: 'workflow_show_dashboard',
            toolArgs: {}
          };
        
        case 'clear':
        case 'c':
          return {
            type: 'schedule_tool',
            toolName: 'workflow_clear_completed',
            toolArgs: {}
          };
        
        default:
          return {
            type: 'schedule_tool',
            toolName: 'workflow_help',
            toolArgs: { subCommand }
          };
      }
    }

    case 'progress':
    case 'prog': {
      return processProgressCommand(args);
    }

    default:
      return null;
  }
}

/**
 * Process progress-specific commands
 */
function processProgressCommand(args: string[]): SlashCommandProcessorResult {
  const subCommand = args[0] || 'show';
  
  switch (subCommand) {
    case 'show':
    case 's':
      return {
        type: 'schedule_tool',
        toolName: 'workflow_progress_show',
        toolArgs: {
          workflowId: args[1] || null,
          format: parseProgressFormat(args[2]) || ProgressFormat.ASCII_BAR
        }
      };
    
    case 'hide':
    case 'h':
      return {
        type: 'schedule_tool',
        toolName: 'workflow_progress_hide',
        toolArgs: {}
      };
    
    case 'toggle':
    case 't':
      return {
        type: 'schedule_tool',
        toolName: 'workflow_progress_toggle',
        toolArgs: {}
      };
    
    case 'format':
    case 'f':
      const format = parseProgressFormat(args[1]);
      if (!format) {
        return {
          type: 'schedule_tool',
          toolName: 'workflow_progress_format_help',
          toolArgs: {}
        };
      }
      return {
        type: 'schedule_tool',
        toolName: 'workflow_progress_set_format',
        toolArgs: { format }
      };
    
    case 'compact':
      return {
        type: 'schedule_tool',
        toolName: 'workflow_progress_toggle_compact',
        toolArgs: {}
      };
    
    case 'track':
      if (!args[1]) {
        return {
          type: 'schedule_tool',
          toolName: 'workflow_progress_track_help',
          toolArgs: {}
        };
      }
      return {
        type: 'schedule_tool',
        toolName: 'workflow_progress_track',
        toolArgs: {
          workflowId: args[1],
          interval: parseInt(args[2]) || 1000
        }
      };
    
    case 'untrack':
      if (!args[1]) {
        return {
          type: 'schedule_tool',
          toolName: 'workflow_progress_untrack_help',
          toolArgs: {}
        };
      }
      return {
        type: 'schedule_tool',
        toolName: 'workflow_progress_untrack',
        toolArgs: {
          workflowId: args[1]
        }
      };
    
    case 'clear':
    case 'c':
      return {
        type: 'schedule_tool',
        toolName: 'workflow_progress_clear',
        toolArgs: {}
      };
    
    case 'help':
    case '?':
    default:
      return {
        type: 'schedule_tool',
        toolName: 'workflow_progress_help',
        toolArgs: { subCommand }
      };
  }
}

/**
 * Parse progress format from string
 */
function parseProgressFormat(formatStr?: string): ProgressFormat | null {
  if (!formatStr) return null;
  
  const normalized = formatStr.toLowerCase().replace(/[-_\s]/g, '');
  
  switch (normalized) {
    case 'ascii':
    case 'asciibar':
    case 'bar':
      return ProgressFormat.ASCII_BAR;
    
    case 'emoji':
    case 'emojiicons':
    case 'icons':
      return ProgressFormat.EMOJI_ICONS;
    
    case 'text':
    case 'textsummary':
    case 'summary':
      return ProgressFormat.TEXT_SUMMARY;
    
    case 'detailed':
    case 'detailedreport':
    case 'report':
      return ProgressFormat.DETAILED_REPORT;
    
    default:
      return null;
  }
}

/**
 * Get help text for workflow progress commands
 */
export function getWorkflowProgressHelp(): string {
  return `
🚀 Workflow Progress Commands:

📊 General Workflow Commands:
  /workflow list, /wf ls          - List all active workflows
  /workflow stats, /wf s          - Show workflow statistics
  /workflow dashboard, /wf d      - Show workflow dashboard
  /workflow clear, /wf c          - Clear completed workflows

📈 Progress Display Commands:
  /progress show [id] [format]    - Show progress (optionally for specific workflow)
  /progress hide                  - Hide progress display
  /progress toggle                - Toggle progress visibility
  /progress format <type>         - Set display format (ascii/emoji/text/detailed)
  /progress compact               - Toggle compact mode

🎯 Progress Tracking Commands:
  /progress track <id> [interval] - Start tracking workflow (default: 1000ms interval)
  /progress untrack <id>          - Stop tracking workflow
  /progress clear                 - Clear all progress data

📝 Progress Formats:
  • ascii/bar     - ASCII progress bars with percentages
  • emoji/icons   - Visual progress with emoji indicators  
  • text/summary  - Simple text summary
  • detailed/report - Comprehensive progress report

💡 Interactive Controls (in overlay mode):
  • ESC/Q - Close overlay    • C - Toggle compact
  • F - Cycle formats        • D - Toggle dashboard
  • X - Clear completed      • W - Open from mini indicator

Examples:
  /progress show                  - Show all active workflow progress
  /progress show wf-123 emoji     - Show specific workflow with emoji format
  /progress format detailed       - Switch to detailed report format
  /progress track automation-001  - Start tracking specific workflow
  /workflow dashboard             - Show comprehensive dashboard
`;
}
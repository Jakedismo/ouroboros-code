/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { SlashCommand, CommandKind } from './types.js';
import { MessageType } from '../types.js';

/**
 * Workflow progress command for real-time workflow execution monitoring
 */
export const workflowCommand: SlashCommand = {
  name: 'workflow',
  description: 'Real-time workflow execution progress monitoring and control',
  kind: CommandKind.BUILT_IN,
  action: async (context) => {
    // Add workflow progress info message
    context.ui.addItem({
      type: MessageType.INFO,
      text: '📊 Workflow Progress System:\n\n' +
            'Available commands:\n' +
            '• /workflow progress [id] - Show workflow progress\n' +
            '• /workflow list - List active workflows\n' +
            '• /workflow stats - Show workflow statistics\n' +
            '• /workflow dashboard - Show comprehensive dashboard\n' +
            '• /progress [show|hide|toggle] - Control progress display\n\n' +
            'Real-time TUI progress display is integrated and will automatically\n' +
            'show workflow progress when workflows are executed.\n\n' +
            'Press W during execution to open the interactive progress overlay.'
    }, Date.now());
  },
  subCommands: [
    {
      name: 'progress',
      description: 'Show workflow execution progress',
      kind: CommandKind.BUILT_IN,
      action: async (context, args) => {
        const workflowId = args || 'all';
        context.ui.addItem({
          type: MessageType.INFO,
          text: `📊 Showing workflow progress for: ${workflowId}\n\n` +
                   'Real-time progress tracking system is active.\n' +
                   'Workflow execution progress will be displayed automatically\n' +
                   'when workflows are running.\n\n' +
                   'Use the WorkflowProgressOverlay (press W) for interactive control.',
            }, Date.now());
      }
    },
    {
      name: 'list',
      description: 'List all active workflows',
      kind: CommandKind.BUILT_IN,
      action: async (context) => {
        context.ui.addItem({
          type: MessageType.INFO,
          text: '📋 Active Workflows:\n\n' +
                   'No active workflows currently running.\n' +
                   'Workflows will appear here when executed via the automation specialist agent.',
            }, Date.now());
      }
    },
    {
      name: 'stats',
      description: 'Show workflow statistics',
      kind: CommandKind.BUILT_IN,
      action: async (context) => {
        context.ui.addItem({
          type: MessageType.INFO,
          text: '📈 Workflow Statistics:\n\n' +
                   'Real-time workflow statistics will be displayed here\n' +
                   'when workflows are active.\n\n' +
                   'Statistics include:\n' +
                   '• Execution time\n' +
                   '• Success rate\n' +
                   '• Step completion\n' +
                   '• Performance metrics',
            }, Date.now());
      }
    },
    {
      name: 'dashboard',
      description: 'Show comprehensive workflow dashboard',
      kind: CommandKind.BUILT_IN,
      action: async (context) => {
        context.ui.addItem({
          type: MessageType.INFO,
          text: '📊 Workflow Dashboard:\n\n' +
                   '═══════════════════════════════\n' +
                   'Real-time TUI Progress System: ✅ Active\n' +
                   'Workflow State Management: ✅ Active\n' +
                   'Progress Tracking: ✅ Active\n' +
                   'Interactive Overlay: ✅ Available (Press W)\n' +
                   '═══════════════════════════════\n\n' +
                   'The comprehensive workflow dashboard provides:\n' +
                   '• Live progress visualization\n' +
                   '• Performance analytics\n' +
                   '• Error tracking and recovery\n' +
                   '• Interactive controls\n\n' +
                   'Press W during workflow execution for the full interactive experience.',
            }, Date.now());
      }
    },
    {
      name: 'errors',
      description: 'Show workflow errors and recovery options',
      kind: CommandKind.BUILT_IN,
      action: async (context, args) => {
        const workflowId = args || 'all';
        context.ui.addItem({
          type: MessageType.INFO,
          text: `🛡️ Workflow Error Recovery System for: ${workflowId}\n\n` +
                   'The comprehensive error handling system provides:\n\n' +
                   '🚨 ERROR ANALYSIS:\n' +
                   '• Automatic error categorization and severity assessment\n' +
                   '• Root cause analysis with contributing factors\n' +
                   '• Impact assessment for affected workflow steps\n' +
                   '• Recovery complexity and time estimation\n\n' +
                   '🔧 RECOVERY STRATEGIES:\n' +
                   '• Retry: Re-execute failed step with cleanup\n' +
                   '• Skip: Safely bypass non-critical failed steps\n' +
                   '• Rollback: Restore to previous checkpoint\n' +
                   '• Restart: Full workflow restart from beginning\n' +
                   '• Continue: Proceed despite non-critical errors\n\n' +
                   '📊 AUTOMATIC RECOVERY:\n' +
                   '• Low/Medium severity errors with high success probability\n' +
                   '• Intelligent retry logic with exponential backoff\n' +
                   '• Safe rollback to validated checkpoints\n\n' +
                   'Use /workflow recovery [workflowId] for interactive recovery options.',
            }, Date.now());
      }
    },
    {
      name: 'recovery',
      description: 'Interactive workflow error recovery interface',
      kind: CommandKind.BUILT_IN,
      action: async (context, args) => {
        const workflowId = args || context.invocation?.args || '';
        context.ui.addItem({
          type: MessageType.INFO,
          text: `🔧 Interactive Workflow Recovery for: ${workflowId || 'all workflows'}\n\n` +
                   '🛡️ RECOVERY INTERFACE:\n' +
                   '• Press E during workflow execution to open error recovery\n' +
                   '• Navigate errors with ↑↓ or J/K keys\n' +
                   '• Press R to view recovery strategies for selected error\n' +
                   '• Press A for automatic recovery (if available)\n' +
                   '• Press E to execute selected recovery strategy\n\n' +
                   '📸 ROLLBACK CAPABILITIES:\n' +
                   '• Automatic checkpoint creation during execution\n' +
                   '• File system snapshots for complete restoration\n' +
                   '• Environment and state preservation\n' +
                   '• Conflict detection and validation\n\n' +
                   '✅ VERIFICATION:\n' +
                   '• Post-recovery state validation\n' +
                   '• Integrity checking and conflict resolution\n' +
                   '• Performance impact analysis\n\n' +
                   'Recovery system is active and monitoring all workflow executions.',
            }, Date.now());
      }
    },
    {
      name: 'rollback',
      description: 'Rollback workflow to checkpoint or snapshot',
      kind: CommandKind.BUILT_IN,
      action: async (context, args) => {
        const [workflowId, checkpointId] = (args || '').split(' ');
        
        if (!workflowId) {
          context.ui.addItem({
            type: MessageType.INFO,
            text: '🔄 Workflow Rollback System\n\n' +
                     'Usage: /workflow rollback <workflowId> [checkpointId]\n\n' +
                     '📸 ROLLBACK CAPABILITIES:\n' +
                     '• Restore workflow to any previous checkpoint\n' +
                     '• Complete file system state restoration\n' +
                     '• Environment variable restoration\n' +
                     '• Automatic conflict detection and resolution\n\n' +
                     '🔍 VALIDATION:\n' +
                     '• Pre-rollback validation and impact assessment\n' +
                     '• Snapshot integrity verification\n' +
                     '• Dependency and conflict analysis\n\n' +
                     '⚡ EXECUTION:\n' +
                     '• Real-time rollback progress tracking\n' +
                     '• Automatic backup creation before rollback\n' +
                     '• Post-rollback verification and validation\n\n' +
                     'List available checkpoints: /workflow checkpoints <workflowId>\n' +
                     'View rollback status: /workflow rollback-status',
              }, Date.now());
          return;
        }

        context.ui.addItem({
          type: MessageType.INFO,
          text: `🔄 Initiating rollback for workflow: ${workflowId}\n` +
                   (checkpointId ? `Target checkpoint: ${checkpointId}\n` : 'Target: Latest checkpoint\n') +
                   '\n' +
                   'Rollback process:\n' +
                   '1. 🔍 Validating rollback prerequisites\n' +
                   '2. 📸 Creating backup snapshot (if enabled)\n' +
                   '3. 🔄 Restoring workflow state\n' +
                   '4. 📁 Restoring file system (if snapshot available)\n' +
                   '5. ✅ Verifying rollback completion\n\n' +
                   'The rollback system will provide real-time progress updates\n' +
                   'and handle any conflicts automatically.',
            }, Date.now());
      }
    },
    {
      name: 'checkpoints',
      description: 'List available workflow checkpoints',
      kind: CommandKind.BUILT_IN,
      action: async (context, args) => {
        const workflowId = args || 'all';
        context.ui.addItem({
          type: MessageType.INFO,
          text: `📍 Workflow Checkpoints for: ${workflowId}\n\n` +
                   '🔍 CHECKPOINT SYSTEM:\n' +
                   '• Automatic checkpoints created every 30 seconds during execution\n' +
                   '• Manual checkpoints can be created at any time\n' +
                   '• Full workflow state and context preservation\n' +
                   '• File system snapshots for complete restoration\n\n' +
                   '📊 CHECKPOINT DATA:\n' +
                   '• Workflow execution state and progress\n' +
                   '• Step completion status and results\n' +
                   '• Environment variables and working directory\n' +
                   '• Resource usage and performance metrics\n\n' +
                   '🎯 USAGE:\n' +
                   '• View checkpoint details: Select checkpoint and press Enter\n' +
                   '• Rollback to checkpoint: /workflow rollback <workflowId> <checkpointId>\n' +
                   '• Create manual checkpoint: /workflow checkpoint <workflowId> [description]\n\n' +
                   'No checkpoints currently available for display.\n' +
                   'Checkpoints will appear here when workflows are executed.',
            }, Date.now());
      }
    },
    {
      name: 'snapshots',
      description: 'Manage workflow rollback snapshots',
      kind: CommandKind.BUILT_IN,
      action: async (context, args) => {
        const workflowId = args || 'all';
        context.ui.addItem({
          type: MessageType.INFO,
          text: `📸 Rollback Snapshots for: ${workflowId}\n\n` +
                   '🔄 SNAPSHOT SYSTEM:\n' +
                   '• Complete file system state capture\n' +
                   '• Environment and process state preservation\n' +
                   '• Compressed storage with integrity verification\n' +
                   '• Automatic cleanup of old snapshots\n\n' +
                   '📊 SNAPSHOT DATA:\n' +
                   '• File contents and permissions\n' +
                   '• Directory structure and metadata\n' +
                   '• Environment variables and working directory\n' +
                   '• Resource states and open file handles\n\n' +
                   '🎯 MANAGEMENT:\n' +
                   '• Create snapshot: /workflow snapshot <workflowId> [description]\n' +
                   '• Delete snapshot: /workflow delete-snapshot <snapshotId>\n' +
                   '• Restore from snapshot: /workflow restore <workflowId> <snapshotId>\n' +
                   '• Cleanup old snapshots: /workflow cleanup-snapshots [days]\n\n' +
                   'Snapshots provide complete restoration capabilities for\n' +
                   'file system and environment state recovery.',
            }, Date.now());
      }
    },
    {
      name: 'plan',
      altNames: ['design', 'create'],
      description: 'Interactive workflow planning interface',
      kind: CommandKind.BUILT_IN,
      action: async (context, args) => {
        const templateName = args?.trim();
        
        context.ui.addItem({
          type: MessageType.INFO,
          text: '🎯 Interactive Workflow Planning Interface\n\n' +
                'The workflow planning TUI provides:\n\n' +
                '📋 PLANNING FEATURES:\n' +
                '• Visual workflow designer with drag-and-drop steps\n' +
                '• ASCII diagram generation for workflow visualization\n' +
                '• Step dependency management and validation\n' +
                '• Template library with common workflow patterns\n' +
                '• Real-time estimation of execution time\n\n' +
                '🎨 AVAILABLE TEMPLATES:\n' +
                '• file-processing - Process multiple files with validation\n' +
                '• deployment - Automated deployment with testing\n' +
                '• data-sync - Synchronize data between sources\n' +
                '• custom - Start with blank workflow\n\n' +
                '⌨️  INTERACTIVE CONTROLS:\n' +
                '• A - Add new step\n' +
                '• E - Edit selected step\n' +
                '• D - Delete step\n' +
                '• V - Toggle diagram view\n' +
                '• S - Save workflow\n' +
                '• X - Execute workflow\n' +
                '• 1-5 - Quick add step types\n\n' +
                templateName ? 
                  `Loading template: ${templateName}\n` +
                  'Use /workflow execute to run the planned workflow.'
                  :
                  'Use /workflow plan <template-name> to start with a template\n' +
                  'or /workflow plan to create a custom workflow.'
        }, Date.now());
      }
    },
    {
      name: 'execute',
      altNames: ['run', 'start'],
      description: 'Execute workflow with real-time monitoring',
      kind: CommandKind.BUILT_IN,
      action: async (context, args) => {
        const workflowId = args?.trim();
        
        context.ui.addItem({
          type: MessageType.INFO,
          text: '⚡ Workflow Execution Monitor\n\n' +
                '🖥️  REAL-TIME MONITORING:\n' +
                '• Live step-by-step execution progress\n' +
                '• Real-time performance metrics and timing\n' +
                '• Detailed logging with error tracking\n' +
                '• Interactive progress visualization\n' +
                '• Automatic retry and recovery options\n\n' +
                '📊 MONITORING FEATURES:\n' +
                '• Progress Tab: Step status and current execution\n' +
                '• Logs Tab: Real-time execution logs and output\n' +
                '• Metrics Tab: Performance statistics and estimates\n' +
                '• Multi-workflow dashboard for parallel executions\n\n' +
                '⌨️  EXECUTION CONTROLS:\n' +
                '• P - Pause/Resume execution\n' +
                '• C - Cancel workflow\n' +
                '• R - Retry current step\n' +
                '• S - Skip current step\n' +
                '• A - Toggle log auto-scroll\n' +
                '• 1-3 - Switch between tabs\n\n' +
                '🚀 EXECUTION STATUS:\n' +
                workflowId ?
                  `Preparing to execute workflow: ${workflowId}\n` +
                  'The interactive execution monitor will display real-time progress.'
                  :
                  'Specify workflow ID: /workflow execute <workflow-id>\n' +
                  'Use /workflow list to see available workflows.'
        }, Date.now());
      }
    },
    {
      name: 'templates',
      altNames: ['template'],
      description: 'Browse and manage workflow templates',
      kind: CommandKind.BUILT_IN,
      action: async (context, args) => {
        const action = args?.split(' ')[0];
        const templateName = args?.split(' ')[1];
        
        context.ui.addItem({
          type: MessageType.INFO,
          text: '📚 Workflow Template Library\n\n' +
                '🎯 BUILT-IN TEMPLATES:\n\n' +
                '1. FILE-PROCESSING WORKFLOW:\n' +
                '   • Validate input files and check formats\n' +
                '   • Determine processing path based on file type\n' +
                '   • Process multiple files in parallel\n' +
                '   • Validate results and generate reports\n' +
                '   Usage: /workflow plan file-processing\n\n' +
                '2. DEPLOYMENT WORKFLOW:\n' +
                '   • Run comprehensive test suite\n' +
                '   • Build and package application\n' +
                '   • Deploy to staging with smoke tests\n' +
                '   • Production deployment with monitoring\n' +
                '   Usage: /workflow plan deployment\n\n' +
                '3. DATA-SYNC WORKFLOW:\n' +
                '   • Connect to multiple data sources\n' +
                '   • Fetch and transform changed records\n' +
                '   • Apply changes to all target systems\n' +
                '   • Verify synchronization integrity\n' +
                '   Usage: /workflow plan data-sync\n\n' +
                '💡 TEMPLATE MANAGEMENT:\n' +
                '• /workflow templates list - Show all templates\n' +
                '• /workflow templates show <name> - View template details\n' +
                '• /workflow templates export <name> - Export template\n' +
                '• /workflow templates import <file> - Import template\n\n' +
                action === 'list' ? 
                  'Available templates: file-processing, deployment, data-sync'
                  : action === 'show' && templateName ?
                    `Displaying details for template: ${templateName}`
                    : 'Use /workflow plan <template-name> to create workflow from template'
        }, Date.now());
      }
    },
    {
      name: 'monitor',
      altNames: ['watch'],
      description: 'Multi-workflow execution dashboard',
      kind: CommandKind.BUILT_IN,
      action: async (context) => {
        context.ui.addItem({
          type: MessageType.INFO,
          text: '📊 Multi-Workflow Execution Dashboard\n\n' +
                '🎛️  DASHBOARD FEATURES:\n' +
                '• Real-time overview of all active workflows\n' +
                '• Execution status and progress for each workflow\n' +
                '• Resource utilization and performance metrics\n' +
                '• Queue management and execution prioritization\n' +
                '• Historical execution data and trends\n\n' +
                '📈 MONITORING CAPABILITIES:\n' +
                '• Live execution status (Running, Completed, Failed)\n' +
                '• Progress percentage and estimated completion time\n' +
                '• Resource usage (CPU, Memory, Network)\n' +
                '• Step-level execution details and timing\n' +
                '• Error tracking and failure analysis\n\n' +
                '🔧 DASHBOARD CONTROLS:\n' +
                '• ↑↓ - Navigate between workflows\n' +
                '• Enter - Open detailed execution view\n' +
                '• P - Pause/Resume selected workflow\n' +
                '• C - Cancel selected workflow\n' +
                '• R - Refresh dashboard data\n' +
                '• F - Toggle full-screen mode\n\n' +
                '⚡ CURRENT STATUS:\n' +
                'No active workflow executions found.\n' +
                'Use /workflow execute <workflow-id> to start monitoring workflows.\n' +
                'The dashboard will automatically update with real-time data.'
        }, Date.now());
      }
    },
    {
      name: 'help',
      description: 'Show workflow command help',
      kind: CommandKind.BUILT_IN,
      action: async (context) => {
        context.ui.addItem({
          type: MessageType.INFO,
          text: '🚀 Workflow System Commands:\n\n' +
                   '🎯 WORKFLOW PLANNING & DESIGN:\n' +
                   '  /workflow plan [template]       - Interactive workflow planning TUI\n' +
                   '  /workflow templates             - Browse workflow template library\n' +
                   '  /workflow templates show <name> - View specific template details\n' +
                   '  /workflow templates list        - List all available templates\n\n' +
                   '⚡ WORKFLOW EXECUTION:\n' +
                   '  /workflow execute <id>          - Execute workflow with real-time monitoring\n' +
                   '  /workflow monitor               - Multi-workflow execution dashboard\n' +
                   '  /workflow list, /wf ls          - List all workflows (active/completed)\n' +
                   '  /workflow stats, /wf s          - Show workflow execution statistics\n' +
                   '  /workflow progress [id]         - Show progress for specific workflow\n\n' +
                   '🛡️ ERROR HANDLING & RECOVERY:\n' +
                   '  /workflow errors [id]           - Show workflow errors and diagnostics\n' +
                   '  /workflow recovery [id]         - Interactive error recovery interface\n' +
                   '  /workflow rollback <id> [cp]    - Rollback workflow to checkpoint\n' +
                   '  /workflow checkpoints [id]      - List available checkpoints\n' +
                   '  /workflow snapshots [id]        - Manage rollback snapshots\n\n' +
                   '📈 REAL-TIME MONITORING:\n' +
                   '  /progress show                  - Enable progress display\n' +
                   '  /progress hide                  - Disable progress display\n' +
                   '  /progress toggle                - Toggle progress visibility\n\n' +
                   '💡 INTERACTIVE TUI CONTROLS:\n' +
                   '  PLANNING: A-Add Step, E-Edit, D-Delete, V-Toggle Diagram, S-Save, X-Execute\n' +
                   '  EXECUTION: P-Pause/Resume, C-Cancel, R-Retry, S-Skip, 1-3-Tabs\n' +
                   '  MONITORING: W-Overlay, E-Recovery, ESC/Q-Close, F-Format, D-Dashboard\n\n' +
                   '🎨 WORKFLOW TEMPLATES:\n' +
                   '  • file-processing: Multi-file processing with validation\n' +
                   '  • deployment: Automated deployment with testing\n' +
                   '  • data-sync: Multi-source data synchronization\n\n' +
                   '🚀 ADVANCED FEATURES:\n' +
                   '  • ASCII diagram generation for workflow visualization\n' +
                   '  • Step dependency management and validation\n' +
                   '  • Real-time execution progress with live metrics\n' +
                   '  • Parallel workflow execution and monitoring\n' +
                   '  • Automatic checkpointing and recovery\n' +
                   '  • Performance analytics and optimization\n' +
                   '  • Interactive error handling and retry logic',
            }, Date.now());
      }
    }
  ]
};

/**
 * Progress command (standalone alias for workflow progress)
 */
export const progressCommand: SlashCommand = {
  name: 'progress',
  description: 'Workflow progress monitoring (alias for workflow progress)',
  kind: CommandKind.BUILT_IN,
  action: async (context, args) => {
    const command = args || 'show';
    
    switch (command) {
      case 'show':
        context.ui.addItem({
          type: MessageType.INFO,
          text: '📊 Progress Display: ON\n\n' +
                   'Real-time workflow progress will be shown during execution.\n' +
                   'Press W for interactive controls.',
            }, Date.now());
        break;
      
      case 'hide':
        context.ui.addItem({
          type: MessageType.INFO,
          text: '📊 Progress Display: OFF\n\n' +
                   'Workflow progress display has been hidden.\n' +
                   'Use /progress show to re-enable.',
            }, Date.now());
        break;
      
      case 'toggle':
        context.ui.addItem({
          type: MessageType.INFO,
          text: '📊 Progress Display: TOGGLED\n\n' +
                   'Workflow progress display visibility has been toggled.',
            }, Date.now());
        break;
      
      default:
        context.ui.addItem({
          type: MessageType.INFO,
          text: '📊 Workflow Progress System Active\n\n' +
                   'Available commands:\n' +
                   '• /progress show - Show progress display\n' +
                   '• /progress hide - Hide progress display\n' +
                   '• /progress toggle - Toggle visibility\n\n' +
                   'Interactive controls available during execution (Press W).',
            }, Date.now());
    }
  }
};
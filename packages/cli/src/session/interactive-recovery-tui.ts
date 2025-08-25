/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import { SessionDisplayInfo, RecoveryFilters, RecoverySelection } from './recovery-ui.js';
import { SessionRecoveryOptions } from './types.js';

/**
 * TUI Screen types
 */
export enum TUIScreen {
  SESSION_LIST = 'session_list',
  SESSION_DETAILS = 'session_details',
  RECOVERY_OPTIONS = 'recovery_options',
  FILTERS = 'filters',
  CONFIRMATION = 'confirmation',
  PROGRESS = 'progress'
}

/**
 * TUI Navigation state
 */
export interface TUIState {
  currentScreen: TUIScreen;
  selectedIndex: number;
  maxDisplay: number;
  scrollOffset: number;
  filters: RecoveryFilters;
  selectedSession: SessionDisplayInfo | null;
  recoveryOptions: SessionRecoveryOptions;
  showHelp: boolean;
}

/**
 * Key binding configuration
 */
export interface KeyBindings {
  up: string[];
  down: string[];
  select: string[];
  back: string[];
  quit: string[];
  help: string[];
  filter: string[];
  details: string[];
  quickSelect: string[];
}

/**
 * Enhanced interactive TUI for session recovery
 */
export class InteractiveRecoveryTUI extends EventEmitter {
  private state: TUIState;
  private sessions: SessionDisplayInfo[] = [];
  private keyBindings: KeyBindings;
  private isActive = false;

  constructor() {
    super();
    
    this.state = {
      currentScreen: TUIScreen.SESSION_LIST,
      selectedIndex: 0,
      maxDisplay: 10,
      scrollOffset: 0,
      filters: {},
      selectedSession: null,
      recoveryOptions: {
        restoreWorkflows: true,
        restoreAgent: true,
        restoreEnvironment: false,
        restoreOpenFiles: false,
        restoreTerminalSessions: false,
        restoreClipboard: false
      },
      showHelp: false
    };

    this.keyBindings = {
      up: ['ArrowUp', 'k'],
      down: ['ArrowDown', 'j'],
      select: ['Enter', ' '],
      back: ['Escape', 'q'],
      quit: ['q', 'Ctrl+c'],
      help: ['h', '?'],
      filter: ['f'],
      details: ['d', 'ArrowRight', 'l'],
      quickSelect: ['1', '2', '3', '4', '5']
    };
  }

  /**
   * Start interactive TUI session
   */
  async start(sessions: SessionDisplayInfo[]): Promise<RecoverySelection | null> {
    this.sessions = sessions;
    this.isActive = true;

    // Setup terminal for interactive mode
    this.setupTerminal();

    try {
      // Main TUI loop
      while (this.isActive) {
        this.render();
        const key = await this.waitForKey();
        
        if (!this.handleKeyPress(key)) {
          break;
        }
      }

      // Return selection result
      if (this.state.selectedSession && this.state.currentScreen === TUIScreen.CONFIRMATION) {
        return {
          session: this.state.selectedSession.session,
          options: this.state.recoveryOptions,
          confirmed: true
        };
      }

      return null;
      
    } finally {
      this.restoreTerminal();
    }
  }

  /**
   * Private: Setup terminal for interactive mode
   */
  private setupTerminal(): void {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
    }
    
    // Hide cursor and clear screen
    process.stdout.write('\x1b[?25l\x1b[2J\x1b[H');
  }

  /**
   * Private: Restore terminal
   */
  private restoreTerminal(): void {
    // Show cursor and reset
    process.stdout.write('\x1b[?25h');
    
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }
  }

  /**
   * Private: Render current screen
   */
  private render(): void {
    // Clear screen and move to top
    process.stdout.write('\x1b[2J\x1b[H');

    switch (this.state.currentScreen) {
      case TUIScreen.SESSION_LIST:
        this.renderSessionList();
        break;
      case TUIScreen.SESSION_DETAILS:
        this.renderSessionDetails();
        break;
      case TUIScreen.RECOVERY_OPTIONS:
        this.renderRecoveryOptions();
        break;
      case TUIScreen.FILTERS:
        this.renderFilters();
        break;
      case TUIScreen.CONFIRMATION:
        this.renderConfirmation();
        break;
      case TUIScreen.PROGRESS:
        this.renderProgress();
        break;
    }

    if (this.state.showHelp) {
      this.renderHelp();
    }

    this.renderStatusBar();
  }

  /**
   * Private: Render session list screen
   */
  private renderSessionList(): void {
    console.log('╭─ 📋 SESSION RECOVERY ─────────────────────────────────────────────╮');
    console.log(`│ Found ${this.sessions.length} recoverable sessions                                        │`);
    console.log('├───────────────────────────────────────────────────────────────────┤');

    if (this.sessions.length === 0) {
      console.log('│ No sessions available for recovery                                │');
      console.log('│                                                                   │');
      console.log('│ 💡 Sessions are created automatically when you use Ouroboros     │');
      console.log('╰───────────────────────────────────────────────────────────────────╯');
      return;
    }

    const startIndex = this.state.scrollOffset;
    const endIndex = Math.min(startIndex + this.state.maxDisplay, this.sessions.length);

    for (let i = startIndex; i < endIndex; i++) {
      const session = this.sessions[i];
      const isSelected = i === this.state.selectedIndex;
      const prefix = isSelected ? '►' : ' ';
      const score = (session.recoveryScore * 100).toFixed(0).padStart(3);
      
      // Main session line
      const line1 = `${prefix} ${session.statusIcon} ${session.displayName}`.padEnd(50);
      const score_display = `${score}%`;
      console.log(`│${line1}│${score_display.padStart(18)}│`);
      
      // Details line
      const details = `  📂 ${session.subtitle} • 🌳 ${session.gitDisplay}`.padEnd(67);
      console.log(`│${details}│`);
      
      // Agent and time line
      const agentTime = `  🤖 ${session.session.activeAgent} • ⏰ ${session.ageDisplay}`.padEnd(67);
      console.log(`│${agentTime}│`);
      
      // Workflows line
      const workflows = `  🔄 ${session.workflowsDisplay}`.padEnd(67);
      console.log(`│${workflows}│`);

      if (!session.canRecover) {
        const warning = '  ❌ Cannot recover - check warnings'.padEnd(67);
        console.log(`│${warning}│`);
      }
      
      console.log('│                                                                   │');
    }

    // Scrolling indicator
    if (this.sessions.length > this.state.maxDisplay) {
      const scrollInfo = `Showing ${startIndex + 1}-${endIndex} of ${this.sessions.length}`;
      console.log(`│ ${scrollInfo.padEnd(65)} │`);
    }

    console.log('╰───────────────────────────────────────────────────────────────────╯');
  }

  /**
   * Private: Render session details screen
   */
  private renderSessionDetails(): void {
    const session = this.state.selectedSession;
    if (!session) return;

    console.log('╭─ 📊 SESSION DETAILS ──────────────────────────────────────────────╮');
    console.log(`│ ${session.displayName.padEnd(65)} │`);
    console.log('├───────────────────────────────────────────────────────────────────┤');
    console.log(`│ 📂 Project: ${session.subtitle.padEnd(52)} │`);
    console.log(`│ 🌳 Git: ${session.gitDisplay.padEnd(56)} │`);
    console.log(`│ 🤖 Agent: ${session.session.activeAgent.padEnd(54)} │`);
    console.log(`│ ⏰ Last Active: ${session.ageDisplay.padEnd(48)} │`);
    console.log(`│ 📊 Recovery Score: ${(session.recoveryScore * 100).toFixed(0)}%`.padEnd(66) + ' │');
    console.log(`│ ${session.statusIcon} Status: ${session.session.status.padEnd(52)} │`);
    console.log('│                                                                   │');
    console.log(`│ 🔄 Workflows: ${session.workflowsDisplay.padEnd(50)} │`);
    console.log(`│ 📈 Commands: ${session.session.statistics.commandsExecuted.toString().padEnd(51)} │`);
    console.log(`│ ⚡ Duration: ${this.formatDuration(session.session.totalDuration).padEnd(50)} │`);
    console.log('│                                                                   │');

    if (session.warnings.length > 0) {
      console.log('│ ⚠️  WARNINGS:                                                      │');
      session.warnings.slice(0, 3).forEach(warning => {
        const warningText = `   • ${warning}`.padEnd(67);
        console.log(`│${warningText}│`);
      });
      console.log('│                                                                   │');
    }

    if (session.recommendations.length > 0) {
      console.log('│ 💡 RECOMMENDATIONS:                                               │');
      session.recommendations.slice(0, 3).forEach(rec => {
        const recText = `   • ${rec}`.padEnd(67);
        console.log(`│${recText}│`);
      });
      console.log('│                                                                   │');
    }

    console.log('╰───────────────────────────────────────────────────────────────────╯');
  }

  /**
   * Private: Render recovery options screen
   */
  private renderRecoveryOptions(): void {
    console.log('╭─ ⚙️  RECOVERY OPTIONS ─────────────────────────────────────────────╮');
    console.log('│ Configure what to restore from the selected session              │');
    console.log('├───────────────────────────────────────────────────────────────────┤');

    const options = [
      { key: 'restoreWorkflows', label: '🔄 Restore Active Workflows', desc: 'Resume in-progress workflows' },
      { key: 'restoreAgent', label: '🤖 Restore Agent Context', desc: 'Keep the same active agent' },
      { key: 'restoreEnvironment', label: '🌍 Restore Environment', desc: 'Restore env vars and settings' },
      { key: 'restoreOpenFiles', label: '📄 Restore Open Files', desc: 'Reopen previously opened files' },
      { key: 'restoreTerminalSessions', label: '💻 Restore Terminal Sessions', desc: 'Restore terminal state' },
      { key: 'restoreClipboard', label: '📋 Restore Clipboard', desc: 'Restore clipboard contents' }
    ];

    options.forEach((option, index) => {
      const isSelected = index === this.state.selectedIndex;
      const isEnabled = this.state.recoveryOptions[option.key as keyof SessionRecoveryOptions];
      const prefix = isSelected ? '►' : ' ';
      const checkbox = isEnabled ? '✅' : '☐';
      
      console.log(`│${prefix} ${checkbox} ${option.label.padEnd(55)} │`);
      console.log(`│     ${option.desc.padEnd(59)} │`);
    });

    console.log('│                                                                   │');
    console.log('╰───────────────────────────────────────────────────────────────────╯');
  }

  /**
   * Private: Render confirmation screen
   */
  private renderConfirmation(): void {
    const session = this.state.selectedSession;
    if (!session) return;

    console.log('╭─ ✅ CONFIRM RECOVERY ──────────────────────────────────────────────╮');
    console.log(`│ Ready to recover: ${session.displayName.padEnd(46)} │`);
    console.log('├───────────────────────────────────────────────────────────────────┤');
    console.log(`│ 📂 Project: ${session.subtitle.padEnd(52)} │`);
    console.log(`│ 📊 Recovery Score: ${(session.recoveryScore * 100).toFixed(0)}%`.padEnd(66) + ' │');
    console.log('│                                                                   │');
    console.log('│ Will restore:                                                     │');
    
    const options = this.state.recoveryOptions;
    if (options.restoreWorkflows) console.log('│   ✅ Active workflows                                              │');
    if (options.restoreAgent) console.log('│   ✅ Agent context                                                 │');
    if (options.restoreEnvironment) console.log('│   ✅ Environment variables                                         │');
    if (options.restoreOpenFiles) console.log('│   ✅ Open files                                                    │');
    if (options.restoreTerminalSessions) console.log('│   ✅ Terminal sessions                                             │');
    if (options.restoreClipboard) console.log('│   ✅ Clipboard contents                                            │');

    console.log('│                                                                   │');
    console.log('│ Press ENTER to confirm, ESC to cancel                            │');
    console.log('╰───────────────────────────────────────────────────────────────────╯');
  }

  /**
   * Private: Render filters screen
   */
  private renderFilters(): void {
    console.log('╭─ 🔍 FILTERS ───────────────────────────────────────────────────────╮');
    console.log('│ Filter sessions by various criteria                              │');
    console.log('├───────────────────────────────────────────────────────────────────┤');
    console.log('│ [Filters interface would be implemented here]                    │');
    console.log('│                                                                   │');
    console.log('│ Coming soon: Interactive filtering by project, git branch,       │');
    console.log('│ agent, status, recovery score, and age                           │');
    console.log('│                                                                   │');
    console.log('╰───────────────────────────────────────────────────────────────────╯');
  }

  /**
   * Private: Render progress screen
   */
  private renderProgress(): void {
    console.log('╭─ ⏳ RECOVERY IN PROGRESS ──────────────────────────────────────────╮');
    console.log('│                                                                   │');
    console.log('│                     🔄 Recovering Session...                     │');
    console.log('│                                                                   │');
    console.log('│ Please wait while the session is being restored                  │');
    console.log('│                                                                   │');
    console.log('╰───────────────────────────────────────────────────────────────────╯');
  }

  /**
   * Private: Render help overlay
   */
  private renderHelp(): void {
    console.log('╭─ ❓ HELP ──────────────────────────────────────────────────────────╮');
    console.log('│ Key Bindings:                                                     │');
    console.log('│   ↑/k        Move up                                             │');
    console.log('│   ↓/j        Move down                                           │');
    console.log('│   Enter/Space Select item                                        │');
    console.log('│   →/l/d      View details                                        │');
    console.log('│   f          Show filters                                        │');
    console.log('│   h/?        Show/hide help                                      │');
    console.log('│   Esc        Go back                                             │');
    console.log('│   q          Quit                                                │');
    console.log('│                                                                   │');
    console.log('│ Press h or ? to hide help                                        │');
    console.log('╰───────────────────────────────────────────────────────────────────╯');
  }

  /**
   * Private: Render status bar
   */
  private renderStatusBar(): void {
    const screenName = this.getScreenName();
    const helpText = this.state.showHelp ? 'h:hide help' : 'h:help';
    console.log(`\n${screenName} • ${helpText} • q:quit • ${this.sessions.length} sessions`);
  }

  /**
   * Private: Get current screen display name
   */
  private getScreenName(): string {
    switch (this.state.currentScreen) {
      case TUIScreen.SESSION_LIST: return '📋 Session List';
      case TUIScreen.SESSION_DETAILS: return '📊 Session Details';
      case TUIScreen.RECOVERY_OPTIONS: return '⚙️  Recovery Options';
      case TUIScreen.FILTERS: return '🔍 Filters';
      case TUIScreen.CONFIRMATION: return '✅ Confirm Recovery';
      case TUIScreen.PROGRESS: return '⏳ Recovery Progress';
      default: return 'Unknown Screen';
    }
  }

  /**
   * Private: Handle key press
   */
  private handleKeyPress(key: string): boolean {
    // Handle help toggle
    if (this.keyBindings.help.includes(key)) {
      this.state.showHelp = !this.state.showHelp;
      return true;
    }

    // Handle quit
    if (this.keyBindings.quit.includes(key)) {
      this.isActive = false;
      return false;
    }

    // Handle navigation based on current screen
    switch (this.state.currentScreen) {
      case TUIScreen.SESSION_LIST:
        return this.handleSessionListKeys(key);
      case TUIScreen.SESSION_DETAILS:
        return this.handleSessionDetailsKeys(key);
      case TUIScreen.RECOVERY_OPTIONS:
        return this.handleRecoveryOptionsKeys(key);
      case TUIScreen.CONFIRMATION:
        return this.handleConfirmationKeys(key);
      default:
        return this.handleGenericKeys(key);
    }
  }

  /**
   * Private: Handle keys in session list screen
   */
  private handleSessionListKeys(key: string): boolean {
    if (this.keyBindings.up.includes(key)) {
      this.moveSelection(-1);
    } else if (this.keyBindings.down.includes(key)) {
      this.moveSelection(1);
    } else if (this.keyBindings.select.includes(key)) {
      this.selectCurrentSession();
    } else if (this.keyBindings.details.includes(key)) {
      this.showSessionDetails();
    } else if (this.keyBindings.filter.includes(key)) {
      this.state.currentScreen = TUIScreen.FILTERS;
    }
    
    return true;
  }

  /**
   * Private: Handle keys in session details screen
   */
  private handleSessionDetailsKeys(key: string): boolean {
    if (this.keyBindings.back.includes(key)) {
      this.state.currentScreen = TUIScreen.SESSION_LIST;
    } else if (this.keyBindings.select.includes(key)) {
      this.state.currentScreen = TUIScreen.RECOVERY_OPTIONS;
      this.state.selectedIndex = 0;
    }
    
    return true;
  }

  /**
   * Private: Handle keys in recovery options screen
   */
  private handleRecoveryOptionsKeys(key: string): boolean {
    if (this.keyBindings.up.includes(key)) {
      this.state.selectedIndex = Math.max(0, this.state.selectedIndex - 1);
    } else if (this.keyBindings.down.includes(key)) {
      this.state.selectedIndex = Math.min(5, this.state.selectedIndex + 1);
    } else if (this.keyBindings.select.includes(key)) {
      this.toggleRecoveryOption();
    } else if (this.keyBindings.back.includes(key)) {
      this.state.currentScreen = TUIScreen.SESSION_DETAILS;
    } else if (key === 'Enter' && this.keyBindings.select.includes(' ')) {
      this.state.currentScreen = TUIScreen.CONFIRMATION;
    }
    
    return true;
  }

  /**
   * Private: Handle keys in confirmation screen
   */
  private handleConfirmationKeys(key: string): boolean {
    if (this.keyBindings.select.includes(key)) {
      this.state.currentScreen = TUIScreen.PROGRESS;
      this.isActive = false; // Exit with confirmation
    } else if (this.keyBindings.back.includes(key)) {
      this.state.currentScreen = TUIScreen.RECOVERY_OPTIONS;
    }
    
    return true;
  }

  /**
   * Private: Handle generic keys
   */
  private handleGenericKeys(key: string): boolean {
    if (this.keyBindings.back.includes(key)) {
      this.state.currentScreen = TUIScreen.SESSION_LIST;
    }
    
    return true;
  }

  /**
   * Private: Move selection up/down
   */
  private moveSelection(direction: number): void {
    const maxIndex = this.sessions.length - 1;
    this.state.selectedIndex = Math.max(0, Math.min(maxIndex, this.state.selectedIndex + direction));

    // Update scroll offset
    if (this.state.selectedIndex < this.state.scrollOffset) {
      this.state.scrollOffset = this.state.selectedIndex;
    } else if (this.state.selectedIndex >= this.state.scrollOffset + this.state.maxDisplay) {
      this.state.scrollOffset = this.state.selectedIndex - this.state.maxDisplay + 1;
    }
  }

  /**
   * Private: Select current session
   */
  private selectCurrentSession(): void {
    if (this.state.selectedIndex < this.sessions.length) {
      this.state.selectedSession = this.sessions[this.state.selectedIndex];
      this.state.currentScreen = TUIScreen.RECOVERY_OPTIONS;
      this.state.selectedIndex = 0;
    }
  }

  /**
   * Private: Show session details
   */
  private showSessionDetails(): void {
    if (this.state.selectedIndex < this.sessions.length) {
      this.state.selectedSession = this.sessions[this.state.selectedIndex];
      this.state.currentScreen = TUIScreen.SESSION_DETAILS;
    }
  }

  /**
   * Private: Toggle recovery option
   */
  private toggleRecoveryOption(): void {
    const options = ['restoreWorkflows', 'restoreAgent', 'restoreEnvironment', 'restoreOpenFiles', 'restoreTerminalSessions', 'restoreClipboard'];
    const optionKey = options[this.state.selectedIndex] as keyof SessionRecoveryOptions;
    
    if (optionKey) {
      this.state.recoveryOptions[optionKey] = !this.state.recoveryOptions[optionKey];
    }
  }

  /**
   * Private: Wait for key press
   */
  private async waitForKey(): Promise<string> {
    return new Promise((resolve) => {
      const onData = (chunk: string) => {
        process.stdin.removeListener('data', onData);
        
        // Handle special keys
        if (chunk === '\u0003') { // Ctrl+C
          resolve('Ctrl+c');
        } else if (chunk === '\u001b') { // ESC
          resolve('Escape');
        } else if (chunk === '\r' || chunk === '\n') { // Enter
          resolve('Enter');
        } else if (chunk === '\u001b[A') { // Up arrow
          resolve('ArrowUp');
        } else if (chunk === '\u001b[B') { // Down arrow
          resolve('ArrowDown');
        } else if (chunk === '\u001b[C') { // Right arrow
          resolve('ArrowRight');
        } else if (chunk === '\u001b[D') { // Left arrow
          resolve('ArrowLeft');
        } else {
          resolve(chunk);
        }
      };
      
      process.stdin.on('data', onData);
    });
  }

  /**
   * Private: Format duration for display
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}
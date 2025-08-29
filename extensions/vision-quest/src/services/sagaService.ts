/**
 * Main service orchestrating the Vision Quest workflow
 */

import { EventEmitter } from 'events';
import { SagaStateMachine, SagaPhase, SagaEvent } from '../state/sagaStateMachine';
import { NarratorService } from './narratorService';
import { ArbiterService } from './arbiterService';
import { SageService } from './sageService';
import { StorageManager } from '../storage/storageManager';
import { WorkspaceManager } from './workspaceManager';
import { ValidationService } from './validationService';
import type { ProviderInterface, ToolInterface, Config } from '@ouroboros/ouroboros-code-core';

export interface SagaSession {
  id: string;
  userGoal: string;
  startTime: number;
  phase: SagaPhase;
  designDocument?: string;
  implementation?: ImplementationResult;
  error?: Error;
}

export interface ImplementationResult {
  files: FileChange[];
  patch: string;
  validationResults: ValidationResult[];
  stats: {
    iterations: number;
    duration: number;
    tokensUsed: number;
  };
}

export interface FileChange {
  path: string;
  action: 'added' | 'modified' | 'deleted';
  lines: { added: number; removed: number };
  diff?: string;
}

export interface ValidationResult {
  gate: string;
  passed: boolean;
  output?: string;
  error?: string;
}

export class SagaService extends EventEmitter {
  private stateMachine: SagaStateMachine;
  private narratorService: NarratorService;
  private arbiterService: ArbiterService;
  private sageService: SageService;
  private storageManager: StorageManager;
  private workspaceManager: WorkspaceManager;
  private validationService: ValidationService;
  private currentSession?: SagaSession;

  constructor(
    private providers: Map<string, ProviderInterface>,
    private tools: ToolInterface,
    storageManager: StorageManager,
    private config: Config
  ) {
    super();
    this.stateMachine = new SagaStateMachine();
    this.storageManager = storageManager;
    this.workspaceManager = new WorkspaceManager(config.getTargetDir());
    this.validationService = new ValidationService(config);
    
    this.narratorService = new NarratorService(providers);
    this.arbiterService = new ArbiterService(providers);
    this.sageService = new SageService(providers, tools, this.validationService);

    this.setupStateMachine();
  }

  private setupStateMachine() {
    this.stateMachine.onTransition((state) => {
      this.emit('phaseChange', state.value, state.context);
      
      // Auto-trigger next phase actions
      switch (state.value) {
        case SagaPhase.NARRATING:
          this.runNarrator();
          break;
        case SagaPhase.DESIGN_READY:
          this.runArbiter();
          break;
        case SagaPhase.SAGE_RUNNING:
          this.runSage();
          break;
        case SagaPhase.RESULTS_READY:
          this.runValidation();
          break;
      }
    });
  }

  async startSession(userGoal: string): Promise<SagaSession> {
    const sessionId = this.generateSessionId(userGoal);
    
    this.currentSession = {
      id: sessionId,
      userGoal,
      startTime: Date.now(),
      phase: SagaPhase.IDLE,
    };

    this.stateMachine.start();
    this.stateMachine.send({ type: 'START', goal: userGoal });

    this.emit('sessionStarted', this.currentSession);
    
    return this.currentSession;
  }

  private async runNarrator() {
    if (!this.currentSession) return;

    try {
      this.emit('narratorStarted');
      
      // Run multi-provider design generation
      const designs = await this.narratorService.generateDesigns(
        this.currentSession.userGoal,
        (provider, status) => {
          this.emit('providerUpdate', { provider, status });
        }
      );

      this.stateMachine.send({ 
        type: 'DESIGN_COMPLETE', 
        designs 
      });
    } catch (error) {
      this.handleError(error as Error);
    }
  }

  private async runArbiter() {
    if (!this.currentSession) return;

    try {
      this.emit('arbiterStarted');
      
      const state = this.stateMachine.getState();
      const providerResults = state.context.providerResults;
      
      if (!providerResults || providerResults.size === 0) {
        throw new Error('No designs to synthesize');
      }

      // Synthesize designs into a single coherent document
      const synthesizedDesign = await this.arbiterService.synthesize(
        this.currentSession.userGoal,
        providerResults
      );

      this.currentSession.designDocument = synthesizedDesign;
      
      // Save design document
      await this.storageManager.saveDesignDocument(
        this.currentSession.id,
        synthesizedDesign,
        {
          userGoal: this.currentSession.userGoal,
          providers: Array.from(providerResults.keys()),
          timestamp: Date.now(),
        }
      );

      this.stateMachine.send({ 
        type: 'SYNTHESIS_COMPLETE', 
        design: synthesizedDesign 
      });
      
      this.emit('designReady', synthesizedDesign);
    } catch (error) {
      this.handleError(error as Error);
    }
  }

  private async runSage() {
    if (!this.currentSession || !this.currentSession.designDocument) return;

    try {
      this.emit('sageStarted');
      
      // Create ephemeral workspace
      const workspace = await this.workspaceManager.createEphemeralWorkspace(
        this.currentSession.id
      );
      
      this.emit('workspaceCreated', workspace);

      // Run automated implementation
      const implementation = await this.sageService.implement(
        this.currentSession.designDocument,
        workspace,
        {
          maxIterations: this.config.get('saga.maxIterations') || 10,
          onIteration: (iteration, status) => {
            this.emit('sageIteration', { iteration, status });
          },
          onTask: (task) => {
            this.emit('sageTask', task);
          },
        }
      );

      this.currentSession.implementation = implementation;
      
      this.stateMachine.send({ 
        type: 'IMPLEMENTATION_COMPLETE', 
        implementation 
      });
      
      this.emit('implementationComplete', implementation);
    } catch (error) {
      this.handleError(error as Error);
    }
  }

  private async runValidation() {
    if (!this.currentSession || !this.currentSession.implementation) return;

    try {
      this.emit('validationStarted');
      
      const workspace = await this.workspaceManager.getWorkspace(this.currentSession.id);
      if (!workspace) {
        throw new Error('No workspace found for validation');
      }

      // Run success gates validation
      const results = await this.validationService.validate(workspace);
      
      this.currentSession.implementation.validationResults = results;
      
      this.stateMachine.send({ 
        type: 'VALIDATION_COMPLETE', 
        results 
      });
      
      this.emit('validationComplete', results);
    } catch (error) {
      this.handleError(error as Error);
    }
  }

  async approveDesign() {
    this.stateMachine.send({ type: 'APPROVE_DESIGN' });
  }

  async reviseDesign(feedback: string) {
    this.stateMachine.send({ type: 'REVISE_DESIGN', feedback });
  }

  async editDesign(newDesign: string) {
    if (this.currentSession) {
      this.currentSession.designDocument = newDesign;
      this.stateMachine.send({ type: 'SAVE_DESIGN', design: newDesign });
    }
  }

  async approveChanges() {
    this.stateMachine.send({ type: 'APPROVE_CHANGES' });
    await this.persistChanges();
  }

  async rejectChanges() {
    this.stateMachine.send({ type: 'REJECT_CHANGES' });
  }

  private async persistChanges() {
    if (!this.currentSession || !this.currentSession.implementation) return;

    try {
      this.emit('persistStarted');
      
      const workspace = await this.workspaceManager.getWorkspace(this.currentSession.id);
      if (!workspace) {
        throw new Error('No workspace found for persistence');
      }

      // Apply patch to main workspace
      await this.workspaceManager.applyPatch(
        workspace,
        this.currentSession.implementation.patch
      );

      // Clean up ephemeral workspace
      await this.workspaceManager.cleanupWorkspace(this.currentSession.id);
      
      this.stateMachine.send({ type: 'PERSIST_COMPLETE' });
      
      this.emit('persistComplete');
    } catch (error) {
      this.handleError(error as Error);
    }
  }

  private handleError(error: Error) {
    if (this.currentSession) {
      this.currentSession.error = error;
    }
    this.stateMachine.send({ type: 'ERROR', error });
    this.emit('error', error);
  }

  private generateSessionId(userGoal: string): string {
    const slug = userGoal
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .substring(0, 30);
    const timestamp = Date.now();
    return `${slug}-${timestamp}`;
  }

  getCurrentPhase(): SagaPhase {
    return this.stateMachine.getState().value as SagaPhase;
  }

  getCurrentSession(): SagaSession | undefined {
    return this.currentSession;
  }

  async cleanup() {
    this.stateMachine.stop();
    if (this.currentSession) {
      await this.workspaceManager.cleanupWorkspace(this.currentSession.id);
    }
  }
}
/**
 * State machine for Vision Quest workflow
 */

import { createMachine, interpret, State } from 'xstate';

export enum SagaPhase {
  IDLE = 'idle',
  NARRATING = 'narrating',
  DESIGN_READY = 'design_ready',
  EDITING = 'editing',
  AWAITING_DESIGN_APPROVAL = 'awaiting_approval_design',
  SAGE_RUNNING = 'sage_running',
  RESULTS_READY = 'results_ready',
  REVIEWING_DIFFS = 'review_diffs',
  AWAITING_CHANGES_APPROVAL = 'awaiting_approval_changes',
  PERSISTING = 'persist_or_discard',
  DONE = 'done',
  ERROR = 'error'
}

export interface SagaContext {
  userGoal: string;
  designDocument?: string;
  providerResults?: Map<string, string>;
  synthesizedDesign?: string;
  implementation?: {
    files: string[];
    patch: string;
    validationResults: ValidationResult[];
  };
  error?: Error;
  stats: {
    phase: SagaPhase;
    startTime: number;
    phaseTimings: Map<SagaPhase, number>;
    tokenUsage: Map<string, number>;
    providerCalls: Map<string, number>;
  };
}

export interface ValidationResult {
  gate: string;
  passed: boolean;
  output?: string;
  error?: string;
}

export type SagaEvent =
  | { type: 'START'; goal: string }
  | { type: 'DESIGN_COMPLETE'; designs: Map<string, string> }
  | { type: 'SYNTHESIS_COMPLETE'; design: string }
  | { type: 'EDIT_DESIGN' }
  | { type: 'SAVE_DESIGN'; design: string }
  | { type: 'APPROVE_DESIGN' }
  | { type: 'REVISE_DESIGN'; feedback: string }
  | { type: 'IMPLEMENTATION_COMPLETE'; implementation: any }
  | { type: 'VALIDATION_COMPLETE'; results: ValidationResult[] }
  | { type: 'REVIEW_DIFFS' }
  | { type: 'APPROVE_CHANGES' }
  | { type: 'REJECT_CHANGES' }
  | { type: 'PERSIST_COMPLETE' }
  | { type: 'ERROR'; error: Error };

export const createSagaStateMachine = () => {
  return createMachine<SagaContext, SagaEvent>({
    id: 'saga',
    initial: SagaPhase.IDLE,
    context: {
      userGoal: '',
      stats: {
        phase: SagaPhase.IDLE,
        startTime: Date.now(),
        phaseTimings: new Map(),
        tokenUsage: new Map(),
        providerCalls: new Map(),
      }
    },
    states: {
      [SagaPhase.IDLE]: {
        on: {
          START: {
            target: SagaPhase.NARRATING,
            actions: (context, event) => {
              context.userGoal = event.goal;
              context.stats.startTime = Date.now();
            }
          }
        }
      },
      [SagaPhase.NARRATING]: {
        entry: (context) => {
          context.stats.phase = SagaPhase.NARRATING;
        },
        on: {
          DESIGN_COMPLETE: {
            target: SagaPhase.DESIGN_READY,
            actions: (context, event) => {
              context.providerResults = event.designs;
              context.stats.phaseTimings.set(
                SagaPhase.NARRATING, 
                Date.now() - context.stats.startTime
              );
            }
          },
          ERROR: {
            target: SagaPhase.ERROR
          }
        }
      },
      [SagaPhase.DESIGN_READY]: {
        entry: (context) => {
          context.stats.phase = SagaPhase.DESIGN_READY;
        },
        on: {
          SYNTHESIS_COMPLETE: {
            target: SagaPhase.AWAITING_DESIGN_APPROVAL,
            actions: (context, event) => {
              context.synthesizedDesign = event.design;
            }
          },
          EDIT_DESIGN: {
            target: SagaPhase.EDITING
          },
          ERROR: {
            target: SagaPhase.ERROR
          }
        }
      },
      [SagaPhase.EDITING]: {
        on: {
          SAVE_DESIGN: {
            target: SagaPhase.AWAITING_DESIGN_APPROVAL,
            actions: (context, event) => {
              context.synthesizedDesign = event.design;
            }
          }
        }
      },
      [SagaPhase.AWAITING_DESIGN_APPROVAL]: {
        on: {
          APPROVE_DESIGN: {
            target: SagaPhase.SAGE_RUNNING
          },
          REVISE_DESIGN: {
            target: SagaPhase.NARRATING,
            actions: (context, event) => {
              // Store revision feedback for next iteration
              context.userGoal = `${context.userGoal}\n\nRevision feedback: ${event.feedback}`;
            }
          },
          EDIT_DESIGN: {
            target: SagaPhase.EDITING
          }
        }
      },
      [SagaPhase.SAGE_RUNNING]: {
        entry: (context) => {
          context.stats.phase = SagaPhase.SAGE_RUNNING;
        },
        on: {
          IMPLEMENTATION_COMPLETE: {
            target: SagaPhase.RESULTS_READY,
            actions: (context, event) => {
              context.implementation = event.implementation;
              context.stats.phaseTimings.set(
                SagaPhase.SAGE_RUNNING,
                Date.now() - context.stats.startTime
              );
            }
          },
          ERROR: {
            target: SagaPhase.ERROR
          }
        }
      },
      [SagaPhase.RESULTS_READY]: {
        on: {
          VALIDATION_COMPLETE: {
            target: SagaPhase.REVIEWING_DIFFS,
            actions: (context, event) => {
              if (context.implementation) {
                context.implementation.validationResults = event.results;
              }
            }
          }
        }
      },
      [SagaPhase.REVIEWING_DIFFS]: {
        on: {
          APPROVE_CHANGES: {
            target: SagaPhase.PERSISTING
          },
          REJECT_CHANGES: {
            target: SagaPhase.AWAITING_DESIGN_APPROVAL
          }
        }
      },
      [SagaPhase.PERSISTING]: {
        on: {
          PERSIST_COMPLETE: {
            target: SagaPhase.DONE
          },
          ERROR: {
            target: SagaPhase.ERROR
          }
        }
      },
      [SagaPhase.DONE]: {
        type: 'final'
      },
      [SagaPhase.ERROR]: {
        entry: (context, event) => {
          if (event.type === 'ERROR') {
            context.error = event.error;
          }
        },
        type: 'final'
      }
    }
  });
};

export class SagaStateMachine {
  private machine: ReturnType<typeof createSagaStateMachine>;
  private service: any;

  constructor() {
    this.machine = createSagaStateMachine();
    this.service = interpret(this.machine);
  }

  start() {
    this.service.start();
  }

  send(event: SagaEvent) {
    this.service.send(event);
  }

  getState(): State<SagaContext, SagaEvent> {
    return this.service.state;
  }

  onTransition(callback: (state: State<SagaContext, SagaEvent>) => void) {
    this.service.onTransition(callback);
  }

  stop() {
    this.service.stop();
  }
}
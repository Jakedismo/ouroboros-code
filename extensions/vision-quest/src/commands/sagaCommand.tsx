/**
 * Saga command implementation - launches the Vision Quest TUI
 */

import React from 'react';
import { render } from 'ink';
import type { CommandContext, SlashCommandActionReturn } from '@ouroboros/ouroboros-code-core';
import { SagaService } from '../services/sagaService';
import { SagaFrame } from '../ui/SagaFrame';
import { SagaPhase } from '../state/sagaStateMachine';

export class SagaCommand {
  constructor(
    private sagaService: SagaService,
    private context: CommandContext
  ) {}

  async execute(args: string): Promise<SlashCommandActionReturn> {
    const userGoal = args.trim();
    
    if (!userGoal) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Please provide a goal for your Vision Quest. Usage: /saga "your development goal"',
      };
    }

    // Start the saga session
    const session = await this.sagaService.startSession(userGoal);
    
    // Launch the TUI
    const app = render(
      <SagaApp 
        sagaService={this.sagaService}
        session={session}
        context={this.context}
      />
    );

    // Return control to the TUI
    return {
      type: 'tui',
      cleanup: async () => {
        app.unmount();
        await this.sagaService.cleanup();
      }
    };
  }
}

interface SagaAppProps {
  sagaService: SagaService;
  session: any;
  context: CommandContext;
}

const SagaApp: React.FC<SagaAppProps> = ({ sagaService, session, context }) => {
  const [phase, setPhase] = React.useState(SagaPhase.IDLE);
  const [designDocument, setDesignDocument] = React.useState<string>();
  const [providerResults, setProviderResults] = React.useState(new Map());
  const [implementation, setImplementation] = React.useState<any>();
  const [error, setError] = React.useState<Error>();

  React.useEffect(() => {
    // Subscribe to saga service events
    const handlePhaseChange = (newPhase: SagaPhase) => {
      setPhase(newPhase);
    };

    const handleDesignReady = (design: string) => {
      setDesignDocument(design);
    };

    const handleProviderUpdate = (update: any) => {
      setProviderResults(prev => {
        const newMap = new Map(prev);
        newMap.set(update.provider, update.status);
        return newMap;
      });
    };

    const handleImplementationComplete = (impl: any) => {
      setImplementation(impl);
    };

    const handleError = (err: Error) => {
      setError(err);
      context.ui.addItem({
        type: 'error',
        text: `Vision Quest error: ${err.message}`,
      }, Date.now());
    };

    sagaService.on('phaseChange', handlePhaseChange);
    sagaService.on('designReady', handleDesignReady);
    sagaService.on('providerUpdate', handleProviderUpdate);
    sagaService.on('implementationComplete', handleImplementationComplete);
    sagaService.on('error', handleError);

    return () => {
      sagaService.off('phaseChange', handlePhaseChange);
      sagaService.off('designReady', handleDesignReady);
      sagaService.off('providerUpdate', handleProviderUpdate);
      sagaService.off('implementationComplete', handleImplementationComplete);
      sagaService.off('error', handleError);
    };
  }, [sagaService, context]);

  const handleEditDesign = () => {
    // Enter edit mode
    setPhase(SagaPhase.EDITING);
  };

  const handleApproveDesign = async () => {
    await sagaService.approveDesign();
  };

  const handleReviseDesign = async (feedback: string) => {
    await sagaService.reviseDesign(feedback);
  };

  const handleApproveChanges = async () => {
    await sagaService.approveChanges();
  };

  const handleRejectChanges = async () => {
    await sagaService.rejectChanges();
  };

  const handlePersist = async (commitMessage: string) => {
    // Persist changes with commit message
    context.ui.addItem({
      type: 'info',
      text: `Persisting changes: ${commitMessage}`,
    }, Date.now());
    
    await sagaService.approveChanges();
  };

  const handleDiscard = async () => {
    await sagaService.rejectChanges();
  };

  const handleExit = () => {
    process.exit(0);
  };

  return (
    <SagaFrame
      phase={phase}
      projectName={context.services.config?.getTargetDir() || 'Unknown Project'}
      branch="main"
      userGoal={session.userGoal}
      designDocument={designDocument}
      providerResults={providerResults}
      implementation={implementation}
      onEditDesign={handleEditDesign}
      onApproveDesign={handleApproveDesign}
      onReviseDesign={handleReviseDesign}
      onApproveChanges={handleApproveChanges}
      onRejectChanges={handleRejectChanges}
      onPersist={handlePersist}
      onDiscard={handleDiscard}
      onExit={handleExit}
    />
  );
};
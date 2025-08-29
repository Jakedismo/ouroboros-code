/**
 * Main TUI frame for Vision Quest
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import Gradient from 'ink-gradient';
import Spinner from 'ink-spinner';
import { SagaPhase } from '../state/sagaStateMachine';
import { NarratorView } from './NarratorView';
import { DesignViewer } from './DesignViewer';
import { SageProgress } from './SageProgress';
import { CodePressReview } from './CodePressReview';
import { FinalizeDialog } from './FinalizeDialog';

interface SagaFrameProps {
  phase: SagaPhase;
  projectName: string;
  branch?: string;
  userGoal: string;
  designDocument?: string;
  providerResults?: Map<string, ProviderResult>;
  implementation?: ImplementationResult;
  onEditDesign?: () => void;
  onApproveDesign?: () => void;
  onReviseDesign?: (feedback: string) => void;
  onApproveChanges?: () => void;
  onRejectChanges?: () => void;
  onPersist?: (commitMessage: string) => void;
  onDiscard?: () => void;
  onExit?: () => void;
}

interface ProviderResult {
  provider: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  duration?: number;
  design?: string;
  error?: string;
}

interface ImplementationResult {
  files: FileChange[];
  patch: string;
  validationResults: ValidationResult[];
  stats: {
    iterations: number;
    duration: number;
    tokensUsed: number;
  };
}

interface FileChange {
  path: string;
  action: 'added' | 'modified' | 'deleted';
  lines: { added: number; removed: number };
}

interface ValidationResult {
  gate: string;
  passed: boolean;
  output?: string;
}

export const SagaFrame: React.FC<SagaFrameProps> = ({
  phase,
  projectName,
  branch = 'main',
  userGoal,
  designDocument,
  providerResults,
  implementation,
  onEditDesign,
  onApproveDesign,
  onReviseDesign,
  onApproveChanges,
  onRejectChanges,
  onPersist,
  onDiscard,
  onExit,
}) => {
  const { exit } = useApp();
  const [showHelp, setShowHelp] = useState(false);

  // Handle global keyboard shortcuts
  useInput((input, key) => {
    if (key.escape) {
      onExit ? onExit() : exit();
    }
    if (input === '?') {
      setShowHelp(!showHelp);
    }
  });

  const renderPhaseIndicator = () => {
    const phases = [
      { name: 'Narrator', phase: SagaPhase.NARRATING },
      { name: 'Sage', phase: SagaPhase.SAGE_RUNNING },
      { name: 'CodePress', phase: SagaPhase.REVIEWING_DIFFS },
    ];

    return (
      <Box>
        {phases.map((p, i) => (
          <React.Fragment key={p.name}>
            <Text
              color={
                phase === p.phase ? '#00ff00' :
                phases.findIndex(ph => ph.phase === phase) > i ? '#888888' : '#444444'
              }
              bold={phase === p.phase}
            >
              {p.name}
            </Text>
            {i < phases.length - 1 && <Text color="#666666"> ▷ </Text>}
          </React.Fragment>
        ))}
      </Box>
    );
  };

  const renderHeader = () => (
    <Box
      borderStyle="round"
      borderColor="#8B5CF6"
      paddingX={1}
      width="100%"
      flexDirection="column"
    >
      <Box justifyContent="space-between">
        <Gradient colors={['#4d21fc', '#847ace', '#ff628c']}>
          <Text bold>┌─ Vision Quest — /saga ─────────────────────────────────────┐</Text>
        </Gradient>
      </Box>
      <Box justifyContent="space-between">
        <Text>Project: <Text color="#89B4FA">{projectName}</Text></Text>
        <Text>Branch: <Text color="#F9E2AF">{branch}</Text></Text>
        <Text>Provider: <Text color="#A6E3A1">auto</Text></Text>
      </Box>
      <Box marginTop={1}>
        <Text>Phase: </Text>
        {renderPhaseIndicator()}
      </Box>
    </Box>
  );

  const renderContent = () => {
    switch (phase) {
      case SagaPhase.IDLE:
        return (
          <Box padding={2}>
            <Text color="#888888">Initializing Vision Quest...</Text>
          </Box>
        );

      case SagaPhase.NARRATING:
        return (
          <NarratorView
            userGoal={userGoal}
            providerResults={providerResults}
          />
        );

      case SagaPhase.DESIGN_READY:
      case SagaPhase.AWAITING_DESIGN_APPROVAL:
      case SagaPhase.EDITING:
        return (
          <DesignViewer
            design={designDocument || ''}
            isEditing={phase === SagaPhase.EDITING}
            onEdit={onEditDesign}
            onApprove={onApproveDesign}
            onRevise={onReviseDesign}
          />
        );

      case SagaPhase.SAGE_RUNNING:
        return (
          <SageProgress
            designTitle={userGoal}
            iteration={implementation?.stats.iterations || 1}
            duration={implementation?.stats.duration || 0}
            validationResults={implementation?.validationResults || []}
          />
        );

      case SagaPhase.REVIEWING_DIFFS:
        return (
          <CodePressReview
            implementation={implementation!}
            onApprove={onApproveChanges}
            onReject={onRejectChanges}
          />
        );

      case SagaPhase.PERSISTING:
        return (
          <FinalizeDialog
            implementation={implementation!}
            onPersist={onPersist}
            onDiscard={onDiscard}
          />
        );

      case SagaPhase.DONE:
        return (
          <Box padding={2} flexDirection="column">
            <Gradient colors={['#00ff00', '#00cc00']}>
              <Text bold>✅ Vision Quest Complete!</Text>
            </Gradient>
            <Text marginTop={1}>Your implementation has been successfully applied.</Text>
            <Text color="#888888">Press ESC to exit.</Text>
          </Box>
        );

      case SagaPhase.ERROR:
        return (
          <Box padding={2}>
            <Text color="#ff0000">❌ An error occurred. Please check the logs.</Text>
          </Box>
        );

      default:
        return (
          <Box padding={2}>
            <Text>Phase: {phase}</Text>
          </Box>
        );
    }
  };

  const renderHelp = () => {
    if (!showHelp) return null;

    return (
      <Box
        borderStyle="single"
        borderColor="#666666"
        padding={1}
        marginTop={1}
      >
        <Box flexDirection="column">
          <Text bold color="#F9E2AF">Keyboard Shortcuts:</Text>
          <Text>ESC - Exit  | ? - Toggle help  | ↑↓ - Navigate</Text>
          <Text>E - Edit    | A - Approve      | R - Revise</Text>
          <Text>O - Open in $EDITOR | D - View diff | P - Pause</Text>
        </Box>
      </Box>
    );
  };

  return (
    <Box flexDirection="column" width="100%">
      {renderHeader()}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="#444444"
        marginTop={1}
        minHeight={20}
      >
        {renderContent()}
      </Box>
      {renderHelp()}
    </Box>
  );
};
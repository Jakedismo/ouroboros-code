/**
 * Narrator phase view - shows multi-provider design generation
 */

import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import Gradient from 'ink-gradient';

interface ProviderResult {
  provider: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  duration?: number;
  design?: string;
  error?: string;
}

interface NarratorViewProps {
  userGoal: string;
  providerResults?: Map<string, ProviderResult>;
}

export const NarratorView: React.FC<NarratorViewProps> = ({
  userGoal,
  providerResults = new Map(),
}) => {
  const providers = [
    { id: 'gpt-5', name: 'GPT-5', color: '#00A67E' },
    { id: 'claude-opus-4-1', name: 'Claude Opus 4.1', color: '#8B5CF6' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', color: '#4285F4' },
  ];

  const renderProviderStatus = (providerId: string, providerName: string, color: string) => {
    const result = providerResults.get(providerId) || { 
      provider: providerId, 
      status: 'pending' 
    };

    const statusIcon = {
      pending: '○',
      running: <Spinner type="dots" />,
      complete: '✓',
      error: '✗',
    }[result.status];

    const statusColor = {
      pending: '#666666',
      running: '#F9E2AF',
      complete: '#00ff00',
      error: '#ff0000',
    }[result.status];

    return (
      <Box key={providerId} marginY={0}>
        <Box width={20}>
          <Text color={color}>{providerName}</Text>
        </Box>
        <Box width={15}>
          <Text color={statusColor}>
            {typeof statusIcon === 'string' ? statusIcon : statusIcon} {result.status}
          </Text>
        </Box>
        {result.duration && (
          <Text color="#888888">({result.duration.toFixed(1)}s)</Text>
        )}
      </Box>
    );
  };

  const allComplete = Array.from(providerResults.values()).every(
    r => r.status === 'complete' || r.status === 'error'
  );

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Gradient colors={['#4d21fc', '#847ace']}>
          <Text bold>[Narrator] Generating design documents...</Text>
        </Gradient>
      </Box>

      <Box flexDirection="column" marginLeft={2}>
        <Text color="#888888" italic>Goal: {userGoal}</Text>
      </Box>

      <Box flexDirection="column" marginTop={2}>
        <Text bold color="#F9E2AF">Provider Status (fan-out to top models):</Text>
        <Box flexDirection="column" marginTop={1} marginLeft={2}>
          {providers.map(p => renderProviderStatus(p.id, p.name, p.color))}
        </Box>
      </Box>

      {allComplete && (
        <Box marginTop={2} flexDirection="column">
          <Box>
            <Text color="#00ff00">✓ All providers complete</Text>
          </Box>
          <Box marginTop={1}>
            <Gradient colors={['#8B5CF6', '#ff628c']}>
              <Text bold>[Arbiter] Synthesizing designs...</Text>
            </Gradient>
          </Box>
          <Box marginLeft={2}>
            <Text color="#888888">Using Claude Opus 4.1 (fallback: GPT-5 → Gemini)</Text>
          </Box>
        </Box>
      )}

      <Box marginTop={2} borderStyle="single" borderColor="#444444" padding={1}>
        <Box flexDirection="column">
          <Text color="#666666" dimColor>
            💡 Narrator is analyzing your goal and generating comprehensive design
          </Text>
          <Text color="#666666" dimColor>
            documents from multiple AI providers for the best result.
          </Text>
        </Box>
      </Box>
    </Box>
  );
};
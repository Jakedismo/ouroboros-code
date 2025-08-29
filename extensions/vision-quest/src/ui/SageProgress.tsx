/**
 * Sage phase progress view - shows automated implementation
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import Gradient from 'ink-gradient';

interface ValidationResult {
  gate: string;
  passed: boolean;
  output?: string;
}

interface SageProgressProps {
  designTitle: string;
  iteration: number;
  duration: number;
  tasks?: Task[];
  logs?: string[];
  validationResults: ValidationResult[];
  onPause?: () => void;
  onStop?: () => void;
}

interface Task {
  name: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  description?: string;
}

export const SageProgress: React.FC<SageProgressProps> = ({
  designTitle,
  iteration,
  duration,
  tasks = [],
  logs = [],
  validationResults,
  onPause,
  onStop,
}) => {
  const [showLogs, setShowLogs] = useState(true);
  const [logScrollOffset, setLogScrollOffset] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const defaultTasks: Task[] = tasks.length > 0 ? tasks : [
    { name: 'Create files', status: 'complete', description: 'Setting up project structure' },
    { name: 'Update docs', status: 'running', description: 'Updating documentation' },
    { name: 'Add tests', status: 'pending', description: 'Writing test cases' },
    { name: 'Wire scripts', status: 'pending', description: 'Configuring build scripts' },
  ];

  const defaultLogs = logs.length > 0 ? logs : [
    '$ tsc --noEmit',
    'Checking TypeScript compilation...',
    '✓ No errors found',
    '$ npm run lint --fix',
    'Running ESLint with auto-fix...',
    'Fixed 3 issues',
    '$ npm test',
    'Running test suite...',
  ];

  const visibleLogs = defaultLogs.slice(logScrollOffset, logScrollOffset + 8);

  useInput((input, key) => {
    if (input === 'p' || input === 'P') {
      setIsPaused(!isPaused);
      onPause?.();
    } else if (input === 's' || input === 'S') {
      onStop?.();
    } else if (input === 'l' || input === 'L') {
      setShowLogs(!showLogs);
    } else if (input === 'v' || input === 'V') {
      // View patch - would open diff viewer
    }

    if (key.upArrow) {
      setLogScrollOffset(Math.max(0, logScrollOffset - 1));
    } else if (key.downArrow) {
      setLogScrollOffset(Math.min(defaultLogs.length - 8, logScrollOffset + 1));
    }
  });

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const renderTask = (task: Task) => {
    const icon = {
      pending: '○',
      running: <Spinner type="dots" />,
      complete: '✓',
      error: '✗',
    }[task.status];

    const color = {
      pending: '#666666',
      running: '#F9E2AF',
      complete: '#00ff00',
      error: '#ff0000',
    }[task.status];

    return (
      <Box key={task.name}>
        <Box width={2}>
          <Text color={color}>{typeof icon === 'string' ? icon : icon}</Text>
        </Box>
        <Box width={15}>
          <Text color={task.status === 'running' ? '#F9E2AF' : '#CDD6F4'}>
            {task.name}
          </Text>
        </Box>
        {task.description && (
          <Text color="#666666" dimColor>
            {task.description}
          </Text>
        )}
      </Box>
    );
  };

  const renderGate = (result: ValidationResult) => {
    const icon = result.passed ? '✓' : '✗';
    const color = result.passed ? '#00ff00' : '#ff0000';

    return (
      <Box key={result.gate}>
        <Text color={color}>[{icon}]</Text>
        <Text color="#CDD6F4"> {result.gate}</Text>
      </Box>
    );
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="#4285F4" padding={1}>
        <Box flexDirection="column">
          <Gradient colors={['#00A67E', '#4285F4']}>
            <Text bold>┌─ Sage: Automated Implementation ─────────────────┐</Text>
          </Gradient>
          
          <Box marginTop={1} justifyContent="space-between">
            <Text>Plan: <Text color="#89B4FA">{designTitle}</Text></Text>
          </Box>
          
          <Box justifyContent="space-between">
            <Text>Iteration: <Text color="#F9E2AF">{iteration}</Text></Text>
            <Text>Time: <Text color="#A6E3A1">{formatDuration(duration)}</Text></Text>
            {isPaused && <Text color="#ff0000" bold>PAUSED</Text>}
          </Box>
        </Box>
      </Box>

      <Box marginTop={1} height={12}>
        <Box width="33%" flexDirection="column" borderStyle="single" borderColor="#444444" padding={1}>
          <Text bold color="#F9E2AF">Tasks</Text>
          <Box flexDirection="column" marginTop={1}>
            {defaultTasks.map(renderTask)}
          </Box>
        </Box>

        <Box width="34%" flexDirection="column" borderStyle="single" borderColor="#444444" padding={1} marginX={1}>
          <Text bold color="#89B4FA">Live Logs</Text>
          <Box flexDirection="column" marginTop={1}>
            {visibleLogs.map((log, i) => (
              <Text key={i} color="#888888" wrap="truncate">
                {log}
              </Text>
            ))}
          </Box>
        </Box>

        <Box width="33%" flexDirection="column" borderStyle="single" borderColor="#444444" padding={1}>
          <Text bold color="#A6E3A1">Success Gates</Text>
          <Box flexDirection="column" marginTop={1}>
            {validationResults.length > 0 ? (
              validationResults.map(renderGate)
            ) : (
              <>
                <Box><Text color="#666666">[○] tsc clean</Text></Box>
                <Box><Text color="#666666">[○] lint clean</Text></Box>
                <Box><Text color="#666666">[○] tests passing</Text></Box>
                <Box><Text color="#666666">[○] docs updated</Text></Box>
              </>
            )}
          </Box>
        </Box>
      </Box>

      <Box marginTop={1} justifyContent="center">
        <Text color="#666666">
          P pause • L logs • V view patch • S stop & review
        </Text>
      </Box>
    </Box>
  );
};
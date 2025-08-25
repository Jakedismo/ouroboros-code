/**
 * @license
 * Copyright 2025 Ouroboros
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text, useApp, useInput } from 'ink';

export type GateStatus = 'pending' | 'ok' | 'fail' | 'skipped';

export interface ActionUIState {
  logs: string[];
  gates: {
    tsc?: GateStatus;
    lint?: GateStatus;
    test?: GateStatus;
  };
  lastOutput?: string;
}

export const SagaActionProgress: React.FC<{ state: ActionUIState }> = ({ state }) => {
  const { exit } = useApp();

  useInput((input, key) => {
    if (key.escape || input === 'q') exit();
  });

  const sidebar = (
    <Box flexDirection="column" width={28} marginRight={2}>
      <Text>Gates</Text>
      <Text>───────────────</Text>
      <Status label="TypeScript" status={state.gates.tsc} />
      <Status label="Lint" status={state.gates.lint} />
      <Status label="Test" status={state.gates.test} />
      <Text>───────────────</Text>
      <Text color="gray">Press q to quit</Text>
    </Box>
  );

  const logPanel = (
    <Box flexDirection="column">
      <Text>Progress</Text>
      <Text>──────────────────────────────────────────────────────────────</Text>
      {state.logs.length === 0 ? <Text color="gray">(no logs)</Text> : state.logs.slice(-20).map((l, i) => <Text key={i}>• {l}</Text>)}
      <Text>──────────────────────────────────────────────────────────────</Text>
      {!!state.lastOutput && (
        <>
          <Text>Last Output</Text>
          <Text>──────────────────────────────────────────────────────────────</Text>
          <Text>{state.lastOutput}</Text>
        </>
      )}
    </Box>
  );

  return (
    <Box>
      {sidebar}
      {logPanel}
    </Box>
  );
};

const Status: React.FC<{ label: string; status?: GateStatus }> = ({ label, status }) => {
  let symbol = '•';
  let color: any = undefined;
  switch (status) {
    case 'pending': symbol = '…'; color = 'yellow'; break;
    case 'ok': symbol = '✓'; color = 'green'; break;
    case 'fail': symbol = '✗'; color = 'red'; break;
    case 'skipped': symbol = '⤼'; color = 'gray'; break;
    default: symbol = '•'; color = undefined; break;
  }
  return <Text color={color}>{symbol} {label}</Text>;
};


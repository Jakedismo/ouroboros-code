/**
 * @license
 * Copyright 2025 Ouroboros
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';

export interface FileEntry {
  status: string; // M/A/D/R...
  path: string;
  accepted?: boolean;
}

export type GateStatus = 'pending' | 'ok' | 'fail' | 'skipped';

export interface SagaCodePressProps {
  files: FileEntry[];
  loadDiff: (file: string) => Promise<string>;
  onAcceptFile: (file: string) => Promise<void> | void;
  onDiscardFile: (file: string) => Promise<void> | void;
  onAcceptAll: () => Promise<void> | void;
  onDiscardAll: () => Promise<void> | void;
  onExit?: () => void;
  gateStatuses?: { tsc?: GateStatus; lint?: GateStatus; test?: GateStatus };
  snapshotId?: string;
  summary?: string;
}

export const SagaCodePress: React.FC<SagaCodePressProps> = ({
  files: initial,
  loadDiff,
  onAcceptFile,
  onDiscardFile,
  onAcceptAll,
  onDiscardAll,
  onExit,
  gateStatuses,
  snapshotId,
  summary,
}) => {
  const { exit } = useApp();
  const [files, setFiles] = useState<FileEntry[]>(initial);
  const [idx, setIdx] = useState(0);
  const [diff, setDiff] = useState<string>('');
  const [status, setStatus] = useState('↑/↓ navigate • a accept • d discard • A accept all • X discard all • q quit');

  useEffect(() => {
    (async () => {
      if (files.length > 0) {
        setDiff(await loadDiff(files[idx]?.path));
      } else {
        setDiff('(no files)');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, files.length]);

  useInput(async (input, key) => {
    if (key.escape || input === 'q') {
      onExit?.();
      exit();
    }
    if (key.upArrow) setIdx((i) => (i > 0 ? i - 1 : i));
    if (key.downArrow) setIdx((i) => (i < files.length - 1 ? i + 1 : i));

    const current = files[idx];
    if (!current) return;

    if (input === 'a') {
      setStatus(`Accepting ${current.path}...`);
      await onAcceptFile(current.path);
      setFiles((prev) => prev.map((f, i) => (i === idx ? { ...f, accepted: true } : f)));
      setStatus('Accepted. ' + help());
    }
    if (input === 'd') {
      setStatus(`Discarding ${current.path}...`);
      await onDiscardFile(current.path);
      // remove from list after discard
      setFiles((prev) => prev.filter((_, i) => i !== idx));
      setIdx((i) => (i > 0 ? i - 1 : 0));
      setStatus('Discarded. ' + help());
    }
    if (input === 'A') {
      setStatus('Accepting all...');
      await onAcceptAll();
      setFiles((prev) => prev.map((f) => ({ ...f, accepted: true })));
      setStatus('All marked accepted. ' + help());
    }
    if (input === 'X') {
      setStatus('Discarding all changes...');
      await onDiscardAll();
      setFiles([]);
      setStatus('All discarded. Press q to quit.');
    }
  });

  function help() {
    return '↑/↓ navigate • a accept • d discard • A accept all • X discard all • q quit';
  }

  const leftWidth = 42;

  return (
    <Box flexDirection="column">
      <Text>CodePress — Review & Per-file Accept/Discard</Text>
      <Text>────────────────────────────────────────────────────────────────────────────</Text>
      <Box>
        <Box width={leftWidth} flexDirection="column" marginRight={2}>
          <Text>Snapshot: {snapshotId || '-'}</Text>
          <Text>Gates:</Text>
          <Text>  {renderGate('TS', gateStatuses?.tsc)}  {renderGate('Lint', gateStatuses?.lint)}  {renderGate('Test', gateStatuses?.test)}</Text>
          <Text>──────── Files ────────</Text>
          {files.length === 0 && <Text color="gray">(no changes)</Text>}
          {files.map((f, i) => (
            <Text key={f.path} color={i === idx ? 'cyan' : f.accepted ? 'green' : undefined}>
              {i === idx ? '➤ ' : '  '}{f.status.padEnd(2)} {f.path}
              {f.accepted ? ' (accepted)' : ''}
            </Text>
          ))}
        </Box>
        <Box flexDirection="column">
          <Text>{diff || '(no diff)'}</Text>
        </Box>
      </Box>
      <Text>────────────────────────────────────────────────────────────────────────────</Text>
      {!!summary && <Text>{summary}</Text>}
      <Text color="green">{status}</Text>
    </Box>
  );
};

function renderGate(label: string, status?: GateStatus) {
  let sym = '•';
  let color: any = undefined;
  switch (status) {
    case 'pending': sym = '…'; color = 'yellow'; break;
    case 'ok': sym = '✓'; color = 'green'; break;
    case 'fail': sym = '✗'; color = 'red'; break;
    case 'skipped': sym = '⤼'; color = 'gray'; break;
    default: sym = '•'; color = 'gray'; break;
  }
  return `${sym} ${label}`;
}

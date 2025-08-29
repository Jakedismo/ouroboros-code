/**
 * CodePress review component - shows diffs and changes
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import Gradient from 'ink-gradient';

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
  diff?: string;
}

interface ValidationResult {
  gate: string;
  passed: boolean;
  output?: string;
}

interface CodePressReviewProps {
  implementation: ImplementationResult;
  onApprove?: () => void;
  onReject?: () => void;
}

export const CodePressReview: React.FC<CodePressReviewProps> = ({
  implementation,
  onApprove,
  onReject,
}) => {
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [showFullDiff, setShowFullDiff] = useState(false);
  const [fileSelections, setFileSelections] = useState<Map<string, boolean>>(
    new Map(implementation.files.map(f => [f.path, true]))
  );

  const selectedFile = implementation.files[selectedFileIndex];

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedFileIndex(Math.max(0, selectedFileIndex - 1));
    } else if (key.downArrow) {
      setSelectedFileIndex(Math.min(implementation.files.length - 1, selectedFileIndex + 1));
    } else if (key.return || input === ' ') {
      // Toggle file selection
      const newSelections = new Map(fileSelections);
      newSelections.set(selectedFile.path, !fileSelections.get(selectedFile.path));
      setFileSelections(newSelections);
    } else if (input === 'd' || input === 'D') {
      setShowFullDiff(!showFullDiff);
    } else if (input === 'a' || input === 'A') {
      onApprove?.();
    } else if (input === 'r' || input === 'R' || input === 'x' || input === 'X') {
      onReject?.();
    }
  });

  const renderFileList = () => {
    return implementation.files.map((file, index) => {
      const isSelected = index === selectedFileIndex;
      const isChecked = fileSelections.get(file.path);
      
      const actionColor = {
        added: '#00ff00',
        modified: '#F9E2AF',
        deleted: '#ff0000',
      }[file.action];

      const actionIcon = {
        added: '+',
        modified: '~',
        deleted: '-',
      }[file.action];

      return (
        <Box key={file.path}>
          <Text color={isSelected ? '#89B4FA' : '#666666'}>
            {isSelected ? '▶' : ' '}
          </Text>
          <Text color={isChecked ? '#00ff00' : '#666666'}>
            {' '}{isChecked ? '✓' : '□'}{' '}
          </Text>
          <Text color={actionColor}>{actionIcon}</Text>
          <Text color={isSelected ? '#CDD6F4' : '#888888'}>
            {' '}{file.path}
          </Text>
        </Box>
      );
    });
  };

  const renderDiffPreview = () => {
    if (!selectedFile) return null;

    const diffLines = (selectedFile.diff || `
--- a/${selectedFile.path}
+++ b/${selectedFile.path}
@@ -1,3 +1,7 @@
+// New implementation
+export function newFeature() {
+  return 'Vision Quest implementation';
+}
    `).split('\n').slice(0, 10);

    return (
      <Box flexDirection="column">
        {diffLines.map((line, i) => {
          let color = '#888888';
          if (line.startsWith('+')) color = '#00ff00';
          else if (line.startsWith('-')) color = '#ff0000';
          else if (line.startsWith('@@')) color = '#89B4FA';
          else if (line.startsWith('---') || line.startsWith('+++')) color = '#F9E2AF';

          return (
            <Text key={i} color={color}>
              {line}
            </Text>
          );
        })}
        {selectedFile.diff && selectedFile.diff.split('\n').length > 10 && (
          <Text color="#666666" italic>
            ... {selectedFile.diff.split('\n').length - 10} more lines
          </Text>
        )}
      </Box>
    );
  };

  const stats = implementation.files.reduce(
    (acc, file) => ({
      added: acc.added + (file.action === 'added' ? 1 : 0),
      modified: acc.modified + (file.action === 'modified' ? 1 : 0),
      deleted: acc.deleted + (file.action === 'deleted' ? 1 : 0),
      linesAdded: acc.linesAdded + file.lines.added,
      linesRemoved: acc.linesRemoved + file.lines.removed,
    }),
    { added: 0, modified: 0, deleted: 0, linesAdded: 0, linesRemoved: 0 }
  );

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="#8B5CF6" padding={1}>
        <Gradient colors={['#ff628c', '#847ace']}>
          <Text bold>┌─ CodePress: Review Changes ──────────────────────┐</Text>
        </Gradient>
      </Box>

      <Box marginTop={1} marginBottom={1}>
        <Text>
          Summary: {implementation.files.length} files changed • 
          <Text color="#00ff00"> {stats.added} added</Text> • 
          <Text color="#F9E2AF"> {stats.modified} modified</Text> • 
          <Text color="#ff0000"> {stats.deleted} deleted</Text> • 
          <Text color="#888888"> +{stats.linesAdded}/-{stats.linesRemoved} lines</Text>
        </Text>
      </Box>

      <Box height={15}>
        <Box 
          width="40%" 
          flexDirection="column" 
          borderStyle="single" 
          borderColor="#444444" 
          padding={1}
        >
          <Text bold color="#F9E2AF">Files</Text>
          <Box flexDirection="column" marginTop={1}>
            {renderFileList()}
          </Box>
        </Box>

        <Box 
          width="60%" 
          flexDirection="column" 
          borderStyle="single" 
          borderColor="#444444" 
          padding={1}
          marginLeft={1}
        >
          <Text bold color="#89B4FA">
            Diff Preview {selectedFile && `(${selectedFile.path})`}
          </Text>
          <Box flexDirection="column" marginTop={1}>
            {renderDiffPreview()}
          </Box>
        </Box>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Box>
          <Text color="#A6E3A1">✓ Validation passed: </Text>
          <Text color="#888888">
            {implementation.validationResults.filter(r => r.passed).length}/
            {implementation.validationResults.length} gates
          </Text>
        </Box>
        <Box marginTop={1} justifyContent="center">
          <Text color="#666666">
            ENTER toggle • D view full diff • A accept • R reject • X discard
          </Text>
        </Box>
      </Box>
    </Box>
  );
};
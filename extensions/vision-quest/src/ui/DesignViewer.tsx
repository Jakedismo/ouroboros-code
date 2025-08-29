/**
 * Design document viewer and editor
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import Gradient from 'ink-gradient';

interface DesignViewerProps {
  design: string;
  isEditing: boolean;
  onEdit?: () => void;
  onApprove?: () => void;
  onRevise?: (feedback: string) => void;
  onSave?: (design: string) => void;
}

export const DesignViewer: React.FC<DesignViewerProps> = ({
  design,
  isEditing,
  onEdit,
  onApprove,
  onRevise,
  onSave,
}) => {
  const [scrollOffset, setScrollOffset] = useState(0);
  const [showReviseInput, setShowReviseInput] = useState(false);
  const [reviseFeedback, setReviseFeedback] = useState('');
  const [editedDesign, setEditedDesign] = useState(design);

  const lines = (isEditing ? editedDesign : design).split('\n');
  const viewportHeight = 15;
  const visibleLines = lines.slice(scrollOffset, scrollOffset + viewportHeight);

  useEffect(() => {
    setEditedDesign(design);
  }, [design]);

  useInput((input, key) => {
    if (isEditing) {
      if (key.escape) {
        onSave?.(editedDesign);
      }
      return;
    }

    if (showReviseInput) {
      if (key.escape) {
        setShowReviseInput(false);
        setReviseFeedback('');
      }
      return;
    }

    // Navigation
    if (key.upArrow) {
      setScrollOffset(Math.max(0, scrollOffset - 1));
    } else if (key.downArrow) {
      setScrollOffset(Math.min(lines.length - viewportHeight, scrollOffset + 1));
    } else if (key.pageUp) {
      setScrollOffset(Math.max(0, scrollOffset - viewportHeight));
    } else if (key.pageDown) {
      setScrollOffset(Math.min(lines.length - viewportHeight, scrollOffset + viewportHeight));
    }

    // Actions
    if (input === 'e' || input === 'E') {
      onEdit?.();
    } else if (input === 'a' || input === 'A') {
      onApprove?.();
    } else if (input === 'r' || input === 'R') {
      setShowReviseInput(true);
    } else if (input === 'o' || input === 'O') {
      // Open in $EDITOR - would need to implement shell integration
      console.log('Opening in external editor...');
    }
  });

  const handleReviseSubmit = () => {
    if (reviseFeedback.trim()) {
      onRevise?.(reviseFeedback);
      setShowReviseInput(false);
      setReviseFeedback('');
    }
  };

  const renderScrollbar = () => {
    if (lines.length <= viewportHeight) return null;

    const scrollbarHeight = Math.max(1, Math.floor((viewportHeight / lines.length) * viewportHeight));
    const scrollbarPosition = Math.floor((scrollOffset / (lines.length - viewportHeight)) * (viewportHeight - scrollbarHeight));

    return (
      <Box flexDirection="column" marginLeft={1}>
        {Array.from({ length: viewportHeight }, (_, i) => {
          const isScrollbar = i >= scrollbarPosition && i < scrollbarPosition + scrollbarHeight;
          return (
            <Text key={i} color={isScrollbar ? '#666666' : '#333333'}>
              {isScrollbar ? '█' : '│'}
            </Text>
          );
        })}
      </Box>
    );
  };

  const renderDesignContent = () => {
    return (
      <Box>
        <Box flexDirection="column" flexGrow={1}>
          {visibleLines.map((line, i) => {
            const lineNumber = scrollOffset + i + 1;
            const isHeader = line.startsWith('#');
            const isBullet = line.trim().startsWith('-') || line.trim().startsWith('*');
            
            return (
              <Box key={lineNumber}>
                <Text color="#444444" dimColor>
                  {String(lineNumber).padStart(3, ' ')} │
                </Text>
                <Text
                  color={
                    isHeader ? '#F9E2AF' :
                    isBullet ? '#89B4FA' :
                    '#CDD6F4'
                  }
                  bold={isHeader}
                >
                  {' '}{line}
                </Text>
              </Box>
            );
          })}
        </Box>
        {renderScrollbar()}
      </Box>
    );
  };

  const renderEditMode = () => {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text color="#F9E2AF" bold>
            📝 Edit Mode - Press ESC to save
          </Text>
        </Box>
        <Box borderStyle="single" borderColor="#F9E2AF" padding={1}>
          <TextInput
            value={editedDesign}
            onChange={setEditedDesign}
            placeholder="Edit design document..."
          />
        </Box>
      </Box>
    );
  };

  const renderReviseInput = () => {
    return (
      <Box borderStyle="double" borderColor="#8B5CF6" padding={1} marginTop={1}>
        <Box flexDirection="column">
          <Text color="#8B5CF6" bold>Revision Feedback:</Text>
          <TextInput
            value={reviseFeedback}
            onChange={setReviseFeedback}
            onSubmit={handleReviseSubmit}
            placeholder="Describe what changes you'd like..."
          />
          <Text color="#666666" fontSize={12}>Press Enter to submit, ESC to cancel</Text>
        </Box>
      </Box>
    );
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1} justifyContent="space-between">
        <Gradient colors={['#4d21fc', '#847ace']}>
          <Text bold>[Design Document]</Text>
        </Gradient>
        <Text color="#666666">
          {lines.length} lines | {design.length} chars
        </Text>
      </Box>

      {isEditing ? renderEditMode() : (
        <>
          <Box
            borderStyle="single"
            borderColor="#444444"
            height={viewportHeight + 2}
            padding={1}
          >
            {renderDesignContent()}
          </Box>

          {showReviseInput && renderReviseInput()}

          <Box marginTop={1} justifyContent="center">
            <Text color="#666666">
              ↑↓ scroll • E edit • O open $EDITOR • A accept • R revise
            </Text>
          </Box>
        </>
      )}
    </Box>
  );
};
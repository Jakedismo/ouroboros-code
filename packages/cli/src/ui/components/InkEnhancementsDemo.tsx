/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Box, Text, useFocus, useFocusManager, useInput, useStdin, useIsScreenReaderEnabled } from 'ink';
import { Colors } from '../colors.js';

/**
 * Demo component showcasing Ink.js enhancements including:
 * - Focus management with useFocus and useFocusManager
 * - Screen reader support with useIsScreenReaderEnabled
 * - Overflow handling with overflowX/overflowY
 * - Custom border styles
 * - Raw mode detection with useStdin
 * - Component theming
 */
export function InkEnhancementsDemo(): React.JSX.Element {
  const { focusNext, focusPrevious } = useFocusManager();
  const { isRawModeSupported } = useStdin();
  const isScreenReaderEnabled = useIsScreenReaderEnabled();
  const [activeSection, setActiveSection] = useState<'focus' | 'overflow' | 'borders' | 'rawmode'>('focus');

  // Global keyboard navigation
  useInput((input, key) => {
    if (key.tab) {
      focusNext();
    }
    if (key.shift && key.tab) {
      focusPrevious();
    }
    if (key.rightArrow) {
      setActiveSection('overflow');
    }
    if (key.leftArrow) {
      setActiveSection('focus');
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text color={Colors.AccentPurple} bold>
        Ink.js Enhancements Demo
      </Text>
      <Text dimColor>
        Use Tab/Shift+Tab to navigate • ←→ to switch sections • Screen reader: {isScreenReaderEnabled ? 'Enabled' : 'Disabled'}
      </Text>

      <Box marginTop={1} flexDirection="row">
        {/* Focus Management Section */}
        <Box flexDirection="column" width="25%" marginRight={1}>
          <Text color={activeSection === 'focus' ? Colors.AccentGreen : Colors.Gray}>
            Focus Management
          </Text>
          <FocusableItem id="item1" label="Item 1" />
          <FocusableItem id="item2" label="Item 2" />
          <FocusableItem id="item3" label="Item 3" />
        </Box>

        {/* Overflow Handling Section */}
        <Box flexDirection="column" width="25%" marginRight={1}>
          <Text color={activeSection === 'overflow' ? Colors.AccentGreen : Colors.Gray}>
            Overflow Handling
          </Text>
          <Box
            borderStyle="single"
            borderColor={Colors.Gray}
            width={15}
            height={3}
            overflowX="hidden"
            overflowY="hidden"
          >
            <Text>This text will be clipped if too long for the container boundaries.</Text>
          </Box>
        </Box>

        {/* Custom Borders Section */}
        <Box flexDirection="column" width="25%" marginRight={1}>
          <Text color={activeSection === 'borders' ? Colors.AccentGreen : Colors.Gray}>
            Custom Borders
          </Text>
          <Box
            borderStyle={{
              topLeft: '╔',
              top: '═',
              topRight: '╗',
              left: '║',
              bottomLeft: '╚',
              bottom: '═',
              bottomRight: '╝',
              right: '║'
            }}
            borderColor={Colors.AccentBlue}
            padding={1}
            width={15}
          >
            <Text>Custom border characters</Text>
          </Box>
        </Box>

        {/* Raw Mode Section */}
        <Box flexDirection="column" width="25%">
          <Text color={activeSection === 'rawmode' ? Colors.AccentGreen : Colors.Gray}>
            Raw Mode
          </Text>
          <Box
            borderStyle="round"
            borderColor={Colors.Gray}
            padding={1}
            flexDirection="column"
          >
            <Text>Raw mode: {isRawModeSupported ? 'Supported' : 'Not supported'}</Text>
            <Text dimColor wrap="truncate-middle">
              This demonstrates terminal capability detection
            </Text>
          </Box>
        </Box>
      </Box>

      {/* Screen Reader Enhanced Content */}
      {isScreenReaderEnabled && (
        <Box marginTop={1} padding={1} borderStyle="double" borderColor={Colors.AccentYellow}>
          <Text color={Colors.AccentYellow}>
            Screen Reader Mode Active: Enhanced accessibility features enabled
          </Text>
        </Box>
      )}
    </Box>
  );
}

function FocusableItem({ id, label }: { id: string; label: string }): React.JSX.Element {
  const { isFocused } = useFocus({ id });

  return (
    <Box marginY={0.5}>
      <Text color={isFocused ? Colors.AccentGreen : Colors.Gray}>
        {isFocused ? '▶ ' : '  '}{label}
      </Text>
    </Box>
  );
}
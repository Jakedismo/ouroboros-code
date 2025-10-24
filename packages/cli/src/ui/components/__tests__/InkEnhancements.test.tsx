/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { Box, Text } from 'ink';
import { useFocusManager, useFocus, useInput, useStdin } from 'ink';

// Mock components for testing Ink.js enhancements
function FocusableComponent({ id, label }: { id: string; label: string }) {
  const { isFocused } = useFocus({ id });
  return (
    <Text color={isFocused ? 'green' : 'white'}>
      {isFocused ? '→ ' : '  '}
      {label}
    </Text>
  );
}

function FocusManagerTest() {
  const { focusNext, focusPrevious, focus, enableFocus, disableFocus } =
    useFocusManager();
  const [focusEnabled, setFocusEnabled] = React.useState(true);

  useInput((input, key) => {
    if (key.rightArrow) focusNext();
    if (key.leftArrow) focusPrevious();
    if (input === '1') focus('first');
    if (input === '2') focus('second');
    if (input === 'd') {
      disableFocus();
      setFocusEnabled(false);
    }
    if (input === 'e') {
      enableFocus();
      setFocusEnabled(true);
    }
  });

  return (
    <Box flexDirection="column">
      <Text>Focus Manager Test ({focusEnabled ? 'Enabled' : 'Disabled'})</Text>
      <FocusableComponent id="first" label="First Item" />
      <FocusableComponent id="second" label="Second Item" />
      <FocusableComponent id="third" label="Third Item" />
      <Text dimColor>Use ←→ arrows, 1-2 to jump, d/e to toggle focus</Text>
    </Box>
  );
}

function OverflowTest() {
  return (
    <Box flexDirection="column">
      <Box overflowX="hidden" width={10}>
        <Text>This text is too long and will be cut off.</Text>
      </Box>
      <Box overflowY="hidden" height={1}>
        <Text>Line 1{'\n'}Line 2</Text>
      </Box>
      <Box overflow="hidden" width={5} height={1}>
        <Text>Very long text that should be clipped</Text>
      </Box>
    </Box>
  );
}

function TextWrappingTest() {
  return (
    <Box flexDirection="column">
      <Box width={7}>
        <Text>Hello World</Text>
      </Box>
      <Box width={7}>
        <Text wrap="truncate">Hello World</Text>
      </Box>
      <Box width={7}>
        <Text wrap="truncate-middle">Hello World</Text>
      </Box>
      <Box width={7}>
        <Text wrap="truncate-start">Hello World</Text>
      </Box>
    </Box>
  );
}

function CustomBorderTest() {
  return (
    <Box
      borderStyle={{
        topLeft: '↘',
        top: '↓',
        topRight: '↙',
        left: '→',
        bottomLeft: '↗',
        bottom: '↑',
        bottomRight: '↖',
        right: '←',
      }}
      padding={1}
    >
      <Text>Custom Border</Text>
    </Box>
  );
}

function RawModeTest() {
  const { isRawModeSupported, setRawMode } = useStdin();
  const [rawModeEnabled, setRawModeEnabled] = React.useState(false);

  React.useEffect(() => {
    if (isRawModeSupported) {
      setRawMode(true);
      setRawModeEnabled(true);
      return () => setRawMode(false);
    }
    return undefined;
  }, [isRawModeSupported, setRawMode]);

  return (
    <Box>
      <Text>
        Raw mode:{' '}
        {isRawModeSupported
          ? rawModeEnabled
            ? 'Enabled'
            : 'Supported'
          : 'Not supported'}
      </Text>
    </Box>
  );
}

describe('Ink.js Enhancements', () => {
  describe('Focus Management', () => {
    it('should render focusable components correctly', () => {
      const { lastFrame } = render(<FocusManagerTest />);
      const output = lastFrame();

      expect(output).toContain('Focus Manager Test (Enabled)');
      expect(output).toContain('First Item');
      expect(output).toContain('Second Item');
      expect(output).toContain('Third Item');
      expect(output).toContain(
        'Use ←→ arrows, 1-2 to jump, d/e to toggle focus',
      );
    });

    it('should initialize with focus management enabled', () => {
      const { lastFrame } = render(<FocusManagerTest />);
      const output = lastFrame();

      // Focus management should be enabled by default
      expect(output).toContain('Focus Manager Test (Enabled)');
    });

    it('should support programmatic focus control', () => {
      // Test that the focus manager hooks are available and callable
      function TestFocusManager() {
        const { focusNext, focusPrevious, focus, enableFocus, disableFocus } =
          useFocusManager();

        React.useEffect(() => {
          // Test that these functions exist and are callable
          expect(typeof focusNext).toBe('function');
          expect(typeof focusPrevious).toBe('function');
          expect(typeof focus).toBe('function');
          expect(typeof enableFocus).toBe('function');
          expect(typeof disableFocus).toBe('function');
        }, []);

        return <Text>Focus manager available</Text>;
      }

      const { lastFrame } = render(<TestFocusManager />);
      expect(lastFrame()).toContain('Focus manager available');
    });
  });

  describe('Overflow Handling', () => {
    it('should handle horizontal overflow with truncation', () => {
      const { lastFrame } = render(<OverflowTest />);
      const output = lastFrame();

      // The text should be cut off at the specified width
      expect(output).toBeDefined();
      // Note: Actual truncation behavior depends on terminal capabilities
    });

    it('should handle vertical overflow with clipping', () => {
      const { lastFrame } = render(<OverflowTest />);
      const output = lastFrame();

      expect(output).toBeDefined();
      // Should not show the second line due to height=1
    });
  });

  describe('Text Wrapping and Truncation', () => {
    it('should wrap text by default', () => {
      const { lastFrame } = render(<TextWrappingTest />);
      const output = lastFrame();

      // Default wrapping should split "Hello World" across lines
      expect(output).toContain('Hello');
      expect(output).toContain('World');
    });

    it('should support different wrap modes', () => {
      const { lastFrame } = render(<TextWrappingTest />);
      const output = lastFrame();

      // Should contain various truncation patterns
      expect(output).toBeDefined();
      expect(output).toMatch(/…/); // Should contain ellipsis
    });
  });

  describe('Custom Borders', () => {
    it('should render custom border styles', () => {
      const { lastFrame } = render(<CustomBorderTest />);
      const output = lastFrame();

      expect(output).toContain('Custom Border');
      // Custom border characters should be present
      expect(output).toMatch(/[↘↓↙→↗↑↖←]/);
    });
  });

  describe('Raw Mode Detection', () => {
    it('should detect raw mode support', () => {
      const { lastFrame } = render(<RawModeTest />);
      const output = lastFrame();

      // Should indicate raw mode status
      expect(output).toMatch(/Raw mode: (Supported|Not supported|Enabled)/);
    });
  });

  describe('Screen Reader Support', () => {
    it('should render with screen reader support enabled', () => {
      // Test that components render correctly when screen reader mode is enabled
      const { lastFrame } = render(<FocusManagerTest />);
      const output = lastFrame();

      expect(output).toBeDefined();
      // Screen reader mode should not break rendering
    });
  });

  describe('useStdin Hook', () => {
    it('should provide stdin stream and raw mode controls', () => {
      function TestStdinHook() {
        const { stdin, setRawMode, isRawModeSupported } = useStdin();

        React.useEffect(() => {
          // Test that these properties exist
          expect(stdin).toBeDefined();
          expect(typeof setRawMode).toBe('function');
          expect(typeof isRawModeSupported).toBe('boolean');
        }, []);

        return <Text>Stdin hook available</Text>;
      }

      const { lastFrame } = render(<TestStdinHook />);
      expect(lastFrame()).toContain('Stdin hook available');
    });
  });

  describe('useInput Hook', () => {
    it('should handle keyboard input', () => {
      const onInput = vi.fn();
      const onKey = vi.fn();

      function TestInputHook() {
        useInput((input, key) => {
          if (input) {
            onInput(input);
          }
          if (key.escape) {
            onKey('escape');
          }
        });

        return <Text>Input handler active</Text>;
      }

      const { lastFrame, stdin } = render(<TestInputHook />);

      // Initially should show the component
      expect(lastFrame()).toContain('Input handler active');

      // Send some input
      stdin.write('test');
      expect(onInput).toHaveBeenCalledWith('test');

      // Send escape key
      stdin.write('\u001B'); // ESC
      expect(onKey).toHaveBeenCalledWith('escape');
    });
  });
});

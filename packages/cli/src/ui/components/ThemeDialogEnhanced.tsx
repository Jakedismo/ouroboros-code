/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useState } from 'react';
import { Box, Text, useFocus, useFocusManager, useInput } from 'ink';
import { Colors } from '../colors.js';
import { themeManager, DEFAULT_THEME } from '../themes/theme-manager.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { DiffRenderer } from './messages/DiffRenderer.js';
import { colorizeCode } from '../utils/CodeColorizer.js';
import type { LoadedSettings } from '../../config/settings.js';
import { SettingScope } from '../../config/settings.js';
import {
  getScopeItems,
  getScopeMessageForSetting,
} from '../../utils/dialogScopeUtils.js';

interface ThemeDialogEnhancedProps {
  /** Callback function when a theme is selected */
  onSelect: (themeName: string | undefined, scope: SettingScope) => void;

  /** Callback function when a theme is highlighted */
  onHighlight: (themeName: string | undefined) => void;
  /** The settings object */
  settings: LoadedSettings;
  availableTerminalHeight?: number;
  terminalWidth: number;
}

function FocusableSection({
  id,
  children,
  onFocus,
  onBlur,
}: {
  id: string;
  children: React.ReactNode;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  const { isFocused } = useFocus({ id, autoFocus: id === 'theme' });

  React.useEffect(() => {
    if (isFocused && onFocus) {
      onFocus();
    } else if (!isFocused && onBlur) {
      onBlur();
    }
  }, [isFocused, onFocus, onBlur]);

  return <>{children}</>;
}

export function ThemeDialogEnhanced({
  onSelect,
  onHighlight,
  settings,
  availableTerminalHeight,
  terminalWidth,
}: ThemeDialogEnhancedProps): React.JSX.Element {
  const { focusNext, focusPrevious, focus } = useFocusManager();
  const [selectedScope, setSelectedScope] = useState<SettingScope>(
    SettingScope.User,
  );

  // Track the currently highlighted theme name
  const [highlightedThemeName, setHighlightedThemeName] = useState<
    string | undefined
  >(settings.merged.ui?.theme || DEFAULT_THEME.name);

  // Generate theme items filtered by selected scope
  const availableThemes = themeManager.getAvailableThemes();
  const themeItems = availableThemes.map((theme) => ({
    label: theme.name,
    value: theme.name,
    themeNameDisplay: theme.name,
    themeTypeDisplay: theme.type,
  }));

  // Find the index of the currently selected theme
  const initialThemeIndex = themeItems.findIndex(
    (item) => item.value === highlightedThemeName,
  );
  // If not found, fall back to the first theme
  const safeInitialThemeIndex = initialThemeIndex >= 0 ? initialThemeIndex : 0;

  const scopeItems = getScopeItems();

  const handleThemeSelect = useCallback(
    (themeName: string) => {
      onSelect(themeName, selectedScope);
    },
    [onSelect, selectedScope],
  );

  const handleThemeHighlight = (themeName: string) => {
    setHighlightedThemeName(themeName);
    onHighlight(themeName);
  };

  const handleScopeHighlight = useCallback((scope: SettingScope) => {
    setSelectedScope(scope);
  }, []);

  const handleScopeSelect = useCallback(
    (scope: SettingScope) => {
      handleScopeHighlight(scope);
      // After selecting scope, focus back to theme selection
      focus('theme');
    },
    [handleScopeHighlight, focus],
  );

  // Global keyboard shortcuts
  useInput((input, key) => {
    if (key.escape) {
      onSelect(undefined, selectedScope);
    }
    if (key.tab) {
      focusNext();
    }
    if (key.shift && key.tab) {
      focusPrevious();
    }
  });

  // Generate scope message for theme setting
  const otherScopeModifiedMessage = getScopeMessageForSetting(
    'ui.theme',
    selectedScope,
    settings,
  );

  // Calculate layout dimensions
  const PREVIEW_PANE_WIDTH_PERCENTAGE = 0.55;
  const PREVIEW_PANE_WIDTH_SAFETY_MARGIN = 0.9;
  // Combined horizontal padding from the dialog and preview pane.
  const TOTAL_HORIZONTAL_PADDING = 4;
  const colorizeCodeWidth = Math.max(
    Math.floor(
      (terminalWidth - TOTAL_HORIZONTAL_PADDING) *
        PREVIEW_PANE_WIDTH_PERCENTAGE *
        PREVIEW_PANE_WIDTH_SAFETY_MARGIN,
    ),
    1,
  );

  const DIALOG_PADDING = 2;
  const selectThemeHeight = themeItems.length + 1;
  const SCOPE_SELECTION_HEIGHT = 4; // Height for the scope selection section + margin.
  const SPACE_BETWEEN_THEME_SELECTION_AND_APPLY_TO = 1;
  const TAB_TO_SELECT_HEIGHT = 2;
  availableTerminalHeight = availableTerminalHeight ?? Number.MAX_SAFE_INTEGER;
  availableTerminalHeight -= 2; // Top and bottom borders.
  availableTerminalHeight -= TAB_TO_SELECT_HEIGHT;

  let totalLeftHandSideHeight =
    DIALOG_PADDING +
    selectThemeHeight +
    SCOPE_SELECTION_HEIGHT +
    SPACE_BETWEEN_THEME_SELECTION_AND_APPLY_TO;

  let showScopeSelection = true;
  let includePadding = true;

  // Remove content from the LHS that can be omitted if it exceeds the available height.
  if (totalLeftHandSideHeight > availableTerminalHeight) {
    includePadding = false;
    totalLeftHandSideHeight -= DIALOG_PADDING;
  }

  if (totalLeftHandSideHeight > availableTerminalHeight) {
    // First, try hiding the scope selection
    totalLeftHandSideHeight -= SCOPE_SELECTION_HEIGHT;
    showScopeSelection = false;
  }

  // Vertical space taken by elements other than the two code blocks in the preview pane.
  // Includes "Preview" title, borders, and margin between blocks.
  const PREVIEW_PANE_FIXED_VERTICAL_SPACE = 8;

  // The right column doesn't need to ever be shorter than the left column.
  const availableTerminalHeightCodeBlock = Math.max(
    availableTerminalHeight - PREVIEW_PANE_FIXED_VERTICAL_SPACE,
    0,
  );

  const availableHeightForPanes = Math.max(
    0,
    availableTerminalHeightCodeBlock - 1,
  );

  // The code block is slightly longer than the diff, so give it more space.
  const codeBlockHeight = Math.ceil(availableHeightForPanes * 0.6);
  const diffHeight = Math.floor(availableHeightForPanes * 0.4);

  // Get the selected theme for preview
  const selectedTheme = highlightedThemeName
    ? themeManager.getTheme(highlightedThemeName)
    : DEFAULT_THEME;

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.Gray}
      flexDirection="column"
      paddingTop={includePadding ? 1 : 0}
      paddingBottom={includePadding ? 1 : 0}
      paddingLeft={1}
      paddingRight={1}
      width="100%"
    >
      <Box flexDirection="row">
        {/* Left Column: Selection */}
        <Box flexDirection="column" width="45%" paddingRight={2}>
          <FocusableSection id="theme">
            <Text wrap="truncate">
              Select Theme{' '}
              <Text color={Colors.Gray}>{otherScopeModifiedMessage}</Text>
            </Text>
            <RadioButtonSelect
              items={themeItems}
              initialIndex={safeInitialThemeIndex}
              onSelect={handleThemeSelect}
              onHighlight={handleThemeHighlight}
              maxItemsToShow={8}
              showScrollArrows={true}
            />
          </FocusableSection>

          {/* Scope Selection */}
          {showScopeSelection && (
            <FocusableSection id="scope" onFocus={() => focus('scope')}>
              <Box marginTop={1} flexDirection="column">
                <Text wrap="truncate">Apply To</Text>
                <RadioButtonSelect
                  items={scopeItems}
                  initialIndex={0} // Default to User Settings
                  onSelect={handleScopeSelect}
                  onHighlight={handleScopeHighlight}
                />
              </Box>
            </FocusableSection>
          )}
        </Box>

        {/* Right Column: Preview */}
        <Box flexDirection="column" width="55%">
          <Text color={Colors.AccentPurple} bold>
            Preview
          </Text>
          <Box
            borderStyle="single"
            borderColor={Colors.Gray}
            flexDirection="column"
            height={codeBlockHeight}
            paddingX={1}
            marginBottom={1}
          >
            <Text color={Colors.Gray} dimColor>
              JavaScript
            </Text>
            <Box overflow="hidden">
              {colorizeCode(
                `function hello(name) {
  console.log(\`Hello, \${name}!\`);
}

hello('World');`,
                'javascript',
                colorizeCodeWidth,
              )}
            </Box>
          </Box>

          <Box
            borderStyle="single"
            borderColor={Colors.Gray}
            flexDirection="column"
            height={diffHeight}
            paddingX={1}
          >
            <Text color={Colors.Gray} dimColor>
              Diff
            </Text>
            <Box overflow="hidden">
              <DiffRenderer
                diffContent={`@@ -1,3 +1,4 @@
 function example() {
-  console.log("old");
+  console.log("new");
+  console.log("added");
   return true;
 }`}
                terminalWidth={colorizeCodeWidth}
                availableTerminalHeight={diffHeight - 2}
                theme={selectedTheme}
              />
            </Box>
          </Box>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          {showScopeSelection
            ? 'Tab/Shift+Tab: Navigate • Enter: Select • Esc: Cancel'
            : 'Enter: Select • Esc: Cancel'}
        </Text>
      </Box>
    </Box>
  );
}

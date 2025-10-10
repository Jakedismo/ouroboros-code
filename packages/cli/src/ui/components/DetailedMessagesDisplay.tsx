/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import Markdown from 'ink-markdown';
import chalk from 'chalk';
import { Colors } from '../colors.js';
import type { ConsoleMessageItem } from '../types.js';
import { MaxSizedBox } from './shared/MaxSizedBox.js';

interface DetailedMessagesDisplayProps {
  messages: ConsoleMessageItem[];
  maxHeight: number | undefined;
  width: number;
  // debugMode is not needed here if App.tsx filters debug messages before passing them.
  // If DetailedMessagesDisplay should handle filtering, add debugMode prop.
}

export const DetailedMessagesDisplay: React.FC<
  DetailedMessagesDisplayProps
> = ({ messages, maxHeight, width }) => {
  if (messages.length === 0) {
    return null; // Don't render anything if there are no messages
  }

  const borderAndPadding = 4;
  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle="round"
      borderColor={Colors.Gray}
      paddingX={1}
      width={width}
    >
      <Box marginBottom={1}>
        <Text bold color={Colors.Foreground}>
          Debug Console <Text color={Colors.Gray}>(ctrl+o to close)</Text>
        </Text>
      </Box>
      <MaxSizedBox maxHeight={maxHeight} maxWidth={width - borderAndPadding}>
        {messages.map((msg, index) => {
          let textColor = Colors.Foreground;
          let icon = '\u2139'; // Information source (ℹ)

          switch (msg.type) {
            case 'warn':
              textColor = Colors.AccentYellow;
              icon = '\u26A0'; // Warning sign (⚠)
              break;
            case 'error':
              textColor = Colors.AccentRed;
              icon = '\u2716'; // Heavy multiplication x (✖)
              break;
            case 'debug':
              textColor = Colors.Gray;
              icon = '\u{1F50D}'; // Left-pointing magnifying glass (🔍)
              break;
            case 'log':
            default:
              break;
          }

          const shouldRenderAsMarkdown = /[`*_#\[-]/.test(msg.content);
          const markdownTheme = {
            text: (value: string) => chalk.hex(textColor)(value),
            strong: chalk.hex(textColor).bold,
            em: chalk.hex(textColor).italic,
            codespan: chalk.hex(Colors.AccentCyan),
            link: chalk.hex(Colors.AccentBlue),
            href: chalk.hex(Colors.AccentBlue).underline,
            listitem: (value: string) => chalk.hex(textColor)(value),
            heading: chalk.hex(textColor).bold,
            firstHeading: chalk.hex(textColor).bold,
            blockquote: chalk.hex(Colors.Gray).italic,
          } as const;

          return (
            <Box key={index} flexDirection="row" marginBottom={0}>
              <Text color={textColor}>{icon} </Text>
              <Box flexDirection="column" flexGrow={1}>
                {shouldRenderAsMarkdown ? (
                  <Markdown {...markdownTheme}>{msg.content}</Markdown>
                ) : (
                  <Text color={textColor} wrap="wrap">
                    {msg.content}
                  </Text>
                )}
                {msg.count && msg.count > 1 && (
                  <Text color={Colors.Gray}> (x{msg.count})</Text>
                )}
              </Box>
            </Box>
          );
        })}
      </MaxSizedBox>
    </Box>
  );
};

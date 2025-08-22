/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text, Box } from 'ink';
import { Colors } from '../../colors.js';

interface ThinkingMessageProps {
  content: string;
  isComplete: boolean;
  provider?: string;
  metadata?: {
    thinkingTime?: number;
    effortLevel?: string;
    tokenCount?: number;
    modelType?: string;
    usedThinking?: boolean;
    summaryMode?: boolean;
  };
  terminalWidth: number;
}

export const ThinkingMessage: React.FC<ThinkingMessageProps> = ({
  content,
  isComplete,
  provider,
  metadata,
  terminalWidth,
}) => {
  // Choose icon and color based on provider and state
  const getProviderIcon = () => {
    if (provider?.includes('openai') || provider?.includes('gpt')) {
      return '🤔';
    } else if (provider?.includes('anthropic') || provider?.includes('claude')) {
      return '💭';
    }
    return '🧠';
  };

  const getStatusIndicator = () => {
    if (isComplete) {
      return '✓';
    }
    return '…';
  };

  const prefix = `${getProviderIcon()} ${getStatusIndicator()} `;
  const prefixWidth = prefix.length + 1; // Account for visual width

  // Format metadata info
  const formatMetadata = () => {
    if (!metadata) return '';
    
    const parts: string[] = [];
    
    if (metadata.modelType) {
      parts.push(metadata.modelType);
    }
    
    if (metadata.effortLevel) {
      parts.push(`effort: ${metadata.effortLevel}`);
    }
    
    if (metadata.tokenCount) {
      const tokens = metadata.tokenCount >= 1000 
        ? `${(metadata.tokenCount / 1000).toFixed(0)}k` 
        : metadata.tokenCount.toString();
      parts.push(`budget: ${tokens} tokens`);
    }
    
    if (metadata.thinkingTime && isComplete) {
      const time = metadata.thinkingTime >= 1000 
        ? `${(metadata.thinkingTime / 1000).toFixed(1)}s`
        : `${metadata.thinkingTime}ms`;
      parts.push(`time: ${time}`);
    }
    
    return parts.length > 0 ? ` (${parts.join(', ')})` : '';
  };

  // Wrap long content
  const wrapContent = (text: string, maxWidth: number): string[] => {
    if (!text) return [''];
    
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    
    for (const word of words) {
      if (currentLine.length + word.length + 1 <= maxWidth) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) {
          lines.push(currentLine);
        }
        currentLine = word;
      }
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    return lines;
  };

  const maxContentWidth = Math.max(40, terminalWidth - prefixWidth - 4);
  const contentLines = wrapContent(content, maxContentWidth);
  const metadataText = formatMetadata();

  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Box width={prefixWidth}>
          <Text color={isComplete ? Colors.AccentGreen : Colors.AccentYellow}>
            {prefix}
          </Text>
        </Box>
        <Box flexGrow={1} flexDirection="column">
          {contentLines.map((line, index) => (
            <Box key={index}>
              <Text 
                color={isComplete ? Colors.Gray : Colors.AccentCyan}
                italic={!isComplete}
                wrap="wrap"
              >
                {line}
                {index === contentLines.length - 1 && metadataText && (
                  <Text color={Colors.Gray} dimColor>
                    {metadataText}
                  </Text>
                )}
              </Text>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
};
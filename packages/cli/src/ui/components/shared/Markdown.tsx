/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { Text } from 'ink';
import { Marked } from 'marked';
import TerminalRenderer from 'marked-terminal';

import type { TerminalRendererOptions } from 'marked-terminal';

type MarkdownProps = React.PropsWithChildren<TerminalRendererOptions>;

export const Markdown: React.FC<MarkdownProps> = ({ children, ...theme }) => {
  const content = useMemo(() => {
    const parts = React.Children.toArray(children).map((child) =>
      typeof child === 'string' ? child : '',
    );
    return parts.join('');
  }, [children]);

  const rendered = useMemo(() => {
    if (!content) {
      return '';
    }

    const parser = new Marked();
    parser.use({ renderer: new TerminalRenderer(theme) });
    const result = parser.parse(content, { async: false });
    return typeof result === 'string' ? result.trimEnd() : '';
  }, [content, theme]);

  if (!rendered) {
    return <Text />;
  }

  return <Text>{rendered}</Text>;
};

export default Markdown;

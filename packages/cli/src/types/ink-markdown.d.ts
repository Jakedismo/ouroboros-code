declare module 'ink-markdown' {
  import type { FC, PropsWithChildren } from 'react';

  export type MarkdownProps = PropsWithChildren<Record<string, unknown>>;

  const Markdown: FC<MarkdownProps>;
  export default Markdown;
}

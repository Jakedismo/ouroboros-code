declare module 'ink-link' {
  import type { FC, ReactNode } from 'react';

  export interface LinkProps {
    readonly url: string;
    readonly fallback?: string;
    readonly children?: ReactNode;
  }

  const Link: FC<LinkProps>;
  export default Link;
}

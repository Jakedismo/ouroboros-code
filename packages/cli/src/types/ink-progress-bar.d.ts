declare module 'ink-progress-bar' {
  import type { FC } from 'react';

  export interface ProgressBarProps {
    readonly percent: number;
    readonly leftPad?: number;
    readonly rightPad?: number;
    readonly barWidth?: number;
    readonly barCharacter?: string;
    readonly barColor?: string;
    readonly backgroundColor?: string;
  }

  const ProgressBar: FC<ProgressBarProps>;
  export default ProgressBar;
}

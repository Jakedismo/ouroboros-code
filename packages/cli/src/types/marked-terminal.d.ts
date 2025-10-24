declare module 'marked-terminal' {
  import type { Renderer } from 'marked';

  export interface TerminalRendererOptions extends Partial<Renderer> {
    readonly tab?: number;
    readonly width?: number;
    readonly reflowText?: boolean;
    readonly showSectionPrefix?: boolean;
  }

  export default class TerminalRenderer {
    constructor(options?: TerminalRendererOptions);
  }
}

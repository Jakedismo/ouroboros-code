declare module 'ink-text-input' {
  import type React from 'react';

  export interface TextInputProps {
    readonly value: string;
    readonly placeholder?: string;
    readonly focus?: boolean;
    readonly showCursor?: boolean;
    readonly highlightPastedText?: boolean;
    readonly mask?: string;
    onChange?: (value: string) => void;
    onSubmit?: (value: string) => void;
  }

  const TextInput: React.ComponentType<TextInputProps>;
  export default TextInput;
}

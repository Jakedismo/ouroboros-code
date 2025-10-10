declare module 'ink-table' {
  import type React from 'react';

  export interface TableColumn<T extends Record<string, unknown>> {
    readonly key: keyof T & string;
    readonly label?: string;
  }

  export interface TableProps<T extends Record<string, unknown>> {
    readonly data: ReadonlyArray<T>;
    readonly columns?: ReadonlyArray<TableColumn<T> | (keyof T & string)>;
  }

  const Table: React.ComponentType<TableProps<Record<string, unknown>>>;
  export default Table;
}

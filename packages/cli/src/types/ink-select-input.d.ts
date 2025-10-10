declare module 'ink-select-input' {
  import type { ComponentType, FC, ReactElement, ReactNode } from 'react';

  export interface Item<T> {
    readonly label: string;
    readonly value: T;
    readonly key?: string | number;
  }

  export interface IndicatorProps {
    readonly isSelected: boolean;
  }

  export interface ItemComponentProps<T> {
    readonly label: string;
    readonly value: T;
    readonly isSelected: boolean;
    readonly children?: ReactNode;
  }

  export interface Props<T> {
    readonly items: ReadonlyArray<Item<T>>;
    readonly initialIndex?: number;
    readonly limit?: number;
    readonly isFocused?: boolean;
    readonly indicatorComponent?: ComponentType<IndicatorProps>;
    readonly itemComponent?: ComponentType<ItemComponentProps<T>>;
    readonly onHighlight?: (item: Item<T>) => void;
    readonly onSelect?: (item: Item<T>) => void;
  }

  const SelectInput: <T>(props: Props<T>) => ReactElement | null;
  export default SelectInput;
}

declare module 'ink-select-input/build/SelectInput.js' {
  export { default } from 'ink-select-input';
  export type { Item, Props } from 'ink-select-input';
}

declare module 'ink-select-input/build/Indicator.js' {
  import type { FC } from 'react';
  import type { IndicatorProps } from 'ink-select-input';

  export type Props = IndicatorProps;
  const Indicator: FC<IndicatorProps>;
  export default Indicator;
}

declare module 'ink-select-input/build/Item.js' {
  import type { FC } from 'react';
  import type { ItemComponentProps } from 'ink-select-input';

  export interface Props<T = unknown> extends ItemComponentProps<T> {}

  const Item: FC<Props>;
  export default Item;
}

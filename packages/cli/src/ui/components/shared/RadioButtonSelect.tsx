/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import type {
  Item as SelectInputItem,
  Props as SelectInputProps,
} from 'ink-select-input/build/SelectInput.js';
import type { Props as IndicatorProps } from 'ink-select-input/build/Indicator.js';
import type { Props as ItemProps } from 'ink-select-input/build/Item.js';
import { Colors } from '../../colors.js';
import { useKeypress } from '../../hooks/useKeypress.js';

/**
 * Represents a single option for the RadioButtonSelect.
 * Requires a label for display and a value to be returned on selection.
 */
export interface RadioSelectItem<T> {
  label: string;
  value: T;
  disabled?: boolean;
  themeNameDisplay?: string;
  themeTypeDisplay?: string;
}

/**
 * Props for the RadioButtonSelect component.
 * @template T The type of the value associated with each radio item.
 */
export interface RadioButtonSelectProps<T> {
  /** An array of items to display as radio options. */
  items: Array<RadioSelectItem<T>>;
  /** The initial index selected */
  initialIndex?: number;
  /** Function called when an item is selected. Receives the `value` of the selected item. */
  onSelect: (value: T) => void;
  /** Function called when an item is highlighted. Receives the `value` of the selected item. */
  onHighlight?: (value: T) => void;
  /** Whether this select input is currently focused and should respond to input. */
  isFocused?: boolean;
  /** Whether to show the scroll arrows. */
  showScrollArrows?: boolean;
  /** The maximum number of items to show at once. */
  maxItemsToShow?: number;
  /** Whether to show numbers next to items. */
  showNumbers?: boolean;
}

type SelectValue<T> = {
  readonly index: number;
  readonly option: RadioSelectItem<T>;
};

const clampIndex = (index: number, length: number): number => {
  if (length === 0) {
    return 0;
  }
  if (index < 0) {
    return 0;
  }
  if (index >= length) {
    return length - 1;
  }
  return index;
};

export function RadioButtonSelect<T>({
  items,
  initialIndex = 0,
  onSelect,
  onHighlight,
  isFocused = true,
  showScrollArrows = false,
  maxItemsToShow = 10,
  showNumbers = true,
}: RadioButtonSelectProps<T>): React.JSX.Element | null {
  const normalizedInitialIndex = clampIndex(initialIndex, items.length);
  const [highlightedIndex, setHighlightedIndex] = useState(normalizedInitialIndex);
  const [selectKey, setSelectKey] = useState(0);
  const [forcedIndex, setForcedIndex] = useState<number | null>(null);
  const numberBufferRef = useRef('');
  const numberTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingSelectionRef = useRef<RadioSelectItem<T> | null>(null);

  useEffect(() => {
    const nextIndex = clampIndex(initialIndex, items.length);
    setHighlightedIndex(nextIndex);
    setForcedIndex(nextIndex);
    setSelectKey((key) => key + 1);
  }, [initialIndex, items.length]);

  useEffect(() => {
    if (forcedIndex === null) {
      return;
    }
    const clearForcedIndex = setTimeout(() => setForcedIndex(null), 0);
    return () => clearTimeout(clearForcedIndex);
  }, [forcedIndex]);

  useEffect(
    () => () => {
      if (numberTimerRef.current) {
        clearTimeout(numberTimerRef.current);
      }
    },
    [],
  );

  const selectItems: Array<SelectInputItem<SelectValue<T>>> = useMemo(
    () =>
      items.map((option, index) => ({
        key: `${index}-${option.label}`,
        label: option.label,
        value: { index, option },
      })),
    [items],
  );

  const totalDigits = useMemo(() => String(items.length).length, [items.length]);

  const commitSelection = (option: RadioSelectItem<T>) => {
    if (option.disabled) {
      return;
    }
    onSelect(option.value);
  };

  const handleHighlight = (item: SelectInputItem<SelectValue<T>>) => {
    const { index, option } = item.value;
    setHighlightedIndex(index);
    if (!option.disabled) {
      onHighlight?.(option.value);
    }
  };

  const handleSelect = (item: SelectInputItem<SelectValue<T>>) => {
    if (numberBufferRef.current !== '') {
      pendingSelectionRef.current = item.value.option;
      return;
    }
    commitSelection(item.value.option);
  };

  const scheduleBufferReset = () => {
    if (numberTimerRef.current) {
      clearTimeout(numberTimerRef.current);
    }
    numberTimerRef.current = setTimeout(() => {
      numberBufferRef.current = '';
      pendingSelectionRef.current = null;
    }, 350);
  };

  useKeypress(
    (key) => {
      if (!isFocused || !showNumbers || items.length === 0) {
        return;
      }

      const { sequence } = key;
      if (!sequence || !/^[0-9]$/.test(sequence)) {
        if (numberBufferRef.current && sequence) {
          numberBufferRef.current = '';
          pendingSelectionRef.current = null;
          if (numberTimerRef.current) {
            clearTimeout(numberTimerRef.current);
            numberTimerRef.current = null;
          }
        }
        return;
      }

      if (numberTimerRef.current) {
        clearTimeout(numberTimerRef.current);
        numberTimerRef.current = null;
      }

      const nextBuffer = numberBufferRef.current + sequence;
      numberBufferRef.current = nextBuffer;

      if (nextBuffer === '0') {
        scheduleBufferReset();
        return;
      }

      const targetIndex = Number.parseInt(nextBuffer, 10) - 1;
      if (targetIndex >= 0 && targetIndex < items.length) {
        const targetOption = items[targetIndex]!;
        pendingSelectionRef.current = targetOption;
        setHighlightedIndex(targetIndex);
        setForcedIndex(targetIndex);
        setSelectKey((key) => key + 1);
        if (!targetOption.disabled) {
          onHighlight?.(targetOption.value);
        }

        const potentialNext = Number.parseInt(`${nextBuffer}0`, 10);
        if (potentialNext > items.length) {
          commitSelection(targetOption);
          numberBufferRef.current = '';
          pendingSelectionRef.current = null;
        } else {
          numberTimerRef.current = setTimeout(() => {
            if (pendingSelectionRef.current) {
              commitSelection(pendingSelectionRef.current);
            }
            numberBufferRef.current = '';
            pendingSelectionRef.current = null;
          }, 350);
        }
      } else {
        numberBufferRef.current = '';
        pendingSelectionRef.current = null;
      }
    },
    { isActive: Boolean(isFocused && items.length > 0) },
  );

  if (items.length === 0) {
    return null;
  }

  const indicator: React.FC<IndicatorProps> = ({ isSelected }) => (
    <Box width={2} marginRight={1} justifyContent="center">
      <Text color={isSelected ? Colors.AccentGreen : Colors.Gray} aria-hidden>
        {isSelected ? '●' : ' '}
      </Text>
    </Box>
  );

  const ItemRow: React.FC<ItemProps & { value: SelectValue<T> }> = ({
    label,
    isSelected,
    value,
  }) => {
    const { option, index } = value;
    const isDisabled = option.disabled;
    const baseColor = isDisabled ? Colors.Gray : Colors.Foreground;
    const textColor = isSelected && !isDisabled ? Colors.AccentGreen : baseColor;
    const numberText = `${String(index + 1).padStart(totalDigits, ' ')}.`;

    return (
      <Box flexDirection="row" minWidth={1} alignItems="center">
        {showNumbers && (
          <Box
            minWidth={totalDigits + 1}
            marginRight={1}
            aria-hidden
            justifyContent="flex-end"
          >
            <Text color={isDisabled ? Colors.Gray : Colors.Comment}>{numberText}</Text>
          </Box>
        )}
        {option.themeNameDisplay && option.themeTypeDisplay ? (
          <Text color={textColor} wrap="truncate">
            {option.themeNameDisplay}{' '}
            <Text color={Colors.Gray}>{option.themeTypeDisplay}</Text>
          </Text>
        ) : (
          <Text color={textColor} wrap="truncate">
            {label}
          </Text>
        )}
      </Box>
    );
  };

  const effectiveLimit = Math.max(1, Math.min(maxItemsToShow, items.length));
  const hasOverflow = items.length > effectiveLimit;
  const approximateWindow = Math.max(effectiveLimit - 1, 1);
  const showUpArrow =
    showScrollArrows && hasOverflow && highlightedIndex >= approximateWindow;
  const showDownArrow =
    showScrollArrows && hasOverflow && highlightedIndex < items.length - 1;

  const selectProps: SelectInputProps<SelectValue<T>> = {
    key: selectKey,
    items: selectItems,
    initialIndex: forcedIndex ?? highlightedIndex,
    isFocused,
    limit: effectiveLimit,
    onHighlight: handleHighlight,
    onSelect: handleSelect,
    indicatorComponent: indicator,
    itemComponent: ItemRow as unknown as React.FC<ItemProps>,
  };

  return (
    <Box flexDirection="column">
      {showUpArrow && (
        <Text color={Colors.Gray} aria-hidden>
          ▲
        </Text>
      )}
      <SelectInput {...selectProps} />
      {showDownArrow && (
        <Text color={Colors.Gray} aria-hidden>
          ▼
        </Text>
      )}
    </Box>
  );
}


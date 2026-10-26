import type { ReactNode } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useFieldContext } from '@/hooks/form-context';

export type OptionFieldItem = {
  label: string;
  value: unknown;
  /** Stable list key; defaults to `id` or `String(value)` */
  id?: string;
  icon?: ReactNode;
  sublabel?: string;
};

type OptionFieldLayout = 'equal' | 'wrap' | 'grid-2';

type OptionFieldProps = {
  options: readonly OptionFieldItem[];
  label?: string;
  description?: string;
  /** Classes on the outer field wrapper (default includes bottom margin) */
  className?: string;
  /** equal: horizontal equal-width chips · wrap: compact pills (e.g. expiry) · grid-2: two-column cards (e.g. templates) */
  layout?: OptionFieldLayout;
  disabled?: boolean;
  /** Runs after the field value updates (e.g. clear related fields) */
  onSelectionChange?: (value: unknown) => void;
};

function optionKey(option: OptionFieldItem, index: number): string {
  if (option.id != null && option.id !== '') return option.id;
  if (typeof option.value === 'string' || typeof option.value === 'number') {
    return String(option.value);
  }
  return `${option.label}-${index}`;
}

export function OptionField({
  options,
  label,
  description,
  className = '',
  layout = 'equal',
  disabled = false,
  onSelectionChange,
}: OptionFieldProps) {
  const field = useFieldContext();
  const errors = field.state.meta.errors[0];

  const rowClass =
    layout === 'equal'
      ? 'flex-row gap-3'
      : layout === 'wrap'
        ? 'flex-row flex-wrap gap-2'
        : 'flex-row flex-wrap gap-3';

  return (
    <View className={`mb-4 gap-1.5 ${className}`.trim()}>
      {label && <Text className="text-base font-medium text-text-secondary">{label}</Text>}
      {description && <Text className="text-sm leading-5 text-text-secondary">{description}</Text>}
      <View className={rowClass}>
        {options.map((option, index) => {
          const isSelected = field.state.value === option.value;
          const key = optionKey(option, index);

          const basePressable =
            layout === 'equal'
              ? `min-h-[48px] flex-1 items-center justify-center rounded-xl border py-3 ${
                  isSelected ? 'border-primary bg-primary/10' : 'border-border bg-surface'
                }`
              : layout === 'wrap'
                ? `min-h-[48px] min-w-[68px] items-center justify-center rounded-2xl border-2 px-3 ${
                    isSelected ? 'border-primary bg-primary/15' : 'border-border bg-surface'
                  }`
                : `min-h-[132px] items-center justify-center rounded-2xl border-2 px-3 py-4 ${
                    isSelected ? 'border-primary bg-primary/15' : 'border-border bg-surface'
                  }`;

          const gridItemStyle =
            layout === 'grid-2'
              ? ({ maxWidth: '48%', flexGrow: 1, flexBasis: '48%' } as const)
              : undefined;

          const labelClass =
            layout === 'wrap'
              ? `text-sm font-bold ${isSelected ? 'text-primary' : 'text-text-secondary'}`
              : layout === 'grid-2'
                ? `mt-3 text-center text-base font-bold text-text-primary`
                : `text-base font-medium ${isSelected ? 'text-primary' : 'text-text-secondary'}`;

          return (
            <TouchableOpacity
              key={key}
              onPress={() => {
                field.handleChange(option.value);
                onSelectionChange?.(option.value);
              }}
              disabled={disabled}
              className={basePressable}
              style={gridItemStyle}
              activeOpacity={layout === 'grid-2' ? 0.8 : 0.75}
            >
              {layout === 'grid-2' || option.icon ? (
                <View className="items-center px-1">
                  {option.icon}
                  <Text className={labelClass} numberOfLines={layout === 'grid-2' ? 2 : 1}>
                    {option.label}
                  </Text>
                  {option.sublabel ? (
                    <Text
                      className={
                        layout === 'grid-2'
                          ? 'mt-1 text-center text-xs text-text-secondary'
                          : 'mt-0.5 text-center text-xs text-text-secondary'
                      }
                    >
                      {option.sublabel}
                    </Text>
                  ) : null}
                </View>
              ) : (
                <Text className={labelClass}>{option.label}</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
      {errors && typeof errors === 'object' && 'message' in errors && (
        <Text className="text-sm text-error">{String(errors.message)}</Text>
      )}
    </View>
  );
}

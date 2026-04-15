import { Text, TouchableOpacity, View } from 'react-native';
import { useFieldContext } from '@/hooks/form-context';

type OptionFieldProps = {
  options: readonly { label: string; value: unknown }[];
  label?: string;
  description?: string;
  /** Classes on the outer field wrapper (default includes bottom margin) */
  className?: string;
};

export function OptionField({ options, label, description, className = '' }: OptionFieldProps) {
  const field = useFieldContext();
  const errors = field.state.meta.errors[0];

  return (
    <View className={`mb-4 gap-1.5 ${className}`.trim()}>
      {label && <Text className="text-base font-medium text-text-secondary">{label}</Text>}
      {description && <Text className="text-sm leading-5 text-text-secondary">{description}</Text>}
      <View className="flex-row gap-3">
        {options.map((option) => {
          const isSelected = field.state.value === option.value;
          return (
            <TouchableOpacity
              key={option.label}
              onPress={() => field.handleChange(option.value)}
              className={`min-h-[48px] flex-1 items-center justify-center rounded-xl border py-3 ${
                isSelected ? 'border-primary bg-primary/10' : 'border-border bg-surface'
              }`}
              activeOpacity={0.7}
            >
              <Text
                className={`text-base font-medium ${
                  isSelected ? 'text-primary' : 'text-text-secondary'
                }`}
              >
                {option.label}
              </Text>
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

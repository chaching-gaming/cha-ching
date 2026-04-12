import { Text, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';
import { useFieldContext } from '@/hooks/form-context';
import { colors } from '@/constants/colors';

type TextFieldProps = {
  label?: string;
  labelRight?: React.ReactNode;
  rightIcon?: React.ReactNode;
  placeholder?: string;
} & Omit<TextInputProps, 'value' | 'onChangeText' | 'onBlur'>;

export function TextField({
  label,
  labelRight,
  rightIcon,
  placeholder,
  ...inputProps
}: TextFieldProps) {
  const field = useFieldContext<string>();
  const errors = field.state.meta.errors[0];

  return (
    <View className="mb-4 gap-1.5">
      {(label || labelRight) && (
        <View className="flex-row items-center justify-between">
          {label && (
            <Text className="text-base font-medium text-text-secondary">{label}</Text>
          )}
          {labelRight}
        </View>
      )}
      <View className="relative">
        <TextInput
          className={`min-h-[48px] rounded-xl border bg-surface-light px-4 py-3.5 text-base text-white ${
            rightIcon ? 'pr-11' : ''
          } ${errors ? 'border-error' : 'border-border'}`}
          placeholderTextColor={colors.textMuted}
          placeholder={placeholder}
          value={field.state.value}
          onChangeText={(text) => field.handleChange(text)}
          onBlur={field.handleBlur}
          {...inputProps}
        />
        {rightIcon && (
          <View className="absolute top-0 right-0 bottom-0 w-11 items-center justify-center">
            {rightIcon}
          </View>
        )}
      </View>
      {errors && typeof errors === 'object' && 'message' in errors && (
        <Text className="text-sm text-error">{String(errors.message)}</Text>
      )}
    </View>
  );
}

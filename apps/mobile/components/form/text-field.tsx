import { Platform, Text, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';
import { useFieldContext } from '@/hooks/form-context';
import { useTheme } from '@/providers/theme';

type TextFieldProps = {
  label?: string;
  labelRight?: React.ReactNode;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  /** Applied before updating field value (e.g. strip non-digits) */
  transformValue?: (text: string) => string;
  /** Extra classes on the TextInput (e.g. larger stake typography) */
  inputClassName?: string;
  /** Classes on the outer field wrapper (default includes bottom margin) */
  className?: string;
  placeholder?: string;
} & Omit<TextInputProps, 'value' | 'onChangeText' | 'onBlur'>;

export function TextField({
  label,
  labelRight,
  leftIcon,
  rightIcon,
  transformValue,
  inputClassName = '',
  className = '',
  placeholder,
  multiline,
  ...inputProps
}: TextFieldProps) {
  const { colors } = useTheme();
  const field = useFieldContext<string>();
  const errors = field.state.meta.errors[0];
  const padL = leftIcon ? 'pl-11' : 'pl-4';
  const padR = rightIcon ? 'pr-16' : 'pr-4';

  return (
    <View className={`mb-4 gap-1.5 ${className}`.trim()}>
      {(label || labelRight) && (
        <View className="flex-row items-center justify-between">
          {label && <Text className="text-base font-medium text-text-secondary">{label}</Text>}
          {labelRight}
        </View>
      )}
      <View className="relative">
        <TextInput
          className={`rounded-xl border bg-surface-light text-base text-text-primary ${padL} ${padR} ${
            errors ? 'border-error' : 'border-border'
          } ${inputClassName}`}
          style={[
            multiline
              ? {
                  minHeight: 48,
                  textAlignVertical: 'top',
                  includeFontPadding: false,
                  paddingTop: 14,
                  paddingBottom: 14,
                }
              : {
                  height: 48,
                  textAlignVertical: 'center',
                  includeFontPadding: false,
                },
            !multiline &&
              Platform.OS === 'ios' && {
                paddingTop: 0,
                paddingBottom: 0,
                lineHeight: 20,
              },
            !multiline &&
              Platform.OS === 'android' && {
                paddingVertical: 12,
              },
          ]}
          placeholderTextColor={colors.textMuted}
          placeholder={placeholder}
          multiline={multiline}
          value={field.state.value}
          onChangeText={(text) => {
            const next = transformValue ? transformValue(text) : text;
            field.handleChange(next);
          }}
          onBlur={field.handleBlur}
          {...inputProps}
        />
        {leftIcon && (
          <View className="pointer-events-none absolute top-0 bottom-0 left-0 w-11 items-center justify-center">
            {leftIcon}
          </View>
        )}
        {rightIcon && (
          <View className="pointer-events-none absolute top-0 right-3.5 bottom-0 w-16 items-center justify-center">
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

import { Text, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';

import { colors } from '@/constants/colors';

interface InputProps extends Omit<TextInputProps, 'className'> {
  label?: string;
  error?: string;
  className?: string;
}

export function Input({ label, error, className = '', ...props }: InputProps) {
  return (
    <View className={`mb-4 ${className}`}>
      {label && <Text className="mb-2 text-base font-medium text-text-secondary">{label}</Text>}
      <TextInput
        className={`min-h-[48px] rounded-xl border bg-surface-light px-4 py-3.5 text-base text-text-primary ${
          error ? 'border-error' : 'border-border'
        }`}
        placeholderTextColor={colors.textMuted}
        {...props}
      />
      {error && <Text className="mt-1 text-sm text-error">{error}</Text>}
    </View>
  );
}

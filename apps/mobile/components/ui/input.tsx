import { Text, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';

interface InputProps extends Omit<TextInputProps, 'className'> {
  label?: string;
  error?: string;
  className?: string;
}

export function Input({ label, error, className = '', ...props }: InputProps) {
  return (
    <View className={`mb-4 ${className}`}>
      {label && <Text className="mb-2 text-sm text-text-secondary">{label}</Text>}
      <TextInput
        className={`min-h-[44px] rounded-xl border bg-surface-light px-4 py-3 text-base text-white ${
          error ? 'border-error' : 'border-border'
        }`}
        placeholderTextColor="#64748B"
        {...props}
      />
      {error && <Text className="mt-1 text-sm text-error">{error}</Text>}
    </View>
  );
}

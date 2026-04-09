import { ActivityIndicator, Text, TouchableOpacity } from 'react-native';

const variants = {
  primary: 'bg-primary active:bg-primary-dark',
  secondary: 'bg-surface-light border border-border',
  danger: 'bg-error',
  outline: 'border border-border bg-transparent',
} as const;

const textVariants = {
  primary: 'text-white font-semibold',
  secondary: 'text-text-secondary font-medium',
  danger: 'text-white font-semibold',
  outline: 'text-text-secondary font-medium',
} as const;

interface ButtonProps {
  variant?: keyof typeof variants;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  children: string;
  className?: string;
}

export function Button({
  variant = 'primary',
  onPress,
  disabled = false,
  loading = false,
  children,
  className = '',
}: ButtonProps) {
  return (
    <TouchableOpacity
      className={`min-h-[44px] items-center justify-center rounded-xl px-6 py-3.5 ${variants[variant]} ${disabled || loading ? 'opacity-50' : ''} ${className}`}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#fff' : '#94A3B8'} />
      ) : (
        <Text className={`text-base ${textVariants[variant]}`}>{children}</Text>
      )}
    </TouchableOpacity>
  );
}

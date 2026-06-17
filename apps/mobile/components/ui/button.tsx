import { ActivityIndicator, Text, TouchableOpacity } from 'react-native';

import { useTheme } from '@/providers/theme';

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

const sizes = {
  md: { container: 'min-h-[44px] px-6 py-3.5', label: 'text-base' },
  lg: { container: 'min-h-[52px] px-6 py-4', label: 'text-lg' },
} as const;

interface ButtonProps {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  children: string;
  className?: string;
}

export function Button({
  variant = 'primary',
  size = 'md',
  onPress,
  disabled = false,
  loading = false,
  children,
  className = '',
}: ButtonProps) {
  const { colors } = useTheme();
  const s = sizes[size];
  return (
    <TouchableOpacity
      className={`items-center justify-center rounded-xl ${s.container} ${variants[variant]} ${disabled || loading ? 'opacity-50' : ''} ${className}`}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' || variant === 'danger' ? '#FFFFFF' : colors.textSecondary} />
      ) : (
        <Text className={`${s.label} ${textVariants[variant]}`}>{children}</Text>
      )}
    </TouchableOpacity>
  );
}

import { Text, View } from 'react-native';

const variants = {
  admin: 'bg-primary/20',
  player: 'bg-blue-500/20',
  attestor: 'bg-warning/20',
  success: 'bg-primary/20',
  error: 'bg-error/20',
  default: 'bg-surface-light',
} as const;

const textVariants = {
  admin: 'text-primary',
  player: 'text-blue-400',
  attestor: 'text-warning',
  success: 'text-primary',
  error: 'text-error',
  default: 'text-text-secondary',
} as const;

interface BadgeProps {
  variant?: keyof typeof variants;
  label: string;
  className?: string;
}

export function Badge({ variant = 'default', label, className = '' }: BadgeProps) {
  return (
    <View className={`rounded-full px-3 py-1 ${variants[variant]} ${className}`}>
      <Text className={`text-xs font-medium ${textVariants[variant]}`}>{label}</Text>
    </View>
  );
}

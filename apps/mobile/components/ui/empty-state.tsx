import { Text, View } from 'react-native';
import type { ComponentType } from 'react';

import { colors } from '@/constants/colors';
import { Button } from './button';

interface IconProps {
  size: number;
  color: string;
  weight?: 'regular' | 'fill' | 'bold';
}

interface EmptyStateProps {
  /** Optional icon to display above the title */
  icon?: ComponentType<IconProps>;
  /** Main title text */
  title: string;
  /** Optional subtitle/description text */
  subtitle?: string;
  /** Optional primary action button */
  action?: {
    label: string;
    onPress: () => void;
  };
  /** Optional secondary action button */
  secondaryAction?: {
    label: string;
    onPress: () => void;
  };
  /** Additional className for the container */
  className?: string;
}

/**
 * Reusable empty state component for screens with no content
 */
export function EmptyState({
  icon: Icon,
  title,
  subtitle,
  action,
  secondaryAction,
  className = '',
}: EmptyStateProps) {
  return (
    <View className={`flex-1 items-center justify-center px-5 ${className}`}>
      {Icon ? (
        <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-surface">
          <Icon size={32} color={colors.textMuted} weight="regular" />
        </View>
      ) : null}

      <Text className="text-center text-xl font-semibold text-white">{title}</Text>

      {subtitle ? (
        <Text className="mt-2 max-w-sm text-center text-base leading-6 text-text-secondary">
          {subtitle}
        </Text>
      ) : null}

      {action || secondaryAction ? (
        <View className="mt-6 w-full max-w-xs gap-3">
          {action ? (
            <Button variant="primary" onPress={action.onPress}>
              {action.label}
            </Button>
          ) : null}
          {secondaryAction ? (
            <Button variant="outline" onPress={secondaryAction.onPress}>
              {secondaryAction.label}
            </Button>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

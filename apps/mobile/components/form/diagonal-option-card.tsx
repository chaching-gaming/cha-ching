import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { colors } from '@/constants/colors';

type DiagonalOptionCardProps = {
  icon: ReactNode;
  label: string;
  sublabel?: string;
  value: string;
  positiveLabel: string;
  negativeLabel: string;
  selectedPick: string | null;
  onSelect: (value: string, pick: string) => void;
  disabled?: boolean;
  isActive: boolean;
};

export function DiagonalOptionCard({
  icon,
  label,
  sublabel,
  value,
  positiveLabel,
  negativeLabel,
  selectedPick,
  onSelect,
  disabled = false,
  isActive,
}: DiagonalOptionCardProps) {
  const positiveSelected = isActive && selectedPick === positiveLabel;
  const negativeSelected = isActive && selectedPick === negativeLabel;

  const borderColor = isActive ? colors.primary : colors.border;
  const bgColor = isActive ? 'rgba(46, 175, 125, 0.1)' : colors.surface;

  return (
    <View
      style={{
        maxWidth: '48%',
        flexGrow: 1,
        flexBasis: '48%',
        borderRadius: 16,
        borderWidth: 2,
        borderColor,
        backgroundColor: bgColor,
        overflow: 'hidden',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {/* Top section: Icon and label */}
      <View className="items-center px-3 pb-2 pt-4">
        {icon}
        <Text className="mt-2 text-center text-sm font-bold text-white" numberOfLines={2}>
          {label}
        </Text>
        {sublabel ? (
          <Text className="mt-0.5 text-center text-xs text-text-muted">{sublabel}</Text>
        ) : null}
      </View>

      {/* Bottom section: Two toggle buttons */}
      <View className="flex-row gap-2 px-2 pb-2">
        <Pressable
          onPress={() => !disabled && onSelect(value, positiveLabel)}
          disabled={disabled}
          style={{
            flex: 1,
            paddingVertical: 10,
            borderRadius: 10,
            backgroundColor: positiveSelected ? colors.primary : 'rgba(255,255,255,0.08)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: '700',
              color: positiveSelected ? colors.background : colors.textSecondary,
            }}
          >
            {positiveLabel}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => !disabled && onSelect(value, negativeLabel)}
          disabled={disabled}
          style={{
            flex: 1,
            paddingVertical: 10,
            borderRadius: 10,
            backgroundColor: negativeSelected ? colors.error : 'rgba(255,255,255,0.08)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: '700',
              color: negativeSelected ? '#FFFFFF' : colors.textSecondary,
            }}
          >
            {negativeLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

import { Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CaretLeft } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';

import { colors } from '@/constants/colors';

interface ScreenHeaderProps {
  title: string;
  /** Optional line under title (e.g. room name on sub-pages) */
  subtitle?: string;
  showBack?: boolean;
  right?: React.ReactNode;
  /** Override default title typography (default: text-xl font-bold) */
  titleClassName?: string;
  backIconSize?: number;
}

export function ScreenHeader({
  title,
  subtitle,
  showBack = false,
  right,
  titleClassName = 'text-xl font-bold text-white',
  backIconSize = 24,
}: ScreenHeaderProps) {
  const router = useRouter();

  // Main tab pages (no back button): left-aligned title
  // Sub-pages (with back button): center-aligned title
  if (!showBack) {
    return (
      <View className="flex-row items-center justify-between bg-background px-5 pb-4 pt-16">
        <Text className={titleClassName}>{title}</Text>
        {right ? <View>{right}</View> : null}
      </View>
    );
  }

  return (
    <View className="flex-row items-center bg-background px-5 pb-4 pt-16">
      {/* Left slot */}
      <View className="w-12 items-start">
        <TouchableOpacity
          onPress={() => router.back()}
          onLongPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.replace('/(tabs)/rooms');
          }}
          delayLongPress={400}
          activeOpacity={0.7}
          accessibilityLabel="Go back"
          accessibilityHint="Long press to go home"
        >
          <CaretLeft size={backIconSize} color={colors.textPrimary} weight="bold" />
        </TouchableOpacity>
      </View>

      {/* Center title */}
      <View className="flex-1 items-center">
        <Text className={titleClassName} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text
            className="mt-0.5 max-w-full px-1 text-center text-sm font-semibold text-primary"
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>

      {/* Right slot */}
      <View className="min-w-12 items-end">{right ?? null}</View>
    </View>
  );
}

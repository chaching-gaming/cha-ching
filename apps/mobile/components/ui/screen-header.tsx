import { Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CaretLeft, House } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';

import { colors } from '@/constants/colors';

interface ScreenHeaderProps {
  title: string;
  /** Optional line under title (e.g. room name on sub-pages) */
  subtitle?: string;
  showBack?: boolean;
  /** Show a home button alongside back for quick navigation to rooms list */
  showHome?: boolean;
  right?: React.ReactNode;
  /** Override default title typography (default: text-xl font-bold) */
  titleClassName?: string;
  backIconSize?: number;
}

export function ScreenHeader({
  title,
  subtitle,
  showBack = false,
  showHome = false,
  right,
  titleClassName = 'text-xl font-bold text-text-primary',
  backIconSize = 24,
}: ScreenHeaderProps) {
  const router = useRouter();

  const handleGoHome = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // dismissAll clears the entire stack, leaving only the root screen
    // This prevents the native back gesture from returning to intermediate screens
    router.dismissAll();
  };

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
      {/* Left slot - back button and optional home */}
      <View className={`flex-row items-center ${showHome ? 'min-w-16 gap-3' : 'w-12'}`}>
        <TouchableOpacity
          onPress={() => router.back()}
          onLongPress={handleGoHome}
          delayLongPress={400}
          activeOpacity={0.7}
          accessibilityLabel="Go back"
          accessibilityHint="Long press to go home"
        >
          <CaretLeft size={backIconSize} color={colors.textPrimary} weight="bold" />
        </TouchableOpacity>
        {showHome && (
          <TouchableOpacity
            onPress={handleGoHome}
            activeOpacity={0.7}
            accessibilityLabel="Go to rooms"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <House size={18} color={colors.textMuted} weight="fill" />
          </TouchableOpacity>
        )}
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

      {/* Right slot - matches left width to keep title centered */}
      <View className={`items-end ${showHome ? 'min-w-16' : 'min-w-12'}`}>{right ?? null}</View>
    </View>
  );
}

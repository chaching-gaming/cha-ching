import { useMemo } from 'react';
import { Text, TouchableOpacity } from 'react-native';
import Animated, {
  SlideInUp,
  SlideOutUp,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { CheckCircle, Info, Warning, X } from 'phosphor-react-native';

import { useTheme } from '@/providers/theme';
import type { ThemeColors } from '@/constants/colors';

type ToastType = 'error' | 'success' | 'info';

export interface ToastProps {
  type: ToastType;
  message: string;
  action?: {
    label: string;
    onPress: () => void;
  };
  onDismiss: () => void;
}

function getToastConfig(colors: ThemeColors) {
  return {
    error: {
      icon: Warning,
      bgClass: 'bg-error/15',
      borderClass: 'border-error/30',
      iconColor: colors.error,
    },
    success: {
      icon: CheckCircle,
      bgClass: 'bg-primary/15',
      borderClass: 'border-primary/30',
      iconColor: colors.primary,
    },
    info: {
      icon: Info,
      bgClass: 'bg-surface-light',
      borderClass: 'border-border',
      iconColor: colors.textSecondary,
    },
  } as const;
}

export function Toast({ type, message, action, onDismiss }: ToastProps) {
  const { colors } = useTheme();
  const toastConfig = useMemo(() => getToastConfig(colors), [colors]);
  const config = toastConfig[type];
  const Icon = config.icon;

  const translateY = useSharedValue(0);

  // Swipe to dismiss gesture
  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      // Only allow upward swipe (negative y)
      if (event.translationY < 0) {
        translateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (event.translationY < -50) {
        // Dismiss if swiped far enough
        onDismiss();
      } else {
        // Snap back
        translateY.value = withTiming(0, { duration: 200 });
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        entering={SlideInUp.duration(300)}
        exiting={SlideOutUp.duration(200)}
        style={animatedStyle}
        className={`mb-2 flex-row items-center gap-3 rounded-xl border px-4 py-3 ${config.bgClass} ${config.borderClass}`}
      >
        <Icon size={20} color={config.iconColor} weight="fill" />

        <Text className="min-w-0 flex-1 text-sm font-medium text-text-primary" numberOfLines={2}>
          {message}
        </Text>

        {action ? (
          <TouchableOpacity
            onPress={() => {
              action.onPress();
              onDismiss();
            }}
            activeOpacity={0.7}
            className="rounded-lg bg-surface-light px-3 py-1.5"
          >
            <Text className="text-sm font-semibold text-text-primary">{action.label}</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity onPress={onDismiss} activeOpacity={0.7} className="p-1">
          <X size={18} color={toastConfig.info.iconColor} weight="bold" />
        </TouchableOpacity>
      </Animated.View>
    </GestureDetector>
  );
}

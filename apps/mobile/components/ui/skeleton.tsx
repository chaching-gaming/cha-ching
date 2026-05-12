import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

/**
 * Base skeleton component with pulse animation
 */
export function Skeleton({ className = '' }: { className?: string }) {
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 800 }),
        withTiming(0.5, { duration: 800 })
      ),
      -1,
      false
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={animatedStyle}
      className={`rounded-lg bg-surface-light ${className}`}
    />
  );
}

/**
 * Circular skeleton for avatars
 */
export function SkeletonAvatar({
  size = 'md',
}: {
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-12 w-12',
    lg: 'h-14 w-14',
    xl: 'h-16 w-16',
  };

  return <Skeleton className={`${sizeClasses[size]} rounded-full`} />;
}

/**
 * Skeleton for text lines
 */
export function SkeletonText({
  width = 'full',
  height = 'sm',
}: {
  width?: 'full' | '3/4' | '1/2' | '1/4';
  height?: 'xs' | 'sm' | 'md' | 'lg';
}) {
  const widthClasses = {
    full: 'w-full',
    '3/4': 'w-3/4',
    '1/2': 'w-1/2',
    '1/4': 'w-1/4',
  };

  const heightClasses = {
    xs: 'h-3',
    sm: 'h-4',
    md: 'h-5',
    lg: 'h-6',
  };

  return <Skeleton className={`${widthClasses[width]} ${heightClasses[height]}`} />;
}

/**
 * Skeleton for list items (e.g., room rows, standings rows)
 */
export function SkeletonListItem() {
  return (
    <View className="flex-row items-center gap-3 border-b border-border/40 px-5 py-4">
      <SkeletonAvatar size="md" />
      <View className="flex-1 gap-2">
        <SkeletonText width="3/4" height="md" />
        <SkeletonText width="1/2" height="sm" />
      </View>
    </View>
  );
}

/**
 * Skeleton for activity cards (bets, chip requests)
 */
export function SkeletonCard() {
  return (
    <View className="mb-3 rounded-2xl border border-border bg-surface px-4 py-4">
      {/* Header */}
      <View className="mb-3 flex-row items-center justify-between">
        <SkeletonText width="1/4" height="xs" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </View>

      {/* Main content */}
      <View className="gap-2">
        <SkeletonText width="full" height="lg" />
        <SkeletonText width="3/4" height="lg" />
      </View>

      {/* Options row */}
      <View className="mt-3 flex-row gap-2">
        <Skeleton className="h-20 flex-1 rounded-xl" />
        <Skeleton className="h-20 flex-1 rounded-xl" />
      </View>

      {/* Footer */}
      <View className="mt-3 flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Skeleton className="h-5 w-5 rounded-full" />
          <SkeletonText width="1/4" height="sm" />
        </View>
        <SkeletonText width="1/4" height="xs" />
      </View>
    </View>
  );
}

/**
 * Skeleton for profile header
 */
export function SkeletonProfileHeader() {
  return (
    <View className="items-center gap-3 px-5 py-6">
      <SkeletonAvatar size="xl" />
      <View className="items-center gap-2">
        <SkeletonText width="1/2" height="lg" />
        <SkeletonText width="1/4" height="sm" />
      </View>
    </View>
  );
}

/**
 * Skeleton for stats cards
 */
export function SkeletonStatsCard() {
  return (
    <View className="rounded-2xl border border-border bg-surface p-4">
      <View className="flex-row items-center justify-between">
        <View className="gap-2">
          <SkeletonText width="1/2" height="xs" />
          <SkeletonText width="3/4" height="lg" />
        </View>
        <Skeleton className="h-10 w-10 rounded-full" />
      </View>
    </View>
  );
}

/**
 * Skeleton for notification items
 */
export function SkeletonNotificationItem() {
  return (
    <View className="mx-4 mb-3 flex-row items-start gap-3 rounded-xl bg-surface p-4">
      <Skeleton className="h-12 w-12 rounded-full" />
      <View className="flex-1 gap-2">
        <SkeletonText width="3/4" height="md" />
        <SkeletonText width="full" height="sm" />
        <SkeletonText width="1/4" height="xs" />
      </View>
    </View>
  );
}

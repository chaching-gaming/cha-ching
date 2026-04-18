import { useEffect } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { ChatCircleDots, Coins } from 'phosphor-react-native';

import { colors } from '@/constants/colors';
import type { BetWithProfiles } from '@/hooks/use-activity-feed';

type Props = {
  bet: BetWithProfiles | null;
  currentUserId: string | null;
  onDismiss: () => void;
};

const AUTO_DISMISS_MS = 3500;

export function LockedInCelebration({ bet, currentUserId, onDismiss }: Props) {
  const visible = bet !== null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      {bet ? (
        <LockedInContent bet={bet} currentUserId={currentUserId} onDismiss={onDismiss} />
      ) : null}
    </Modal>
  );
}

function LockedInContent({
  bet,
  currentUserId,
  onDismiss,
}: {
  bet: BetWithProfiles;
  currentUserId: string | null;
  onDismiss: () => void;
}) {
  const subjectName = bet.subject_profile?.display_name ?? null;
  const myStake = currentUserId
    ? ((bet.stakes ?? []).find((s) => s.user_id === currentUserId) ?? null)
    : null;

  const iconOpacity = useSharedValue(0);
  const iconScale = useSharedValue(0.6);
  const glowOpacity = useSharedValue(0);
  const glowScale = useSharedValue(0.4);
  const progress = useSharedValue(0);

  useEffect(() => {
    iconOpacity.value = withTiming(1, { duration: 350 });
    iconScale.value = withSequence(
      withTiming(1.1, { duration: 380 }),
      withTiming(1, { duration: 200 }),
    );

    glowOpacity.value = withSequence(
      withTiming(0.55, { duration: 400 }),
      withRepeat(
        withSequence(withTiming(0.25, { duration: 900 }), withTiming(0.55, { duration: 900 })),
        -1,
        false,
      ),
    );
    glowScale.value = withRepeat(
      withSequence(withTiming(1.25, { duration: 900 }), withTiming(1, { duration: 900 })),
      -1,
      false,
    );

    progress.value = withTiming(1, { duration: AUTO_DISMISS_MS });
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const iconStyle = useAnimatedStyle(() => ({
    opacity: iconOpacity.value,
    transform: [{ scale: iconScale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [{ scale: glowScale.value }],
  }));

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  return (
    <Pressable className="flex-1 items-center justify-center bg-black/90" onPress={onDismiss}>
      <View className="items-center px-8">
        {/* Icon with pulsing glow */}
        <View className="relative h-36 w-36 items-center justify-center">
          <Animated.View
            style={[
              glowStyle,
              {
                position: 'absolute',
                width: 144,
                height: 144,
                borderRadius: 72,
                backgroundColor: colors.primary,
              },
            ]}
          />
          <Animated.View
            style={[
              iconStyle,
              {
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
              },
            ]}
          >
            <ChatCircleDots size={44} color="#ffffff" weight="fill" />
          </Animated.View>
        </View>

        <Text className="mt-6 text-3xl font-black uppercase tracking-wider text-white">
          You&apos;re locked in
        </Text>
        {subjectName ? (
          <Text className="mt-2 text-base text-text-secondary" numberOfLines={1}>
            About {subjectName}
          </Text>
        ) : null}

        <View className="mt-4 flex-row items-center gap-2 rounded-full bg-warning/15 px-4 py-2">
          <Coins size={20} color={colors.chipsIcon} weight="fill" />
          <Text className="text-lg font-bold text-warning">
            {bet.stake.toLocaleString('en-US')} chips
          </Text>
        </View>

        {myStake ? (
          <View className="mt-2 rounded-full border-2 border-primary bg-primary/10 px-4 py-1">
            <Text className="text-sm font-bold text-primary">
              Backing &ldquo;{myStake.pick}&rdquo;
            </Text>
          </View>
        ) : null}

        <Text
          className="mt-4 max-w-[300px] text-center text-sm text-text-secondary"
          numberOfLines={3}
        >
          {bet.question}
        </Text>
      </View>

      {/* Auto-dismiss progress bar */}
      <View className="absolute bottom-12 left-8 right-8 h-1 overflow-hidden rounded-full bg-surface">
        <Animated.View
          style={[progressStyle, { height: '100%', backgroundColor: colors.primary }]}
        />
      </View>
    </Pressable>
  );
}

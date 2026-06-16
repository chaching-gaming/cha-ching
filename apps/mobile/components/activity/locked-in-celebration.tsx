import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChatCircleDots, Coins } from 'phosphor-react-native';

import { useTheme } from '@/providers/theme';
import type { BetWithProfiles } from '@/hooks/use-activity-feed';

type Props = {
  bet: BetWithProfiles | null;
  currentUserId: string | null;
  onDismiss: () => void;
};

const AUTO_DISMISS_MS = 3500;

export function LockedInCelebration({ bet, currentUserId, onDismiss }: Props) {
  if (!bet) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <LockedInContent bet={bet} currentUserId={currentUserId} onDismiss={onDismiss} />
    </View>
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
  const { colors } = useTheme();
  const subjectName = bet.subject_profile?.display_name ?? null;
  const myStake = currentUserId
    ? ((bet.stakes ?? []).find((s) => s.user_id === currentUserId) ?? null)
    : null;

  // Progress bar state (0-100)
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Update progress every 50ms for smooth bar
    const interval = setInterval(() => {
      setProgress((prev) => {
        const next = prev + (100 / (AUTO_DISMISS_MS / 50));
        return next >= 100 ? 100 : next;
      });
    }, 50);

    // Auto-dismiss after timeout
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);

    return () => {
      clearInterval(interval);
      clearTimeout(timer);
    };
  }, [onDismiss]);

  return (
    <Pressable
      style={StyleSheet.absoluteFill}
      className="items-center justify-center bg-black/90"
      onPress={onDismiss}
    >
      <View className="items-center px-8">
        {/* Icon with static glow effect */}
        <View className="relative h-36 w-36 items-center justify-center">
          <View
            style={{
              position: 'absolute',
              width: 144,
              height: 144,
              borderRadius: 72,
              backgroundColor: colors.primary,
              opacity: 0.35,
            }}
          />
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: colors.primary,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.6,
              shadowRadius: 20,
              elevation: 10,
            }}
          >
            <ChatCircleDots size={44} color={colors.textPrimary} weight="fill" />
          </View>
        </View>

        <Text className="mt-6 text-3xl font-black uppercase tracking-wider text-text-primary">
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

      {/* Auto-dismiss progress bar - using regular View with width percentage */}
      <View className="absolute bottom-12 left-8 right-8 h-1 overflow-hidden rounded-full bg-surface">
        <View
          style={{
            height: '100%',
            width: `${progress}%`,
            backgroundColor: colors.primary,
          }}
        />
      </View>
    </Pressable>
  );
}

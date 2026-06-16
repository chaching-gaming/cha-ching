import { useEffect, useMemo } from 'react';
import { Dimensions, Modal, Pressable, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Trophy } from 'phosphor-react-native';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/providers/theme';
import type { BetWithProfiles } from '@/hooks/use-activity-feed';

type Props = {
  bet: BetWithProfiles | null;
  currentUserId: string | null;
  onDismiss: () => void;
};

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CONFETTI_COUNT = 28;

export function WinnerCelebration({ bet, currentUserId, onDismiss }: Props) {
  const visible = bet !== null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      {bet ? <WinnerContent bet={bet} currentUserId={currentUserId} onDismiss={onDismiss} /> : null}
    </Modal>
  );
}

function WinnerContent({
  bet,
  currentUserId,
  onDismiss,
}: {
  bet: BetWithProfiles;
  currentUserId: string | null;
  onDismiss: () => void;
}) {
  const { colors } = useTheme();
  // Derive winners from stakes that matched the outcome; compute per-winner
  // payout as floor(total_pool / n_winners) — mirrors the server math.
  const stakes = bet.stakes ?? [];
  const outcomeKey = bet.outcome?.trim().toLowerCase() ?? '';
  const winningStakes = stakes.filter((s) => s.pick.trim().toLowerCase() === outcomeKey);
  const totalPool = stakes.length * (bet.stake ?? 0);
  const payout = winningStakes.length > 0 ? Math.floor(totalPool / winningStakes.length) : 0;
  const meWon = !!currentUserId && winningStakes.some((s) => s.user_id === currentUserId);
  const myStake = currentUserId ? (stakes.find((s) => s.user_id === currentUserId) ?? null) : null;
  const winnerLabel =
    winningStakes.length === 0
      ? 'No winners'
      : winningStakes.length === 1
        ? `${winningStakes[0].user?.display_name ?? 'Someone'} won!`
        : `${winningStakes.length} winners · ${bet.outcome ?? ''}`;

  return (
    <Pressable className="flex-1 items-center justify-center bg-black/85" onPress={onDismiss}>
      <View className="absolute inset-0" pointerEvents="none">
        {Array.from({ length: CONFETTI_COUNT }).map((_, i) => (
          <ConfettiPiece key={i} index={i} />
        ))}
      </View>

      <View className="items-center gap-4 px-8" onStartShouldSetResponder={() => true}>
        <Text className="text-sm font-bold tracking-[4px] text-primary">WINNER</Text>

        <View className="relative">
          <Avatar
            uri={myStake?.user?.avatar_url ?? winningStakes[0]?.user?.avatar_url}
            fallback={myStake?.user?.display_name ?? winningStakes[0]?.user?.display_name ?? '?'}
            size="xl"
          />
          <View className="absolute -right-2 -top-2 h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-primary">
            <Trophy size={16} color={colors.textPrimary} weight="fill" />
          </View>
        </View>

        <Text className="text-center text-3xl font-bold text-text-primary">
          {meWon ? 'You won!' : winnerLabel}
        </Text>

        {payout > 0 ? (
          <View className="rounded-full bg-primary/15 px-5 py-2">
            <Text className="text-xl font-bold text-primary">
              +{payout.toLocaleString('en-US')} chips
              {winningStakes.length > 1 ? ' each' : ''}
            </Text>
          </View>
        ) : null}

        <Text
          className="mt-1 max-w-[280px] text-center text-sm text-text-secondary"
          numberOfLines={3}
        >
          {bet.question}
        </Text>

        <View className="mt-4 w-48">
          <Button onPress={onDismiss}>Nice</Button>
        </View>
      </View>
    </Pressable>
  );
}

function ConfettiPiece({ index }: { index: number }) {
  const { colors } = useTheme();
  const color = colors.confetti[index % colors.confetti.length];
  const startX = useMemo(() => Math.random() * SCREEN_W, []);
  const driftX = useMemo(() => (Math.random() - 0.5) * 120, []);
  const size = useMemo(() => 8 + Math.random() * 6, []);
  const delay = index * 60;
  const duration = 2600 + ((index * 97) % 1200);

  const y = useSharedValue(-40);
  const x = useSharedValue(0);
  const rotation = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 200 }));
    y.value = withDelay(delay, withTiming(SCREEN_H + 40, { duration }));
    x.value = withDelay(delay, withTiming(driftX, { duration }));
    rotation.value = withDelay(delay, withRepeat(withTiming(360, { duration: 900 }), -1, false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { rotate: `${rotation.value}deg` },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: startX,
          top: 0,
          width: size,
          height: size,
          borderRadius: 2,
          backgroundColor: color,
        },
        animatedStyle,
      ]}
    />
  );
}

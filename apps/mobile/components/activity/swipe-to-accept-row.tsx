import { useCallback, useMemo, useRef } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { CaretRight } from 'phosphor-react-native';

import { useAcceptBet } from '@/hooks/use-accept-bet';
import { getRpcErrorMessage } from '@/hooks/use-rooms';
import type { BetWithProfiles } from '@/hooks/use-activity-feed';

type Props = {
  bet: BetWithProfiles;
  roomId: string;
  children: React.ReactNode;
};

/**
 * Swipe the bet card right-to-left to reveal the Accept action.
 * Swipe-only (no tap button) to guard against accidental touches.
 */
export function SwipeToAcceptRow({ bet, roomId, children }: Props) {
  const swipeRef = useRef<Swipeable>(null);
  const acceptBet = useAcceptBet();

  const oppositePick = useMemo(() => {
    const opts = Array.isArray(bet.options) ? (bet.options as unknown[]) : [];
    const offered = bet.offered_pick?.trim().toLowerCase();
    const candidate = opts.find(
      (o) => typeof o === 'string' && o.trim().toLowerCase() !== offered,
    );
    return typeof candidate === 'string' ? candidate : null;
  }, [bet.options, bet.offered_pick]);

  const submit = useCallback(
    async (pick: string) => {
      try {
        await acceptBet.mutateAsync({ p_bet_id: bet.id, p_pick: pick, roomId });
      } catch (err) {
        Alert.alert('Could not accept bet', getRpcErrorMessage(err, 'Please try again.'));
      }
    },
    [acceptBet, bet.id, roomId],
  );

  const handleAccept = useCallback(() => {
    swipeRef.current?.close();
    if (!oppositePick) {
      Alert.alert('Could not accept bet', 'This bet has no valid opposite option.');
      return;
    }
    Alert.alert(
      'Accept this bet?',
      `You'll pick "${oppositePick}" for ${bet.stake.toLocaleString('en-US')} chips.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Accept', style: 'default', onPress: () => submit(oppositePick) },
      ],
    );
  }, [bet.stake, oppositePick, submit]);

  return (
    <Swipeable
      ref={swipeRef}
      friction={2}
      overshootLeft={false}
      leftThreshold={40}
      containerStyle={{ overflow: 'visible' }}
      enabled={!acceptBet.isPending}
      renderLeftActions={() => (
        <View className="mb-3 flex-row items-stretch pr-2">
          <TouchableOpacity
            onPress={handleAccept}
            disabled={acceptBet.isPending}
            activeOpacity={0.85}
            className="min-w-[110px] items-center justify-center rounded-2xl bg-primary px-4"
          >
            <CaretRight size={22} color="#ffffff" weight="bold" />
            <Text className="mt-1 text-center text-sm font-bold text-white">
              {acceptBet.isPending ? 'Accepting…' : 'Accept'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    >
      {children}
    </Swipeable>
  );
}

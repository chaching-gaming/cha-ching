import { useCallback, useRef } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { CaretRight } from 'phosphor-react-native';

import { colors } from '@/constants/colors';
import type { BetWithProfiles } from '@/hooks/use-activity-feed';

type Props = {
  bet: BetWithProfiles;
  children: React.ReactNode;
};

/**
 * Swipe the bet card to reveal the Accept action. Tapping Accept opens the
 * full-screen accept-bet route where the user picks a side and locks in.
 * Swipe-only discovery (with the inline hint) so an accidental tap on the
 * card itself doesn't trigger navigation.
 */
export function SwipeToAcceptRow({ bet, children }: Props) {
  const router = useRouter();
  const swipeRef = useRef<Swipeable>(null);

  const handleAccept = useCallback(() => {
    swipeRef.current?.close();
    router.push(`/(tabs)/rooms/accept-bet?betId=${bet.id}`);
  }, [bet.id, router]);

  return (
    <Swipeable
      ref={swipeRef}
      friction={2}
      overshootLeft={false}
      leftThreshold={40}
      containerStyle={{ overflow: 'visible' }}
      renderLeftActions={() => (
        <View className="mb-3 flex-row items-stretch pr-2">
          <TouchableOpacity
            onPress={handleAccept}
            activeOpacity={0.85}
            className="min-w-[110px] items-center justify-center rounded-2xl bg-primary px-4"
          >
            <CaretRight size={22} color={colors.textPrimary} weight="bold" />
            <Text className="mt-1 text-center text-sm font-bold text-white">Accept</Text>
          </TouchableOpacity>
        </View>
      )}
    >
      {children}
    </Swipeable>
  );
}

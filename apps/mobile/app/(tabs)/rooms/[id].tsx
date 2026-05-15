import { useCallback, useMemo, useState, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gear, Plus } from 'phosphor-react-native';

import { colors } from '@/constants/colors';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ActivityFeedItem } from '@/components/activity/activity-feed-item';
import {
  BetFeedStatusFilter,
  betMatchesFilter,
  type BetFilter,
} from '@/components/activity/bet-feed-status-filter';
import { LockedInCelebration } from '@/components/activity/locked-in-celebration';
import { RoomHeaderBar } from '@/components/activity/room-header-bar';
import { WinnerCelebration } from '@/components/activity/winner-celebration';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/providers/auth';
import { useRoomDetail, useRoomMembers } from '@/hooks/use-rooms';
import {
  useMyRoomBalance,
  useRealtimeActivityFeed,
  useRoomActivityFeed,
} from '@/hooks/use-activity-feed';
import { useLockedInCelebration } from '@/hooks/use-locked-in-celebration';
import { useWinnerCelebration } from '@/hooks/use-winner-celebration';

const EMPTY_STATE_COPY: Record<BetFilter, { title: string; subtitle: string }> = {
  all: { title: 'No bets yet', subtitle: 'Tap Create Bet to start the action.' },
  open: { title: 'No open bets', subtitle: 'Create a new bet or wait for one to open.' },
  matched: { title: 'No matched bets', subtitle: 'Bets show up here once both sides are staked.' },
  settled: { title: 'No settled bets', subtitle: 'Finished bets will appear here.' },
};

export default function RoomDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session: authSession } = useAuth();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();

  const { data: room, isLoading: roomLoading } = useRoomDetail(id);
  const { data: members } = useRoomMembers(id);
  const { data: balance } = useMyRoomBalance(id);
  const { data: activityItems, isLoading: feedLoading } = useRoomActivityFeed(id);

  // Track if we've already shown the removal alert to prevent duplicates
  const hasShownRemovalAlert = useRef(false);

  const handleCurrentUserRemoved = useCallback(() => {
    if (hasShownRemovalAlert.current) return;
    hasShownRemovalAlert.current = true;

    Alert.alert(
      'Removed from Room',
      'You have been removed from this room by an admin.',
      [
        {
          text: 'OK',
          onPress: () => {
            queryClient.invalidateQueries({ queryKey: ['rooms'] });
            router.replace('/(tabs)/rooms');
          },
        },
      ],
      { cancelable: false },
    );
  }, [queryClient, router]);

  useRealtimeActivityFeed(id, { onCurrentUserRemoved: handleCurrentUserRemoved });

  const currentUserId = authSession?.user.id ?? null;
  const myBalance = balance ?? 0;
  const hasOpenRequest = useMemo(
    () =>
      !!currentUserId &&
      (activityItems ?? []).some(
        (i) =>
          i.type === 'chip_request' &&
          i.chipRequest.requested_by === currentUserId &&
          i.chipRequest.status === 'OPEN',
      ),
    [activityItems, currentUserId],
  );

  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<BetFilter>('all');

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['rooms', id] });
    setRefreshing(false);
  }, [id, queryClient]);

  const currentMember = members?.find((m) => m.user_id === authSession?.user.id);
  const isActive = room?.is_active ?? false;

  const feedItems = useMemo(() => activityItems ?? [], [activityItems]);

  // Chip requests only show in "all" tab; bet filters apply to bet items only.
  const visibleItems = useMemo(
    () =>
      feedItems.filter((item) => {
        if (item.type === 'chip_request') return filter === 'all';
        return betMatchesFilter(item.bet, filter);
      }),
    [feedItems, filter],
  );

  // Detects live bet.status → SETTLED transitions and queues a celebration
  // for the current user if they were a participant. `feedLoading` gates the
  // initial seed so historical SETTLED bets don't fire on first render.
  const { celebratingBet, dismissCelebration } = useWinnerCelebration(
    feedItems,
    authSession?.user.id ?? null,
    feedLoading,
  );

  // Detects OPEN → MATCHED transitions and queues a "You're locked in" flash.
  const { lockedInBet, dismissLockedIn } = useLockedInCelebration(
    feedItems,
    authSession?.user.id ?? null,
    feedLoading,
  );

  const openSettings = useCallback(() => {
    router.push(`/(tabs)/rooms/settings?id=${id}`);
  }, [router, id]);

  if (roomLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!room) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-lg text-text-secondary">Room not found</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title={room.name}
        showBack
        titleClassName="text-xl font-bold text-white"
        backIconSize={28}
        right={
          <TouchableOpacity
            onPress={openSettings}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Room settings"
          >
            <Gear size={26} color={colors.textSecondary} />
          </TouchableOpacity>
        }
      />

      <FlatList
        data={visibleItems}
        keyExtractor={(item) =>
          item.type === 'bet' ? `bet-${item.bet.id}` : `cr-${item.chipRequest.id}`
        }
        renderItem={({ item }) => (
          <ActivityFeedItem
            item={item}
            currentUserId={authSession?.user.id}
            currentUserRole={currentMember?.role ?? null}
            roomActive={isActive}
            roomId={id}
            currentUserBalance={myBalance}
          />
        )}
        contentContainerClassName="px-5 pb-24"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View>
            <RoomHeaderBar
              members={members ?? []}
              balance={myBalance}
              onOpenStandings={() => router.push(`/(tabs)/rooms/standings?id=${id}`)}
              roomId={id}
              roomActive={isActive}
              hasOpenRequest={hasOpenRequest}
            />
            <BetFeedStatusFilter value={filter} onChange={setFilter} />
          </View>
        }
        ListEmptyComponent={
          feedLoading ? (
            <View className="items-center py-12">
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <View className="items-center px-2 py-12">
              <Text className="text-center text-xl font-semibold text-text-secondary">
                {EMPTY_STATE_COPY[filter].title}
              </Text>
              <Text className="mt-2 max-w-sm text-center text-base leading-6 text-text-secondary">
                {EMPTY_STATE_COPY[filter].subtitle}
              </Text>
            </View>
          )
        }
      />

      <WinnerCelebration
        bet={celebratingBet}
        currentUserId={authSession?.user.id ?? null}
        onDismiss={dismissCelebration}
      />

      <LockedInCelebration
        bet={lockedInBet}
        currentUserId={authSession?.user.id ?? null}
        onDismiss={dismissLockedIn}
      />

      {isActive ? (
        <TouchableOpacity
          onPress={() => router.push(`/(tabs)/rooms/create-bet?id=${id}`)}
          activeOpacity={0.85}
          accessibilityLabel="Create bet"
          className="absolute right-5 h-14 w-14 items-center justify-center rounded-full bg-primary"
          style={{
            bottom: Platform.OS === 'android' ? Math.max(insets.bottom, 12) + 24 : 24,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.35,
            shadowRadius: 6,
            elevation: 6,
          }}
        >
          <Plus size={28} color="#ffffff" weight="bold" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

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
import { Gear, HandHeart, Plus } from 'phosphor-react-native';

import { useTheme } from '@/providers/theme';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ActivityFeedItem } from '@/components/activity/activity-feed-item';
import { WinnerCelebration } from '@/components/activity/winner-celebration';
import {
  BetFeedStatusFilter,
  betMatchesFilter,
  betInvolvesUser,
  type BetFilter,
} from '@/components/activity/bet-feed-status-filter';
import { ChipRequestsSheet } from '@/components/activity/chip-requests-sheet';
import { RoomHeaderBar } from '@/components/activity/room-header-bar';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/providers/auth';
import { useRoomDetail, useRoomMembersWithHistory } from '@/hooks/use-rooms';
import {
  useMyRoomBalance,
  useRealtimeActivityFeed,
  useRoomActivityFeedPaginated,
} from '@/hooks/use-activity-feed';
import { useWinnerCelebration } from '@/hooks/use-winner-celebration';

/** Split room name like "Sunday golf - 2026-05-10" into { name, date } */
function parseRoomName(fullName: string): { name: string; date: string | null } {
  const separator = ' - ';
  const lastIndex = fullName.lastIndexOf(separator);
  if (lastIndex === -1) {
    return { name: fullName, date: null };
  }
  return {
    name: fullName.slice(0, lastIndex),
    date: fullName.slice(lastIndex + separator.length),
  };
}

const EMPTY_STATE_COPY: Record<BetFilter, { title: string; subtitle: string }> = {
  active: { title: 'No active bets', subtitle: 'Create a bet or wait for action.' },
  open: { title: 'No open bets', subtitle: 'Create a new bet or wait for one to open.' },
  matched: { title: 'No matched bets', subtitle: 'Bets show up here once both sides are staked.' },
  settled: { title: 'No settled bets', subtitle: 'Finished bets will appear here.' },
};

export default function RoomDetailScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session: authSession } = useAuth();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();

  const { data: room, isLoading: roomLoading } = useRoomDetail(id);
  const { data: allMembers } = useRoomMembersWithHistory(id);
  const { data: balance } = useMyRoomBalance(id);

  // Filter to only active members for display
  const members = useMemo(
    () => allMembers?.filter((m) => m.membershipStatus === 'active') ?? [],
    [allMembers],
  );

  // Check if current user is an active member (not left/removed)
  const currentUserMembership = useMemo(
    () => allMembers?.find((m) => m.user_id === authSession?.user.id),
    [allMembers, authSession?.user.id],
  );
  const isCurrentUserActiveMember = currentUserMembership?.membershipStatus === 'active';
  const {
    data: activityItems,
    isLoading: feedLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useRoomActivityFeedPaginated(id);

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

  // Winner celebration on live bet settlement (not on pagination)
  const { celebratingBet, dismissCelebration } = useWinnerCelebration(
    activityItems ?? [],
    currentUserId,
    feedLoading,
    isFetchingNextPage,
  );

  const myBalance = balance ?? 0;

  // Parse room name into display name and date
  const { name: roomDisplayName, date: roomDate } = useMemo(
    () => parseRoomName(room?.name ?? ''),
    [room?.name],
  );

  // Current user's open chip request (for header progress + cancel)
  const myOpenChipRequest = useMemo(() => {
    if (!currentUserId) return null;
    const item = (activityItems ?? []).find(
      (i) =>
        i.type === 'chip_request' &&
        i.chipRequest.requested_by === currentUserId &&
        i.chipRequest.status === 'OPEN',
    );
    return item?.type === 'chip_request' ? item.chipRequest : null;
  }, [activityItems, currentUserId]);

  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<BetFilter>('active');
  const [myBetsOnly, setMyBetsOnly] = useState(false);
  const [chipRequestsSheetOpen, setChipRequestsSheetOpen] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['rooms', id] });
    setRefreshing(false);
  }, [id, queryClient]);

  const currentMember = currentUserMembership;
  const isActive = room?.is_active ?? false;
  // Can create bets only if room is active AND user is an active member
  const canCreateBet = isActive && isCurrentUserActiveMember;

  const feedItems = useMemo(() => activityItems ?? [], [activityItems]);

  // Only show bets in the main feed (chip requests moved to dedicated sheet)
  // When myBetsOnly is enabled, only show bets where the current user has a stake.
  const visibleItems = useMemo(
    () =>
      feedItems.filter((item) => {
        if (item.type === 'chip_request') return false; // Chip requests shown in sheet only
        if (!betMatchesFilter(item.bet, filter)) return false;
        if (myBetsOnly && !betInvolvesUser(item.bet, currentUserId)) return false;
        return true;
      }),
    [feedItems, filter, myBetsOnly, currentUserId],
  );

  // All chip requests for the bottom sheet (includes all statuses)
  const allChipRequests = useMemo(
    () =>
      feedItems
        .filter((item) => item.type === 'chip_request')
        .map((item) => (item as Extract<typeof item, { type: 'chip_request' }>).chipRequest),
    [feedItems],
  );

  // Count of open chip requests for badge display
  const openChipRequestCount = useMemo(
    () => allChipRequests.filter((r) => r.status === 'OPEN').length,
    [allChipRequests],
  );

  const openSettings = useCallback(() => {
    router.push(`/(tabs)/rooms/settings?id=${id}`);
  }, [router, id]);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

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
        title={roomDisplayName}
        subtitle={roomDate ?? undefined}
        showBack
        titleClassName="text-xl font-bold text-text-primary"
        backIconSize={28}
        right={
          <View className="flex-row items-center gap-4">
            <TouchableOpacity
              onPress={() => setChipRequestsSheetOpen(true)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={
                openChipRequestCount > 0
                  ? `${openChipRequestCount} open chip requests`
                  : 'View chip requests'
              }
              className="relative"
            >
              <HandHeart size={26} color={colors.primary} weight="fill" />
              {openChipRequestCount > 0 && (
                <View className="absolute -right-1.5 -top-1 min-w-[18px] items-center justify-center rounded-full bg-error px-1 py-0.5">
                  <Text className="text-[10px] font-bold text-text-primary">{openChipRequestCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={openSettings}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Room settings"
            >
              <Gear size={26} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
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
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
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
              myOpenChipRequest={myOpenChipRequest}
              isActiveMember={isCurrentUserActiveMember}
            />
            <BetFeedStatusFilter
              value={filter}
              onChange={setFilter}
              myBetsOnly={myBetsOnly}
              onMyBetsChange={setMyBetsOnly}
            />
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
                {myBetsOnly ? "No bets you're in" : EMPTY_STATE_COPY[filter].title}
              </Text>
              <Text className="mt-2 max-w-sm text-center text-base leading-6 text-text-secondary">
                {myBetsOnly ? 'Join a bet to see it here.' : EMPTY_STATE_COPY[filter].subtitle}
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          isFetchingNextPage ? (
            <View className="items-center py-4">
              <ActivityIndicator color={colors.primary} size="small" />
            </View>
          ) : null
        }
      />

      {canCreateBet ? (
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

      {/* Winner celebration on live bet settlement */}
      <WinnerCelebration
        bet={celebratingBet}
        currentUserId={currentUserId}
        onDismiss={dismissCelebration}
      />

      {/* Chip requests bottom sheet */}
      <ChipRequestsSheet
        visible={chipRequestsSheetOpen}
        onClose={() => setChipRequestsSheetOpen(false)}
        chipRequests={allChipRequests}
        currentUserId={currentUserId}
        roomId={id}
        roomActive={isActive}
        currentUserBalance={myBalance}
        isActiveMember={isCurrentUserActiveMember}
      />
    </View>
  );
}

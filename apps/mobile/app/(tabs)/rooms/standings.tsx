import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Crown } from 'phosphor-react-native';

import { colors } from '@/constants/colors';
import { Avatar, Badge, EmptyState, ScreenHeader, SkeletonListItem } from '@/components/ui';
import { useAuth } from '@/providers/auth';
import { useRoomDetail } from '@/hooks/use-rooms';
import { useRoomMemberBalances, type RoomMemberBalance } from '@/hooks/use-activity-feed';
import { balanceColorClass, formatBalance } from '@/lib/format-balance';

// Podium medal colors from design tokens
const RANK_BADGE_COLORS: Record<1 | 2 | 3, { bg: string; text: string }> = {
  1: { bg: colors.medal.gold, text: colors.textPrimary },
  2: { bg: colors.medal.silver, text: colors.textPrimary },
  3: { bg: colors.medal.bronze, text: colors.textPrimary },
};

export default function StandingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session: authSession } = useAuth();
  const queryClient = useQueryClient();

  const { data: room, isLoading: roomLoading } = useRoomDetail(id);
  const { data: memberBalances, isLoading: balancesLoading } = useRoomMemberBalances(id);
  // Expo Router keeps the main room screen mounted in the stack while this page
  // is on top, so its `useRealtimeActivityFeed` subscription is still active and
  // keeps invalidating `roomMemberBalancesKey` on every chip movement. Our own
  // `useRoomMemberBalances` here refetches from the shared cache automatically —
  // no need to double-subscribe from this page.

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['rooms', id] });
    setRefreshing(false);
  }, [id, queryClient]);

  const currentUserId = authSession?.user.id ?? null;
  const chipLimit = room?.per_user_chip_limit ?? null;
  const members = useMemo(() => memberBalances ?? [], [memberBalances]);

  const podium = useMemo(() => members.slice(0, 3), [members]);
  const rest = useMemo(() => members.slice(3), [members]);

  if (roomLoading) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="Standings" showBack titleClassName="text-xl font-bold text-white" backIconSize={28} />
        <View>
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonListItem key={i} />
          ))}
        </View>
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
        title="Standings"
        subtitle={room.name}
        showBack
        titleClassName="text-xl font-bold text-white"
        backIconSize={28}
      />

      {members.length === 0 ? (
        balancesLoading ? (
          <View>
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonListItem key={i} />
            ))}
          </View>
        ) : (
          <EmptyState
            icon={Crown}
            title="No standings yet"
            subtitle="Standings appear once chips start moving."
          />
        )
      ) : (
        <FlatList
          data={rest}
          keyExtractor={(m) => m.user_id}
          renderItem={({ item, index }) => (
            <StandingsRow
              member={item}
              rank={index + 4}
              isSelf={!!currentUserId && item.user_id === currentUserId}
              chipLimit={chipLimit}
            />
          )}
          contentContainerClassName="pb-12"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={
            <Podium members={podium} currentUserId={currentUserId} chipLimit={chipLimit} />
          }
        />
      )}
    </View>
  );
}

// ============================================================================
// Podium — top 3 on pedestals
// ============================================================================

function Podium({
  members,
  currentUserId,
  chipLimit,
}: {
  members: RoomMemberBalance[];
  currentUserId: string | null;
  chipLimit: number | null;
}) {
  // Position: #2 on the left, #1 in the middle (tallest), #3 on the right.
  // For under-filled rooms we still center #1 and only render columns we have.
  const first = members[0];
  const second = members[1];
  const third = members[2];

  return (
    <View className="mt-4 mb-4 flex-row items-end gap-2 px-5">
      <View className="flex-1">
        {second ? (
          <PodiumColumn
            member={second}
            rank={2}
            avatarSize="lg"
            pedestalHeight={96}
            isSelf={!!currentUserId && second.user_id === currentUserId}
            chipLimit={chipLimit}
          />
        ) : (
          <View className="opacity-0">
            <PodiumPlaceholder pedestalHeight={96} />
          </View>
        )}
      </View>
      <View className="flex-1">
        {first ? (
          <PodiumColumn
            member={first}
            rank={1}
            avatarSize="xl"
            pedestalHeight={128}
            isSelf={!!currentUserId && first.user_id === currentUserId}
            chipLimit={chipLimit}
          />
        ) : null}
      </View>
      <View className="flex-1">
        {third ? (
          <PodiumColumn
            member={third}
            rank={3}
            avatarSize="lg"
            pedestalHeight={80}
            isSelf={!!currentUserId && third.user_id === currentUserId}
            chipLimit={chipLimit}
          />
        ) : (
          <View className="opacity-0">
            <PodiumPlaceholder pedestalHeight={80} />
          </View>
        )}
      </View>
    </View>
  );
}

function PodiumColumn({
  member,
  rank,
  avatarSize,
  pedestalHeight,
  isSelf,
  chipLimit,
}: {
  member: RoomMemberBalance;
  rank: 1 | 2 | 3;
  avatarSize: 'lg' | 'xl';
  pedestalHeight: number;
  isSelf: boolean;
  chipLimit: number | null;
}) {
  const badge = RANK_BADGE_COLORS[rank];
  const belowLimit = chipLimit != null && member.balance <= chipLimit;

  return (
    <View className="items-center">
      {/* Avatar with rank badge */}
      <View className="relative">
        <Avatar uri={member.avatar_url} fallback={member.display_name ?? '?'} size={avatarSize} />
        <View
          className="absolute -right-1 -top-1 h-6 w-6 items-center justify-center rounded-full border-2 border-background"
          style={{ backgroundColor: badge.bg }}
        >
          <Text className="text-[11px] font-bold" style={{ color: badge.text }}>
            {rank}
          </Text>
        </View>
      </View>

      {/* Name */}
      <Text
        className="mt-2 max-w-full text-center text-sm font-semibold text-white"
        numberOfLines={1}
      >
        {member.display_name ?? 'Unknown'}
        {isSelf ? <Text className="text-xs text-text-secondary"> (you)</Text> : null}
      </Text>

      {/* Balance pill */}
      <View className="mt-1 rounded-lg bg-surface-light px-2 py-0.5">
        <Text className={`text-xs font-bold ${balanceColorClass(member.balance)}`}>
          {formatBalance(member.balance)}
        </Text>
      </View>

      {belowLimit ? (
        <Badge
          variant="error"
          label="At limit"
          className="mt-1 px-2 py-0.5"
          labelClassName="text-[10px] font-bold tracking-wide"
        />
      ) : null}

      {/* Pedestal */}
      <View
        className="mt-3 w-full items-center justify-center rounded-t-xl bg-surface"
        style={{ height: pedestalHeight }}
      >
        <Text className="text-5xl font-black text-text-muted opacity-30">{rank}</Text>
      </View>
    </View>
  );
}

function PodiumPlaceholder({ pedestalHeight }: { pedestalHeight: number }) {
  // Spacer to keep podium proportions stable when the room has fewer than
  // three members. Matches a PodiumColumn's avatar + label + pill vertical
  // footprint (~96 px) so the bottoms still align.
  return (
    <View className="items-center">
      <View className="h-16 w-16" />
      <View className="mt-2 h-4" />
      <View className="mt-1 h-5" />
      <View className="mt-3 w-full rounded-t-xl" style={{ height: pedestalHeight }} />
    </View>
  );
}

// ============================================================================
// Rank 4+ list row
// ============================================================================

function StandingsRow({
  member,
  rank,
  isSelf,
  chipLimit,
}: {
  member: RoomMemberBalance;
  rank: number;
  isSelf: boolean;
  chipLimit: number | null;
}) {
  const belowLimit = chipLimit != null && member.balance <= chipLimit;
  return (
    <View className="flex-row items-center border-b border-border/40 px-5 py-4">
      <Text className="w-8 text-base font-bold text-text-muted">{rank}</Text>
      <Avatar uri={member.avatar_url} fallback={member.display_name ?? '?'} size="md" />
      <View className="ml-3 min-w-0 flex-1 flex-row items-center gap-2">
        <Text className="min-w-0 shrink text-base text-white" numberOfLines={1}>
          {member.display_name ?? 'Unknown'}
          {isSelf ? <Text className="text-sm text-text-secondary"> (you)</Text> : null}
        </Text>
        {belowLimit ? (
          <Badge
            variant="error"
            label="At limit"
            className="px-2 py-0.5"
            labelClassName="text-[10px] font-bold tracking-wide"
          />
        ) : null}
      </View>
      <Text className={`text-base font-bold ${balanceColorClass(member.balance)}`}>
        {formatBalance(member.balance)}
      </Text>
    </View>
  );
}

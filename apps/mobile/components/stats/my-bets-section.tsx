import { useCallback, useMemo } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import {
  Trophy,
  TrendDown,
  Clock,
  Prohibit,
  ListDashes,
} from 'phosphor-react-native';

import { colors } from '@/constants/colors';
import { EmptyState } from '@/components/ui';
import { StatCard } from './stat-card';
import { useMyBets, myBetsKey, calculateMyBetsStats, type MyBet } from '@/hooks/use-my-bets';
import { balanceColorClass, formatBalance } from '@/lib/format-balance';

interface MyBetsSectionProps {
  roomId?: string | null;
}

export function MyBetsSection({ roomId }: MyBetsSectionProps) {
  const queryClient = useQueryClient();
  const {
    data,
    isLoading,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useMyBets(roomId);

  const allBets = useMemo(() => data?.pages.flatMap((page) => page) ?? [], [data]);
  const stats = useMemo(() => calculateMyBetsStats(allBets), [allBets]);

  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: myBetsKey(roomId ?? null) });
    await refetch();
  }, [queryClient, refetch, roomId]);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading && allBets.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-5">
        <Text className="text-base text-text-muted">Loading your bets...</Text>
      </View>
    );
  }

  if (!isLoading && allBets.length === 0) {
    return (
      <EmptyState
        icon={ListDashes}
        title="No bets yet"
        subtitle="Your betting history will appear here once you start placing bets."
      />
    );
  }

  return (
    <FlatList
      data={allBets}
      keyExtractor={(item) => item.bet_id}
      renderItem={({ item, index }) => (
        <BetRow bet={item} isLast={index === allBets.length - 1} />
      )}
      contentContainerClassName="pb-12"
      ListHeaderComponent={<StatsHeader stats={stats} />}
      refreshControl={
        <RefreshControl
          refreshing={isFetching && !isFetchingNextPage}
          onRefresh={handleRefresh}
          tintColor={colors.primary}
        />
      }
      onEndReached={handleLoadMore}
      onEndReachedThreshold={0.5}
      ListFooterComponent={
        isFetchingNextPage ? (
          <View className="py-4">
            <Text className="text-center text-sm text-text-muted">Loading more...</Text>
          </View>
        ) : null
      }
    />
  );
}

function StatsHeader({ stats }: { stats: ReturnType<typeof calculateMyBetsStats> }) {
  return (
    <View className="px-5 pb-4">
      <Text className="mb-2 mt-3 px-1 text-xs font-semibold uppercase tracking-widest text-text-muted">
        Summary
      </Text>
      <View className="flex-row gap-3">
        <StatCard label="Total bets" value={String(stats.totalBets)} />
        <StatCard label="Win rate" value={stats.winRate != null ? `${stats.winRate}%` : '—'} tone="primary" />
      </View>
      <View className="mt-3 flex-row gap-3">
        <StatCard label="Wins" value={String(stats.wins)} tone="primary" />
        <StatCard label="Losses" value={String(stats.losses)} tone="error" />
      </View>
      <View className="mt-3">
        <View className="rounded-2xl border border-border bg-surface px-4 py-3">
          <Text className="text-xs font-semibold uppercase tracking-widest text-text-muted">
            Net chips
          </Text>
          <Text className={`mt-1 text-3xl font-bold ${balanceColorClass(stats.netChips)}`}>
            {formatBalance(stats.netChips)}
          </Text>
        </View>
      </View>
      <Text className="mb-2 mt-5 px-1 text-xs font-semibold uppercase tracking-widest text-text-muted">
        History
      </Text>
    </View>
  );
}

function BetRow({ bet, isLast }: { bet: MyBet; isLast: boolean }) {
  const StatusIcon = useMemo(() => {
    if (bet.status === 'SETTLED') {
      return bet.won ? Trophy : TrendDown;
    }
    if (bet.status === 'VOID') {
      return Prohibit;
    }
    return Clock;
  }, [bet.status, bet.won]);

  const iconColor = useMemo(() => {
    if (bet.status === 'SETTLED') {
      return bet.won ? '#22C55E' : '#EF4444';
    }
    if (bet.status === 'VOID') {
      return colors.textMuted;
    }
    return colors.warning;
  }, [bet.status, bet.won]);

  const chipsChangeText = useMemo(() => {
    if (bet.chips_change == null) return null;
    if (bet.chips_change === 0) return '±0';
    return formatBalance(bet.chips_change);
  }, [bet.chips_change]);

  const chipsChangeColor = useMemo(() => {
    if (bet.chips_change == null || bet.chips_change === 0) {
      return 'text-text-muted';
    }
    return bet.chips_change > 0 ? 'text-primary' : 'text-error';
  }, [bet.chips_change]);

  return (
    <View
      className={`mx-4 ${isLast ? 'mb-0' : 'mb-3'} rounded-xl border border-border bg-surface p-4`}
    >
      {/* Header row: status icon + question */}
      <View className="flex-row items-start gap-3">
        <View className="h-10 w-10 items-center justify-center rounded-full bg-surface-light">
          <StatusIcon size={20} color={iconColor} weight="fill" />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-base font-semibold text-white" numberOfLines={2}>
            {bet.question}
          </Text>
          <Text className="mt-1 text-sm text-text-secondary" numberOfLines={1}>
            {bet.room_name}
          </Text>
        </View>
      </View>

      {/* Details row */}
      <View className="mt-3 flex-row items-center justify-between border-t border-border/40 pt-3">
        <View className="flex-row items-center gap-4">
          {/* My pick */}
          <View>
            <Text className="text-xs text-text-muted">Your pick</Text>
            <Text className="mt-0.5 text-sm font-medium text-white">{bet.my_pick}</Text>
          </View>

          {/* Outcome (if settled) */}
          {bet.outcome ? (
            <View>
              <Text className="text-xs text-text-muted">Outcome</Text>
              <Text className="mt-0.5 text-sm font-medium text-white">{bet.outcome}</Text>
            </View>
          ) : null}

          {/* Stake */}
          <View>
            <Text className="text-xs text-text-muted">Stake</Text>
            <Text className="mt-0.5 text-sm font-medium text-white">{bet.stake}</Text>
          </View>
        </View>

        {/* Chip change */}
        {chipsChangeText ? (
          <Text className={`text-lg font-bold ${chipsChangeColor}`}>{chipsChangeText}</Text>
        ) : (
          <View className="rounded-full bg-surface-light px-2.5 py-1">
            <Text className="text-xs font-semibold text-text-muted">
              {bet.status === 'VOID' ? 'VOID' : 'PENDING'}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

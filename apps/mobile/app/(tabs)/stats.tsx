import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { CaretDown, ChartBar, Globe } from 'phosphor-react-native';

import { useTheme } from '@/providers/theme';
import {
  Avatar,
  EmptyState,
  ScreenHeader,
  SectionHeader,
  SkeletonStatsCard,
} from '@/components/ui';
import { RoomSelectionSheet } from '@/components/activity/room-selection-sheet';
import { StatCard } from '@/components/stats/stat-card';
import { MyBetsSection } from '@/components/stats/my-bets-section';
import { useRooms } from '@/hooks/use-rooms';
import {
  useRoomEventStats,
  useRoomPlayerStats,
  useAllRoomsPlayerStats,
  useAllRoomsEventStats,
  type PlayerStat,
  type AggregatePlayerStat,
} from '@/hooks/use-room-stats';
import { balanceColorClass, formatBalance, netBalanceColorClass } from '@/lib/format-balance';

type StatsTab = 'leaderboard' | 'my-bets';

function formatChipCount(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export default function StatsScreen() {
  const { data: rooms, isLoading: roomsLoading } = useRooms('active');
  // Default to null = "All Rooms" aggregate view
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<StatsTab>('leaderboard');

  const selectedRoom = useMemo(
    () => (selectedRoomId ? rooms?.find((r) => r.room.id === selectedRoomId) ?? null : null),
    [rooms, selectedRoomId],
  );

  // Keep "All Rooms" (null) as default. Only reset to null if selected room is gone.
  useEffect(() => {
    if (!rooms || selectedRoomId === null) return;
    const stillPresent = rooms.some((r) => r.room.id === selectedRoomId);
    if (!stillPresent) setSelectedRoomId(null);
  }, [rooms, selectedRoomId]);

  const handleSelectRoom = useCallback((roomId: string | null) => {
    setSelectedRoomId(roomId);
    setPickerOpen(false);
  }, []);

  // Display name for dropdown
  const dropdownLabel = selectedRoomId === null ? 'All Rooms' : (selectedRoom?.room.name ?? 'Select a room');

  if (roomsLoading) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="Stats" />
        <View className="px-5 pt-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonStatsCard key={i} />
          ))}
        </View>
      </View>
    );
  }

  if (!rooms || rooms.length === 0) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="Stats" />
        <EmptyState
          icon={ChartBar}
          title="No active rooms"
          subtitle="Join or create a room to start tracking stats."
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Stats" />

      {/* Room dropdown - above tabs since it applies to both */}
      <View className="px-5 pb-3">
        <RoomDropdown
          roomName={dropdownLabel}
          isAllRooms={selectedRoomId === null}
          onPress={() => setPickerOpen(true)}
        />
      </View>

      {/* Tab switcher */}
      <View className="mx-5 mb-3 flex-row rounded-xl bg-surface p-1">
        <TabButton
          label="Leaderboard"
          isActive={activeTab === 'leaderboard'}
          onPress={() => setActiveTab('leaderboard')}
        />
        <TabButton
          label="My Bets"
          isActive={activeTab === 'my-bets'}
          onPress={() => setActiveTab('my-bets')}
        />
      </View>

      {/* Tab content */}
      {activeTab === 'leaderboard' ? (
        selectedRoomId === null ? (
          <AllRoomsStats />
        ) : (
          <RoomStats roomId={selectedRoomId} />
        )
      ) : (
        <MyBetsSection roomId={selectedRoomId} />
      )}

      <RoomSelectionSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelectRoom={handleSelectRoom}
        showAllRoomsOption
        title="Select room"
        selectedRoomId={selectedRoomId}
      />
    </View>
  );
}

// ============================================================================
// Tab button for the tab switcher
// ============================================================================

function TabButton({
  label,
  isActive,
  onPress,
}: {
  label: string;
  isActive: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      className={`flex-1 items-center rounded-lg py-2.5 ${isActive ? 'bg-primary' : ''}`}
    >
      <Text className={`text-sm font-semibold ${isActive ? 'text-white' : 'text-text-secondary'}`}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ============================================================================
// Room dropdown — tappable bar that opens the RoomSelectionSheet
// ============================================================================

function RoomDropdown({
  roomName,
  isAllRooms,
  onPress,
}: {
  roomName: string;
  isAllRooms?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel="Pick a room"
      className="flex-row items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3"
    >
      <View className="min-w-0 flex-1 flex-row items-center gap-2">
        {isAllRooms && <Globe size={20} color={colors.primary} weight="fill" />}
        <Text className="text-base font-bold text-text-primary" numberOfLines={1}>
          {roomName}
        </Text>
      </View>
      <CaretDown size={20} color={colors.textMuted} weight="bold" />
    </TouchableOpacity>
  );
}

// ============================================================================
// Room stats body — event cards + popular questions + player list
// ============================================================================

function RoomStats({ roomId }: { roomId: string }) {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const { data: event, isLoading: eventLoading } = useRoomEventStats(roomId);
  const { data: players, isLoading: playersLoading } = useRoomPlayerStats(roomId);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['rooms', roomId] });
    setRefreshing(false);
  }, [queryClient, roomId]);

  const loading = eventLoading || playersLoading;

  if (loading && !event) {
    return (
      <View className="px-5 pt-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStatsCard key={i} />
        ))}
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerClassName="pb-12"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      <View className="px-5">
        <SectionHeader>Overview</SectionHeader>
        <View className="flex-row gap-3">
          <StatCard label="Total bets" value={formatChipCount(event?.total_bets ?? 0)} />
          <StatCard
            label="Settled"
            value={formatChipCount(event?.settled_bets ?? 0)}
            tone="primary"
          />
        </View>
        <View className="mt-3 flex-row gap-3">
          <StatCard
            label="Chips wagered"
            value={formatChipCount(event?.total_chips_wagered ?? 0)}
          />
          <StatCard
            label="Donations"
            value={formatChipCount(event?.total_donations ?? 0)}
            tone="warning"
          />
        </View>

        <SectionHeader>Players</SectionHeader>
        {players && players.length > 0 ? (
          <View className="overflow-hidden rounded-2xl border border-border bg-surface">
            {players.map((p, idx) => (
              <PlayerRow key={p.user_id} player={p} isLast={idx === players.length - 1} />
            ))}
          </View>
        ) : (
          <View className="rounded-2xl border border-border bg-surface px-4 py-6">
            <Text className="text-center text-base text-text-secondary">No members yet</Text>
          </View>
        )}

        <SectionHeader>By status</SectionHeader>
        <View className="flex-row gap-3">
          <StatusCard dotClass="bg-primary" label="Open" value={event?.open_bets ?? 0} />
          <StatusCard dotClass="bg-warning" label="Matched" value={event?.matched_bets ?? 0} />
        </View>
        <View className="mt-3 flex-row gap-3">
          <StatusCard dotClass="bg-secondary" label="Settled" value={event?.settled_bets ?? 0} />
          <StatusCard dotClass="bg-text-muted" label="Void" value={event?.voided_bets ?? 0} />
        </View>

        <SectionHeader>Popular questions</SectionHeader>
        {event?.popular_templates && event.popular_templates.length > 0 ? (
          <View className="overflow-hidden rounded-2xl border border-border bg-surface">
            {event.popular_templates.map((t, idx) => (
              <View
                key={`${t.template_slug ?? 'writein'}-${idx}`}
                className={`flex-row items-center justify-between px-4 py-3 ${
                  idx === event.popular_templates.length - 1 ? '' : 'border-b border-border/40'
                }`}
              >
                <Text className="min-w-0 flex-1 text-base text-text-primary" numberOfLines={1}>
                  {t.label}
                </Text>
                <Text className="ml-3 text-sm font-semibold text-text-muted">
                  {t.bet_count} {t.bet_count === 1 ? 'bet' : 'bets'}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <View className="rounded-2xl border border-border bg-surface px-4 py-6">
            <Text className="text-center text-base text-text-secondary">No bets yet</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

// ============================================================================
// All rooms aggregate stats — cross-room leaderboard
// ============================================================================

function AllRoomsStats() {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const { data: event, isLoading: eventLoading } = useAllRoomsEventStats();
  const { data: players, isLoading: playersLoading } = useAllRoomsPlayerStats();

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['all-rooms'] });
    setRefreshing(false);
  }, [queryClient]);

  const loading = eventLoading || playersLoading;

  if (loading && !event) {
    return (
      <View className="px-5 pt-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStatsCard key={i} />
        ))}
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerClassName="pb-12"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      <View className="px-5">
        <SectionHeader>Overview</SectionHeader>
        <View className="flex-row gap-3">
          <StatCard label="Total rooms" value={formatChipCount(event?.total_rooms ?? 0)} />
          <StatCard
            label="Total bets"
            value={formatChipCount(event?.total_bets ?? 0)}
            tone="primary"
          />
        </View>
        <View className="mt-3 flex-row gap-3">
          <StatCard
            label="Chips wagered"
            value={formatChipCount(event?.total_chips_wagered ?? 0)}
          />
          <StatCard
            label="Donations"
            value={formatChipCount(event?.total_donations ?? 0)}
            tone="warning"
          />
        </View>

        <SectionHeader>Global Leaderboard</SectionHeader>
        {players && players.length > 0 ? (
          <View className="overflow-hidden rounded-2xl border border-border bg-surface">
            {players.map((p, idx) => (
              <AggregatePlayerRow key={p.user_id} player={p} rank={idx + 1} isLast={idx === players.length - 1} />
            ))}
          </View>
        ) : (
          <View className="rounded-2xl border border-border bg-surface px-4 py-6">
            <Text className="text-center text-base text-text-secondary">No data yet</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

// ============================================================================
// Aggregate player row for cross-room leaderboard
// ============================================================================

function AggregatePlayerRow({
  player,
  rank,
  isLast,
}: {
  player: AggregatePlayerStat;
  rank: number;
  isLast: boolean;
}) {
  const winRate = useMemo(() => {
    const total = player.total_wins + player.total_losses;
    if (total === 0) return null;
    return Math.round((player.total_wins / total) * 100);
  }, [player.total_wins, player.total_losses]);

  return (
    <View className={`flex-row items-center px-4 py-3 ${isLast ? '' : 'border-b border-border/40'}`}>
      <Text className="w-8 text-base font-bold text-text-muted">{rank}</Text>
      <Avatar uri={player.avatar_url} fallback={player.display_name ?? '?'} size="sm" />
      <View className="ml-3 min-w-0 flex-1">
        <Text className="text-base text-text-primary" numberOfLines={1}>
          {player.display_name ?? 'Unknown'}
        </Text>
        <Text className="mt-0.5 text-xs font-medium text-text-muted">
          {player.total_wins}W · {player.total_losses}L{winRate != null ? ` · ${winRate}%` : ''} · {player.rooms_count} {player.rooms_count === 1 ? 'room' : 'rooms'}
        </Text>
      </View>
      <Text className={`text-base font-bold ${netBalanceColorClass(player.total_net_balance)}`}>
        {formatBalance(player.total_net_balance)}
      </Text>
    </View>
  );
}

function StatusCard({
  dotClass,
  label,
  value,
}: {
  dotClass: string;
  label: string;
  value: number;
}) {
  return (
    <View className="min-w-0 flex-1 rounded-2xl border border-border bg-surface px-4 py-3">
      <View className="flex-row items-center gap-2">
        <View className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
        <Text className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          {label}
        </Text>
      </View>
      <Text className="mt-2 text-2xl font-bold text-text-primary">{value}</Text>
    </View>
  );
}

// ============================================================================
// Player row — tap to expand category breakdown
// ============================================================================

function PlayerRow({ player, isLast }: { player: PlayerStat; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const winRate = useMemo(() => {
    const total = player.wins + player.losses;
    if (total === 0) return null;
    return Math.round((player.wins / total) * 100);
  }, [player.wins, player.losses]);
  const hasBreakdown = player.category_breakdown.length > 0;

  return (
    <View className={isLast ? '' : 'border-b border-border/40'}>
      <TouchableOpacity
        onPress={() => hasBreakdown && setExpanded((v) => !v)}
        activeOpacity={hasBreakdown ? 0.7 : 1}
        disabled={!hasBreakdown}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        className="flex-row items-center px-4 py-3"
      >
        <Avatar uri={player.avatar_url} fallback={player.display_name ?? '?'} size="sm" />
        <View className="ml-3 min-w-0 flex-1">
          <Text className="text-base text-text-primary" numberOfLines={1}>
            {player.display_name ?? 'Unknown'}
          </Text>
          <Text className="mt-0.5 text-xs font-medium text-text-muted">
            {player.wins}W · {player.losses}L{winRate != null ? ` · ${winRate}%` : ''}
          </Text>
        </View>
        <Text className={`text-base font-bold ${balanceColorClass(player.balance)}`}>
          {formatBalance(player.balance)}
        </Text>
      </TouchableOpacity>

      {expanded ? (
        <View className="border-t border-border/40 bg-surface-light px-4 py-3">
          {player.category_breakdown.map((cat) => (
            <View
              key={`${cat.template_slug ?? 'writein'}`}
              className="flex-row items-center justify-between py-1"
            >
              <Text className="min-w-0 flex-1 text-sm text-text-primary" numberOfLines={1}>
                {cat.template_label}
              </Text>
              <Text className="ml-3 text-sm font-semibold text-text-muted">
                {cat.wins}W · {cat.losses}L
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

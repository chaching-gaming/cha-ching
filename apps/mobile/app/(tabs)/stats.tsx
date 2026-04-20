import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { CaretDown } from 'phosphor-react-native';

import { colors } from '@/constants/colors';
import { Avatar } from '@/components/ui/avatar';
import { ScreenHeader } from '@/components/ui/screen-header';
import { RoomSelectionSheet } from '@/components/activity/room-selection-sheet';
import { StatCard } from '@/components/stats/stat-card';
import { useRooms } from '@/hooks/use-rooms';
import { useRoomEventStats, useRoomPlayerStats, type PlayerStat } from '@/hooks/use-room-stats';
import { balanceColorClass, formatBalance } from '@/lib/format-balance';

function formatChipCount(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export default function StatsScreen() {
  const { data: rooms, isLoading: roomsLoading } = useRooms('active');
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const selectedRoom = useMemo(
    () => rooms?.find((r) => r.room.id === selectedRoomId) ?? null,
    [rooms, selectedRoomId],
  );

  // Default-select the first room once rooms land (keeps selection sticky if
  // the user switches away and back while the tab stays mounted). If the
  // currently-selected room is no longer in the list (left / ended), fall back
  // to the first available.
  useEffect(() => {
    if (!rooms) return;
    const stillPresent = selectedRoomId ? rooms.some((r) => r.room.id === selectedRoomId) : false;
    if (!stillPresent) setSelectedRoomId(rooms[0]?.room.id ?? null);
  }, [rooms, selectedRoomId]);

  const handleSelectRoom = useCallback((roomId: string) => {
    setSelectedRoomId(roomId);
    setPickerOpen(false);
  }, []);

  if (roomsLoading) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="Stats" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </View>
    );
  }

  if (!rooms || rooms.length === 0) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="Stats" />
        <View className="flex-1 items-center justify-center px-5">
          <Text className="text-center text-xl font-semibold text-white">No active rooms</Text>
          <Text className="mt-2 max-w-sm text-center text-base leading-6 text-text-secondary">
            Join or create a room to start tracking stats.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Stats" />
      <View className="px-5 pb-3">
        <RoomDropdown
          roomName={selectedRoom?.room.name ?? 'Select a room'}
          onPress={() => setPickerOpen(true)}
        />
      </View>
      {selectedRoomId ? <RoomStats roomId={selectedRoomId} /> : null}

      <RoomSelectionSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelectRoom={handleSelectRoom}
      />
    </View>
  );
}

// ============================================================================
// Room dropdown — tappable bar that opens the RoomSelectionSheet
// ============================================================================

function RoomDropdown({ roomName, onPress }: { roomName: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel="Pick a room"
      className="flex-row items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3"
    >
      <View className="min-w-0 flex-1">
        <Text className="mt-0.5 text-base font-bold text-white" numberOfLines={1}>
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
      <View className="flex-1 items-center justify-center py-12">
        <ActivityIndicator color={colors.primary} />
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
        <SectionLabel>Overview</SectionLabel>
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

        <SectionLabel>By status</SectionLabel>
        <View className="flex-row gap-3">
          <StatusCard dotClass="bg-primary" label="Open" value={event?.open_bets ?? 0} />
          <StatusCard dotClass="bg-warning" label="Matched" value={event?.matched_bets ?? 0} />
        </View>
        <View className="mt-3 flex-row gap-3">
          <StatusCard dotClass="bg-indigo-400" label="Settled" value={event?.settled_bets ?? 0} />
          <StatusCard dotClass="bg-text-muted" label="Void" value={event?.voided_bets ?? 0} />
        </View>

        <SectionLabel>Popular questions</SectionLabel>
        {event?.popular_templates && event.popular_templates.length > 0 ? (
          <View className="overflow-hidden rounded-2xl border border-border bg-surface">
            {event.popular_templates.map((t, idx) => (
              <View
                key={`${t.template_slug ?? 'writein'}-${idx}`}
                className={`flex-row items-center justify-between px-4 py-3 ${
                  idx === event.popular_templates.length - 1 ? '' : 'border-b border-border/40'
                }`}
              >
                <Text className="min-w-0 flex-1 text-base text-white" numberOfLines={1}>
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

        <SectionLabel>Players</SectionLabel>
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
      </View>
    </ScrollView>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="mb-2 mt-5 px-1 text-xs font-semibold uppercase tracking-widest text-text-muted">
      {children}
    </Text>
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
      <Text className="mt-2 text-2xl font-bold text-white">{value}</Text>
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
          <Text className="text-base text-white" numberOfLines={1}>
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
              <Text className="min-w-0 flex-1 text-sm text-white" numberOfLines={1}>
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

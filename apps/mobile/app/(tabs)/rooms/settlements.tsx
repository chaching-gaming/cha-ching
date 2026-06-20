import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, SectionList, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { CaretRight, Handshake, MagnifyingGlass } from 'phosphor-react-native';

import { useTheme } from '@/providers/theme';
import { Avatar, Badge, EmptyState, ScreenHeader, SkeletonListItem } from '@/components/ui';
import { SettlementStatusSheet } from '@/components/activity/settlement-status-sheet';
import { useAuth } from '@/providers/auth';
import { useRoomDetail, useRoomMembersWithHistory } from '@/hooks/use-rooms';
import {
  useRoomMemberBalances,
  type RoomMemberBalance,
  type SettlementStatus,
} from '@/hooks/use-activity-feed';
import { useUpdateSettlementStatus } from '@/hooks/use-settlement-status';
import { formatBalance, netBalanceColorClass } from '@/lib/format-balance';

const SETTLEMENT_BADGE_VARIANTS: Record<SettlementStatus, 'warning' | 'success' | 'error'> = {
  PENDING: 'warning',
  SETTLED: 'success',
  DISPUTED: 'error',
};

const SETTLEMENT_BADGE_LABELS: Record<SettlementStatus, string> = {
  PENDING: 'Pending',
  SETTLED: 'Settled',
  DISPUTED: 'Disputed',
};

function byNetMagnitude(a: RoomMemberBalance, b: RoomMemberBalance) {
  return Math.abs(b.net_balance) - Math.abs(a.net_balance);
}

type Section = { title: string; data: RoomMemberBalance[] };

export default function SettlementsScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session: authSession } = useAuth();
  const queryClient = useQueryClient();

  const { data: room, isLoading: roomLoading } = useRoomDetail(id);
  const { data: memberBalances, isLoading: balancesLoading } = useRoomMemberBalances(id);
  const { data: roomMembers } = useRoomMembersWithHistory(id);
  const updateSettlementStatus = useUpdateSettlementStatus();

  const [editMode, setEditMode] = useState(false);
  const [search, setSearch] = useState('');
  const [sheetVisible, setSheetVisible] = useState(false);
  const [selectedMember, setSelectedMember] = useState<RoomMemberBalance | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const currentMember = roomMembers?.find((m) => m.user_id === authSession?.user.id);
  const isAdmin = currentMember?.role === 'ADMIN' && currentMember?.membershipStatus === 'active';
  const currentUserId = authSession?.user.id ?? null;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['rooms', id] });
    setRefreshing(false);
  }, [id, queryClient]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = memberBalances ?? [];
    if (!q) return all;
    return all.filter((m) => (m.display_name ?? '').toLowerCase().includes(q));
  }, [memberBalances, search]);

  const activeMembers = useMemo(
    () => [...filtered.filter((m) => !m.left_at)].sort(byNetMagnitude),
    [filtered],
  );

  const pastMembers = useMemo(
    () => [...filtered.filter((m) => !!m.left_at)].sort(byNetMagnitude),
    [filtered],
  );

  const sections = useMemo<Section[]>(() => {
    const result: Section[] = [];
    if (activeMembers.length > 0) {
      result.push({ title: `Members (${activeMembers.length})`, data: activeMembers });
    }
    if (pastMembers.length > 0) {
      result.push({ title: `Past Members (${pastMembers.length})`, data: pastMembers });
    }
    return result;
  }, [activeMembers, pastMembers]);

  const handleRowPress = useCallback(
    (member: RoomMemberBalance) => {
      if (!editMode || member.net_balance === 0) return;
      setSelectedMember(member);
      setSheetVisible(true);
    },
    [editMode],
  );

  const handleSelectStatus = useCallback(
    (status: SettlementStatus) => {
      if (!selectedMember) return;
      updateSettlementStatus.mutate({
        roomId: id,
        userId: selectedMember.user_id,
        status,
      });
    },
    [id, selectedMember, updateSettlementStatus],
  );

  const handleSheetClose = useCallback(() => {
    setSheetVisible(false);
    setSelectedMember(null);
  }, []);

  if (roomLoading) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader
          title="Settlements"
          showBack
          titleClassName="text-xl font-bold text-text-primary"
        />
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
        title="Settlements"
        subtitle={room.name}
        showBack
        titleClassName="text-xl font-bold text-text-primary"
        right={
          isAdmin ? (
            <Pressable onPress={() => setEditMode((prev) => !prev)} className="active:opacity-70">
              <Text
                className={`text-base font-semibold ${editMode ? 'text-primary' : 'text-text-secondary'}`}
              >
                {editMode ? 'Done' : 'Edit'}
              </Text>
            </Pressable>
          ) : undefined
        }
      />

      {balancesLoading && !memberBalances ? (
        <View>
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonListItem key={i} />
          ))}
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(m) => m.user_id}
          renderItem={({ item }) => (
            <SettlementRow
              member={item}
              isSelf={!!currentUserId && item.user_id === currentUserId}
              editMode={editMode && isAdmin}
              onPress={() => handleRowPress(item)}
            />
          )}
          renderSectionHeader={({ section }) => (
            <View className="bg-background px-5 py-2">
              <Text className="text-xs font-semibold uppercase tracking-widest text-text-muted">
                {section.title}
              </Text>
            </View>
          )}
          ListHeaderComponent={
            <View className="px-5 pb-2 pt-3">
              <View className="flex-row items-center gap-2 rounded-xl bg-surface px-3 py-2.5">
                <MagnifyingGlass size={18} color={colors.textMuted} weight="bold" />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search members..."
                  placeholderTextColor={colors.textMuted}
                  className="flex-1 text-base text-text-primary"
                  autoCapitalize="none"
                  autoCorrect={false}
                  clearButtonMode="while-editing"
                />
              </View>
            </View>
          }
          ListEmptyComponent={
            search.trim() ? (
              <View className="items-center px-5 py-10">
                <Text className="text-base text-text-secondary">
                  {`No members match "${search}"`}
                </Text>
              </View>
            ) : (
              <EmptyState
                icon={Handshake}
                title="No balances yet"
                subtitle="Settlement statuses appear once chips start moving."
              />
            )
          }
          contentContainerClassName="pb-12"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        />
      )}

      <SettlementStatusSheet
        visible={sheetVisible}
        onClose={handleSheetClose}
        currentStatus={selectedMember?.settlement_status ?? null}
        memberName={selectedMember?.display_name ?? 'Unknown'}
        onSelectStatus={handleSelectStatus}
      />
    </View>
  );
}

// ============================================================================
// Settlement row
// ============================================================================

function SettlementRow({
  member,
  isSelf,
  editMode,
  onPress,
}: {
  member: RoomMemberBalance;
  isSelf: boolean;
  editMode: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const hasNonZeroNet = member.net_balance !== 0;
  const settlementStatus = member.settlement_status ?? (hasNonZeroNet ? ('PENDING' as SettlementStatus) : null);
  const isEditable = editMode && hasNonZeroNet;

  return (
    <Pressable
      onPress={isEditable ? onPress : undefined}
      className={`flex-row items-center border-b border-border/40 px-5 py-4 ${isEditable ? 'active:bg-surface/50' : ''}`}
    >
      <Avatar uri={member.avatar_url} fallback={member.display_name ?? '?'} size="md" />
      <View className="ml-3 min-w-0 flex-1">
        <Text className="text-base text-text-primary" numberOfLines={1}>
          {member.display_name ?? 'Unknown'}
          {isSelf ? <Text className="text-sm text-text-secondary"> (you)</Text> : null}
        </Text>
        <View className="mt-1 self-start">
          {!hasNonZeroNet ? (
            <Badge
              variant="default"
              label="Even"
              className="px-2 py-0.5 opacity-60"
              labelClassName="text-[10px] font-bold tracking-wide"
            />
          ) : settlementStatus ? (
            <Badge
              variant={SETTLEMENT_BADGE_VARIANTS[settlementStatus]}
              label={SETTLEMENT_BADGE_LABELS[settlementStatus]}
              className="px-2 py-0.5"
              labelClassName="text-[10px] font-bold tracking-wide"
            />
          ) : null}
        </View>
      </View>
      <View className="items-end gap-1">
        <Text className={`text-base font-bold ${netBalanceColorClass(member.net_balance)}`}>
          {formatBalance(member.net_balance)}
        </Text>
        {isEditable ? (
          <CaretRight size={16} color={colors.textMuted} weight="bold" />
        ) : null}
      </View>
    </Pressable>
  );
}

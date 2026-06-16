import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { DownloadSimple, Export, FileCsv } from 'phosphor-react-native';

import { useTheme } from '@/providers/theme';
import { ActionSheet, type ActionSheetOption } from '@/components/ui/action-sheet';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useAuth } from '@/providers/auth';
import {
  getRpcErrorMessage,
  useRoomDetail,
  useRoomMembers,
} from '@/hooks/use-rooms';
import {
  roomLedgerKey,
  useRoomLedger,
  type LedgerEntryRow,
  type LedgerType,
} from '@/hooks/use-room-ledger';
import { useExportRoomBets, useExportRoomLedger } from '@/hooks/use-admin-exports';
import { balanceColorClass, formatBalance } from '@/lib/format-balance';
import { formatRelativeActivityTime } from '@/lib/date-format';

type BadgeVariant = Parameters<typeof Badge>[0]['variant'];

const TYPE_LABELS: Record<LedgerType, string> = {
  BET_WIN: 'Bet win',
  BET_LOSS: 'Bet loss',
  STAKE_LOCK: 'Stake locked',
  VOID_REFUND: 'Refund',
  DONATION_IN: 'Donation in',
  DONATION_OUT: 'Donation out',
  GRANT: 'Grant',
};

const TYPE_VARIANTS: Record<LedgerType, BadgeVariant> = {
  BET_WIN: 'success',
  BET_LOSS: 'default',
  STAKE_LOCK: 'warning',
  VOID_REFUND: 'attestor',
  DONATION_IN: 'admin',
  DONATION_OUT: 'default',
  GRANT: 'matched',
};

export default function LedgerScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session: authSession } = useAuth();
  const queryClient = useQueryClient();

  const { data: room, isLoading: roomLoading } = useRoomDetail(id);
  const { data: members } = useRoomMembers(id);
  const currentMember = members?.find((m) => m.user_id === authSession?.user.id);
  const isAdmin = currentMember?.role === 'ADMIN';

  // Query only enables for admins — non-admins never hit the RPC. The RPC's
  // `is_room_admin` gate is the real enforcement; this is UX polish.
  const ledgerQuery = useRoomLedger(isAdmin ? id : null);
  const exportLedger = useExportRoomLedger(id, room?.name);
  const exportBets = useExportRoomBets(id, room?.name);

  const entries = useMemo(
    () => ledgerQuery.data?.pages.flat() ?? [],
    [ledgerQuery.data],
  );

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: roomLedgerKey(id) });
    setRefreshing(false);
  }, [id, queryClient]);

  const isExporting = exportLedger.isPending || exportBets.isPending;
  const [exportSheetOpen, setExportSheetOpen] = useState(false);

  const handleExport = useCallback(
    (which: 'ledger' | 'bets') => {
      const mutation = which === 'ledger' ? exportLedger : exportBets;
      mutation.mutate(undefined, {
        onError: (err) => {
          Alert.alert('Export failed', getRpcErrorMessage(err));
        },
      });
    },
    [exportLedger, exportBets],
  );

  const handleOpenExport = useCallback(() => {
    if (isExporting) return;
    setExportSheetOpen(true);
  }, [isExporting]);

  const exportOptions = useMemo<ActionSheetOption[]>(
    () => [
      {
        key: 'ledger',
        label: 'Export Ledger',
        subtitle: 'Every chip movement in this room',
        icon: <FileCsv size={22} color={colors.primary} weight="bold" />,
        onPress: () => handleExport('ledger'),
      },
      {
        key: 'bets',
        label: 'Export Bets',
        subtitle: 'All bets with settlement details',
        icon: <DownloadSimple size={22} color={colors.warning} weight="bold" />,
        onPress: () => handleExport('bets'),
      },
    ],
    [handleExport],
  );

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

  if (!isAdmin) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader
          title="Wager Ledger"
          subtitle={room.name}
          showBack
          showHome
          backIconSize={28}
        />
        <View className="flex-1 items-center justify-center px-5">
          <Text className="text-center text-xl font-semibold text-text-secondary">
            Admins only
          </Text>
          <Text className="mt-2 max-w-sm text-center text-base leading-6 text-text-secondary">
            Only room admins can view the full ledger.
          </Text>
        </View>
      </View>
    );
  }

  const isInitialLoading = ledgerQuery.isLoading && entries.length === 0;

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title="Wager Ledger"
        subtitle={room.name}
        showBack
        backIconSize={28}
        right={
          isExporting ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <TouchableOpacity
              onPress={handleOpenExport}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Export as CSV"
            >
              <Export size={24} color={colors.textSecondary} weight="bold" />
            </TouchableOpacity>
          )
        }
      />

      {isInitialLoading ? (
        <View className="flex-1 items-center justify-center py-12">
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : entries.length === 0 ? (
        <View className="flex-1 items-center justify-center px-5 py-12">
          <Text className="text-center text-xl font-semibold text-text-secondary">
            No ledger activity yet
          </Text>
          <Text className="mt-2 max-w-sm text-center text-base leading-6 text-text-secondary">
            Entries appear as bets settle, void, or chips move between players.
          </Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(e) => e.id}
          renderItem={({ item }) => <LedgerRow entry={item} />}
          contentContainerClassName="pb-12"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          onEndReached={() => {
            if (ledgerQuery.hasNextPage && !ledgerQuery.isFetchingNextPage) {
              ledgerQuery.fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            ledgerQuery.isFetchingNextPage ? (
              <View className="py-6">
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : null
          }
        />
      )}

      <ActionSheet
        visible={exportSheetOpen}
        onClose={() => setExportSheetOpen(false)}
        title="Export CSV"
        options={exportOptions}
      />
    </View>
  );
}

function LedgerRow({ entry }: { entry: LedgerEntryRow }) {
  const amount = Number(entry.amount);
  return (
    <View className="flex-row items-center gap-3 border-b border-border/40 px-5 py-3.5">
      <Avatar uri={entry.avatar_url} fallback={entry.display_name ?? '?'} size="md" />

      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-2">
          <Text className="min-w-0 shrink text-base font-semibold text-text-primary" numberOfLines={1}>
            {entry.display_name ?? 'Unknown'}
          </Text>
          <Badge
            variant={TYPE_VARIANTS[entry.type] ?? 'default'}
            label={TYPE_LABELS[entry.type] ?? entry.type}
            className="px-2 py-0.5"
            labelClassName="text-[10px] font-bold tracking-wide"
          />
        </View>
        {entry.bet_question ? (
          <Text className="mt-0.5 text-sm text-text-secondary" numberOfLines={1}>
            {entry.bet_question}
          </Text>
        ) : null}
        <Text className="mt-0.5 text-xs text-text-muted">
          {formatRelativeActivityTime(entry.created_at)}
        </Text>
      </View>

      <Text className={`text-base font-bold ${balanceColorClass(amount)}`}>
        {formatBalance(amount)}
      </Text>
    </View>
  );
}

import { useCallback } from 'react';
import { FlatList, Modal, Pressable, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Coins, X } from 'phosphor-react-native';

import { colors } from '@/constants/colors';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import type { RoomMemberBalance } from '@/hooks/use-activity-feed';
import { balanceColorClass, formatBalance } from '@/lib/format-balance';

type Props = {
  visible: boolean;
  onClose: () => void;
  members: RoomMemberBalance[];
  currentUserId?: string | null;
  chipLimit?: number | null;
};

export function ChipStandingsSheet({ visible, onClose, members, currentUserId, chipLimit }: Props) {
  const safeInsets = useSafeAreaInsets();

  const renderRow = useCallback(
    ({ item, index }: { item: RoomMemberBalance; index: number }) => {
      const isSelf = !!currentUserId && item.user_id === currentUserId;
      const belowLimit = chipLimit != null && item.balance <= chipLimit;
      return (
        <View className="flex-row items-center border-b border-border/40 py-3">
          <Text className="w-6 text-sm font-bold text-text-muted">{index + 1}</Text>
          <Avatar uri={item.avatar_url} fallback={item.display_name ?? '?'} size="sm" />
          <View className="ml-3 min-w-0 flex-1 flex-row items-center gap-2">
            <Text className="min-w-0 shrink text-base text-white" numberOfLines={1}>
              {item.display_name ?? 'Unknown'}
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
          <Text className={`text-base font-bold ${balanceColorClass(item.balance)}`}>
            {formatBalance(item.balance)}
          </Text>
        </View>
      );
    },
    [chipLimit, currentUserId],
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/65" onPress={onClose}>
        <Pressable
          className="rounded-t-3xl border-t border-border bg-background px-5 pt-4"
          style={{
            paddingBottom: Math.max(safeInsets.bottom, 20),
            maxHeight: '80%',
          }}
          onPress={(e) => e.stopPropagation()}
        >
          <View className="mb-4 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Coins size={22} color={colors.chipsIcon} weight="fill" />
              <Text className="text-xl font-bold text-white">Chip standings</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel="Close chip standings"
            >
              <X size={26} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {members.length === 0 ? (
            <View className="items-center py-10">
              <Text className="text-base text-text-secondary">No members yet.</Text>
            </View>
          ) : (
            <FlatList
              data={members}
              keyExtractor={(m) => m.user_id}
              renderItem={renderRow}
              showsVerticalScrollIndicator={false}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

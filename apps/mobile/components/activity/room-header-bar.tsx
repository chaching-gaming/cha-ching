import { Text, TouchableOpacity, View } from 'react-native';
import { Coins } from 'phosphor-react-native';

import { colors } from '@/constants/colors';
import { Avatar } from '@/components/ui/avatar';
import type { RoomMemberWithProfile } from '@/hooks/use-rooms';
import { balanceColorClass, formatBalance } from '@/lib/format-balance';

interface RoomHeaderBarProps {
  members: RoomMemberWithProfile[];
  balance: number;
  onOpenStandings: () => void;
}

const MAX_AVATARS = 5;

export function RoomHeaderBar({ members, balance, onOpenStandings }: RoomHeaderBarProps) {
  const visible = members.slice(0, MAX_AVATARS);
  const overflow = members.length - MAX_AVATARS;

  return (
    <View className="flex-row items-center justify-between py-4">
      {/* Member avatars — tap to open chip standings */}
      <TouchableOpacity
        onPress={onOpenStandings}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Open chip standings"
        className="items-start"
      >
        <View className="flex-row items-center">
          {visible.map((member, index) => (
            <View
              key={member.id}
              className={`rounded-full border-2 border-background ${index > 0 ? '-ml-2.5' : ''}`}
              style={{ zIndex: MAX_AVATARS - index }}
            >
              <Avatar
                uri={member.profiles?.avatar_url}
                fallback={member.profiles?.display_name ?? '?'}
                size="md"
              />
            </View>
          ))}
          {overflow > 0 && (
            <View className="-ml-2.5 h-12 w-12 items-center justify-center rounded-full border-2 border-background bg-surface-light">
              <Text className="text-sm font-semibold text-text-secondary">+{overflow}</Text>
            </View>
          )}
        </View>
        <Text className="mt-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
          Standings
        </Text>
      </TouchableOpacity>

      {/* Balance */}
      <View className="items-end">
        <Text className="text-base text-text-muted">Your Balance</Text>
        <View className="flex-row items-center gap-1.5">
          <Coins size={22} color={colors.chipsIcon} weight="fill" />
          <Text className={`text-2xl font-bold ${balanceColorClass(balance)}`}>
            {formatBalance(balance)}
          </Text>
        </View>
      </View>
    </View>
  );
}

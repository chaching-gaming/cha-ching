import { Text, TouchableOpacity, View } from 'react-native';
import { Coins } from 'phosphor-react-native';

import { colors } from '@/constants/colors';
import { Avatar } from '@/components/ui/avatar';
import type { RoomMemberWithProfile } from '@/hooks/use-rooms';

interface RoomHeaderBarProps {
  members: RoomMemberWithProfile[];
  balance: number;
  onViewMembers: () => void;
}

const MAX_AVATARS = 5;

export function RoomHeaderBar({ members, balance, onViewMembers }: RoomHeaderBarProps) {
  const visible = members.slice(0, MAX_AVATARS);
  const overflow = members.length - MAX_AVATARS;

  return (
    <View className="flex-row items-center justify-between py-3">
      {/* Member avatars */}
      <TouchableOpacity
        onPress={onViewMembers}
        activeOpacity={0.7}
        className="flex-row items-center"
      >
        {visible.map((member, index) => (
          <View
            key={member.id}
            className={`rounded-full border-2 border-background ${index > 0 ? '-ml-2' : ''}`}
            style={{ zIndex: MAX_AVATARS - index }}
          >
            <Avatar
              uri={member.profiles?.avatar_url}
              fallback={member.profiles?.display_name ?? '?'}
              size="sm"
            />
          </View>
        ))}
        {overflow > 0 && (
          <View className="-ml-2 h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-surface-light">
            <Text className="text-xs font-medium text-text-secondary">+{overflow}</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Balance */}
      <View className="items-end">
        <Text className="text-xs text-text-muted">Your Balance</Text>
        <View className="flex-row items-center gap-1">
          <Coins size={16} color={colors.primary} weight="fill" />
          <Text className="text-base font-bold text-primary">{balance}</Text>
        </View>
      </View>
    </View>
  );
}

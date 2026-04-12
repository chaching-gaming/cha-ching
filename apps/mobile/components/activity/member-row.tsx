import { Text, TouchableOpacity, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import type { RoomMemberWithProfile } from '@/hooks/use-rooms';

const ROLE_LABELS: Record<string, string> = {
  PLAYER: 'Player',
  ATTESTOR: 'Attestor',
  ADMIN: 'Admin',
};

interface MemberRowProps {
  member: RoomMemberWithProfile;
  isAdmin?: boolean;
  isActive?: boolean;
  currentUserId?: string | null;
  onChangeRole?: (userId: string) => void;
  onRemoveMember?: (userId: string) => void;
}

export function MemberRow({
  member,
  isAdmin,
  isActive,
  currentUserId,
  onChangeRole,
  onRemoveMember,
}: MemberRowProps) {
  const role = member.role ?? 'PLAYER';
  const roleVariant = role.toLowerCase() as 'admin' | 'player' | 'attestor';
  const isSelf = member.user_id === currentUserId;
  const canChangeRole = Boolean(isAdmin && isActive && onChangeRole);
  const canSwipeRemove = Boolean(isAdmin && isActive && onRemoveMember && !isSelf);

  const badge = (
    <Badge
      variant={roleVariant}
      label={ROLE_LABELS[role] ?? role}
      className="px-4 py-2"
      labelClassName="text-sm font-semibold"
    />
  );

  const row = (
    <View className="min-h-[56px] flex-row items-center border-b border-border bg-background px-5 py-4">
      <Avatar
        uri={member.profiles?.avatar_url}
        fallback={member.profiles?.display_name ?? '?'}
        size="md"
      />
      <Text className="ml-3 flex-1 text-lg text-white">
        {member.profiles?.display_name ?? 'Unknown'}
        {isSelf ? (
          <Text className="text-sm text-text-secondary"> (you)</Text>
        ) : null}
      </Text>
      {canChangeRole ? (
        <TouchableOpacity
          onPress={() => {
            onChangeRole?.(member.user_id!);
          }}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          {badge}
        </TouchableOpacity>
      ) : (
        badge
      )}
    </View>
  );

  if (!canSwipeRemove) {
    return row;
  }

  return (
    <Swipeable
      friction={2}
      overshootRight={false}
      containerStyle={{ overflow: 'visible' }}
      renderRightActions={() => (
        <View className="min-h-[56px] flex-row items-stretch border-b border-border bg-background pl-2">
          <TouchableOpacity
            onPress={() => {
              onRemoveMember?.(member.user_id!);
            }}
            className="min-w-[84px] justify-center rounded-lg bg-error px-4"
            activeOpacity={0.85}
            style={{ alignSelf: 'stretch' }}
          >
            <Text className="text-center text-base font-semibold leading-6 text-white">Remove</Text>
          </TouchableOpacity>
        </View>
      )}
    >
      {row}
    </Swipeable>
  );
}

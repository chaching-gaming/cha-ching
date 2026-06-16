import { Pressable, Text, TouchableOpacity, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import type { RoomMemberWithProfile, RoomMemberStatus } from '@/hooks/use-rooms';

const ROLE_LABELS: Record<string, string> = {
  PLAYER: 'Player',
  ATTESTOR: 'Attestor',
  ADMIN: 'Admin',
};

const STATUS_LABELS: Record<RoomMemberStatus, string> = {
  active: '',
  left: 'Left',
  removed: 'Removed',
};

interface MemberRowProps {
  member: RoomMemberWithProfile;
  isAdmin?: boolean;
  isActive?: boolean;
  currentUserId?: string | null;
  membershipStatus?: RoomMemberStatus;
  onChangeRole?: (userId: string) => void;
  onRemoveMember?: (userId: string) => void;
  onMemberPress?: (userId: string) => void;
}

export function MemberRow({
  member,
  isAdmin,
  isActive,
  currentUserId,
  membershipStatus = 'active',
  onChangeRole,
  onRemoveMember,
  onMemberPress,
}: MemberRowProps) {
  const role = member.role ?? 'PLAYER';
  const roleVariant = role.toLowerCase() as 'admin' | 'player' | 'attestor';
  const isSelf = member.user_id === currentUserId;
  const isPastMember = membershipStatus !== 'active';

  // Disable interactions for past members
  const canChangeRole = Boolean(isAdmin && isActive && onChangeRole && !isPastMember);
  const canSwipeRemove = Boolean(isAdmin && isActive && onRemoveMember && !isSelf && !isPastMember);
  const canPressMember = Boolean(onMemberPress && member.user_id);

  // Show status badge for past members, role badge for active members
  const badge = isPastMember ? (
    <Badge
      variant="default"
      label={STATUS_LABELS[membershipStatus]}
      className="bg-surface-alt px-4 py-2"
      labelClassName="text-sm font-semibold text-text-muted"
    />
  ) : (
    <Badge
      variant={roleVariant}
      label={ROLE_LABELS[role] ?? role}
      className="px-4 py-2"
      labelClassName="text-sm font-semibold"
    />
  );

  const rowContent = (
    <>
      <Avatar
        uri={member.profiles?.avatar_url}
        fallback={member.profiles?.display_name ?? '?'}
        size="md"
      />
      <Text className="ml-3 flex-1 text-lg text-text-primary">
        {member.profiles?.display_name ?? 'Unknown'}
        {isSelf ? <Text className="text-sm text-text-secondary"> (you)</Text> : null}
      </Text>
      {canChangeRole ? (
        <TouchableOpacity
          onPress={(e) => {
            // Prevent propagation to parent Pressable
            e.stopPropagation();
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
    </>
  );

  const row = canPressMember ? (
    <Pressable
      onPress={() => onMemberPress?.(member.user_id!)}
      className={`min-h-[56px] flex-row items-center border-b border-border bg-background px-5 py-4 active:bg-surface/50 ${isPastMember ? 'opacity-60' : ''}`}
    >
      {rowContent}
    </Pressable>
  ) : (
    <View
      className={`min-h-[56px] flex-row items-center border-b border-border bg-background px-5 py-4 ${isPastMember ? 'opacity-60' : ''}`}
    >
      {rowContent}
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
            <Text className="text-center text-base font-semibold leading-6 text-background">Remove</Text>
          </TouchableOpacity>
        </View>
      )}
    >
      {row}
    </Swipeable>
  );
}

import { Text, TouchableOpacity, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import type { RoomMemberWithProfile } from '@/hooks/use-rooms';

interface MemberRowProps {
  member: RoomMemberWithProfile;
  isAdmin?: boolean;
  isActive?: boolean;
  onReassign?: (userId: string) => void;
}

export function MemberRow({ member, isAdmin, isActive, onReassign }: MemberRowProps) {
  const roleVariant = member.role?.toLowerCase() as 'admin' | 'player' | 'attestor';

  return (
    <View className="flex-row items-center border-b border-border px-4 py-3">
      <Avatar
        uri={member.profiles?.avatar_url}
        fallback={member.profiles?.display_name ?? '?'}
        size="sm"
      />
      <Text className="ml-3 flex-1 text-base text-white">
        {member.profiles?.display_name ?? 'Unknown'}
      </Text>
      {isAdmin && isActive && member.role !== 'ADMIN' && onReassign && (
        <TouchableOpacity
          onPress={() => onReassign(member.user_id!)}
          className="mr-2 rounded-lg bg-surface px-2 py-1"
          activeOpacity={0.7}
        >
          <Text className="text-xs text-primary">Make Admin</Text>
        </TouchableOpacity>
      )}
      {member.role ? <Badge variant={roleVariant} label={member.role} /> : null}
    </View>
  );
}

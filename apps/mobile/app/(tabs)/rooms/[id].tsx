import { ActivityIndicator, FlatList, Share, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Copy, ShareNetwork } from 'phosphor-react-native';

import { colors } from '@/constants/colors';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useRoomDetail, useRoomMembers, type RoomMemberWithProfile } from '@/hooks/use-rooms';

function MemberRow({ member }: { member: RoomMemberWithProfile }) {
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
      {member.role ? <Badge variant={roleVariant} label={member.role} /> : null}
    </View>
  );
}

export default function RoomDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: room, isLoading: roomLoading } = useRoomDetail(id);
  const { data: members, isLoading: membersLoading } = useRoomMembers(id);
  console.log({ id, room, members, roomLoading });

  async function handleCopyCode() {
    if (!room?.invite_code) return;
    await Clipboard.setStringAsync(room.invite_code);
  }

  async function handleShareCode() {
    if (!room) return;
    await Share.share({
      message: `Join my room "${room.name}" on Cha-Ching! Use invite code: ${room.invite_code}`,
    });
  }

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
        <Text className="text-base text-text-secondary">Room not found</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title={room.name} showBack />

      <FlatList
        data={members ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <MemberRow member={item} />}
        contentContainerClassName="pb-8"
        ListHeaderComponent={
          <View className="px-4 pt-4">
            {room.description ? (
              <Text className="mb-4 text-base text-text-secondary">{room.description}</Text>
            ) : null}

            <Card className="mb-4">
              <Text className="mb-2 text-sm text-text-secondary">Invite Code</Text>
              <View className="flex-row items-center justify-between">
                <Text className="text-2xl font-bold tracking-widest text-primary">
                  {room.invite_code}
                </Text>
                <View className="flex-row gap-3">
                  <TouchableOpacity
                    onPress={handleCopyCode}
                    className="h-10 w-10 items-center justify-center rounded-lg bg-surface-light"
                    activeOpacity={0.7}
                  >
                    <Copy size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleShareCode}
                    className="h-10 w-10 items-center justify-center rounded-lg bg-surface-light"
                    activeOpacity={0.7}
                  >
                    <ShareNetwork size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
            </Card>

            <Text className="mb-2 text-sm font-medium text-text-muted">
              Members ({members?.length ?? 0})
            </Text>
          </View>
        }
        ListEmptyComponent={
          membersLoading ? (
            <View className="py-8 items-center">
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null
        }
      />
    </View>
  );
}

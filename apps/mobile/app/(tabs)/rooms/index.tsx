import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Plus, QrCode, Users } from 'phosphor-react-native';

import { colors } from '@/constants/colors';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useRooms, type RoomWithMembership } from '@/hooks/use-rooms';

function RoomCard({ item, onPress }: { item: RoomWithMembership; onPress: () => void }) {
  const roleVariant = item.role?.toLowerCase() as 'admin' | 'player' | 'attestor';

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <Card className="mb-3">
        <View className="flex-row items-center justify-between">
          <View className="flex-1 mr-3">
            <Text className="text-lg font-semibold text-white">{item.room.name}</Text>
            {item.room.description ? (
              <Text className="mt-1 text-sm text-text-secondary" numberOfLines={1}>
                {item.room.description}
              </Text>
            ) : null}
            <View className="mt-2 flex-row items-center gap-1">
              <Users size={14} color={colors.textMuted} />
              <Text className="text-xs text-text-muted">
                {item.room.member_count} {item.room.member_count === 1 ? 'member' : 'members'}
              </Text>
            </View>
          </View>
          {item.role ? <Badge variant={roleVariant} label={item.role} /> : null}
        </View>
      </Card>
    </TouchableOpacity>
  );
}

function EmptyState() {
  const router = useRouter();

  return (
    <View className="flex-1 items-center justify-center px-6">
      <Text className="text-2xl font-bold text-white">No rooms yet</Text>
      <Text className="mt-2 mb-6 text-center text-base text-text-secondary">
        Create a room to start betting with friends, or join one with an invite code.
      </Text>
      <View className="w-full gap-3">
        <Button onPress={() => router.push('/(tabs)/rooms/create')}>Create a Room</Button>
        <Button variant="outline" onPress={() => router.push('/(tabs)/rooms/join')}>
          Join with Code
        </Button>
      </View>
    </View>
  );
}

export default function RoomsListScreen() {
  const router = useRouter();
  const { data: rooms, isLoading } = useRooms();

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title="Rooms"
        right={
          <View className="flex-row items-center gap-4">
            <TouchableOpacity onPress={() => router.push('/(tabs)/rooms/join')}>
              <QrCode size={24} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/(tabs)/rooms/create')}>
              <Plus size={24} color={colors.primary} weight="bold" />
            </TouchableOpacity>
          </View>
        }
      />

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : !rooms?.length ? (
        <EmptyState />
      ) : (
        <FlatList
          data={rooms}
          keyExtractor={(item) => item.room.id}
          renderItem={({ item }) => (
            <RoomCard item={item} onPress={() => router.push(`/(tabs)/rooms/${item.room.id}`)} />
          )}
          contentContainerClassName="px-4 pt-4 pb-8"
        />
      )}
    </View>
  );
}

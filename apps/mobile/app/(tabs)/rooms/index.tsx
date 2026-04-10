import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Plus, QrCode } from 'phosphor-react-native';

import { colors } from '@/constants/colors';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useRooms, type RoomWithMembership } from '@/hooks/use-rooms';

function formatBalance(balance: number): string {
  const abs = Math.abs(balance);
  const formatted = abs >= 1000 ? abs.toLocaleString() : String(abs);
  return balance >= 0 ? `+${formatted}` : `-${formatted}`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function RoomCard({ item, onPress }: { item: RoomWithMembership; onPress: () => void }) {
  const isActive = item.room.is_active;
  const balance = item.balance;
  const balanceColor = balance >= 0 ? 'text-primary' : 'text-error';
  const overflow = item.room.member_count - item.memberPreviews.length;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className="border-b border-border px-5 py-4"
    >
      {/* Row 1: status dot + name + balance */}
      <View className="flex-row items-center justify-between">
        <View className="flex-1 flex-row items-center gap-2 mr-3">
          <View className={`h-2 w-2 rounded-full ${isActive ? 'bg-primary' : 'bg-text-muted'}`} />
          <Text className="text-base font-semibold text-white" numberOfLines={1}>
            {item.room.name}
          </Text>
        </View>
        <Text className={`text-base font-bold ${balanceColor}`}>{formatBalance(balance)}</Text>
      </View>

      {/* Row 2: avatar stack + date */}
      <View className="mt-2.5 flex-row items-center justify-between">
        <View className="flex-row items-center">
          {item.memberPreviews.map((member, index) => (
            <View
              key={index}
              className={`rounded-full border-2 border-background ${index > 0 ? '-ml-2' : ''}`}
              style={{ zIndex: 10 - index }}
            >
              <Avatar uri={member.avatar_url} fallback={member.display_name ?? '?'} size="sm" />
            </View>
          ))}
          {overflow > 0 && (
            <View className="-ml-2 h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-surface-light">
              <Text className="text-[10px] font-medium text-text-secondary">+{overflow}</Text>
            </View>
          )}
        </View>
        <Text className="text-sm text-text-muted">{formatDate(item.room.session_date)}</Text>
      </View>
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
  const { data: rooms, isLoading } = useRooms('active');

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title="Your Rooms"
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
          contentContainerClassName="pb-8"
        />
      )}
    </View>
  );
}

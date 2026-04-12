import { useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Share,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Swipeable } from 'react-native-gesture-handler';
import { Plus, QrCode } from 'phosphor-react-native';

import { colors } from '@/constants/colors';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useRooms, useEndSession, getRpcErrorMessage, type RoomWithMembership } from '@/hooks/use-rooms';

function formatBalance(balance: number): string {
  const abs = Math.abs(balance);
  const formatted = abs >= 1000 ? abs.toLocaleString() : String(abs);
  return balance >= 0 ? `+${formatted}` : `-${formatted}`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function RoomCardContent({ item }: { item: RoomWithMembership }) {
  const isActive = item.room.is_active;
  const balance = item.balance;
  const balanceColor = balance >= 0 ? 'text-primary' : 'text-error';
  const overflow = item.room.member_count - item.memberPreviews.length;

  return (
    <View className="border-b border-border bg-background px-5 py-4">
      {/* Row 1: status dot + name + balance */}
      <View className="flex-row items-center justify-between">
        <View className="mr-3 flex-1 flex-row items-center gap-2">
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
    </View>
  );
}

function RoomSwipeRow({ item }: { item: RoomWithMembership }) {
  const router = useRouter();
  const swipeRef = useRef<Swipeable>(null);
  const endSession = useEndSession();

  const isAdmin = item.role === 'ADMIN';
  const canEndSession = isAdmin && item.room.is_active;
  const inviteCode = item.room.invite_code ?? '';

  const handleShare = useCallback(async () => {
    swipeRef.current?.close();
    const message = `Join "${item.room.name}" on Cha-Ching! Use invite code: ${inviteCode}`;
    try {
      await Share.share({ message });
    } catch {
      /* user dismissed share sheet */
    }
  }, [inviteCode, item.room.name]);

  const handleEndSession = useCallback(() => {
    swipeRef.current?.close();
    Alert.alert('End Session', 'Are you sure? This will prevent new joins and bets.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Session',
        style: 'destructive',
        onPress: async () => {
          try {
            await endSession.mutateAsync({ p_room_id: item.room.id });
          } catch (err) {
            Alert.alert('Error', getRpcErrorMessage(err));
          }
        },
      },
    ]);
  }, [endSession, item.room.id]);

  return (
    <Swipeable
      ref={swipeRef}
      friction={2}
      overshootRight={false}
      containerStyle={{ overflow: 'visible' }}
      renderRightActions={() => (
        <View className="flex-row items-stretch border-b border-border bg-background pl-2">
          <TouchableOpacity
            onPress={handleShare}
            className="min-w-[80px] justify-center self-stretch bg-surface-light px-4"
            activeOpacity={0.85}
          >
            <Text className="text-center text-sm font-semibold text-primary">Share</Text>
          </TouchableOpacity>
          {canEndSession ? (
            <TouchableOpacity
              onPress={handleEndSession}
              className="min-w-[92px] justify-center self-stretch bg-error px-3"
              activeOpacity={0.85}
            >
              <Text className="text-center text-xs font-semibold leading-4 text-white" numberOfLines={2}>
                End
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}
    >
      <Pressable
        onPress={() => router.push(`/(tabs)/rooms/${item.room.id}`)}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      >
        <RoomCardContent item={item} />
      </Pressable>
    </Swipeable>
  );
}

function EmptyState() {
  const router = useRouter();

  return (
    <View className="flex-1 items-center justify-center px-6">
      <Text className="text-2xl font-bold text-white">No rooms yet</Text>
      <Text className="mb-6 mt-2 text-center text-base text-text-secondary">
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
  const { data: rooms, isLoading, refetch, isRefetching } = useRooms('active');

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

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
          removeClippedSubviews={false}
          renderItem={({ item }) => <RoomSwipeRow item={item} />}
          contentContainerClassName="pb-8"
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        />
      )}
    </View>
  );
}

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
import {
  useRooms,
  useEndSession,
  getRpcErrorMessage,
  type RoomWithMembership,
} from '@/hooks/use-rooms';
import { formatSessionDateShort } from '@/lib/date-format';
import { balanceColorClass, formatBalance } from '@/lib/format-balance';

function RoomCardContent({ item }: { item: RoomWithMembership }) {
  const isActive = item.room.is_active;
  const balance = item.balance;
  const balanceColor = balanceColorClass(balance);
  const overflow = item.room.member_count - item.memberPreviews.length;

  return (
    <View className="min-h-[56px] border-b border-border bg-background px-5 py-4">
      {/* Row 1: status dot + name + balance */}
      <View className="flex-row items-center justify-between">
        <View className="mr-3 flex-1 flex-row items-center gap-2">
          <View
            className={`h-2.5 w-2.5 rounded-full ${isActive ? 'bg-primary' : 'bg-text-muted'}`}
          />
          <Text className="text-lg font-semibold text-white" numberOfLines={1}>
            {item.room.name}
          </Text>
        </View>
        <Text className={`text-lg font-bold ${balanceColor}`}>{formatBalance(balance)}</Text>
      </View>

      {/* Row 2: avatar stack + date */}
      <View className="mt-2.5 flex-row items-center justify-between">
        <View className="flex-row items-center">
          {item.memberPreviews.map((member, index) => (
            <View
              key={index}
              className={`rounded-full border-2 border-background ${index > 0 ? '-ml-2.5' : ''}`}
              style={{ zIndex: 10 - index }}
            >
              <Avatar uri={member.avatar_url} fallback={member.display_name ?? '?'} size="md" />
            </View>
          ))}
          {overflow > 0 && (
            <View className="-ml-2.5 h-12 w-12 items-center justify-center rounded-full border-2 border-background bg-surface-light">
              <Text className="text-sm font-semibold text-text-secondary">+{overflow}</Text>
            </View>
          )}
        </View>
        <Text className="text-sm text-text-secondary">
          {formatSessionDateShort(item.room.session_date)}
        </Text>
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
        <View className="min-h-[56px] flex-row items-stretch border-b border-border bg-background pl-2">
          <TouchableOpacity
            onPress={handleShare}
            className="min-w-[88px] justify-center self-stretch bg-surface-light px-4"
            activeOpacity={0.85}
          >
            <Text className="text-center text-base font-semibold text-primary">Share</Text>
          </TouchableOpacity>
          {canEndSession ? (
            <TouchableOpacity
              onPress={handleEndSession}
              className="min-w-[100px] justify-center self-stretch bg-error px-3"
              activeOpacity={0.85}
            >
              <Text
                className="text-center text-sm font-semibold leading-5 text-white"
                numberOfLines={2}
              >
                End session
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
    <View className="flex-1 items-center justify-center px-5">
      <Text className="text-xl font-semibold text-white">No rooms yet</Text>
      <Text className="mb-6 mt-2 text-center text-base leading-6 text-text-secondary">
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
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/rooms/join')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <QrCode size={28} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/rooms/create')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Plus size={28} color={colors.primary} weight="bold" />
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

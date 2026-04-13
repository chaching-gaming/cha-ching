import { useCallback, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  SafeAreaView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarBlank, UserPlus, X } from 'phosphor-react-native';

import { colors } from '@/constants/colors';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ActivityFeedItem } from '@/components/activity/activity-feed-item';
import { MemberRow } from '@/components/activity/member-row';
import { RoomHeaderBar } from '@/components/activity/room-header-bar';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/providers/auth';
import {
  useRoomDetail,
  useRoomMembers,
  useEndSession,
  useUpdateMemberRole,
  useRemoveMember,
  getRpcErrorMessage,
} from '@/hooks/use-rooms';
import {
  useRoomActivityFeed,
  useMyRoomBalance,
  useRealtimeActivityFeed,
} from '@/hooks/use-activity-feed';

function formatSessionDate(dateStr: string) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function promptMemberRole(
  displayName: string,
  onPick: (role: 'PLAYER' | 'ATTESTOR' | 'ADMIN') => void,
) {
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: ['Cancel', 'Player', 'Attestor', 'Admin'],
        cancelButtonIndex: 0,
      },
      (buttonIndex) => {
        if (buttonIndex === 1) onPick('PLAYER');
        if (buttonIndex === 2) onPick('ATTESTOR');
        if (buttonIndex === 3) onPick('ADMIN');
      },
    );
  } else {
    Alert.alert(`Change role: ${displayName}`, undefined, [
      { text: 'Player', onPress: () => onPick('PLAYER') },
      { text: 'Attestor', onPress: () => onPick('ATTESTOR') },
      { text: 'Admin', onPress: () => onPick('ADMIN') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }
}

export default function RoomDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session: authSession } = useAuth();
  const queryClient = useQueryClient();
  const safeInsets = useSafeAreaInsets();

  // Data hooks
  const { data: room, isLoading: roomLoading } = useRoomDetail(id);
  const { data: members } = useRoomMembers(id);
  const { data: balance } = useMyRoomBalance(id);
  const { data: activityItems, isLoading: feedLoading } = useRoomActivityFeed(id);
  useRealtimeActivityFeed(id);

  // Mutations
  const endSession = useEndSession();
  const updateMemberRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();

  // State
  const [showMembers, setShowMembers] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['rooms', id] });
    setRefreshing(false);
  }, [id, queryClient]);

  // Derived
  const currentMember = members?.find((m) => m.user_id === authSession?.user.id);
  const isAdmin = currentMember?.role === 'ADMIN';
  const isActive = room?.is_active ?? false;

  function handleEndSession() {
    Alert.alert('End Session', 'Are you sure? This will prevent new joins and bets.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Session',
        style: 'destructive',
        onPress: async () => {
          try {
            await endSession.mutateAsync({ p_room_id: id });
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to end session';
            Alert.alert('Error', message);
          }
        },
      },
    ]);
  }

  function handleChangeRoleRequest(userId: string) {
    const target = members?.find((m) => m.user_id === userId);
    const targetName = target?.profiles?.display_name ?? 'Member';

    promptMemberRole(targetName, async (newRole) => {
      if (target?.role === newRole) return;
      try {
        await updateMemberRole.mutateAsync({
          p_room_id: id,
          p_target_user_id: userId,
          p_new_role: newRole,
        });
      } catch (err) {
        Alert.alert('Error', getRpcErrorMessage(err));
      }
    });
  }

  function handleRemoveMemberRequest(userId: string) {
    const target = members?.find((m) => m.user_id === userId);
    const targetName = target?.profiles?.display_name ?? 'this member';

    Alert.alert(
      'Remove member',
      `Remove ${targetName} from this session? They will lose access to the room.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeMember.mutateAsync({ p_room_id: id, p_target_user_id: userId });
            } catch (err) {
              Alert.alert('Error', getRpcErrorMessage(err));
            }
          },
        },
      ],
    );
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
        <Text className="text-lg text-text-secondary">Room not found</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title={room.name}
        showBack
        titleClassName="text-xl font-bold text-white"
        backIconSize={28}
        right={
          isActive ? (
            <TouchableOpacity
              onPress={() => router.push(`/(tabs)/rooms/invite?id=${id}`)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <UserPlus size={28} color={colors.primary} />
            </TouchableOpacity>
          ) : undefined
        }
      />

      <FlatList
        data={activityItems ?? []}
        keyExtractor={(item) =>
          item.type === 'bet' ? `bet-${item.bet.id}` : `cr-${item.chipRequest.id}`
        }
        renderItem={({ item }) => (
          <ActivityFeedItem item={item} currentUserId={authSession?.user.id} />
        )}
        contentContainerClassName="px-5 pb-24"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View>
            {/* Member avatars + balance */}
            <RoomHeaderBar
              members={members ?? []}
              balance={balance ?? 0}
              onViewMembers={() => setShowMembers(true)}
            />

            {/* Status row */}
            <View className="mb-4 flex-row items-center justify-between">
              <View className="flex-row items-center gap-2.5">
                <CalendarBlank size={20} color={colors.textSecondary} />
                <Text className="text-sm text-text-secondary">
                  {formatSessionDate(room.session_date)}
                </Text>
                <Badge
                  variant={isActive ? 'success' : 'default'}
                  label={isActive ? 'Live' : 'Ended'}
                  className="px-4 py-2"
                  labelClassName="text-sm font-semibold"
                />
              </View>

              {isAdmin && isActive && (
                <TouchableOpacity
                  onPress={handleEndSession}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text className="text-sm font-semibold text-error">End Session</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Divider + section label */}
            <View className="mb-2 border-b border-border pb-2">
              <Text className="text-sm font-semibold text-text-secondary">Activity</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          feedLoading ? (
            <View className="items-center py-12">
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <View className="items-center py-12">
              <Text className="text-xl font-semibold text-text-secondary">No activity yet</Text>
              <Text className="mt-2 text-center text-base leading-6 text-text-secondary">
                Create a bet to get started
              </Text>
            </View>
          )
        }
        ItemSeparatorComponent={() => <View className="border-b border-border" />}
      />

      {/* Floating Create Bet CTA */}
      {isActive && (
        <View className="absolute bottom-6 left-5 right-5">
          <Button size="lg" onPress={() => router.push(`/(tabs)/rooms/create-bet?id=${id}`)}>
            Create Bet
          </Button>
        </View>
      )}

      {/* Members Modal */}
      <Modal visible={showMembers} animationType="slide" transparent>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <View className="flex-1 bg-background/95">
            <SafeAreaView className="flex-1">
              <View className="flex-row items-center justify-between border-b border-border px-5 py-4">
                <Text className="text-xl font-bold text-white">
                  Members ({members?.length ?? 0})
                </Text>
                <TouchableOpacity
                  onPress={() => setShowMembers(false)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <X size={28} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <FlatList
                data={members ?? []}
                keyExtractor={(item) => item.id}
                removeClippedSubviews={false}
                contentContainerStyle={{ paddingRight: Math.max(safeInsets.right, 4) }}
                renderItem={({ item }) => (
                  <MemberRow
                    member={item}
                    isAdmin={isAdmin}
                    isActive={isActive}
                    currentUserId={authSession?.user.id}
                    onChangeRole={handleChangeRoleRequest}
                    onRemoveMember={handleRemoveMemberRequest}
                  />
                )}
              />
            </SafeAreaView>
          </View>
        </GestureHandlerRootView>
      </Modal>
    </View>
  );
}

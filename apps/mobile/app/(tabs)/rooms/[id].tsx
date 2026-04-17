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
import { Plus, UserPlus, X } from 'phosphor-react-native';

import { colors } from '@/constants/colors';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ActivityFeedItem } from '@/components/activity/activity-feed-item';
import { MemberRow } from '@/components/activity/member-row';
import { RoomHeaderBar } from '@/components/activity/room-header-bar';
import { WinnerCelebration } from '@/components/activity/winner-celebration';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/providers/auth';
import {
  useRoomDetail,
  useRoomMembers,
  useUpdateMemberRole,
  useRemoveMember,
  getRpcErrorMessage,
} from '@/hooks/use-rooms';
import {
  useRoomActivityFeed,
  useMyRoomBalance,
  useRealtimeActivityFeed,
} from '@/hooks/use-activity-feed';
import { useWinnerCelebration } from '@/hooks/use-winner-celebration';

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

  const feedItems = activityItems ?? [];

  // Detects live bet.status → SETTLED transitions and queues a celebration
  // for the current user if they were a participant.
  const { celebratingBet, dismissCelebration } = useWinnerCelebration(
    feedItems,
    authSession?.user.id ?? null,
  );

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
              accessibilityLabel="Invite to room"
            >
              <UserPlus size={28} color={colors.primary} />
            </TouchableOpacity>
          ) : undefined
        }
      />

      <FlatList
        data={feedItems}
        keyExtractor={(item) =>
          item.type === 'bet' ? `bet-${item.bet.id}` : `cr-${item.chipRequest.id}`
        }
        renderItem={({ item }) => (
          <ActivityFeedItem
            item={item}
            currentUserId={authSession?.user.id}
            currentUserRole={currentMember?.role ?? null}
            roomActive={isActive}
            roomId={id}
          />
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
          <RoomHeaderBar
            members={members ?? []}
            balance={balance ?? 0}
            onViewMembers={() => setShowMembers(true)}
          />
        }
        ListEmptyComponent={
          feedLoading ? (
            <View className="items-center py-12">
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <View className="items-center px-2 py-12">
              <Text className="text-center text-xl font-semibold text-text-secondary">
                No bets yet
              </Text>
              <Text className="mt-2 max-w-sm text-center text-base leading-6 text-text-secondary">
                Tap Create Bet to start the action.
              </Text>
            </View>
          )
        }
      />

      <WinnerCelebration
        bet={celebratingBet}
        currentUserId={authSession?.user.id ?? null}
        onDismiss={dismissCelebration}
      />

      {isActive ? (
        <TouchableOpacity
          onPress={() => router.push(`/(tabs)/rooms/create-bet?id=${id}`)}
          activeOpacity={0.85}
          accessibilityLabel="Create bet"
          className="absolute bottom-6 right-5 h-14 w-14 items-center justify-center rounded-full bg-primary"
          style={{
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.35,
            shadowRadius: 6,
            elevation: 6,
          }}
        >
          <Plus size={28} color="#ffffff" weight="bold" />
        </TouchableOpacity>
      ) : null}

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

import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  SafeAreaView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CalendarBlank, UserPlus, X } from 'phosphor-react-native';

import { colors } from '@/constants/colors';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ActivityFeedItem } from '@/components/activity/activity-feed-item';
import { MemberRow } from '@/components/activity/member-row';
import { RoomHeaderBar } from '@/components/activity/room-header-bar';
import { useAuth } from '@/providers/auth';
import { useRoomDetail, useRoomMembers, useEndSession, useReassignAdmin } from '@/hooks/use-rooms';
import {
  useRoomActivityFeed,
  useMyRoomBalance,
  useRealtimeActivityFeed,
} from '@/hooks/use-activity-feed';

function formatSessionDate(dateStr: string) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function RoomDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session: authSession } = useAuth();

  // Data hooks
  const { data: room, isLoading: roomLoading } = useRoomDetail(id);
  const { data: members } = useRoomMembers(id);
  const { data: balance } = useMyRoomBalance(id);
  const { data: activityItems, isLoading: feedLoading } = useRoomActivityFeed(id);
  useRealtimeActivityFeed(id);

  // Mutations
  const endSession = useEndSession();
  const reassignAdmin = useReassignAdmin();

  // State
  const [showMembers, setShowMembers] = useState(false);

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

  function handleReassignAdmin(userId: string) {
    const target = members?.find((m) => m.user_id === userId);
    const targetName = target?.profiles?.display_name ?? 'this member';

    Alert.alert('Reassign Admin', `Make ${targetName} the admin? You will become a Player.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: async () => {
          try {
            await reassignAdmin.mutateAsync({
              p_room_id: id,
              p_new_admin_user_id: userId,
            });
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to reassign admin';
            Alert.alert('Error', message);
          }
        },
      },
    ]);
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
      <ScreenHeader
        title={room.name}
        showBack
        right={
          isActive ? (
            <TouchableOpacity onPress={() => router.push(`/(tabs)/rooms/invite?id=${id}`)}>
              <UserPlus size={24} color={colors.primary} />
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
        contentContainerClassName="px-4 pb-24"
        ListHeaderComponent={
          <View>
            {/* Member avatars + balance */}
            <RoomHeaderBar
              members={members ?? []}
              balance={balance ?? 0}
              onViewMembers={() => setShowMembers(true)}
            />

            {/* Status row */}
            <View className="mb-3 flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <CalendarBlank size={16} color={colors.textSecondary} />
                <Text className="text-sm text-text-secondary">
                  {formatSessionDate(room.session_date)}
                </Text>
                <Badge
                  variant={isActive ? 'success' : 'default'}
                  label={isActive ? 'Live' : 'Ended'}
                />
              </View>

              {isAdmin && isActive && (
                <TouchableOpacity onPress={handleEndSession}>
                  <Text className="text-sm text-error">End Session</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Divider + section label */}
            <View className="mb-2 border-b border-border pb-2">
              <Text className="text-sm font-medium text-text-muted">Activity</Text>
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
              <Text className="text-base text-text-secondary">No activity yet</Text>
              <Text className="mt-1 text-sm text-text-muted">
                Create a bet to get started
              </Text>
            </View>
          )
        }
        ItemSeparatorComponent={() => <View className="border-b border-border" />}
      />

      {/* Floating Create Bet CTA */}
      {isActive && (
        <View className="absolute bottom-6 left-4 right-4">
          <Button
            onPress={() => {
              /* TODO: navigate to create bet screen */
            }}
          >
            Create Bet
          </Button>
        </View>
      )}

      {/* Members Modal */}
      <Modal visible={showMembers} animationType="slide" transparent>
        <View className="flex-1 bg-background/95">
          <SafeAreaView className="flex-1">
            <View className="flex-row items-center justify-between px-4 py-3">
              <Text className="text-lg font-semibold text-white">
                Members ({members?.length ?? 0})
              </Text>
              <TouchableOpacity onPress={() => setShowMembers(false)}>
                <X size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={members ?? []}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <MemberRow
                  member={item}
                  isAdmin={isAdmin}
                  isActive={isActive}
                  onReassign={handleReassignAdmin}
                />
              )}
            />
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}

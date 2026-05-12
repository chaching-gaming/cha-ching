import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Bell, Checks } from 'phosphor-react-native';
import { useQueryClient } from '@tanstack/react-query';

import { colors } from '@/constants/colors';
import { EmptyState, ScreenHeader, SkeletonNotificationItem } from '@/components/ui';
import { NotificationItem } from '@/components/notifications/notification-item';
import {
  useNotificationsFeed,
  notificationsKey,
  type NotificationRow,
} from '@/hooks/use-notifications-feed';
import { useNotifications } from '@/providers/notifications';

type GroupedNotifications = {
  title: string;
  data: NotificationRow[];
};

function groupByDate(notifications: NotificationRow[]): GroupedNotifications[] {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const todayStr = today.toDateString();
  const yesterdayStr = yesterday.toDateString();

  const groups: Record<string, NotificationRow[]> = {
    Today: [],
    Yesterday: [],
    Earlier: [],
  };

  for (const n of notifications) {
    const dateStr = new Date(n.created_at).toDateString();
    if (dateStr === todayStr) {
      groups.Today.push(n);
    } else if (dateStr === yesterdayStr) {
      groups.Yesterday.push(n);
    } else {
      groups.Earlier.push(n);
    }
  }

  return [
    { title: 'Today', data: groups.Today },
    { title: 'Yesterday', data: groups.Yesterday },
    { title: 'Earlier', data: groups.Earlier },
  ].filter((g) => g.data.length > 0);
}

export default function NotificationsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { markAsRead, refreshUnreadCount } = useNotifications();
  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useNotificationsFeed();

  const [refreshing, setRefreshing] = useState(false);
  const [markingAllRead, setMarkingAllRead] = useState(false);

  const allNotifications = useMemo(() => {
    return data?.pages.flat() ?? [];
  }, [data]);

  const unreadNotifications = useMemo(() => {
    return allNotifications.filter((n) => !n.read_at);
  }, [allNotifications]);

  const groupedData = useMemo(() => {
    return groupByDate(allNotifications);
  }, [allNotifications]);

  const handleMarkAllRead = useCallback(async () => {
    if (unreadNotifications.length === 0) return;

    setMarkingAllRead(true);
    try {
      const unreadIds = unreadNotifications.map((n) => n.id);
      await markAsRead(unreadIds);
      await queryClient.invalidateQueries({ queryKey: notificationsKey() });
    } finally {
      setMarkingAllRead(false);
    }
  }, [unreadNotifications, markAsRead, queryClient]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    await refreshUnreadCount();
    setRefreshing(false);
  }, [refetch, refreshUnreadCount]);

  const handleNotificationPress = useCallback(
    async (notification: NotificationRow) => {
      // Mark as read if unread
      if (!notification.read_at) {
        await markAsRead([notification.id]);
        await queryClient.invalidateQueries({ queryKey: notificationsKey() });
      }

      const { room_id, bet_id } = notification.data ?? {};
      const type = notification.type;

      // Navigate to bet detail for bet-related notifications
      if (
        bet_id &&
        ['bet_matched', 'bet_settled', 'bet_disputed', 'bet_expiring', 'bet_accepted'].includes(type)
      ) {
        router.push(`/(tabs)/rooms/bet/${bet_id}`);
        return;
      }

      // Navigate to room for other notifications
      if (room_id) {
        router.push(`/(tabs)/rooms/${room_id}`);
      }
    },
    [markAsRead, router, queryClient]
  );

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const markAllReadButton = unreadNotifications.length > 0 ? (
    <TouchableOpacity
      onPress={handleMarkAllRead}
      disabled={markingAllRead}
      activeOpacity={0.7}
      className="flex-row items-center gap-1"
    >
      <Checks size={20} color={colors.primary} weight="bold" />
      <Text className="text-sm font-medium text-primary">
        {markingAllRead ? 'Marking...' : 'Mark all read'}
      </Text>
    </TouchableOpacity>
  ) : null;

  if (isLoading) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="Notifications" />
        <View>
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonNotificationItem key={i} />
          ))}
        </View>
      </View>
    );
  }

  if (allNotifications.length === 0) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="Notifications" />
        <EmptyState
          icon={Bell}
          title="No notifications yet"
          subtitle="You'll be notified when someone matches your bet, disputes an outcome, or donates chips."
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Notifications" right={markAllReadButton} />
      <FlatList
        data={groupedData}
        keyExtractor={(item) => item.title}
        renderItem={({ item: group }) => (
          <View className="mb-2">
            <Text className="mb-2 px-5 py-2 text-xs font-bold uppercase tracking-widest text-text-muted">
              {group.title}
            </Text>
            {group.data.map((notification, idx) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onPress={() => handleNotificationPress(notification)}
                isLast={idx === group.data.length - 1}
              />
            ))}
          </View>
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View className="py-4">
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: 48 }}
      />
    </View>
  );
}

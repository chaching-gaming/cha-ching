import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Bell } from 'phosphor-react-native';

import { colors } from '@/constants/colors';
import { ScreenHeader } from '@/components/ui/screen-header';
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

  const allNotifications = useMemo(() => {
    return data?.pages.flat() ?? [];
  }, [data]);

  const groupedData = useMemo(() => {
    return groupByDate(allNotifications);
  }, [allNotifications]);

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
      }

      // Navigate to relevant room if room_id present
      const roomId = notification.data?.room_id;
      if (roomId) {
        router.push(`/(tabs)/rooms/${roomId}`);
      }
    },
    [markAsRead, router]
  );

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="Notifications" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  if (allNotifications.length === 0) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="Notifications" />
        <View className="flex-1 items-center justify-center px-5">
          <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-surface">
            <Bell size={32} color={colors.textMuted} weight="regular" />
          </View>
          <Text className="text-center text-xl font-semibold text-white">
            No notifications yet
          </Text>
          <Text className="mt-2 max-w-sm text-center text-base leading-6 text-textSecondary">
            You'll be notified when someone matches your bet, disputes an outcome, or donates chips.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Notifications" />
      <FlatList
        data={groupedData}
        keyExtractor={(item) => item.title}
        renderItem={({ item: group }) => (
          <View>
            <Text className="bg-background px-5 py-2 text-xs font-semibold uppercase tracking-widest text-textMuted">
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

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
  NotificationFilterBar,
  notificationMatchesFilter,
  type NotificationFilter,
} from '@/components/notifications/notification-filter';
import {
  useNotificationsFeed,
  notificationsKey,
  type NotificationRow,
} from '@/hooks/use-notifications-feed';
import { useNotifications } from '@/providers/notifications';
import { useToast } from '@/providers/toast';

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
  const { show: showToast } = useToast();
  const { markAsRead, markAllAsRead, refreshUnreadCount, unreadCount } = useNotifications();
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
  const [filter, setFilter] = useState<NotificationFilter>('results');

  const allNotifications = useMemo(() => {
    return data?.pages.flat() ?? [];
  }, [data]);

  const filteredNotifications = useMemo(() => {
    return allNotifications.filter((n) => notificationMatchesFilter(n, filter));
  }, [allNotifications, filter]);

  const groupedData = useMemo(() => {
    return groupByDate(filteredNotifications);
  }, [filteredNotifications]);

  const handleMarkAllRead = useCallback(async () => {
    setMarkingAllRead(true);
    try {
      // Mark ALL notifications as read (server-side), not just loaded ones
      await markAllAsRead();
      await queryClient.invalidateQueries({ queryKey: notificationsKey() });
    } finally {
      setMarkingAllRead(false);
    }
  }, [markAllAsRead, queryClient]);

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
        ['bet_matched', 'bet_settled', 'bet_disputed', 'bet_expiring', 'bet_accepted', 'bet_won', 'bet_lost'].includes(type)
      ) {
        router.push(`/(tabs)/rooms/bet/${bet_id}`);
        return;
      }

      // Voided bets are auto-deleted, show info toast and navigate to room
      if (type === 'bet_voided' && room_id) {
        router.push(`/(tabs)/rooms/${room_id}`);
        showToast({
          type: 'info',
          message: 'This bet was voided and has been deleted. Voided bets are removed after 5 minutes.',
        });
        return;
      }

      // Navigate to room for other notifications
      if (room_id) {
        router.push(`/(tabs)/rooms/${room_id}`);
      }
    },
    [markAsRead, router, queryClient, showToast]
  );

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const markAllReadButton = unreadCount > 0 ? (
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

  const emptyFilterMessage: Record<NotificationFilter, { title: string; subtitle: string }> = {
    results: {
      title: 'No results yet',
      subtitle: 'Bet outcomes (wins and losses) will appear here.',
    },
    activity: {
      title: 'No activity yet',
      subtitle: 'Your matched bets, chip donations, and other activity will appear here.',
    },
  };

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Notifications" right={markAllReadButton} />
      <NotificationFilterBar value={filter} onChange={setFilter} />
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
        ListEmptyComponent={
          <View className="items-center px-5 py-12">
            <Bell size={48} color={colors.textMuted} />
            <Text className="mt-4 text-center text-xl font-semibold text-text-secondary">
              {emptyFilterMessage[filter].title}
            </Text>
            <Text className="mt-2 max-w-sm text-center text-base leading-6 text-text-muted">
              {emptyFilterMessage[filter].subtitle}
            </Text>
          </View>
        }
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

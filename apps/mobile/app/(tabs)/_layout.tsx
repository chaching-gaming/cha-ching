import { useCallback, useMemo, useState } from 'react';
import { Platform, View } from 'react-native';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { Tabs, useRouter } from 'expo-router';
import { House, Plus, ChartBar, Bell, UserCircle } from 'phosphor-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/providers/theme';
import { RoomSelectionSheet } from '@/components/activity/room-selection-sheet';
import { NotificationBadge } from '@/components/notifications/notification-badge';
import { useNotifications } from '@/providers/notifications';
import { notificationsKey } from '@/hooks/use-notifications-feed';

const TAB_BAR_HEIGHT = 60;
const TAB_BAR_PADDING_TOP = 8;

/** Rooms list only; stack sub-routes hide the tab bar for focused flows. */
const ROOMS_TAB_LIST_ROUTE = 'index';

export default function TabLayout() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [sheetOpen, setSheetOpen] = useState(false);
  const { unreadCount, markAsRead } = useNotifications();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  // Calculate bottom padding: use safe area inset on Android (edge-to-edge), fallback for iOS
  const bottomPadding = Platform.OS === 'android' ? Math.max(insets.bottom, 12) : 20;

  const tabBarStyle = useMemo(
    () => ({
      backgroundColor: colors.surface,
      borderTopColor: colors.border,
      height: TAB_BAR_HEIGHT + bottomPadding + TAB_BAR_PADDING_TOP,
      paddingBottom: bottomPadding,
      paddingTop: TAB_BAR_PADDING_TOP,
    }),
    [bottomPadding, colors],
  );

  const handleNotificationsTabFocus = useCallback(async () => {
    // Get all unread notification IDs from cache and mark them as read
    const cachedData = queryClient.getQueryData<{ pages: Array<Array<{ id: string; read_at: string | null }>> }>(notificationsKey());
    if (cachedData?.pages) {
      const unreadIds = cachedData.pages
        .flat()
        .filter((n) => !n.read_at)
        .map((n) => n.id);
      if (unreadIds.length > 0) {
        await markAsRead(unreadIds);
      }
    }
  }, [queryClient, markAsRead]);

  const handleSelectRoom = useCallback(
    (roomId: string) => {
      setSheetOpen(false);
      router.push(`/(tabs)/rooms/create-bet?id=${roomId}`);
    },
    [router],
  );

  return (
    <>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarStyle: tabBarStyle,
          headerShown: false,
        }}
      >
        <Tabs.Screen
          name="rooms"
          options={({ route }) => {
            const focusedRoute = getFocusedRouteNameFromRoute(route) ?? ROOMS_TAB_LIST_ROUTE;
            const hideTabBar = focusedRoute !== ROOMS_TAB_LIST_ROUTE;
            return {
              title: 'Rooms',
              tabBarStyle: hideTabBar ? { display: 'none' } : tabBarStyle,
              tabBarIcon: ({ color, focused }) => (
                <House size={24} color={color} weight={focused ? 'fill' : 'regular'} />
              ),
            };
          }}
        />
        <Tabs.Screen
          name="stats"
          options={{
            title: 'Stats',
            tabBarIcon: ({ color, focused }) => (
              <ChartBar size={24} color={color} weight={focused ? 'fill' : 'regular'} />
            ),
          }}
        />
        <Tabs.Screen
          name="bet"
          options={{
            title: 'Bet',
            tabBarIcon: () => (
              <View className="-mt-4 h-14 w-14 items-center justify-center rounded-full bg-primary">
                <Plus size={28} color={colors.surface} weight="bold" />
              </View>
            ),
            tabBarLabel: () => null,
          }}
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              setSheetOpen(true);
            },
          }}
        />
        <Tabs.Screen
          name="notifications"
          options={{
            title: 'Notifications',
            tabBarIcon: ({ color, focused }) => (
              <View>
                <Bell size={24} color={color} weight={focused ? 'fill' : 'regular'} />
                <NotificationBadge count={unreadCount} />
              </View>
            ),
          }}
          listeners={{
            focus: () => {
              void handleNotificationsTabFocus();
            },
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color, focused }) => (
              <UserCircle size={24} color={color} weight={focused ? 'fill' : 'regular'} />
            ),
          }}
        />
      </Tabs>

      <RoomSelectionSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSelectRoom={handleSelectRoom}
      />
    </>
  );
}

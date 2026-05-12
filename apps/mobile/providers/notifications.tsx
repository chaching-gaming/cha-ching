import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from './auth';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { notificationsKey } from '@/hooks/use-notifications-feed';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Set up Android notification channel (required for Android 8.0+)
if (Platform.OS === 'android') {
  void Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#2EAF7D',
  });
}

type NotificationData = {
  type?: string;
  room_id?: string;
  bet_id?: string;
  chip_request_id?: string;
};

type NotificationContextType = {
  expoPushToken: string | null;
  unreadCount: number;
  requestPermissions: () => Promise<boolean>;
  markAsRead: (ids: string[]) => Promise<void>;
  refreshUnreadCount: () => Promise<void>;
};

const NotificationContext = createContext<NotificationContextType | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();

  // Fetch unread notification count
  const refreshUnreadCount = useCallback(async () => {
    if (!session?.user.id) {
      setUnreadCount(0);
      return;
    }

    try {
      const { data, error } = await supabase.rpc('get_unread_notification_count');
      if (!error && typeof data === 'number') {
        setUnreadCount(data);
        await Notifications.setBadgeCountAsync(data);
      }
    } catch (err) {
      console.error('Failed to fetch unread count:', err);
    }
  }, [session?.user.id]);

  // Mark notifications as read
  const markAsRead = useCallback(
    async (ids: string[]) => {
      if (!session?.user.id || ids.length === 0) return;

      try {
        const { data, error } = await supabase.rpc('mark_notifications_read', {
          p_notification_ids: ids,
        });

        if (!error) {
          // Refresh count after marking as read
          await refreshUnreadCount();
        }
      } catch (err) {
        console.error('Failed to mark notifications as read:', err);
      }
    },
    [session?.user.id, refreshUnreadCount]
  );

  // Register device token with backend
  const registerDevice = useCallback(
    async (token: string) => {
      if (!session?.user.id) return;

      try {
        const platform = Platform.OS === 'ios' ? 'ios' : 'android';
        await supabase.rpc('register_device', {
          p_expo_push_token: token,
          p_platform: platform,
        });
      } catch (err) {
        console.error('Failed to register device:', err);
      }
    },
    [session?.user.id]
  );

  // Unregister device token
  const unregisterDevice = useCallback(
    async (token: string) => {
      if (!session?.user.id) return;

      try {
        await supabase.rpc('unregister_device', {
          p_expo_push_token: token,
        });
      } catch (err) {
        console.error('Failed to unregister device:', err);
      }
    },
    [session?.user.id]
  );

  // Request notification permissions and get token
  const requestPermissions = useCallback(async (): Promise<boolean> => {
    if (!Device.isDevice) {
      console.log('Push notifications require a physical device');
      return false;
    }

    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        return false;
      }

      // Get Expo push token
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: env.expoProjectId || undefined,
      });

      const token = tokenData.data;
      setExpoPushToken(token);

      // Register with backend
      await registerDevice(token);

      return true;
    } catch (err) {
      console.error('Failed to get push token:', err);
      return false;
    }
  }, [registerDevice]);

  // Handle navigation based on notification data
  const handleNotificationNavigation = useCallback(
    (data: NotificationData) => {
      if (!data) return;

      const { type, room_id } = data;

      // Navigate based on notification type
      switch (type) {
        case 'bet_matched':
        case 'bet_settled':
        case 'bet_disputed':
        case 'bet_expiring':
        case 'bet_accepted':
        case 'chip_request_created':
        case 'chip_donated':
          if (room_id) {
            router.push(`/(tabs)/rooms/${room_id}`);
          }
          break;
        default:
          // Unknown type, do nothing
          break;
      }
    },
    [router]
  );

  // Set up notification listeners
  useEffect(() => {
    if (!session?.user.id) return;

    // Request permissions and register on auth
    void requestPermissions();

    // Refresh unread count
    void refreshUnreadCount();

    // Handle notification received while app is foregrounded
    notificationListener.current = Notifications.addNotificationReceivedListener(() => {
      // Refresh badge count when notification arrives
      void refreshUnreadCount();
    });

    // Handle notification tap
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as NotificationData;
      handleNotificationNavigation(data);
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [session?.user.id, requestPermissions, refreshUnreadCount, handleNotificationNavigation]);

  // Refresh badge count when app comes to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && session?.user.id) {
        void refreshUnreadCount();
      }
    });

    return () => subscription.remove();
  }, [session?.user.id, refreshUnreadCount]);

  // Subscribe to realtime notifications for badge updates
  useEffect(() => {
    if (!session?.user.id) return;

    const channel = supabase
      .channel(`user-notifications:${session.user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${session.user.id}`,
        },
        () => {
          // Refresh unread count when new notification arrives
          void refreshUnreadCount();
          // Invalidate notifications list if user is viewing
          queryClient.invalidateQueries({ queryKey: notificationsKey() });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [session?.user.id, refreshUnreadCount, queryClient]);

  // Unregister device on sign out
  useEffect(() => {
    if (!session?.user.id && expoPushToken) {
      void unregisterDevice(expoPushToken);
      setExpoPushToken(null);
      setUnreadCount(0);
      void Notifications.setBadgeCountAsync(0);
    }
  }, [session?.user.id, expoPushToken, unregisterDevice]);

  return (
    <NotificationContext.Provider
      value={{
        expoPushToken,
        unreadCount,
        requestPermissions,
        markAsRead,
        refreshUnreadCount,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}

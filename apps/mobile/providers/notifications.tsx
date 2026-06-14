import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from './auth';
import { useToast } from './toast';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { notificationsKey } from '@/hooks/use-notifications-feed';

// Storage keys matching preferences provider
const STORAGE_KEY_SOUND = 'pref.sound';
const STORAGE_KEY_NOTIFICATIONS = 'pref.notifications';

// Configure notification handler - checks user preferences before showing/playing
Notifications.setNotificationHandler({
  handleNotification: async () => {
    // Read user preferences from AsyncStorage
    const [soundPref, notifPref] = await AsyncStorage.multiGet([
      STORAGE_KEY_SOUND,
      STORAGE_KEY_NOTIFICATIONS,
    ]);
    // Default to true if not set
    const soundEnabled = soundPref[1] !== 'false';
    const notificationsEnabled = notifPref[1] !== 'false';

    return {
      shouldShowBanner: notificationsEnabled,
      shouldPlaySound: soundEnabled && notificationsEnabled,
      shouldSetBadge: notificationsEnabled,
      shouldShowList: notificationsEnabled,
    };
  },
});

// Set up Android notification channel (required for Android 8.0+)
if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#2EAF7D',
  }).catch(() => {
    // Channel creation failed - notifications may not work properly
  });
}

type NotificationData = {
  type?: string;
  notification_id?: string;
  room_id?: string;
  bet_id?: string;
  chip_request_id?: string;
};

type NotificationContextType = {
  expoPushToken: string | null;
  unreadCount: number;
  requestPermissions: () => Promise<boolean>;
  markAsRead: (ids: string[]) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refreshUnreadCount: () => Promise<void>;
};

const NotificationContext = createContext<NotificationContextType | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const { show: showToast } = useToast();
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const notificationListener = useRef<Notifications.Subscription>(undefined);
  const responseListener = useRef<Notifications.Subscription>(undefined);

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
    } catch {
      // Failed to fetch unread count
    }
  }, [session?.user.id]);

  // Mark notifications as read
  const markAsRead = useCallback(
    async (ids: string[]) => {
      if (!session?.user.id || ids.length === 0) return;

      try {
        const { error } = await supabase.rpc('mark_notifications_read', {
          p_notification_ids: ids,
        });

        if (!error) {
          // Refresh count after marking as read
          await refreshUnreadCount();
        }
      } catch {
        // Failed to mark notifications as read
      }
    },
    [session?.user.id, refreshUnreadCount],
  );

  // Mark ALL notifications as read (not just loaded ones)
  const markAllAsRead = useCallback(async () => {
    if (!session?.user.id) return;

    try {
      const { error } = await supabase.rpc('mark_all_notifications_read');

      if (!error) {
        // Refresh count after marking all as read
        await refreshUnreadCount();
      }
    } catch {
      // Failed to mark all notifications as read
    }
  }, [session?.user.id, refreshUnreadCount]);

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
      } catch {
        // Failed to register device
      }
    },
    [session?.user.id],
  );

  // Unregister device token
  const unregisterDevice = useCallback(
    async (token: string) => {
      if (!session?.user.id) return;

      try {
        await supabase.rpc('unregister_device', {
          p_expo_push_token: token,
        });
      } catch {
        // Failed to unregister device
      }
    },
    [session?.user.id],
  );

  // Request notification permissions and get token
  const requestPermissions = useCallback(async (): Promise<boolean> => {
    if (!Device.isDevice) {
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
    } catch {
      return false;
    }
  }, [registerDevice]);

  // Handle navigation based on notification data (and mark as read)
  const handleNotificationNavigation = useCallback(
    async (data: NotificationData) => {
      if (!data) return;

      const { type, notification_id, room_id } = data;

      // Mark notification as read if we have the ID
      if (notification_id) {
        try {
          await markAsRead([notification_id]);
        } catch {
          // Failed to mark notification as read
        }
      }

      // Navigate based on notification type
      switch (type) {
        case 'bet_matched':
        case 'bet_settled':
        case 'bet_won':
        case 'bet_lost':
        case 'bet_disputed':
        case 'bet_expiring':
        case 'bet_accepted':
          // Navigate to bet detail page if bet_id present, otherwise room
          if (data.bet_id) {
            router.push(`/(tabs)/rooms/bet/${data.bet_id}`);
          } else if (room_id) {
            router.push(`/(tabs)/rooms/${room_id}`);
          }
          break;
        case 'bet_voided':
          // Voided bets are auto-deleted, show info toast and navigate to room
          if (room_id) {
            router.push(`/(tabs)/rooms/${room_id}`);
            showToast({
              type: 'info',
              message: 'This bet was voided and has been deleted. Voided bets are removed after 5 minutes.',
            });
          }
          break;
        case 'bet_created':
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
    [router, markAsRead],
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
      void handleNotificationNavigation(data);
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
        },
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
        markAllAsRead,
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
